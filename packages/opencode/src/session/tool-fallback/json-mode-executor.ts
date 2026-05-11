import type { Tool, ModelMessage } from "ai"
import type { ParsedToolCall, ToolExecutionResult, StreamEvent, LLMInterface } from "./types"
import { generateJsonModePrompt } from "./prompts"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "tool-fallback:json-mode" })

/**
 * JSON Mode executor for tool calling fallback
 * 
 * This executor is used when:
 * - model.capabilities.toolcall === false
 * - model supports structured output (json mode)
 * 
 * Native tool calling models never execute this code (performance isolation)
 */

export interface JsonModeExecutorOptions {
  maxIterations: number
  timeoutMs: number
}

export class JsonModeExecutor {
  private options: JsonModeExecutorOptions

  constructor(options: Partial<JsonModeExecutorOptions> = {}) {
    this.options = {
      maxIterations: 5,
      timeoutMs: 30000,
      ...options,
    }
  }

  /**
   * Execute JSON mode tool calling
   */
  async *execute(
    messages: ModelMessage[],
    tools: Record<string, Tool>,
    llm: LLMInterface
  ): AsyncIterable<StreamEvent> {
    const toolPrompt = generateJsonModePrompt(tools)
    let currentMessages = this.injectToolPrompt(messages, toolPrompt)
    let iteration = 0

    log.info("Starting JSON mode execution", {
      maxIterations: this.options.maxIterations,
      toolCount: Object.keys(tools).length,
    })

    while (iteration < this.options.maxIterations) {
      iteration++
      log.debug("JSON mode iteration", { iteration })

      try {
        // Request structured output
        const response = await llm.stream(currentMessages, {
          output: {
            type: "object",
            properties: {
              tool_calls: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    arguments: { type: "object" },
                  },
                  required: ["name", "arguments"],
                },
              },
            },
          },
        })

        const content = response.content
        log.debug("LLM response received", { contentLength: content.length })

        // Extract JSON tool calls
        const toolCalls = this.extractToolCalls(content)

        if (toolCalls.length === 0) {
          // No tool calls, treat as final response
          log.info("No tool calls found, yielding text response")
          yield { type: "text-delta", textDelta: content }
          return
        }

        // Validate and execute tool calls
        const validToolCalls: ParsedToolCall[] = []
        const executedResults: ToolExecutionResult[] = []

        for (const tc of toolCalls) {
          // Validate tool exists
          if (!tools[tc.name]) {
            log.warn("Unknown tool requested", { toolName: tc.name })
            continue
          }

          const toolCallId = this.generateId()
          tc.id = toolCallId

          // Yield tool call event
          yield {
            type: "tool-call",
            toolCallId,
            toolName: tc.name,
            args: tc.arguments,
          }

          validToolCalls.push(tc)
        }

        if (validToolCalls.length === 0) {
          // No valid tools found, yield error and continue
          yield {
            type: "error",
            error: `No valid tools found. Available: ${Object.keys(tools).join(", ")}`,
          }
          continue
        }

        // Execute all valid tools in parallel
        log.info("Executing tools", { toolCount: validToolCalls.length, iteration })
        const results = await Promise.all(
          validToolCalls.map((tc) => this.executeTool(tc, tools))
        )

        // Yield results and collect for next iteration
        for (let i = 0; i < validToolCalls.length; i++) {
          const tc = validToolCalls[i]
          const result = results[i]

          executedResults.push({
            toolCallId: tc.id,
            toolName: tc.name,
            result: result.output,
            error: result.error,
          })

          yield {
            type: "tool-result",
            toolCallId: tc.id,
            result: result.output,
            error: result.error,
          }
        }

