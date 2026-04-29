/**
 * Cost Tracker - Cost Tracking System
 *
 * Tracks API costs per provider and model:
 * - Monotonically accumulating cost tracking
 * - Per-session cost tracking
 * - Cost limits and alerts
 * - TUI status bar integration
 */

import { Schema, Context, Effect, Layer, Option } from "effect"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "cost" })

/**
 * Cost entry schema for a single API call
 */
export const CostEntry = Schema.Struct({
  id: Schema.String,
  sessionId: Schema.String,
  providerId: Schema.String,
  modelId: Schema.String,
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  cacheReadTokens: Schema.Number,
  cacheWriteTokens: Schema.Number,
  inputCost: Schema.Number, // in USD
  outputCost: Schema.Number, // in USD
  totalCost: Schema.Number, // in USD
  timestamp: Schema.Number,
})
export type CostEntry = Schema.Schema.Type<typeof CostEntry>

/**
 * Aggregated costs
 */
export interface AggregatedCosts {
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  totalInputCost: number
  totalOutputCost: number
  totalCost: number
  callCount: number
}

/**
 * Cost limit configuration
 */
export interface CostLimits {
  sessionLimit?: number
  dailyLimit?: number
  warningThreshold: number // percentage (0-1)
}

/**
 * Cost Tracker Service Interface
 */
export interface Interface {
  readonly record: (entry: Omit<CostEntry, "id" | "timestamp" | "totalCost">) => Effect.Effect<CostEntry>
  readonly getSessionCosts: (sessionId: string) => Effect.Effect<AggregatedCosts>
  readonly getTotalCosts: Effect.Effect<AggregatedCosts>
  readonly getCostsByProvider: (providerId: string) => Effect.Effect<AggregatedCosts>
  readonly getCostsByModel: (providerId: string, modelId: string) => Effect.Effect<AggregatedCosts>
  readonly resetSession: (sessionId: string) => Effect.Effect<void>
  readonly checkLimits: (sessionId: string, limits: CostLimits) => Effect.Effect<{
    sessionExceeded: boolean
    dailyExceeded: boolean
    warning: boolean
    currentSessionCost: number
    currentDailyCost: number
  }>
  readonly getCostStatusForTUI: Effect.Effect<{
    totalCost: number
    sessionCost: number
    isWarning: boolean
    isExceeded: boolean
  }>
}

/**
 * Cost Tracker Service
 */
export class Service extends Context.Service<Service, Interface>()("@opencode/CostTracker") {}

// In-memory storage (MVP - can be extended to SQLite/persistence)
interface State {
  entries: Map<string, CostEntry>
  dailyResetAt: number
  dailyCosts: number
}

