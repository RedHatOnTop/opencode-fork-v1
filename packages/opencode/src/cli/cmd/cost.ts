/**
 * /cost Command - Cost Tracking and Management
 *
 * Implements the /cost command for tracking API costs:
 * - status: Show current cost status
 * - session: Show costs for current session
 * - total: Show total accumulated costs
 * - provider: Show costs by provider
 * - model: Show costs by model
 * - reset: Reset cost tracking for a session
 */

import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { bootstrap } from "../bootstrap"
import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import {
  Service as CostService,
  formatCost,
  formatTokens,
  defaultLayer as costLayer,
} from "@/cost/cost"

const log = Log.create({ service: "cost-cmd" })

/**
 * Format aggregated costs for display
 */
function formatAggregatedCosts(
  costs: { totalInputTokens: number; totalOutputTokens: number; totalCost: number; callCount: number },
  label: string
): string {
  const lines = [
    UI.Style.TEXT_INFO_BOLD + `${label}:` + UI.Style.TEXT_NORMAL,
    `  Input Tokens:  ${formatTokens(costs.totalInputTokens)}`,
    `  Output Tokens: ${formatTokens(costs.totalOutputTokens)}`,
    `  Total Cost:    ${UI.Style.TEXT_BOLD}${formatCost(costs.totalCost)}${UI.Style.TEXT_NORMAL}`,
    `  API Calls:     ${costs.callCount}`,
  ]
  return lines.join("\n")
}

/**
 * Show cost status bar (for TUI)
 */
export function formatCostStatusBar(
  sessionCost: number,
  totalCost: number,
  isWarning: boolean,
  isExceeded: boolean
): string {
  const style = isExceeded
    ? UI.Style.TEXT_ERROR_BOLD
    : isWarning
      ? UI.Style.TEXT_WARNING
      : UI.Style.TEXT_DIM

  return `${style}Cost: ${formatCost(sessionCost)}/session | ${formatCost(totalCost)}/total${UI.Style.TEXT_NORMAL}`
}

