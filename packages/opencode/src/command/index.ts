import { BusEvent } from "@/bus/bus-event"
import { InstanceState } from "@/effect/instance-state"
import { EffectBridge } from "@/effect/bridge"
import type { InstanceContext } from "@/project/instance"
import { SessionID, MessageID } from "@/session/schema"
import { Effect, Layer, Context, Schema } from "effect"
import z from "zod"
import { zod, ZodOverride } from "@/util/effect-zod"
import { withStatics } from "@/util/schema"
import { Config } from "@/config/config"
import { MCP } from "../mcp"
import { Skill } from "../skill"
import PROMPT_INITIALIZE from "./template/initialize.txt"
import PROMPT_REVIEW from "./template/review.txt"

type State = {
  commands: Record<string, Info>
}

export const Event = {
  Executed: BusEvent.define(
    "command.executed",
    Schema.Struct({
      name: Schema.String,
      sessionID: SessionID,
      arguments: Schema.String,
      messageID: MessageID,
    }),
  ),
}

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  source: Schema.optional(Schema.Literals(["command", "mcp", "skill"])),
  // Some command templates are lazy promises from MCP prompt resolution.
  template: Schema.Unknown.annotate({ [ZodOverride]: z.promise(z.string()).or(z.string()) }),
  subtask: Schema.optional(Schema.Boolean),
  hints: Schema.Array(Schema.String),
})
  .annotate({ identifier: "Command" })
  .pipe(withStatics((s) => ({ zod: zod(s) })))

// for some reason zod is inferring `string` for z.promise(z.string()).or(z.string()) so we have to manually override it
export type Info = Omit<Schema.Schema.Type<typeof Info>, "template"> & { template: Promise<string> | string }

export function hints(template: string) {
  const result: string[] = []
  const numbered = template.match(/\$\d+/g)
  if (numbered) {
    for (const match of [...new Set(numbered)].sort()) result.push(match)
  }
  if (template.includes("$ARGUMENTS")) result.push("$ARGUMENTS")
  return result
}

export const Default = {
  INIT: "init",
  REVIEW: "review",
} as const

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly list: () => Effect.Effect<Info[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Command") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const mcp = yield* MCP.Service
    const skill = yield* Skill.Service

    const init = Effect.fn("Command.state")(function* (ctx: InstanceContext) {
      const cfg = yield* config.get()
      const bridge = yield* EffectBridge.make()
      const commands: Record<string, Info> = {}

      commands[Default.INIT] = {
        name: Default.INIT,
        description: "guided AGENTS.md setup",
        source: "command",
        get template() {
          return PROMPT_INITIALIZE.replace("${path}", ctx.worktree)
        },
        hints: hints(PROMPT_INITIALIZE),
      }
      commands[Default.REVIEW] = {
        name: Default.REVIEW,
        description: "review changes [commit|branch|pr], defaults to uncommitted",
        source: "command",
        get template() {
          return PROMPT_REVIEW.replace("${path}", ctx.worktree)
        },
        subtask: true,
        hints: hints(PROMPT_REVIEW),
      }

      commands["mode"] = {
        name: "mode",
        description: "Switch approval mode: strict, default, autopilot, or yolo",
        source: "command",
        get template() {
          return "Switch the approval mode to: $1. Valid modes: strict, default, autopilot, yolo. If switching to yolo, warn the user about the risks first. Report the current mode after switching."
        },
        hints: ["$1"],
      }

      commands["spec"] = {
        name: "spec",
        description: "Activate Spec mode (Plan→Execute→Verify→Ship workflow)",
        source: "command",
        get template() {
          return "Activate Spec mode. You will follow a structured 4-phase workflow: Plan → Execute → Verify → Ship. Start by exploring the codebase and creating a task breakdown. Do not make code changes until the Plan phase is complete."
        },
        hints: [],
      }

      commands["vibe"] = {
        name: "vibe",
        description: "Activate Vibe mode (fast exploratory coding)",
        source: "command",
        get template() {
          return "Activate Vibe mode. Move fast and iterate quickly. Make reasonable assumptions without excessive questioning. Focus on working code over perfect documentation."
        },
        hints: [],
      }

      commands["compact"] = {
        name: "compact",
        description: "Manually trigger context compaction",
        source: "command",
        get template() {
          return "The user has requested a context compaction. Summarize the conversation so far, preserving key decisions, file changes, and current task state. Remove redundant details while keeping actionable context."
        },
        hints: [],
      }

      commands["cost"] = {
        name: "cost",
        description: "Show current session cost and token usage",
        source: "command",
        get template() {
          return "Display the current session's token usage and estimated cost. Report: total input tokens, total output tokens, estimated cost in USD, and which models were used."
        },
        hints: [],
      }

      commands["tasks"] = {
        name: "tasks",
        description: "Show current task list and progress",
        source: "command",
        get template() {
          return "Display the current task list. Show each task's ID, subject, status (pending/in_progress/completed), owner, and dependencies. Also show a summary: total, pending, in progress, completed."
        },
        hints: [],
      }

      commands["memory"] = {
        name: "memory",
        description: "View or manage long-term memory",
        source: "command",
        get template() {
          return "Display all memory entries across all scopes (global, project, session). For each entry show: scope indicator, key, value (truncated), and tags."
        },
        hints: [],
      }

      commands["queue"] = {
        name: "queue",
        description: "Manage blocked actions in autopilot mode",
        source: "command",
        get template() {
          return "Display the current action queue. Show all pending blocked actions with their ID, reason for blocking, original command, and timestamp. If $1 is 'approve all', approve all pending actions. If $1 is 'approve $2', approve the specific action. If $1 is 'reject $2', reject the specific action."
        },
        hints: ["$1"],
      }

      for (const [name, command] of Object.entries(cfg.command ?? {})) {
        commands[name] = {
          name,
          agent: command.agent,
          model: command.model,
          description: command.description,
          source: "command",
          get template() {
            return command.template
          },
          subtask: command.subtask,
          hints: hints(command.template),
        }
      }

      for (const [name, prompt] of Object.entries(yield* mcp.prompts())) {
        commands[name] = {
          name,
          source: "mcp",
          description: prompt.description,
          get template() {
            return bridge.promise(
              mcp
                .getPrompt(
                  prompt.client,
                  prompt.name,
                  prompt.arguments
                    ? Object.fromEntries(prompt.arguments.map((argument, i) => [argument.name, `$${i + 1}`]))
                    : {},
                )
                .pipe(
                  Effect.map(
                    (template) =>
                      template?.messages
                        .map((message) => (message.content.type === "text" ? message.content.text : ""))
                        .join("\n") || "",
                  ),
                ),
            )
          },
          hints: prompt.arguments?.map((_, i) => `$${i + 1}`) ?? [],
        }
      }

      for (const item of yield* skill.all()) {
        if (commands[item.name]) continue
        commands[item.name] = {
          name: item.name,
          description: item.description,
          source: "skill",
          get template() {
            return item.content
          },
          hints: [],
        }
      }

      return {
        commands,
      }
    })

    const state = yield* InstanceState.make<State>((ctx) => init(ctx))

    const get = Effect.fn("Command.get")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      return s.commands[name]
    })

    const list = Effect.fn("Command.list")(function* () {
      const s = yield* InstanceState.get(state)
      return Object.values(s.commands)
    })

    return Service.of({ get, list })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Config.defaultLayer),
  Layer.provide(MCP.defaultLayer),
  Layer.provide(Skill.defaultLayer),
)

export * as Command from "."