// Default pricing (per 1M tokens)
const DEFAULT_PRICING: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> = {
  "anthropic:claude-3-5-sonnet": { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  "anthropic:claude-3-opus": { input: 15.0, output: 75.0, cacheRead: 1.5, cacheWrite: 18.75 },
  "anthropic:claude-3-haiku": { input: 0.25, output: 1.25, cacheRead: 0.025, cacheWrite: 0.3125 },
  "openai:gpt-4o": { input: 5.0, output: 15.0 },
  "openai:gpt-4o-mini": { input: 0.15, output: 0.6 },
  "openai:gpt-4": { input: 30.0, output: 60.0 },
  "openai:gpt-3.5-turbo": { input: 0.5, output: 1.5 },
}

/**
 * Calculate cost based on tokens and pricing
 */
function calculateCost(
  providerId: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number
): { inputCost: number; outputCost: number; totalCost: number } {
  const key = `${providerId}:${modelId}`
  const pricing = DEFAULT_PRICING[key] || { input: 1.0, output: 2.0, cacheRead: 0.1, cacheWrite: 1.0 }

  // Calculate costs (per 1M tokens)
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output

  // Cache costs (if applicable)
  let cacheReadCost = 0
  let cacheWriteCost = 0
  if (pricing.cacheRead) {
    cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cacheRead
  }
  if (pricing.cacheWrite) {
    cacheWriteCost = (cacheWriteTokens / 1_000_000) * pricing.cacheWrite
  }

  const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost

  return { inputCost, outputCost, totalCost }
}

/**
 * Aggregate costs from entries
 */
function aggregateCosts(entries: CostEntry[]): AggregatedCosts {
  return entries.reduce(
    (acc, entry) => ({
      totalInputTokens: acc.totalInputTokens + entry.inputTokens,
      totalOutputTokens: acc.totalOutputTokens + entry.outputTokens,
      totalCacheReadTokens: acc.totalCacheReadTokens + entry.cacheReadTokens,
      totalCacheWriteTokens: acc.totalCacheWriteTokens + entry.cacheWriteTokens,
      totalInputCost: acc.totalInputCost + entry.inputCost,
      totalOutputCost: acc.totalOutputCost + entry.outputCost,
      totalCost: acc.totalCost + entry.totalCost,
      callCount: acc.callCount + 1,
    }),
    {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalInputCost: 0,
      totalOutputCost: 0,
      totalCost: 0,
      callCount: 0,
    }
  )
}

/**
 * Service layer implementation
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state: State = {
      entries: new Map(),
      dailyResetAt: Date.now(),
      dailyCosts: 0,
    }

    // Check if we need to reset daily costs
    const checkDailyReset = () => {
      const now = Date.now()
      const oneDay = 24 * 60 * 60 * 1000

      if (now - state.dailyResetAt > oneDay) {
        state.dailyResetAt = now
        state.dailyCosts = 0
        log.info("Daily cost counter reset")
      }
    }

    const record = Effect.fn("CostTracker.record")(
      function* (entry: Omit<CostEntry, "id" | "timestamp" | "totalCost">) {
        checkDailyReset()

        const { inputCost, outputCost, totalCost } = calculateCost(
          entry.providerId,
          entry.modelId,
          entry.inputTokens,
          entry.outputTokens,
          entry.cacheReadTokens,
          entry.cacheWriteTokens
        )

        const costEntry: CostEntry = {
          ...entry,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          inputCost,
          outputCost,
          totalCost,
        }

        state.entries.set(costEntry.id, costEntry)
        state.dailyCosts += totalCost

        log.info("Cost recorded", {
          sessionId: entry.sessionId,
          provider: entry.providerId,
          model: entry.modelId,
          totalCost: totalCost.toFixed(4),
        })

        return costEntry
      }
    )

    const getSessionCosts = Effect.fn("CostTracker.getSessionCosts")(
      function* (sessionId: string) {
        const entries = Array.from(state.entries.values()).filter(
          (e) => e.sessionId === sessionId
        )
        return aggregateCosts(entries)
      }
    )

    const getTotalCosts = Effect.fn("CostTracker.getTotalCosts")(function* () {
      const entries = Array.from(state.entries.values())
      return aggregateCosts(entries)
    })

    const getCostsByProvider = Effect.fn("CostTracker.getCostsByProvider")(
      function* (providerId: string) {
        const entries = Array.from(state.entries.values()).filter(
          (e) => e.providerId === providerId
        )
        return aggregateCosts(entries)
      }
    )

    const getCostsByModel = Effect.fn("CostTracker.getCostsByModel")(
      function* (providerId: string, modelId: string) {
        const entries = Array.from(state.entries.values()).filter(
          (e) => e.providerId === providerId && e.modelId === modelId
        )
        return aggregateCosts(entries)
      }
    )

    const resetSession = Effect.fn("CostTracker.resetSession")(
      function* (sessionId: string) {
        // Remove all entries for this session
        const toRemove: string[] = []
        for (const [id, entry] of state.entries) {
          if (entry.sessionId === sessionId) {
            toRemove.push(id)
          }
        }

        for (const id of toRemove) {
          const entry = state.entries.get(id)
          if (entry) {
            state.dailyCosts -= entry.totalCost
            state.entries.delete(id)
          }
        }

        log.info("Session costs reset", { sessionId, entriesRemoved: toRemove.length })
      }
    )

    const checkLimits = Effect.fn("CostTracker.checkLimits")(
      function* (sessionId: string, limits: CostLimits) {
        checkDailyReset()

        const sessionCosts = yield* getSessionCosts(sessionId)
        const currentSessionCost = sessionCosts.totalCost

        const sessionExceeded = limits.sessionLimit !== undefined && currentSessionCost > limits.sessionLimit
        const dailyExceeded = limits.dailyLimit !== undefined && state.dailyCosts > limits.dailyLimit

        const warningSession = limits.sessionLimit !== undefined &&
          currentSessionCost > limits.sessionLimit * limits.warningThreshold
        const warningDaily = limits.dailyLimit !== undefined &&
          state.dailyCosts > limits.dailyLimit * limits.warningThreshold

        return {
          sessionExceeded,
          dailyExceeded,
          warning: warningSession || warningDaily,
          currentSessionCost,
          currentDailyCost: state.dailyCosts,
        }
      }
    )

    const getCostStatusForTUI = Effect.fn("CostTracker.getCostStatusForTUI")(function* () {
      // Get current session ID from context (placeholder)
      const currentSessionId = "current-session" // This would come from actual session context

      const sessionCosts = yield* getSessionCosts(currentSessionId)
      const totalCosts = yield* getTotalCosts

      // Default limits (would come from config in production)
      const warningThreshold = 0.8
      const sessionLimit = 10.0 // $10 per session

      const isWarning = sessionCosts.totalCost > sessionLimit * warningThreshold
      const isExceeded = sessionCosts.totalCost > sessionLimit

      return {
        totalCost: totalCosts.totalCost,
        sessionCost: sessionCosts.totalCost,
        isWarning,
        isExceeded,
      }
    })

    return Service.of({
      record,
      getSessionCosts,
      getTotalCosts,
      getCostsByProvider,
      getCostsByModel,
      resetSession,
      checkLimits,
      getCostStatusForTUI,
    })
  })
)

export const defaultLayer = layer

/**
 * Helper: Record cost from message tokens
 */
export function recordMessageCost(
  sessionId: string,
  providerId: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number = 0,
  cacheWriteTokens: number = 0
): Effect.Effect<CostEntry> {
  return Effect.gen(function* () {
    const service = yield* Service
    return yield* service.record({
      sessionId,
      providerId,
      modelId,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
    })
  })
}

/**
 * Helper: Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${(cost * 100).toFixed(2)}¢`
  }
  return `$${cost.toFixed(4)}`
}

/**
 * Helper: Format tokens for display
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`
  }
  return `${tokens}`
}