export const CostCommand = cmd({
  command: "cost [action]",
  describe: "Track and manage API costs",
  builder: (yargs: Argv) => {
    return yargs
      .positional("action", {
        describe: "Action to perform",
        type: "string",
        choices: ["status", "session", "total", "provider", "model", "reset"],
        default: "status",
      })
      .option("provider", {
        alias: "p",
        describe: "Filter by provider ID",
        type: "string",
      })
      .option("model", {
        alias: "m",
        describe: "Filter by model ID",
        type: "string",
      })
      .option("session", {
        alias: "s",
        describe: "Session ID (default: current)",
        type: "string",
      })
      .option("limit", {
        alias: "l",
        describe: "Limit for listings",
        type: "number",
        default: 10,
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const action = args.action as string
      const sessionId = (args.session as string) || "current-session"
      const providerId = args.provider as string | undefined
      const modelId = args.model as string | undefined

      const program = Effect.gen(function* () {
        const cost = yield* CostService

        switch (action) {
          case "status": {
            const status = yield* cost.getCostStatusForTUI
            const totalCosts = yield* cost.getTotalCosts

            UI.println(UI.Style.TEXT_INFO_BOLD + "Cost Status:" + UI.Style.TEXT_NORMAL)
            UI.println("")

            // Status indicator
            const statusText = status.isExceeded
              ? UI.Style.TEXT_ERROR_BOLD + "⚠ LIMIT EXCEEDED" + UI.Style.TEXT_NORMAL
              : status.isWarning
                ? UI.Style.TEXT_WARNING + "⚠ Approaching limit" + UI.Style.TEXT_NORMAL
                : UI.Style.TEXT_SUCCESS + "✓ Within limits" + UI.Style.TEXT_NORMAL

            UI.println(`Status: ${statusText}`)
            UI.println("")
            UI.println(formatCostStatusBar(
              status.sessionCost,
              status.totalCost,
              status.isWarning,
              status.isExceeded
            ))
            UI.println("")
            UI.println(formatAggregatedCosts(totalCosts, "Total Accumulated Costs"))

            break
          }

          case "session": {
            const sessionCosts = yield* cost.getSessionCosts(sessionId)

            UI.println(UI.Style.TEXT_INFO_BOLD + `Session Costs (${sessionId}):` + UI.Style.TEXT_NORMAL)
            UI.println("")

            if (sessionCosts.callCount === 0) {
              UI.println(UI.Style.TEXT_DIM + "No costs recorded for this session yet." + UI.Style.TEXT_NORMAL)
              return
            }

            UI.println(formatAggregatedCosts(sessionCosts, "Session Summary"))

            break
          }

          case "total": {
            const totalCosts = yield* cost.getTotalCosts

            UI.println(UI.Style.TEXT_INFO_BOLD + "Total Accumulated Costs:" + UI.Style.TEXT_NORMAL)
            UI.println("")

            if (totalCosts.callCount === 0) {
              UI.println(UI.Style.TEXT_DIM + "No costs recorded yet." + UI.Style.TEXT_NORMAL)
              return
            }

            UI.println(formatAggregatedCosts(totalCosts, "All Time Costs"))

            // Show cost breakdown
            UI.println("")
            UI.println(UI.Style.TEXT_DIM + "Cost Breakdown:" + UI.Style.TEXT_NORMAL)
            UI.println(`  Input Cost:  ${formatCost(totalCosts.totalInputCost)}`)
            UI.println(`  Output Cost: ${formatCost(totalCosts.totalOutputCost)}`)

            break
          }

          case "provider": {
            if (!providerId) {
              UI.error("Error: --provider is required")
              UI.error("Usage: opencode cost provider --provider <provider-id>")
              UI.println("")
              UI.println(UI.Style.TEXT_DIM + "Common providers:" + UI.Style.TEXT_NORMAL)
              UI.println("  - anthropic")
              UI.println("  - openai")
              UI.println("  - bedrock")
              return
            }

            const providerCosts = yield* cost.getCostsByProvider(providerId)

            UI.println(UI.Style.TEXT_INFO_BOLD + `Provider Costs (${providerId}):` + UI.Style.TEXT_NORMAL)
            UI.println("")

            if (providerCosts.callCount === 0) {
              UI.println(UI.Style.TEXT_DIM + `No costs recorded for ${providerId}.` + UI.Style.TEXT_NORMAL)
              return
            }

            UI.println(formatAggregatedCosts(providerCosts, "Provider Summary"))

            break
          }

          case "model": {
            if (!providerId || !modelId) {
              UI.error("Error: --provider and --model are required")
              UI.error("Usage: opencode cost model --provider <provider-id> --model <model-id>")
              return
            }

            const modelCosts = yield* cost.getCostsByModel(providerId, modelId)

            UI.println(UI.Style.TEXT_INFO_BOLD + `Model Costs (${providerId}:${modelId}):` + UI.Style.TEXT_NORMAL)
            UI.println("")

            if (modelCosts.callCount === 0) {
              UI.println(UI.Style.TEXT_DIM + "No costs recorded for this model." + UI.Style.TEXT_NORMAL)
              return
            }

            UI.println(formatAggregatedCosts(modelCosts, "Model Summary"))

            break
          }

          case "reset": {
            yield* cost.resetSession(sessionId)

            UI.println(UI.Style.TEXT_SUCCESS + `✓ Reset cost tracking for session: ${sessionId}` + UI.Style.TEXT_NORMAL)
            UI.println("")
            UI.println(UI.Style.TEXT_DIM + "Note: This only affects tracking, not actual API charges." + UI.Style.TEXT_NORMAL)

            log.info("Cost tracking reset", { sessionId })
            break
          }

          default: {
            UI.error(`Unknown action: ${action}`)
            UI.error("Valid actions: status, session, total, provider, model, reset")
          }
        }
      })

      await Effect.runPromise(Effect.provide(program, costLayer))
    })
  },
})
