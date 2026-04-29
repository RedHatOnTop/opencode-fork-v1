/**
 * /memory Command - Memory Management
 *
 * Implements the /memory command for managing long-term memories:
 * - add: Add a new memory entry
 * - list: List memory entries (filter by scope)
 * - get: Get a specific memory by key
 * - update: Update an existing memory
 * - remove: Remove a memory entry
 * - search: Search memories by query
 * - clear: Clear all memories (or by scope)
 */

import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { bootstrap } from "../bootstrap"
import { Effect, Option } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import {
  Service as MemoryService,
  MemoryScope,
  MemoryEntry,
  defaultLayer as memoryLayer,
} from "@/memory/memory"

const log = Log.create({ service: "memory-cmd" })

/**
 * Format memory entry for display
 */
function formatMemory(entry: MemoryEntry, index?: number): string {
  const scopeIndicator = entry.scope === "global" ? "[G]" : "[P]"
  const prefix = index !== undefined ? `${index + 1}. ` : ""
  const lines = [
    `${prefix}${scopeIndicator} ${entry.key} (${entry.id.slice(0, 8)})`,
    `   Value: ${entry.value.slice(0, 60)}${entry.value.length > 60 ? "..." : ""}`,
  ]

  if (entry.tags.length > 0) {
    lines.push(`   Tags: ${entry.tags.join(", ")}`)
  }

  const date = new Date(entry.updatedAt).toLocaleString()
  lines.push(`   Updated: ${date} | Accessed: ${entry.accessCount} times`)

  return lines.join("\n")
}

/**
 * Parse tags from comma-separated string
 */
