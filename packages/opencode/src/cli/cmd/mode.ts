/**
 * /mode Command - Approval Mode Management
 *
 * Implements the /mode command for switching between approval modes:
 * - strict: All operations require explicit approval
 * - default: File ops auto-allowed, shell commands use allowlist/denylist
 * - autopilot: Most operations auto-allowed, dangerous commands queued
 * - yolo: Almost everything auto-allowed (with warning)
 */

import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { bootstrap } from "../bootstrap"
import { AppRuntime } from "@/effect/app-runtime"
import {
  ApprovalMode,
  parseApprovalMode,
  requiresWarning,
  getYOLOWarning,
  MODE_POLICIES,
} from "@/permission/approval-mode"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "mode-cmd" })

/**
 * Format mode description for display
 */
function formatModeDescription(mode: ApprovalMode): string {
  const descriptions: Record<ApprovalMode, string> = {
    strict: "All operations require explicit user approval",
    default: "File operations auto-allowed; shell commands use allowlist/denylist",
    autopilot: "Most operations auto-allowed; dangerous commands queued for later approval",
    yolo: "Almost all operations auto-allowed (destructive commands still blocked)",
  }
  return descriptions[mode]
}

/**
 * Format mode policy for display
 */
function formatModePolicy(mode: ApprovalMode): string {
  const policy = MODE_POLICIES[mode]
  const items = [
    `  read: ${policy.read}`,
    `  edit: ${policy.edit}`,
    `  create: ${policy.create}`,
    `  delete: ${policy.delete}`,
    `  bash: ${policy.bash}`,
    `  glob: ${policy.glob}`,
    `  grep: ${policy.grep}`,
  ]
  return items.join("\n")
}

/**
 * Get current mode from runtime (placeholder - would integrate with actual state)
 */
async function getCurrentMode(): Promise<ApprovalMode> {
  // In actual implementation, this would read from Config or runtime state
  // For now, return default
  return "default"
}

/**
 * Set mode in runtime (placeholder - would integrate with actual state)
 */
async function setMode(mode: ApprovalMode): Promise<void> {
  // In actual implementation, this would update Config and runtime state
  log.info("Setting approval mode", { mode })
}

/**
 * Prompt user for YOLO confirmation
 */
async function confirmYOLO(): Promise<boolean> {
  UI.println(UI.Style.TEXT_WARNING + getYOLOWarning() + UI.Style.TEXT_NORMAL)
  UI.println("")
  UI.println("Type 'yes' to confirm YOLO mode activation:")

  // In actual TUI implementation, this would use proper input handling
  // For CLI, we'll use a simplified approach
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(false)
    }, 30000) // 30 second timeout

    process.stdin.once("data", (data) => {
      clearTimeout(timeout)
      const input = data.toString().trim().toLowerCase()
      resolve(input === "yes" || input === "y")
    })
  })
}

export const ModeCommand = cmd({
  command: "mode [mode]",
  describe: "Manage approval mode for tool execution",
  builder: (yargs: Argv) => {
    return yargs
      .positional("mode", {
        describe: "Approval mode to set",
        type: "string",
        choices: ["strict", "default", "autopilot", "yolo"],
      })
      .option("show", {
        alias: "s",
        describe: "Show current mode without changing",
        type: "boolean",
        default: false,
      })
      .option("list", {
        alias: "l",
        describe: "List available modes and their policies",
        type: "boolean",
        default: false,
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      // List mode
      if (args.list) {
        UI.println(UI.Style.TEXT_INFO_BOLD + "Available Approval Modes:" + UI.Style.TEXT_NORMAL)
        UI.println("")

        const modes: ApprovalMode[] = ["strict", "default", "autopilot", "yolo"]
        const currentMode = await getCurrentMode()

        for (const mode of modes) {
          const isCurrent = mode === currentMode
          const marker = isCurrent ? UI.Style.TEXT_SUCCESS + "● " + UI.Style.TEXT_NORMAL : "  "
          const name = isCurrent
            ? UI.Style.TEXT_SUCCESS_BOLD + mode + UI.Style.TEXT_NORMAL
            : UI.Style.TEXT_BOLD + mode + UI.Style.TEXT_NORMAL

          UI.println(`${marker}${name}`)
          UI.println(`    ${formatModeDescription(mode)}`)

          if (isCurrent) {
            UI.println("")
            UI.println(UI.Style.TEXT_DIM + "Current policy:" + UI.Style.TEXT_NORMAL)
            UI.println(formatModePolicy(mode))
          }

          UI.println("")
        }

        return
      }

      // Show current mode
      if (args.show || !args.mode) {
        const currentMode = await getCurrentMode()
        UI.println(UI.Style.TEXT_INFO + "Current approval mode: " + UI.Style.TEXT_NORMAL + UI.Style.TEXT_BOLD + currentMode + UI.Style.TEXT_NORMAL)
        UI.println("")
        UI.println(formatModeDescription(currentMode))
        UI.println("")
        UI.println(UI.Style.TEXT_DIM + "Policy:" + UI.Style.TEXT_NORMAL)
        UI.println(formatModePolicy(currentMode))
        return
      }

      // Set mode
      const modeInput = args.mode.toLowerCase()
      const mode = parseApprovalMode(modeInput)

      if (!mode) {
        UI.error(`Invalid mode: ${args.mode}`)
        UI.error("Valid modes: strict, default, autopilot, yolo")
        process.exit(1)
      }

      // Check if YOLO mode requires warning
      if (mode === "yolo" && requiresWarning(mode)) {
        const confirmed = await confirmYOLO()
        if (!confirmed) {
          UI.println(UI.Style.TEXT_INFO + "YOLO mode activation cancelled." + UI.Style.TEXT_NORMAL)
          return
        }
      }

      // Set the mode
      await setMode(mode)

      UI.println(UI.Style.TEXT_SUCCESS + `Approval mode set to: ${mode}` + UI.Style.TEXT_NORMAL)
      UI.println("")
      UI.println(formatModeDescription(mode))

      // Log the mode change
      log.info("Approval mode changed", { from: await getCurrentMode(), to: mode })
    })
  },
})

/**
 * Format mode for TUI status bar
 */
export function formatModeForStatus(mode: ApprovalMode): string {
  const indicators: Record<ApprovalMode, { text: string; style: string }> = {
    strict: { text: "STRICT", style: "TEXT_WARNING_BOLD" },
    default: { text: "DEFAULT", style: "TEXT_INFO" },
    autopilot: { text: "AUTO", style: "TEXT_SUCCESS" },
    yolo: { text: "YOLO", style: "TEXT_ERROR_BOLD" },
  }

  const indicator = indicators[mode]
  // @ts-ignore - dynamic style access
  return UI.Style[indicator.style] + indicator.text + UI.Style.TEXT_NORMAL
}
