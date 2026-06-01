import { Provider } from "@/provider/provider"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import * as Log from "@opencode-ai/core/util/log"
import { Context, Effect, Layer } from "effect"
import * as Stream from "effect/Stream"
import { streamText, wrapLanguageModel, type ModelMessage, type Tool } from "ai"
import type { LLMEvent } from "@opencode-ai/llm"
import { LLMClient, RequestExecutor, WebSocketExecutor } from "@opencode-ai/llm/route"
import type { LLMClientService } from "@opencode-ai/llm/route"
import { GitLabWorkflowLanguageModel } from "gitlab-ai-provider"
import { ProviderTransform } from "@/provider/transform"
import { Config } from "@/config/config"
import type { Agent } from "@/agent/agent"
import type { MessageV2 } from "./message-v2"
import { Plugin } from "@/plugin"
import { SystemPrompt } from "./system"
import * as SystemPromptLog from "./system-prompt-log"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Permission } from "@/permission"
import { PermissionID } from "@/permission/schema"
import { Bus } from "@/bus"
import { Wildcard } from "@/util/wildcard"
import { SessionID } from "@/session/schema"
import { Auth } from "@/auth"
import { EffectBridge } from "@/effect/bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import * as Option from "effect/Option"
import * as OtelTracer from "@effect/opentelemetry/Tracer"
import { LLMAISDK } from "./llm/ai-sdk"
import { LLMNativeRuntime } from "./llm/native-runtime"
import { LLMRequestPrep } from "./llm/request"

const log = Log.create({ service: "llm" })
export const OUTPUT_TOKEN_MAX = ProviderTransform.OUTPUT_TOKEN_MAX

export type StreamInput = {
  user: MessageV2.User
  sessionID: string
  parentSessionID?: string
  model: Provider.Model
  agent: Agent.Info
  permission?: Permission.Ruleset
  system: string[]
  messages: ModelMessage[]
  small?: boolean
  tools: Record<string, Tool>
  retries?: number
  toolChoice?: "auto" | "required" | "none"
  thinkingEffort?: string
}

export type StreamRequest = StreamInput & {
  abort: AbortSignal
}

export interface Interface {
  readonly stream: (input: StreamInput) => Stream.Stream<LLMEvent, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/LLM") {}

export const use = serviceUse(Service)

const live: Layer.Layer<
  Service,
  never,
  | Auth.Service
  | Config.Service
  | Provider.Service
  | Plugin.Service
  | Permission.Service
  | LLMClientService
  | RuntimeFlags.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const auth = yield* Auth.Service
    const config = yield* Config.Service
    const provider = yield* Provider.Service
    const plugin = yield* Plugin.Service
    const perm = yield* Permission.Service
    const llmClient = yield* LLMClient.Service
    const flags = yield* RuntimeFlags.Service

