/**
 * Token Budget Manager for the Skill Search Engine.
 *
 * Effect Service that tracks loaded skill token counts and enforces
 * an upper limit using LRU (Least Recently Used) eviction policy.
 *
 * ALWAYS-tier skills are excluded from the budget calculation.
 *
 * @module skill/budget
 */

import { Context, Effect, Layer, Ref } from "effect"
import type { BudgetStatus, LoadedSkill } from "./types"

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Interface {
  readonly load: (name: string, content: string) => Effect.Effect<void>
  readonly unload: (name: string) => Effect.Effect<void>
  readonly evictLRU: () => Effect.Effect<string | undefined>
  readonly status: () => Effect.Effect<BudgetStatus>
  readonly canLoad: (tokenCount: number) => Effect.Effect<boolean>
  readonly estimateTokens: (content: string) => number
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/TokenBudget") {}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the number of tokens in a string.
 * Uses the heuristic: 1 token ≈ 4 characters.
 * Empty string returns 0.
 */
export function estimateTokens(content: string): number {
  if (!content) return 0
  return Math.ceil(content.length / 4)
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface BudgetState {
  loaded: Map<string, LoadedSkill>
  totalUsed: number
  limit: number
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const make = (limit: number = 4000) =>
  Effect.gen(function* () {
    const state = yield* Ref.make<BudgetState>({
      loaded: new Map(),
      totalUsed: 0,
      limit,
    })

    const load = Effect.fn("TokenBudget.load")(function* (name: string, content: string) {
      const tokens = estimateTokens(content)

      yield* Ref.update(state, (s) => {
        const newLoaded = new Map(s.loaded)
        // If already loaded, subtract old tokens
        const existing = newLoaded.get(name)
        let newTotal = s.totalUsed
        if (existing) {
          newTotal -= existing.tokenCount
        }

        newLoaded.set(name, {
          name,
          tokenCount: tokens,
          loadedAt: Date.now(),
        })
        newTotal += tokens

        return { ...s, loaded: newLoaded, totalUsed: newTotal }
      })
    })

    const unload = Effect.fn("TokenBudget.unload")(function* (name: string) {
      yield* Ref.update(state, (s) => {
        const newLoaded = new Map(s.loaded)
        const existing = newLoaded.get(name)
        if (!existing) return s

        newLoaded.delete(name)
        return {
          ...s,
          loaded: newLoaded,
          totalUsed: s.totalUsed - existing.tokenCount,
        }
      })
    })

    const evictLRU = Effect.fn("TokenBudget.evictLRU")(function* () {
      const s = yield* Ref.get(state)
      if (s.loaded.size === 0) return undefined

      // Find the skill with the oldest loadedAt timestamp
      let oldest: LoadedSkill | undefined
      for (const skill of s.loaded.values()) {
        if (!oldest || skill.loadedAt < oldest.loadedAt) {
          oldest = skill
        }
      }

      if (!oldest) return undefined

      yield* unload(oldest.name)
      return oldest.name
    })

    const status = Effect.fn("TokenBudget.status")(function* () {
      const s = yield* Ref.get(state)
      return {
        used: s.totalUsed,
        limit: s.limit,
        loaded: Array.from(s.loaded.values()),
      }
    })

    const canLoad = Effect.fn("TokenBudget.canLoad")(function* (tokenCount: number) {
      const s = yield* Ref.get(state)
      return s.totalUsed + tokenCount <= s.limit
    })

    return Service.of({
      load,
      unload,
      evictLRU,
      status,
      canLoad,
      estimateTokens,
    })
  })

export const layer = (limit?: number) => Layer.effect(Service, make(limit))

/**
 * Load a skill with automatic LRU eviction if the budget would be exceeded.
 *
 * If evictLRU returns undefined (nothing to evict), the loop exits
 * and the skill is loaded anyway (temporary budget overrun).
 */
export const loadWithEviction = (
  name: string,
  content: string,
  budget: Interface,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const tokens = budget.estimateTokens(content)
    const can = yield* budget.canLoad(tokens)

    if (!can) {
      // Evict LRU skills until we have room
      while (!(yield* budget.canLoad(tokens))) {
        const evicted = yield* budget.evictLRU()
        if (evicted === undefined) {
          // Nothing left to evict — allow temporary overrun
          break
        }
      }
    }

    yield* budget.load(name, content)
  })