function parseTags(tagString?: string): string[] {
  if (!tagString) return []
  return tagString
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

export const MemoryCommand = cmd({
  command: "memory <action>",
  describe: "Manage long-term memories",
  builder: (yargs: Argv) => {
    return yargs
      .positional("action", {
        describe: "Action to perform",
        type: "string",
        choices: ["add", "list", "get", "update", "remove", "search", "clear"],
      })
      .option("key", {
        alias: "k",
        describe: "Memory key",
        type: "string",
      })
      .option("value", {
        alias: "v",
        describe: "Memory value",
        type: "string",
      })
        .option("scope", {
        alias: "s",
        describe: "Memory scope",
        type: "string",
        choices: ["project", "global"],
        default: "project",
      })
      .option("tags", {
        alias: "t",
        describe: "Comma-separated tags",
        type: "string",
      })
      .option("query", {
        alias: "q",
        describe: "Search query",
        type: "string",
      })
      .option("id", {
        describe: "Memory entry ID",
        type: "string",
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const action = args.action as string
      const scope = args.scope as MemoryScope

      const program = Effect.gen(function* () {
        const memory = yield* MemoryService

        switch (action) {
          case "add": {
            const key = args.key as string | undefined
            const value = args.value as string | undefined

            if (!key || !value) {
              UI.error("Error: --key and --value are required for add action")
              UI.error("Usage: opencode memory add --key <key> --value <value> [--scope project|global] [--tags tag1,tag2]")
              process.exit(1)
            }

            const tags = parseTags(args.tags as string | undefined)
            const entry = yield* memory.add({
              scope,
              key,
              value,
              tags,
            })

            UI.println(UI.Style.TEXT_SUCCESS + "Memory added successfully:" + UI.Style.TEXT_NORMAL)
            UI.println("")
            UI.println(formatMemory(entry))

            log.info("Memory added via command", { id: entry.id, key, scope })
            break
          }

          case "list": {
            const entries = yield* memory.list(scope)

            if (entries.length === 0) {
              UI.println(UI.Style.TEXT_INFO + `No memories found in ${scope} scope.` + UI.Style.TEXT_NORMAL)
              return
            }

            UI.println(UI.Style.TEXT_INFO_BOLD + `Memories (${scope} scope):` + UI.Style.TEXT_NORMAL)
            UI.println("")

            entries.forEach((entry, index) => {
              UI.println(formatMemory(entry, index))
              UI.println("")
            })

            UI.println(UI.Style.TEXT_DIM + `Total: ${entries.length} memories` + UI.Style.TEXT_NORMAL)
            break
          }

          case "get": {
            const key = args.key as string | undefined
            if (!key) {
              UI.error("Error: --key is required for get action")
              UI.error("Usage: opencode memory get --key <key> [--scope project|global]")
              process.exit(1)
            }

            const entryOpt = yield* memory.getByKey(key, scope)

            if (Option.isNone(entryOpt)) {
              UI.println(UI.Style.TEXT_WARNING + `Memory not found: ${key} (${scope} scope)` + UI.Style.TEXT_NORMAL)
              return
            }

            const entry = entryOpt.value
            UI.println(UI.Style.TEXT_INFO_BOLD + "Memory found:" + UI.Style.TEXT_NORMAL)
            UI.println("")
            UI.println(formatMemory(entry))

            // Increment access count
            yield* memory.incrementAccess(entry.id)
            break
          }

          case "update": {
            const key = args.key as string | undefined
            const value = args.value as string | undefined

            if (!key || !value) {
              UI.error("Error: --key and --value are required for update action")
              UI.error("Usage: opencode memory update --key <key> --value <new-value>")
              process.exit(1)
            }

            const entryOpt = yield* memory.getByKey(key, scope)

            if (Option.isNone(entryOpt)) {
              UI.println(UI.Style.TEXT_WARNING + `Memory not found: ${key} (${scope} scope)` + UI.Style.TEXT_NORMAL)
              UI.println(UI.Style.TEXT_DIM + "Use 'memory add' to create a new memory." + UI.Style.TEXT_NORMAL)
              return
            }

            const updatedOpt = yield* memory.update(entryOpt.value.id, value)

            if (Option.isSome(updatedOpt)) {
              UI.println(UI.Style.TEXT_SUCCESS + "Memory updated successfully:" + UI.Style.TEXT_NORMAL)
              UI.println("")
              UI.println(formatMemory(updatedOpt.value))
            }

            log.info("Memory updated via command", { id: entryOpt.value.id, key, scope })
            break
          }

          case "remove": {
            const key = args.key as string | undefined
            const id = args.id as string | undefined

            if (!key && !id) {
              UI.error("Error: --key or --id is required for remove action")
              UI.error("Usage: opencode memory remove --key <key> | --id <id>")
              process.exit(1)
            }

            let targetId: string | undefined = id

            if (!targetId && key) {
              const entryOpt = yield* memory.getByKey(key, scope)
              if (Option.isSome(entryOpt)) {
                targetId = entryOpt.value.id
              }
            }

            if (!targetId) {
              UI.println(UI.Style.TEXT_WARNING + "Memory not found" + UI.Style.TEXT_NORMAL)
              return
            }

            const removed = yield* memory.remove(targetId)

            if (removed) {
              UI.println(UI.Style.TEXT_SUCCESS + "Memory removed successfully." + UI.Style.TEXT_NORMAL)
              log.info("Memory removed via command", { id: targetId })
            } else {
              UI.println(UI.Style.TEXT_WARNING + "Memory not found." + UI.Style.TEXT_NORMAL)
            }
            break
          }

          case "search": {
            const query = args.query as string | undefined

            if (!query) {
              UI.error("Error: --query is required for search action")
              UI.error("Usage: opencode memory search --query <query> [--scope project|global]")
              process.exit(1)
            }

            const results = yield* memory.search(query, scope)

            if (results.length === 0) {
              UI.println(UI.Style.TEXT_INFO + "No matching memories found." + UI.Style.TEXT_NORMAL)
              return
            }

            UI.println(UI.Style.TEXT_INFO_BOLD + `Search results for "${query}":` + UI.Style.TEXT_NORMAL)
            UI.println("")

            results.forEach((result, index) => {
              UI.println(`${index + 1}. [Relevance: ${result.relevance.toFixed(2)}]`)
              UI.println(formatMemory(result.entry))
              UI.println("")
            })

            UI.println(UI.Style.TEXT_DIM + `Found: ${results.length} results` + UI.Style.TEXT_NORMAL)
            break
          }

          case "clear": {
            const entries = yield* memory.list(scope)

            UI.println(UI.Style.TEXT_WARNING + `This will remove all ${entries.length} memories in ${scope} scope.` + UI.Style.TEXT_NORMAL)
            UI.println(UI.Style.TEXT_DIM + "Note: In MVP, this lists memories. Use 'memory remove' with specific keys to delete." + UI.Style.TEXT_NORMAL)
            UI.println("")

            if (entries.length > 0) {
              UI.println("Memories to be cleared:")
              entries.forEach((entry, index) => {
                UI.println(`  ${index + 1}. ${entry.key}`)
              })
            }

            log.info("Memory clear command executed", { scope, count: entries.length })
            break
          }

          default: {
            UI.error(`Unknown action: ${action}`)
            UI.error("Valid actions: add, list, get, update, remove, search, clear")
            process.exit(1)
          }
        }
      })

      await Effect.runPromise(Effect.provide(program, memoryLayer))
    })
  },
})
