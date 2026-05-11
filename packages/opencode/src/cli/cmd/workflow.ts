/**
 * /spec and /vibe Commands - Workflow Mode Management
 *
 * Implements the /spec and /vibe commands for switching between workflow modes:
 * - spec: Detailed planning mode with step-by-step task execution
 * - vibe: Quick exploration mode with minimal planning
 */

import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { bootstrap } from "../bootstrap"
import { Effect, Option } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import {
  Service as WorkflowService,
  WorkflowMode,
  type ModeConfig,
  defaultLayer as workflowLayer,
} from "@/workflow/workflow"

const log = Log.create({ service: "workflow-cmd" })

/**
 * Format mode description for display
 */
function formatModeDescription(mode: WorkflowMode): string {
  const descriptions: Record<WorkflowMode, string> = {
    spec: "Detailed planning mode with step-by-step task execution and quality checkpoints",
    vibe: "Quick exploration mode with minimal planning and fast iteration",
  }
  return descriptions[mode]
}

/**
 * Get current mode display
 */
async function getCurrentModeDisplay(): Promise<{ mode: WorkflowMode; config: ModeConfig }> {
  const program = Effect.gen(function* () {
    const workflow = yield* WorkflowService
    const mode = yield* workflow.getMode()
    const config = yield* workflow.getConfig()
    return { mode, config }
  })

  return Effect.runPromise(Effect.provide(program, workflowLayer) as any)
}

/**
 * Set workflow mode
 */
async function setMode(mode: WorkflowMode, specFile?: string): Promise<void> {
  const program = Effect.gen(function* () {
    const workflow = yield* WorkflowService
    yield* workflow.setMode(mode, { specFile })
    log.info("Workflow mode changed", { mode, specFile })
  })

  await Effect.runPromise(Effect.provide(program, workflowLayer) as any)
}

/**
 * Get system prompt injection for display
 */
async function getPromptInjection(): Promise<Option.Option<string>> {
  const program = Effect.gen(function* () {
    const workflow = yield* WorkflowService
    return yield* workflow.getSystemPromptInjection()
  })

  return Effect.runPromise(Effect.provide(program, workflowLayer) as any)
}

/**
 * /spec command - Switch to specification mode
 */
export const SpecCommand = cmd({
  command: "spec [file]",
  describe: "Switch to specification mode for detailed planning",
  builder: (yargs: Argv) => {
    return yargs
      .positional("file", {
        describe: "Path to specification markdown file",
        type: "string",
      })
      .option("show", {
        alias: "s",
        describe: "Show current mode and spec prompt",
        type: "boolean",
        default: false,
      })
      .option("prompt", {
        alias: "p",
        describe: "Show the system prompt injection",
        type: "boolean",
        default: false,
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      // Show current mode
      if (args.show) {
        const { mode, config } = await getCurrentModeDisplay()
        UI.println(UI.Style.TEXT_INFO_BOLD + "Current Workflow Mode:" + UI.Style.TEXT_NORMAL)
        UI.println("")
        UI.println(`  Mode: ${mode === "spec" ? UI.Style.TEXT_SUCCESS_BOLD : UI.Style.TEXT_NORMAL_BOLD}${mode}${UI.Style.TEXT_NORMAL}`)
        UI.println(`  ${formatModeDescription(mode)}`)
        
        if (config.specFile) {
          UI.println("")
          UI.println(UI.Style.TEXT_DIM + "Active spec file:" + UI.Style.TEXT_NORMAL)
          UI.println(`  ${config.specFile}`)
        }
        
        UI.println("")
        UI.println(UI.Style.TEXT_DIM + "Configuration:" + UI.Style.TEXT_NORMAL)
        UI.println(`  Auto-convert tasks: ${config.autoConvertTasks}`)
        UI.println(`  Enable reflection: ${config.enableReflection}`)
        return
      }

      // Show prompt injection
      if (args.prompt) {
        const injection = await getPromptInjection()
        if (Option.isSome(injection)) {
          UI.println(UI.Style.TEXT_INFO_BOLD + "System Prompt Injection:" + UI.Style.TEXT_NORMAL)
          UI.println("")
          UI.println(injection.value)
        } else {
          UI.println(UI.Style.TEXT_DIM + "No prompt injection active." + UI.Style.TEXT_NORMAL)
        }
        return
      }

      // Switch to spec mode
      const specFile = args.file as string | undefined
      await setMode("spec", specFile)

      UI.println(UI.Style.TEXT_SUCCESS + "✓ Switched to SPEC mode" + UI.Style.TEXT_NORMAL)
      UI.println("")
      UI.println(formatModeDescription("spec"))
      
      if (specFile) {
        UI.println("")
        UI.println(UI.Style.TEXT_INFO + "Loading spec file:" + UI.Style.TEXT_NORMAL)
        UI.println(`  ${specFile}`)
        
        // Load spec file content
        const program = Effect.gen(function* () {
          const workflow = yield* WorkflowService
          return yield* workflow.loadSpec(specFile)
        })
        
        try {
          const content = await Effect.runPromise(Effect.provide(program, workflowLayer) as any)
          UI.println("")
          UI.println(UI.Style.TEXT_DIM + "Spec loaded successfully." + UI.Style.TEXT_NORMAL)
          log.info("Spec file loaded", { filepath: specFile })
        } catch (error) {
          UI.println(UI.Style.TEXT_WARNING + "Warning: Could not load spec file" + UI.Style.TEXT_NORMAL)
          log.warn("Failed to load spec file", { filepath: specFile, error })
        }
      }

      UI.println("")
      UI.println(UI.Style.TEXT_DIM + "Hint: Type /vibe to switch back to quick exploration mode." + UI.Style.TEXT_NORMAL)
    })
  },
})

