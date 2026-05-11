/**
 * Memory Manager - Long-term Memory System
 *
 * Manages long-term memory with 3-tier scope support:
 * - Global scope: Memory shared across all projects (~/.opencode/memory/)
 * - Project scope: Memory specific to the current project (.opencode/memory/)
 * - Session scope: Memory isolated per session, survives session end
 * - Memory CRUD operations
 * - Memory retrieval based on context
 *
 * Spec ref: opencode-enhanced R22
 */

import { Schema, Context, Effect, Layer, Option } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { ulid } from "ulid"
import { Instance } from "../project/instance"
import { Service as PersistenceService, defaultLayer as persistenceLayer } from "./persistence"

const log = Log.create({ service: "memory" })

/**
 * Memory scope types (3-tier: global, project, session)
 */
export const MemoryScope = Schema.Union([Schema.Literal("project"), Schema.Literal("global"), Schema.Literal("session")])
export type MemoryScope = Schema.Schema.Type<typeof MemoryScope>

/**
 * Memory entry schema
 */
export const MemoryEntry = Schema.Struct({
  id: Schema.String,
  scope: MemoryScope,
  key: Schema.String,
  value: Schema.String,
  tags: Schema.Array(Schema.String),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  accessCount: Schema.Number,
  lastAccessedAt: Schema.Number,
})
export type MemoryEntry = Schema.Schema.Type<typeof MemoryEntry>

/**
 * Memory search result
 */
export interface SearchResult {
  entry: MemoryEntry
  relevance: number
}

/**
 * Memory Manager Service Interface
 */
