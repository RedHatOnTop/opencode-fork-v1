import { Effect, Option, Schema } from "effect"
import * as Tool from "./tool"
import { Workflow } from "@/workflow/workflow"

export const Parameters = Schema.Struct({
  reason: Schema.optional(Schema.String).annotate({
    description: "Brief explanation of why you're advancing to the next phase",
  }),
})

export const SpecAdvanceTool = Tool.define(
  "spec_advance",
  Effect.gen(function* () {
    const workflowOpt = yield* Effect.serviceOption(Workflow.Service)

    return {
      description: [
        "ADVANCE TO NEXT SPEC PHASE - Call this when you have completed the current phase in spec mode.",
        "",
        "Use this tool to progress through the 4-phase pipeline:",
        "- plan -> execute: Call after the user approves your plan",
        "- execute -> verify: Call after all implementation tasks are done",
        "- verify -> ship: Call after verification passes (tests, lint, typecheck)",
        "- ship -> idle: Call after changes are committed and summarized",
        "",
        "IMPORTANT: Only call this AFTER the user has confirmed the phase is complete.",
        "DO NOT call this tool repeatedly - one call advances one phase.",
        "",
        "The tool will tell you what phase you're now in and what to do next.",
      ].join("\n"),
      parameters: Parameters,
      execute: (_params: { reason?: string }, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (Option.isNone(workflowOpt)) {
            return {
              title: "Workflow service unavailable",
              output: "The workflow service is not available in the current context.",
              metadata: {},
            }
          }

          const workflow = workflowOpt.value
          const currentPhase = yield* workflow.getPhase()
          const isSpec = yield* workflow.isSpecMode()

          if (!isSpec) {
            return {
              title: "Not in spec mode",
              output: "You are not in spec mode. Use /spec to enter spec mode first.",
              metadata: {},
            }
          }

          const newPhase = yield* workflow.advancePhase()

          if (newPhase === currentPhase) {
            return {
              title: "Phase unchanged",
              output: `Already at the final phase. No further advancement possible from "${currentPhase}".`,
              metadata: {},
            }
          }

          const nextSteps: Record<string, string> = {
            plan: "Break down the task into a structured checklist. Do NOT make code changes.",
            execute: "Execute tasks one at a time in dependency order.",
            verify: "Run verification commands (lint, typecheck, test) and fix any failures.",
            ship: "Commit changes with a descriptive message and generate a summary.",
            idle: "Pipeline complete! All phases finished.",
          }

          return {
            title: `Phase advanced: ${currentPhase} -> ${newPhase}`,
            output: [
              `Successfully advanced from "${currentPhase}" to "${newPhase}".`,
              _params.reason ? `\nReason: ${_params.reason}` : "",
              `\nNext step: ${nextSteps[newPhase] ?? "Pipeline complete."}`,
            ]
              .filter(Boolean)
              .join(""),
            metadata: {},
          }
        }).pipe(Effect.orDie),
    }
  }),
)
