/**
 * Memory Persistence — Disk-backed storage for memory entries
 *
 * Persists memory entries to markdown files on disk:
 * - Global: ~/.opencode/memory/MEMORY.md
 * - Project: .opencode/memory/MEMORY.md
 * - Session: session data directory
 *
 * Spec ref: opencode-enhanced R22
 *
 * @module memory/persistence
 */

import { Effect, Layer, Context, Schema } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import fs from "fs/promises"
import path from "path"
import os from "os"
import type { MemoryEntry, MemoryScope } from "./memory"

const log = Log.create({ service: "memory-persistence" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersistenceResult {
  scope: MemoryScope
  filePath: string
  entriesWritten: number
}

export interface Interface {
  readonly persist: (entries: MemoryEntry[], scope: MemoryScope, projectRoot?: string, sessionId?: string) => Effect.Effect<PersistenceResult>
  readonly load: (scope: MemoryScope, projectRoot?: string, sessionId?: string) => Effect.Effect<MemoryEntry[], null>
  readonly getFilePath: (scope: MemoryScope, projectRoot?: string, sessionId?: string) => string
}

export class Service extends Context.Service<Service, Interface>()("@opencode/MemoryPersistence") {}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

function resolvePath(scope: MemoryScope, projectRoot?: string, sessionId?: string): string {
  const homeDir = os.homedir()

  switch (scope) {
    case "global":
      return path.join(homeDir, ".opencode", "memory", "MEMORY.md")
    case "project":
      return path.join(projectRoot ?? process.cwd(), ".opencode", "memory", "MEMORY.md")
    case "session": {
      const sessionDir = path.join(projectRoot ?? process.cwd(), ".opencode", "sessions", sessionId ?? "default")
      return path.join(sessionDir, "memory.md")
    }
    default:
      return path.join(homeDir, ".opencode", "memory", "MEMORY.md")
  }
}

// ---------------------------------------------------------------------------
// Markdown formatting
// ---------------------------------------------------------------------------

function formatEntriesAsMarkdown(entries: MemoryEntry[]): string {
  if (entries.length === 0) return ""

  const lines: string[] = [
    "---",
    `updated: ${new Date().toISOString()}`,
    `count: ${entries.length}`,
    "type: opencode-memory",
    "---",
    "",
  ]

  for (const entry of entries) {
    lines.push(`## ${entry.key}`)
    lines.push(``)
    lines.push(`- id: ${entry.id}`)
    lines.push(`- scope: ${entry.scope}`)
    lines.push(`- tags: ${entry.tags.join(", ")}`)
    lines.push(`- created: ${new Date(entry.createdAt).toISOString()}`)
    lines.push(`- accessed: ${entry.accessCount} times`)
    lines.push(``)
    lines.push(entry.value)
    lines.push(``)
    lines.push(`---`)
    lines.push(``)
  }

  return lines.join("\n")
}

function parseMarkdownToEntries(content: string): MemoryEntry[] {
  const entries: MemoryEntry[] = []
  if (!content.trim()) return entries

  // Split by --- separators (after frontmatter)
  const sections = content.split(/\n---\n/).slice(1) // Skip frontmatter

  for (const section of sections) {
    const lines = section.trim().split("\n")
    if (lines.length < 2) continue

    // Parse heading (## key)
    const headingMatch = lines[0]?.match(/^## (.+)$/)
    if (!headingMatch) continue
    const key = headingMatch[1]

    // Parse metadata
    let id = ""
    let scope: MemoryScope = "project"
    let tags: string[] = []
    let createdAt = Date.now()
    let accessCount = 0

    const metadataLines: string[] = []
    const contentLines: string[] = []
    let inMetadata = true

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!
      if (inMetadata && line.startsWith("- ")) {
        metadataLines.push(line.slice(2))
      } else if (line.trim() === "") {
        if (inMetadata && metadataLines.length > 0) {
          inMetadata = false
        }
      } else {
        inMetadata = false
        contentLines.push(line)
      }
    }

    for (const meta of metadataLines) {
      const idMatch = meta.match(/^id: (.+)$/)
      if (idMatch) id = idMatch[1]

      const scopeMatch = meta.match(/^scope: (.+)$/)
      if (scopeMatch) scope = scopeMatch[1] as MemoryScope

      const tagsMatch = meta.match(/^tags: (.+)$/)
      if (tagsMatch) tags = tagsMatch[1].split(", ").filter(Boolean)

      const createdMatch = meta.match(/^created: (.+)$/)
      if (createdMatch) {
        const parsed = Date.parse(createdMatch[1])
        if (!isNaN(parsed)) createdAt = parsed
      }

      const accessedMatch = meta.match(/^accessed: (\d+) times/)
      if (accessedMatch) accessCount = parseInt(accessedMatch[1], 10)
    }

    entries.push({
      id: id || `restored-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      scope,
      key,
      value: contentLines.join("\n").trim(),
      tags,
      createdAt,
      updatedAt: Date.now(),
      accessCount,
      lastAccessedAt: Date.now(),
    })
  }

  return entries
}

// ---------------------------------------------------------------------------
// Service Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const persist = Effect.fn("MemoryPersistence.persist")(
      function* (
        entries: MemoryEntry[],
        scope: MemoryScope,
        projectRoot?: string,
        sessionId?: string,
      ) {
        const filePath = resolvePath(scope, projectRoot, sessionId)
        const dir = path.dirname(filePath)

        // Ensure directory exists
        yield* Effect.tryPromise({
          try: () => fs.mkdir(dir, { recursive: true }),
          catch: (e: unknown) => new Error(`Failed to create directory ${dir}: ${e}`),
        })

        const content = formatEntriesAsMarkdown(entries)

        yield* Effect.tryPromise({
          try: () => fs.writeFile(filePath, content, "utf-8"),
          catch: (e: unknown) => new Error(`Failed to write memory file ${filePath}: ${e}`),
        })

        log.info("Memory persisted", { scope, filePath, entries: entries.length })

        return { scope, filePath, entriesWritten: entries.length }
      },
    )

    const load = Effect.fn("MemoryPersistence.load")(
      function* (
        scope: MemoryScope,
        projectRoot?: string,
        sessionId?: string,
      ) {
        const filePath = resolvePath(scope, projectRoot, sessionId)

        const content = yield* Effect.tryPromise({
          try: () => fs.readFile(filePath, "utf-8"),
          catch: () => null,
        })

        if (!content) {
          log.info("No memory file found", { scope, filePath })
          return []
        }

        const entries = parseMarkdownToEntries(content)
        log.info("Memory loaded", { scope, filePath, entries: entries.length })
        return entries
      },
    )

    const getFilePath = (scope: MemoryScope, projectRoot?: string, sessionId?: string) =>
      resolvePath(scope, projectRoot, sessionId)

    return Service.of({
      persist: persist as Interface["persist"],
      load: load as Interface["load"],
      getFilePath,
    })
  }),
)

export const defaultLayer = layer