export interface Interface {
  readonly add: (entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt" | "accessCount" | "lastAccessedAt">) => Effect.Effect<MemoryEntry>
  readonly get: (id: string) => Effect.Effect<Option.Option<MemoryEntry>>
  readonly getByKey: (key: string, scope: MemoryScope) => Effect.Effect<Option.Option<MemoryEntry>>
  readonly update: (id: string, value: string) => Effect.Effect<Option.Option<MemoryEntry>>
  readonly remove: (id: string) => Effect.Effect<boolean>
  readonly list: (scope?: MemoryScope) => Effect.Effect<ReadonlyArray<MemoryEntry>>
  readonly search: (query: string, scope?: MemoryScope) => Effect.Effect<ReadonlyArray<SearchResult>>
  readonly getByTags: (tags: string[], scope?: MemoryScope) => Effect.Effect<ReadonlyArray<MemoryEntry>>
  readonly incrementAccess: (id: string) => Effect.Effect<Option.Option<MemoryEntry>>
  readonly getSystemPromptInjection: (context?: string) => Effect.Effect<Option.Option<string>>
  // Session-scoped memory operations (R22)
  readonly setSessionId: (sessionId: string) => Effect.Effect<void>
  readonly getSessionMemory: () => Effect.Effect<ReadonlyArray<MemoryEntry>>
  readonly clearSessionMemory: () => Effect.Effect<void>
}

/**
 * Memory Manager Service
 */
export class Service extends Context.Service<Service, Interface>()("@opencode/Memory") {}

// In-memory storage (MVP - can be extended to SQLite)
interface State {
  entries: Map<string, MemoryEntry>
  activeSessionId?: string
}

/**
 * Create memory entry with defaults
 */
function createMemoryEntry(
  entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt" | "accessCount" | "lastAccessedAt">
): MemoryEntry {
  const now = Date.now()
  return {
    ...entry,
    id: ulid(),
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    lastAccessedAt: now,
  }
}

/**
 * Simple relevance scoring (MVP - can be extended to embeddings)
 */
function calculateRelevance(entry: MemoryEntry, query: string): number {
  const queryLower = query.toLowerCase()
  const keyLower = entry.key.toLowerCase()
  const valueLower = entry.value.toLowerCase()
  const tagsLower = entry.tags.map((t) => t.toLowerCase())

  let score = 0

  // Exact key match
  if (keyLower === queryLower) score += 10
  // Key contains query
  else if (keyLower.includes(queryLower)) score += 5
  // Query contains key
  else if (queryLower.includes(keyLower)) score += 3

  // Value contains query
  if (valueLower.includes(queryLower)) score += 2

  // Tag matches
  const tagMatches = tagsLower.filter((t) => t.includes(queryLower) || queryLower.includes(t)).length
  score += tagMatches * 3

  // Boost by access count (frequently accessed memories are more relevant)
  score += Math.min(entry.accessCount * 0.1, 5)

  return score
}

/**
 * Format memory entries for system prompt
 */
function formatMemoryForPrompt(entries: MemoryEntry[], context?: string): string {
  if (entries.length === 0) return ""

  const lines = [
    "## Relevant Memory",
    "",
  ]

  if (context) {
    lines.push(`Context: ${context}`, "")
  }

  entries.forEach((entry, index) => {
    const scopeIndicator = entry.scope === "global" ? "[G]" : "[P]"
    lines.push(`${index + 1}. ${scopeIndicator} ${entry.key}`)
    lines.push(`   ${entry.value.slice(0, 200)}${entry.value.length > 200 ? "..." : ""}`)
    if (entry.tags.length > 0) {
      lines.push(`   Tags: ${entry.tags.join(", ")}`)
    }
    lines.push("")
  })

  return lines.join("\n")
}

/**
 * Service layer implementation
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const persistence = yield* PersistenceService
    const getProjectRoot = () => Instance.directory
    const state: State = { entries: new Map() }
    let loaded = false

    const persistScope = Effect.fn("Memory.persistScope")(function* (scope: MemoryScope) {
      const entries = Array.from(state.entries.values()).filter((e) => e.scope === scope)
      if (entries.length > 0) {
        yield* persistence.persist(entries, scope, getProjectRoot(), state.activeSessionId)
      }
    })

    const loadScope = Effect.fn("Memory.loadScope")(function* (scope: MemoryScope) {
      const items = yield* persistence.load(scope, getProjectRoot(), state.activeSessionId)
      for (const entry of items) {
        state.entries.set(entry.id, entry)
      }
      if (items.length > 0) {
        log.info("Memory loaded from disk", { scope, count: items.length })
      }
    })

    const ensureLoaded = Effect.fn("Memory.ensureLoaded")(function* () {
      if (loaded) return
      loaded = true
      yield* loadScope("global").pipe(Effect.catch(() => Effect.succeed(undefined)))
      yield* loadScope("project").pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (state.activeSessionId) {
        yield* loadScope("session").pipe(Effect.catch(() => Effect.succeed(undefined)))
      }
    })

    const add = Effect.fn("Memory.add")(
      function* (entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt" | "accessCount" | "lastAccessedAt">) {
        yield* ensureLoaded()
        const memoryEntry = createMemoryEntry(entry)
        state.entries.set(memoryEntry.id, memoryEntry)

        yield* persistScope(memoryEntry.scope)

        log.info("Memory entry added", { id: memoryEntry.id, key: memoryEntry.key, scope: memoryEntry.scope })
        return memoryEntry
      }
    )

    const get = Effect.fn("Memory.get")(
      function* (id: string) {
        yield* ensureLoaded()
        const entry = state.entries.get(id)
        if (!entry) {
          return Option.none()
        }
        return Option.some(entry)
      }
    )

    const getByKey = Effect.fn("Memory.getByKey")(
      function* (key: string, scope: MemoryScope) {
        yield* ensureLoaded()
        const entry = Array.from(state.entries.values()).find(
          (e) => e.key === key && e.scope === scope
        )
        if (!entry) {
          return Option.none()
        }
        return Option.some(entry)
      }
    )

    const update = Effect.fn("Memory.update")(
      function* (id: string, value: string) {
        const entry = state.entries.get(id)
        if (!entry) {
          return Option.none()
        }

        const updated: MemoryEntry = {
          ...entry,
          value,
          updatedAt: Date.now(),
        }
        state.entries.set(id, updated)

        yield* persistScope(updated.scope)

        log.info("Memory entry updated", { id, key: updated.key })
        return Option.some(updated)
      }
    )

    const remove = Effect.fn("Memory.remove")(
      function* (id: string) {
        const entry = state.entries.get(id)
        const existed = state.entries.has(id)
        if (existed) {
          state.entries.delete(id)
          if (entry) {
            yield* persistScope(entry.scope).pipe(Effect.catch(() => Effect.succeed(undefined)))
          }
          log.info("Memory entry removed", { id })
        }
        return existed
      }
    )

    const list = Effect.fn("Memory.list")(
      function* (scope?: MemoryScope) {
        yield* ensureLoaded()
        const entries = Array.from(state.entries.values())
        if (scope) {
          return entries.filter((e) => e.scope === scope)
        }
        return entries
      }
    )

    const search = Effect.fn("Memory.search")(
      function* (query: string, scope?: MemoryScope) {
        yield* ensureLoaded()
        const entries = Array.from(state.entries.values())
        const filtered = scope ? entries.filter((e) => e.scope === scope) : entries

        // Calculate relevance and filter results
        const results: SearchResult[] = filtered
          .map((entry) => ({
            entry,
            relevance: calculateRelevance(entry, query),
          }))
          .filter((r) => r.relevance > 0)
          .sort((a, b) => b.relevance - a.relevance)

        return results
      }
    )

    const getByTags = Effect.fn("Memory.getByTags")(
      function* (tags: string[], scope?: MemoryScope) {
        yield* ensureLoaded()
        const entries = Array.from(state.entries.values())
        const filtered = scope ? entries.filter((e) => e.scope === scope) : entries

        return filtered.filter((entry) =>
          tags.some((tag) => entry.tags.includes(tag))
        )
      }
    )

    const incrementAccess = Effect.fn("Memory.incrementAccess")(
      function* (id: string) {
        const entry = state.entries.get(id)
        if (!entry) {
          return Option.none()
        }

        const updated: MemoryEntry = {
          ...entry,
          accessCount: entry.accessCount + 1,
          lastAccessedAt: Date.now(),
        }
        state.entries.set(id, updated)

        return Option.some(updated)
      }
    )

    const getSystemPromptInjection = Effect.fn("Memory.getSystemPromptInjection")(
      function* (context?: string) {
        yield* ensureLoaded()
        // Search for relevant memories based on context
        if (!context || context.trim().length === 0) {
          return Option.none()
        }

        const results = yield* search(context)

        // Take top 5 most relevant entries
        const topEntries = results.slice(0, 5).map((r) => r.entry)

        if (topEntries.length === 0) {
          return Option.none()
        }

        const injection = formatMemoryForPrompt(topEntries, context)
        return Option.some(injection)
      }
    )

    // -------------------------------------------------------------------
    // Session-scoped memory operations (R22)
    // -------------------------------------------------------------------

    const setSessionId = Effect.fn("Memory.setSessionId")(function* (sessionId: string) {
      state.activeSessionId = sessionId
      log.info("Session ID set for memory", { sessionId })
    })

    const getSessionMemory = Effect.fn("Memory.getSessionMemory")(function* () {
      return Array.from(state.entries.values()).filter((e) => e.scope === "session")
    })

    const clearSessionMemory = Effect.fn("Memory.clearSessionMemory")(function* () {
      const sessionEntries = Array.from(state.entries.values())
        .filter((e) => e.scope === "session")
        .map((e) => e.id)

      for (const id of sessionEntries) {
        state.entries.delete(id)
      }

      log.info("Session memory cleared", { count: sessionEntries.length })
    })

    return Service.of({
      add,
      get,
      getByKey,
      update,
      remove,
      list,
      search,
      getByTags,
      incrementAccess,
      getSystemPromptInjection,
      setSessionId,
      getSessionMemory,
      clearSessionMemory,
    })
  })
)

export const defaultLayer = layer.pipe(
  Layer.provide(persistenceLayer),
)

/**
 * Helper: Add project memory
 */
export function addProjectMemory(
  key: string,
  value: string,
  tags: string[] = []
): Effect.Effect<MemoryEntry, never, Service> {
  return Effect.gen(function* () {
    const service = yield* Service
    return yield* service.add({
      scope: "project",
      key,
      value,
      tags,
    })
  })
}

/**
 * Helper: Add global memory
 */
export function addGlobalMemory(
  key: string,
  value: string,
  tags: string[] = []
): Effect.Effect<MemoryEntry, never, Service> {
  return Effect.gen(function* () {
    const service = yield* Service
    return yield* service.add({
      scope: "global",
      key,
      value,
      tags,
    })
  })
}

/**
 * Helper: Add session memory
 */
export function addSessionMemory(
  key: string,
  value: string,
  tags: string[] = []
): Effect.Effect<MemoryEntry, never, Service> {
  return Effect.gen(function* () {
    const service = yield* Service
    return yield* service.add({
      scope: "session",
      key,
      value,
      tags,
    })
  })
}

/**
 * Helper: Search memories
 */
export function searchMemories(
  query: string,
  scope?: MemoryScope
): Effect.Effect<ReadonlyArray<SearchResult>, never, Service> {
  return Effect.gen(function* () {
    const service = yield* Service
    return yield* service.search(query, scope)
  })
}

export * as Memory from "./memory"