        // Prepare messages for next iteration
        currentMessages = this.addToolResults(
          currentMessages,
          content,
          validToolCalls,
          results
        )
      } catch (error) {
        log.error("Error in JSON mode execution", { error, iteration })
        yield {
          type: "error",
          error: `JSON mode execution error: ${error instanceof Error ? error.message : String(error)}`,
        }
        return
      }
    }

    log.warn("Max iterations reached", { maxIterations: this.options.maxIterations })
    yield {
      type: "error",
      error: `Maximum tool calling iterations (${this.options.maxIterations}) exceeded`,
    }
  }

  /**
   * Extract tool calls from JSON response
   */
  private extractToolCalls(content: string): ParsedToolCall[] {
    const toolCalls: ParsedToolCall[] = []

    try {
      // Try to parse entire content as JSON
      const parsed = JSON.parse(content)

      if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
        for (const tc of parsed.tool_calls) {
          if (tc.name && typeof tc.name === "string") {
            toolCalls.push({
              id: this.generateId(),
              name: tc.name,
              arguments: tc.arguments || tc.args || {},
            })
          }
        }
      }
    } catch {
      // Try to extract JSON from markdown code block
      const codeBlockPattern = /```(?:json)?\s*\n?([\s\S]*?)```/
      const match = content.match(codeBlockPattern)

      if (match && match[1]) {
        try {
          const parsed = JSON.parse(match[1])

          if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
            for (const tc of parsed.tool_calls) {
              if (tc.name && typeof tc.name === "string") {
                toolCalls.push({
                  id: this.generateId(),
                  name: tc.name,
                  arguments: tc.arguments || tc.args || {},
                })
              }
            }
          }
        } catch (innerError) {
          log.debug("Failed to parse JSON from code block", { innerError })
        }
      }

      // Try to find JSON pattern in text
      if (toolCalls.length === 0) {
        const jsonPattern = /\{\s*["']tool_calls["']\s*:\s*\[/
        if (jsonPattern.test(content)) {
          // Try to extract JSON array from text
          const arrayMatch = content.match(/\[\s*\{[\s\S]*?\}\s*\]/)
          if (arrayMatch) {
            try {
              const parsed = JSON.parse(arrayMatch[0])
              if (Array.isArray(parsed)) {
                for (const tc of parsed) {
                  if (tc.name && typeof tc.name === "string") {
                    toolCalls.push({
                      id: this.generateId(),
                      name: tc.name,
                      arguments: tc.arguments || tc.args || {},
                    })
                  }
                }
              }
            } catch {
              // Failed to parse
            }
          }
        }
      }
    }

    return toolCalls
  }

  /**
   * Execute a tool call
   */
  private async executeTool(
    toolCall: ParsedToolCall,
    tools: Record<string, Tool>
  ): Promise<{ output: string; error?: string }> {
    const tool = tools[toolCall.name]

    if (!tool) {
      return { output: "", error: `Tool "${toolCall.name}" not found` }
    }

    if (!tool.execute) {
      return { output: "", error: `Tool "${toolCall.name}" has no execute function` }
    }

    try {
      const result = await tool.execute(toolCall.arguments, {
        toolCallId: toolCall.id,
        messages: [],
        abortSignal: new AbortController().signal,
      })

      const output = typeof result === "string" ? result : JSON.stringify(result)
      return { output }
    } catch (error) {
      return {
        output: "",
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Inject tool prompt into system message
   */
  private injectToolPrompt(messages: ModelMessage[], toolPrompt: string): ModelMessage[] {
    const systemIndex = messages.findIndex((m) => m.role === "system")

    if (systemIndex >= 0) {
      const systemMsg = messages[systemIndex]
      const existingContent =
        typeof systemMsg.content === "string" ? systemMsg.content : JSON.stringify(systemMsg.content)

      const newContent = `${existingContent}\n\n${toolPrompt}`

      const newMessages = [...messages]
      newMessages[systemIndex] = {
        ...systemMsg,
        content: newContent,
      } as ModelMessage
      return newMessages
    }

    return [{ role: "system", content: toolPrompt }, ...messages]
  }

  /**
   * Add tool results to conversation history
   */
  private addToolResults(
    messages: ModelMessage[],
    assistantResponse: string,
    toolCalls: ParsedToolCall[],
    results: { output: string; error?: string }[]
  ): ModelMessage[] {
    // Build tool result message
    const toolResults = toolCalls.map((tc, i) => ({
      tool_call_id: tc.id,
      name: tc.name,
      result: results[i].error ? `Error: ${results[i].error}` : results[i].output,
    }))

    return [
      ...messages,
      { role: "assistant", content: assistantResponse },
      {
        role: "user",
        content: `Tool execution results:\n${JSON.stringify(toolResults, null, 2)}`,
      },
    ]
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `fallback_json_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }
}