    const run = Effect.fn("LLM.run")(function* (input: StreamRequest) {
      const l = log
        .clone()
        .tag("providerID", input.model.providerID)
        .tag("modelID", input.model.id)
        .tag("session.id", input.sessionID)
        .tag("small", (input.small ?? false).toString())
        .tag("agent", input.agent.name)
        .tag("mode", input.agent.mode)
      l.info("stream", {
        modelID: input.model.id,
        providerID: input.model.providerID,
      })

      const [language, cfg, item, info] = yield* Effect.all(
        [
          provider.getLanguage(input.model),
          config.get(),
          provider.getProvider(input.model.providerID),
          auth.get(input.model.providerID),
        ],
        { concurrency: "unbounded" },
      )

      const isWorkflow = language instanceof GitLabWorkflowLanguageModel
      const prepared = yield* LLMRequestPrep.prepare({
        ...input,
        provider: item,
        auth: info,
        plugin,
        flags,
        isWorkflow,
      })

      SystemPromptLog.set(input.sessionID, {
        parts: prepared.system.map((content, i) => ({
          label: i === 0 ? "Base prompt" : i === 1 ? "Context & instructions" : `Part ${i + 1}`,
          content,
        })),
        model: { id: input.model.id, providerID: input.model.providerID },
        agent: input.agent.name,
        timestamp: Date.now(),
      })

      const _tracerOpt = yield* Effect.serviceOption(OtelTracer as any)
      const telemetryTracer = Option.getOrUndefined(_tracerOpt as any) as any

      // Tool Calling Fallback Check
      // Only applies when model.capabilities.toolcall === false
      // Native tool calling models use the standard streamText path below
      const useFallback = input.model.capabilities.toolcall === false

      if (useFallback) {
        l.info("Using fallback tool calling", {
          modelID: input.model.id,
          reason: "Native tool calling not supported",
        })

        // Dynamically import fallback service (lazy loading for zero overhead on native path)
        const { ToolCallFallbackService } = yield* Effect.tryPromise(() =>
          import("./tool-fallback").then((m) => ({ ToolCallFallbackService: m.ToolCallFallbackService }))
        )

        const fallbackService = new ToolCallFallbackService(
          input.model,
          prepared.tools,
          { strategy: "auto", maxIterations: 5 }
        )

        // Create wrapper for streamText that matches fallback interface
        const streamTextWrapper = async (msgs: ModelMessage[], toolParams?: any) => {
          return streamText({
            temperature: prepared.params.temperature,
            topP: prepared.params.topP,
            topK: prepared.params.topK,
            providerOptions: ProviderTransform.providerOptions(input.model, prepared.params.options),
            maxOutputTokens: prepared.params.maxOutputTokens,
            abortSignal: input.abort,
            headers: prepared.headers,
            maxRetries: input.retries ?? 0,
            messages: msgs,
            model: wrapLanguageModel({
              model: language,
              middleware: [
                {
                  specificationVersion: "v3" as const,
                  async transformParams(args) {
                    if (args.type === "stream") {
                      // @ts-expect-error
                      args.params.prompt = ProviderTransform.message(
                        args.params.prompt,
                        input.model,
                        prepared.messageTransformOptions,
                      )
                    }
                    return args.params
                  },
                },
              ],
            }),
            experimental_telemetry: {
              isEnabled: cfg.experimental?.openTelemetry,
              functionId: "session.llm",
              tracer: telemetryTracer,
              metadata: {
                userId: cfg.username ?? "unknown",
                sessionId: input.sessionID,
              },
            },
          })
        }

        // Execute fallback tool calling
        const fallbackStream = yield* Effect.tryPromise({
          try: async () => {
            const events: any[] = []
            const stream = fallbackService.executeWithFallback(
              [...prepared.messages],
              {
                stream: async (msgs: ModelMessage[], toolParams?: Record<string, unknown>) => {
                  const result = await streamTextWrapper(msgs, toolParams)
                  // Collect all events from the stream
                  const allEvents: any[] = []
                  for await (const event of result.fullStream) {
                    allEvents.push(event)
                    if (event.type === "text-delta") {
                      events.push({ type: "text-delta", textDelta: event.text })
                    } else if (event.type === "tool-call") {
                      events.push({
                        type: "tool-call",
                        toolCallId: event.toolCallId,
                        toolName: event.toolName,
                        args: event.input,
                      })
                    } else if (event.type === "tool-result") {
                      events.push({
                        type: "tool-result",
                        toolCallId: event.toolCallId,
                        result: event.output,
                      })
                    }
                  }
                  // Return the collected content
                  const textEvents = allEvents.filter(e => e.type === "text-delta")
                  const content = textEvents.map(e => e.textDelta).join("")
                  return { content, fullResponse: result }
                },
              }
            )

            // Collect all fallback events
            const fallbackEvents: any[] = []
            for await (const event of stream) {
              fallbackEvents.push(event)
            }

            return { fallbackEvents, nativeEvents: events }
          },
          catch: (error) => {
            l.error("Fallback execution failed", { error })
            return { fallbackEvents: [{ type: "error" as const, error: String(error) } as any], nativeEvents: [] }
          },
        })

        // Create a result object that matches the expected return type
        const textParts = fallbackStream.fallbackEvents
          .filter((e: any) => e.type === "text-delta")
          .map((e: any) => e.textDelta)
          .join("")

        const toolCalls = fallbackStream.fallbackEvents
          .filter((e: any) => e.type === "tool-call")
          .map((e: any) => ({
            toolCallId: e.toolCallId,
            toolName: e.toolName,
            args: e.args,
          }))

        const toolResults = fallbackStream.fallbackEvents
          .filter((e: any) => e.type === "tool-result")
          .map((e: any) => ({
            toolCallId: e.toolCallId,
            result: e.result,
          }))

        // Build fullStream from fallback events
        const fullStream = (async function* () {
          for (const event of fallbackStream.fallbackEvents) {
            if (event.type === "text-delta") {
              yield { type: "text-delta" as const, textDelta: event.textDelta }
            } else if (event.type === "tool-call") {
              yield {
                type: "tool-call" as const,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                args: event.args,
              }
            } else if (event.type === "tool-result") {
              yield {
                type: "tool-result" as const,
                toolCallId: event.toolCallId,
                result: event.result,
              }
            } else if (event.type === "error") {
              yield { type: "error" as const, error: event.error }
            }
          }
        })()

        return {
          type: "ai-sdk" as const,
          result: {
            text: Promise.resolve(textParts),
            toolCalls: Promise.resolve(toolCalls),
            toolResults: Promise.resolve(toolResults),
            finishReason: Promise.resolve("stop" as const),
            usage: Promise.resolve({ promptTokens: 0, completionTokens: 0 }),
            warnings: Promise.resolve([]),
            request: Promise.resolve({}),
            response: Promise.resolve({
              id: "fallback",
              modelId: input.model.id,
              timestamp: new Date(),
            }),
            fullStream,
            experimentalOutput: Promise.resolve(undefined),
            experimentalMessages: Promise.resolve({ messages: [] }),
          } as any
        }
      }

      // Wire up toolExecutor for DWS workflow models so that tool calls
      // from the workflow service are executed via opencode's tool system
      // and results sent back over the WebSocket.
      if (language instanceof GitLabWorkflowLanguageModel) {
        const workflowModel = language as GitLabWorkflowLanguageModel & {
          sessionID?: string
          sessionPreapprovedTools?: string[]
          approvalHandler?: (approvalTools: { name: string; args: string }[]) => Promise<{ approved: boolean }>
        }
        workflowModel.sessionID = input.sessionID
        workflowModel.systemPrompt = prepared.system.join("\n")
        workflowModel.toolExecutor = async (toolName, argsJson, _requestID) => {
          const t = prepared.tools[toolName]
          if (!t || !t.execute) {
            return { result: "", error: `Unknown tool: ${toolName}` }
          }
          try {
            const result = await t.execute!(JSON.parse(argsJson), {
              toolCallId: _requestID,
              messages: input.messages,
              abortSignal: input.abort,
            })
            const output = typeof result === "string" ? result : (result?.output ?? JSON.stringify(result))
            return {
              result: output,
              metadata: typeof result === "object" ? result?.metadata : undefined,
              title: typeof result === "object" ? result?.title : undefined,
            }
          } catch (e: any) {
            return { result: "", error: e.message ?? String(e) }
          }
        }

        const ruleset = Permission.merge(input.agent.permission ?? [], input.permission ?? [])
        workflowModel.sessionPreapprovedTools = Object.keys(prepared.tools).filter((name) => {
          const match = ruleset.findLast((rule) => Wildcard.match(name, rule.permission))
          return !match || match.action !== "ask"
        })

        const bridge = yield* EffectBridge.make()
        const approvedToolsForSession = new Set<string>()
        workflowModel.approvalHandler = bridge.bind(async (approvalTools) => {
          const uniqueNames = [...new Set(approvalTools.map((t: { name: string }) => t.name))] as string[]
          // Auto-approve tools that were already approved in this session
          // (prevents infinite approval loops for server-side MCP tools)
          if (uniqueNames.every((name) => approvedToolsForSession.has(name))) {
            return { approved: true }
          }

          const id = PermissionID.ascending()
          let unsub: (() => void) | undefined
          try {
            unsub = Bus.subscribe(Permission.Event.Replied, (evt) => {
              if (evt.properties.requestID === id) void evt.properties.reply
            })
            const toolPatterns = approvalTools.map((t: { name: string; args: string }) => {
              try {
                const parsed = JSON.parse(t.args) as Record<string, unknown>
                const title = (parsed?.title ?? parsed?.name ?? "") as string
                return title ? `${t.name}: ${title}` : t.name
              } catch {
                return t.name
              }
            })
            const uniquePatterns = [...new Set(toolPatterns)] as string[]
            await bridge.promise(
              perm.ask({
                id,
                sessionID: SessionID.make(input.sessionID),
                permission: "workflow_tool_approval",
                patterns: uniquePatterns,
                metadata: { tools: approvalTools },
                always: uniquePatterns,
                ruleset: [],
              }),
            )
            for (const name of uniqueNames) approvedToolsForSession.add(name)
            workflowModel.sessionPreapprovedTools = [...(workflowModel.sessionPreapprovedTools ?? []), ...uniqueNames]
            return { approved: true }
          } catch {
            return { approved: false }
          } finally {
            unsub?.()
          }
        })
      }

      // Telemetry removed in this fork

      // Runtime seam: native is an opt-in adapter over @opencode-ai/llm. It
      // either returns a ready LLMEvent stream or a concrete fallback reason.
      if (flags.experimentalNativeLlm) {
        const native = LLMNativeRuntime.stream({
          model: input.model,
          provider: item,
          auth: info,
          llmClient,
          messages: prepared.messages,
          tools: prepared.tools,
          toolChoice: input.toolChoice,
          temperature: prepared.params.temperature,
          topP: prepared.params.topP,
          topK: prepared.params.topK,
          maxOutputTokens: prepared.params.maxOutputTokens,
          providerOptions: prepared.params.options,
          headers: prepared.headers,
          abort: input.abort,
        })
        if (native.type === "supported") {
          yield* Effect.logInfo("llm runtime selected").pipe(
            Effect.annotateLogs({
              "llm.runtime": "native",
              "llm.provider": input.model.providerID,
              "llm.model": input.model.id,
            }),
          )
          return {
            type: "native" as const,
            stream: native.stream,
          }
        }
        yield* Effect.logInfo("llm runtime selected").pipe(
          Effect.annotateLogs({
            "llm.runtime": "ai-sdk",
            "llm.provider": input.model.providerID,
            "llm.model": input.model.id,
            "llm.native_unsupported_reason": native.reason,
          }),
        )
        l.info("native runtime unavailable; falling back to ai-sdk", { reason: native.reason })
      }

      yield* Effect.logInfo("llm runtime selected").pipe(
        Effect.annotateLogs({
          "llm.runtime": "ai-sdk",
          "llm.provider": input.model.providerID,
          "llm.model": input.model.id,
        }),
      )
      // Default runtime path: AI SDK owns provider execution and tool dispatch;
      // LLMAISDK.toLLMEvents below normalizes fullStream parts for the processor.
      return {
        type: "ai-sdk" as const,
        result: streamText({
          onError(error) {
            l.error("stream error", {
              error,
            })
          },
          async experimental_repairToolCall(failed) {
            const lower = failed.toolCall.toolName.toLowerCase()
            if (lower !== failed.toolCall.toolName && prepared.tools[lower]) {
              l.info("repairing tool call", {
                tool: failed.toolCall.toolName,
                repaired: lower,
              })
              return {
                ...failed.toolCall,
                toolName: lower,
              }
            }
            return {
              ...failed.toolCall,
              input: JSON.stringify({
                tool: failed.toolCall.toolName,
                error: failed.error.message,
              }),
              toolName: "invalid",
            }
          },
          temperature: prepared.params.temperature,
          topP: prepared.params.topP,
          topK: prepared.params.topK,
          providerOptions: ProviderTransform.providerOptions(input.model, prepared.params.options),
          activeTools: Object.keys(prepared.tools).filter((x) => x !== "invalid"),
          tools: prepared.tools,
          toolChoice: input.toolChoice,
          maxOutputTokens: prepared.params.maxOutputTokens,
          abortSignal: input.abort,
          headers: prepared.headers,
          maxRetries: input.retries ?? 0,
          messages: prepared.messages,
          model: wrapLanguageModel({
            model: language,
            middleware: [
              {
                specificationVersion: "v3" as const,
                async transformParams(args) {
                  if (args.type === "stream") {
                    // @ts-expect-error
                    args.params.prompt = ProviderTransform.message(
                      args.params.prompt,
                      input.model,
                      prepared.messageTransformOptions,
                    )
                  }
                  return args.params
                },
              },
            ],
          }),
          experimental_telemetry: {
            isEnabled: cfg.experimental?.openTelemetry,
            functionId: "session.llm",
            tracer: telemetryTracer,
            metadata: {
              userId: cfg.username ?? "unknown",
              sessionId: input.sessionID,
            },
          },
        }),
      }
    })

