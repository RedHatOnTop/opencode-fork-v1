/**
 * Action Queue - Autopilot Mode Pending Actions
 *
 * Stores actions that are blocked during Autopilot mode for later user approval.
 * In-memory implementation for MVP (can be extended to SQLite persistence).
 */

import { Schema, Context, Effect, Layer } from "effect"
import { ulid } from "ulid"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "action-queue" })

/**
 * Queue item status
 */
export const QueueStatus = Schema.Literals(["pending", "approved", "rejected", "expired"])
export type QueueStatus = Schema.Schema.Type<typeof QueueStatus>

/**
 * Queue item schema
 */
export const QueueItem = Schema.Struct({
  id: Schema.String,
  sessionId: Schema.String,
  requestedAt: Schema.Number,
  reason: Schema.String,
  command: Schema.String,
  context: Schema.String,
  status: QueueStatus,
})
export type QueueItem = Schema.Schema.Type<typeof QueueItem>

/**
 * Action Queue Service Interface
 */
export interface Interface {
  readonly add: (item: Omit<QueueItem, "id" | "requestedAt" | "status">) => Effect.Effect<QueueItem>
  readonly list: (sessionId?: string) => Effect.Effect<ReadonlyArray<QueueItem>>
  readonly listPending: (sessionId?: string) => Effect.Effect<ReadonlyArray<QueueItem>>
  readonly approve: (id: string) => Effect.Effect<QueueItem, Error>
  readonly approveAll: (sessionId?: string) => Effect.Effect<ReadonlyArray<QueueItem>, Error>
  readonly reject: (id: string) => Effect.Effect<QueueItem, Error>
  readonly count: (sessionId?: string) => Effect.Effect<number>
  readonly countPending: (sessionId?: string) => Effect.Effect<number>
}

/**
 * Action Queue Service
 */
export class Service extends Context.Service<Service, Interface>()("@opencode/ActionQueue") {}

// In-memory storage
interface State {
  items: Map<string, QueueItem>
}

/**
 * Create queue item with defaults
 */
function createQueueItem(
  item: Omit<QueueItem, "id" | "requestedAt" | "status">
): QueueItem {
  return {
    ...item,
    id: ulid(),
    requestedAt: Date.now(),
    status: "pending",
  }
}

/**
 * Service layer implementation
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state: State = { items: new Map() }

    const add = Effect.fn("ActionQueue.add")(
      function* (item: Omit<QueueItem, "id" | "requestedAt" | "status">) {
        const queueItem = createQueueItem(item)
        state.items.set(queueItem.id, queueItem)

        log.info("Added item to action queue", { id: queueItem.id, reason: queueItem.reason })
        return queueItem
      }
    )

    const list = Effect.fn("ActionQueue.list")(
      function* (sessionId?: string) {
        const allItems = Array.from(state.items.values())
        const filtered = sessionId
          ? allItems.filter((item) => item.sessionId === sessionId)
          : allItems
        
        // Sort by requestedAt (FIFO)
        return filtered.sort((a, b) => a.requestedAt - b.requestedAt)
      }
    )

    const listPending = Effect.fn("ActionQueue.listPending")(
      function* (sessionId?: string) {
        const allItems = yield* list(sessionId)
        return allItems.filter((item) => item.status === "pending")
      }
    )

    const approve = Effect.fn("ActionQueue.approve")(
      function* (id: string) {
        const item = state.items.get(id)
        if (!item) {
          return yield* Effect.fail(new Error(`Queue item ${id} not found`))
        }

        const updated = { ...item, status: "approved" as const }
        state.items.set(id, updated)

        log.info("Approved action queue item", { id, command: item.command })
        return updated
      }
    )

    const approveAll = Effect.fn("ActionQueue.approveAll")(
      function* (sessionId?: string) {
        const pending = yield* listPending(sessionId)
        const approved: QueueItem[] = []

        for (const item of pending) {
          const approvedItem = yield* approve(item.id)
          approved.push(approvedItem)
        }

        log.info("Approved all pending items", { count: approved.length, sessionId })
        return approved
      }
    )

    const reject = Effect.fn("ActionQueue.reject")(
      function* (id: string) {
        const item = state.items.get(id)
        if (!item) {
          return yield* Effect.fail(new Error(`Queue item ${id} not found`))
        }

        const updated = { ...item, status: "rejected" as const }
        state.items.set(id, updated)

        log.info("Rejected action queue item", { id, command: item.command })
        return updated
      }
    )

    const count = Effect.fn("ActionQueue.count")(
      function* (sessionId?: string) {
        const items = yield* list(sessionId)
        return items.length
      }
    )

    const countPending = Effect.fn("ActionQueue.countPending")(
      function* (sessionId?: string) {
        const pending = yield* listPending(sessionId)
        return pending.length
      }
    )

    return Service.of({
      add,
      list,
      listPending,
      approve,
      approveAll,
      reject,
      count,
      countPending,
    })
  })
)

export const defaultLayer = layer

/**
 * Check if a session has pending actions
 */
export function hasPendingActions(sessionId: string) {
  return Effect.gen(function* () {
    const service = yield* Service
    const count = yield* service.countPending(sessionId)
    return count > 0
  })
}

/**
 * Format queue item for display
 */
export function formatQueueItem(item: QueueItem): string {
  const date = new Date(item.requestedAt).toLocaleString()
  return `[${item.status.toUpperCase()}] ${date} - ${item.reason}
  Command: ${item.command.slice(0, 80)}${item.command.length > 80 ? "..." : ""}`
}

/**
 * Format queue for display
 */
export function formatQueue(items: ReadonlyArray<QueueItem>): string {
  if (items.length === 0) {
    return "No pending actions in queue."
  }

  return items.map(formatQueueItem).join("\n\n")
}

export * as ActionQueue from "./action-queue"