/**
 * /vibe command - Switch to vibe/exploration mode
 */
export const VibeCommand = cmd({
  command: "vibe",
  describe: "Switch to vibe mode for quick exploration",
  builder: (yargs: Argv) => {
    return yargs
      .option("show", {
        alias: "s",
        describe: "Show current mode and vibe prompt",
        type: "boolean",
        default: false,
      })
      .option("prompt", {
        alias: "p",
        describe: "Show the system prompt injection",
        type: "boolean",
        default: false,
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      // Show current mode
      if (args.show) {
        const { mode, config } = await getCurrentModeDisplay()
        UI.println(UI.Style.TEXT_INFO_BOLD + "Current Workflow Mode:" + UI.Style.TEXT_NORMAL)
        UI.println("")
        UI.println(`  Mode: ${mode === "vibe" ? UI.Style.TEXT_SUCCESS_BOLD : UI.Style.TEXT_NORMAL_BOLD}${mode}${UI.Style.TEXT_NORMAL}`)
        UI.println(`  ${formatModeDescription(mode)}`)
        
        UI.println("")
        UI.println(UI.Style.TEXT_DIM + "Configuration:" + UI.Style.TEXT_NORMAL)
        UI.println(`  Auto-convert tasks: ${config.autoConvertTasks}`)
        UI.println(`  Enable reflection: ${config.enableReflection}`)
        return
      }

      // Show prompt injection
      if (args.prompt) {
        const injection = await getPromptInjection()
        if (Option.isSome(injection)) {
          UI.println(UI.Style.TEXT_INFO_BOLD + "System Prompt Injection:" + UI.Style.TEXT_NORMAL)
          UI.println("")
          UI.println(injection.value)
        } else {
          UI.println(UI.Style.TEXT_DIM + "No prompt injection active." + UI.Style.TEXT_NORMAL)
        }
        return
      }

      // Switch to vibe mode
      await setMode("vibe")

      UI.println(UI.Style.TEXT_SUCCESS + "✓ Switched to VIBE mode" + UI.Style.TEXT_NORMAL)
      UI.println("")
      UI.println(formatModeDescription("vibe"))

      UI.println("")
      UI.println(UI.Style.TEXT_DIM + "Hint: Type /spec to switch to detailed planning mode." + UI.Style.TEXT_NORMAL)
    })
  },
})

/**
 * Format mode for TUI status bar
 */
export function formatModeForStatus(mode: WorkflowMode): string {
  const indicators: Record<WorkflowMode, { text: string; style: string }> = {
    spec: { text: "SPEC", style: "TEXT_INFO_BOLD" },
    vibe: { text: "VIBE", style: "TEXT_SUCCESS" },
  }

  const indicator = indicators[mode]
  // @ts-ignore - dynamic style access
  return UI.Style[indicator.style] + indicator.text + UI.Style.TEXT_NORMAL
}
