/**
 * /queue Command - Action Queue Management for Autopilot Mode
 *
 * Implements the /queue command for managing pending actions in Autopilot mode:
 * - list: Show pending actions
 * - approve: Approve a specific action by ID
 * - approve-all: Approve all pending actions
 * - reject: Reject a specific action by ID
 * - clear: Clear rejected/expired actions
 */

import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { bootstrap } from "../bootstrap"
import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import {
  Service as ActionQueueService,
  QueueItem,
} from "@/permission/action-queue"

const log = Log.create({ service: "queue-cmd" })

/**
 * Format queue item for display
 */
function formatQueueItem(item: QueueItem, index: number): string {
  const date = new Date(item.requestedAt).toLocaleString()
  const statusColor =
    item.status === "pending"
      ? UI.Style.TEXT_WARNING
      : item.status === "approved"
        ? UI.Style.TEXT_SUCCESS
        : item.status === "rejected"
          ? UI.Style.TEXT_DANGER
          : UI.Style.TEXT_DIM

  const lines = [
    `${index + 1}. [${statusColor}${item.status.toUpperCase()}${UI.Style.TEXT_NORMAL}] ${UI.Style.TEXT_NORMAL_BOLD}${item.id.slice(0, 8)}${UI.Style.TEXT_NORMAL} - ${date}`,
    `   Reason: ${item.reason}`,
    `   Command: ${item.command.slice(0, 60)}${item.command.length > 60 ? "..." : ""}`,
  ]

  return lines.join("\n")
}

/**
 * Format queue summary
 */
function formatSummary(items: ReadonlyArray<QueueItem>): string {
  const pending = items.filter((i) => i.status === "pending").length
  const approved = items.filter((i) => i.status === "approved").length
  const rejected = items.filter((i) => i.status === "rejected").length
  const expired = items.filter((i) => i.status === "expired").length

  return [
    `Total: ${items.length}`,
    `  ${UI.Style.TEXT_WARNING}Pending: ${pending}${UI.Style.TEXT_NORMAL}`,
    `  ${UI.Style.TEXT_SUCCESS}Approved: ${approved}${UI.Style.TEXT_NORMAL}`,
    `  ${UI.Style.TEXT_DANGER}Rejected: ${rejected}${UI.Style.TEXT_NORMAL}`,
    `  ${UI.Style.TEXT_DIM}Expired: ${expired}${UI.Style.TEXT_NORMAL}`,
  ].join(" | ")
}

export const QueueCommand = cmd({
  command: "queue [action]",
  describe: "Manage pending action queue for Autopilot mode",
  builder: (yargs: Argv) => {
    return yargs
      .positional("action", {
        describe: "Action to perform on the queue",
        type: "string",
        choices: ["list", "approve", "approve-all", "reject", "clear"],
        default: "list",
      })
      .option("id", {
        describe: "Queue item ID (for approve/reject)",
        type: "string",
      })
      .option("session", {
        describe: "Filter by session ID",
        type: "string",
      })
      .option("pending-only", {
        describe: "Show only pending items",
        type: "boolean",
        default: false,
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const action = args.action as string
      const sessionId = args.session as string | undefined

      const program = Effect.gen(function* () {
        const queue = yield* ActionQueueService

        switch (action) {
          case "list": {
            const items = yield* queue.list(sessionId)

            if (items.length === 0) {
              UI.println(UI.Style.TEXT_INFO + "Action queue is empty." + UI.Style.TEXT_NORMAL)
              return
            }

            UI.println(UI.Style.TEXT_INFO_BOLD + "Action Queue:" + UI.Style.TEXT_NORMAL)
            UI.println("")
            UI.println(formatSummary(items))
            UI.println("")

            const displayItems = args["pending-only"]
              ? items.filter((i) => i.status === "pending")
              : items

            if (displayItems.length === 0) {
              UI.println(UI.Style.TEXT_DIM + "No items to display." + UI.Style.TEXT_NORMAL)
              return
            }

            displayItems.forEach((item, index) => {
              UI.println(formatQueueItem(item, index))
              UI.println("")
            })

            break
          }

          case "approve": {
            const id = args.id as string | undefined
            if (!id) {
              UI.error("Error: --id is required for approve action")
              UI.error("Usage: opencode queue approve --id <queue-item-id>")
              process.exit(1)
            }

            const item = yield* queue.approve(id)
            UI.println(
              UI.Style.TEXT_SUCCESS + `Approved action: ${item.id.slice(0, 8)}` + UI.Style.TEXT_NORMAL
            )
            UI.println(`  Command: ${item.command.slice(0, 60)}${item.command.length > 60 ? "..." : ""}`)

            log.info("Action approved via queue command", { id: item.id })
            break
          }

          case "approve-all": {
            const items = yield* queue.approveAll(sessionId)

            if (items.length === 0) {
              UI.println(UI.Style.TEXT_INFO + "No pending actions to approve." + UI.Style.TEXT_NORMAL)
              return
            }

            UI.println(
              UI.Style.TEXT_SUCCESS + `Approved ${items.length} action(s):` + UI.Style.TEXT_NORMAL
            )
            items.forEach((item, index) => {
              UI.println(`  ${index + 1}. ${item.id.slice(0, 8)} - ${item.reason}`)
            })

            log.info("All actions approved via queue command", { count: items.length, sessionId })
            break
          }

          case "reject": {
            const id = args.id as string | undefined
            if (!id) {
              UI.error("Error: --id is required for reject action")
              UI.error("Usage: opencode queue reject --id <queue-item-id>")
              process.exit(1)
            }

            const item = yield* queue.reject(id)
            UI.println(
              UI.Style.TEXT_DANGER + `Rejected action: ${item.id.slice(0, 8)}` + UI.Style.TEXT_NORMAL
            )
            UI.println(`  Command: ${item.command.slice(0, 60)}${item.command.length > 60 ? "..." : ""}`)

            log.info("Action rejected via queue command", { id: item.id })
            break
          }

          case "clear": {
            // Clear rejected and expired items
            const allItems = yield* queue.list(sessionId)
            const toClear = allItems.filter((i) => i.status === "rejected" || i.status === "expired")

            // Note: In a persistent implementation, this would actually remove items
            // For in-memory MVP, we just report what would be cleared
            UI.println(
              UI.Style.TEXT_INFO + `Found ${toClear.length} item(s) to clear (rejected/expired)` + UI.Style.TEXT_NORMAL
            )

            if (toClear.length > 0) {
              toClear.forEach((item, index) => {
                UI.println(`  ${index + 1}. ${item.id.slice(0, 8)} [${item.status}]`)
              })

              UI.println("")
              UI.println(
                UI.Style.TEXT_DIM + "Note: In MVP, items remain in memory. Use reject to mark as rejected." + UI.Style.TEXT_NORMAL
              )
            }

            log.info("Queue clear command executed", { count: toClear.length, sessionId })
            break
          }

          default: {
            UI.error(`Unknown action: ${action}`)
            UI.error("Valid actions: list, approve, approve-all, reject, clear")
            process.exit(1)
          }
        }
      })

      // Run with the default layer
      const { defaultLayer } = await import("@/permission/action-queue")
      await Effect.runPromise(Effect.provide(program, defaultLayer))
    })
  },
})