    const stream: Interface["stream"] = (input) =>
      Stream.scoped(
        Stream.unwrap(
          Effect.gen(function* () {
            const ctrl = yield* Effect.acquireRelease(
              Effect.sync(() => new AbortController()),
              (ctrl) => Effect.sync(() => ctrl.abort()),
            )

            const result = yield* run({ ...input, abort: ctrl.signal })

            if (result.type === "native") return result.stream

            // Adapter seam: both runtimes expose the same LLMEvent stream. Native
            // already returns one; AI SDK streams are converted here.
            const state = LLMAISDK.adapterState()
            return Stream.fromAsyncIterable(result.result.fullStream, (e) =>
              e instanceof Error ? e : new Error(String(e)),
            ).pipe(
              Stream.mapEffect((event: any) => LLMAISDK.toLLMEvents(state, event) as any),
              Stream.flatMap((events: any) => Stream.fromIterable(events) as any),
            ) as any
          }),
        ),
      )

    return Service.of({ stream })
  }),
)

export const layer = live.pipe(Layer.provide(Permission.defaultLayer))

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Auth.defaultLayer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(Provider.defaultLayer),
    Layer.provide(Plugin.defaultLayer),
    Layer.provide(
      LLMClient.layer.pipe(Layer.provide(Layer.mergeAll(RequestExecutor.defaultLayer, WebSocketExecutor.layer))),
    ),
    Layer.provide(RuntimeFlags.defaultLayer),
  ),
)

export const hasToolCalls = LLMRequestPrep.hasToolCalls

export * as LLM from "./llm"
