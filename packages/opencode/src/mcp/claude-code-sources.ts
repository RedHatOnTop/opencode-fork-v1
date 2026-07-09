import path from "node:path"
import { Effect } from "effect"
import { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"
import { FSUtil } from "@opencode-ai/core/fs-util"
import type { Global } from "@opencode-ai/core/global"

// Claude Code stores MCP servers under a `mcpServers` key in settings files
// (~/.claude/settings.json, ~/.zcode/settings.json) and in project-local .mcp.json.
// Each entry is either a local stdio server {command, args, env} or a string URL.
// opencode's own config uses {type:"local", command:[...], environment} /
// {type:"remote", url, headers}; convert into that shape so the existing MCP layer
// can connect to them without a separate loader.

// Claude Code stores each MCP server as an object (or a bare URL string). The object
// shape is loose: it may carry command/args/env (local stdio) or url/headers (remote),
// plus arbitrary metadata (description, type) we ignore. We narrow field-by-field rather
// than binding to a strict discriminated union so extra keys never break conversion.
type ClaudeMcpEntry = string | Record<string, unknown>

type ClaudeMcpConfig = { mcpServers?: Record<string, ClaudeMcpEntry> }

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && Object.values(value).every((v) => typeof v === "string")
}

function isEnabled(entry: Record<string, unknown>): boolean {
  if (entry.enabled === false) return false
  if (entry.disabled === true) return false
  return true
}

// Convert a single Claude Code MCP entry into opencode's config shape.
// Returns undefined for entries that cannot be represented (e.g. an empty object).
export function convertClaudeMcpEntry(entry: ClaudeMcpEntry): ConfigMCPV1.Info | undefined {
  // A bare string is treated as a remote URL (Claude Code's shorthand for HTTP servers).
  if (typeof entry === "string") {
    if (entry === "") return undefined
    return { type: "remote", url: entry }
  }

  if (!isEnabled(entry)) return undefined

  const url = entry.url
  if (typeof url === "string" && url !== "") {
    const headers = entry.headers
    const timeout = typeof entry.timeout === "number" ? entry.timeout : undefined
    return {
      type: "remote",
      url,
      ...(isStringRecord(headers) ? { headers } : {}),
      ...(timeout ? { timeout } : {}),
    }
  }

  const command = entry.command
  if (typeof command === "string" && command !== "") {
    const args = Array.isArray(entry.args) ? entry.args.filter((a): a is string => typeof a === "string") : []
    const env = entry.env
    const timeout = typeof entry.timeout === "number" ? entry.timeout : undefined
    return {
      type: "local",
      command: [command, ...args],
      ...(typeof entry.cwd === "string" ? { cwd: entry.cwd } : {}),
      ...(isStringRecord(env) ? { environment: env } : {}),
      ...(timeout ? { timeout } : {}),
    }
  }
}

// Read and parse a JSON file if it exists and contains a mcpServers object.
// Missing files, parse errors, and non-mcpServers shapes yield an empty record
// (logged, not fatal) so a malformed external file never blocks MCP loading.
function readMcpServers(fsys: FSUtil.Interface, file: string) {
  return Effect.gen(function* () {
    if (!(yield* fsys.existsSafe(file))) return {}
    const parsed = yield* fsys.readJson(file).pipe(
      Effect.catch((error) =>
        Effect.logWarning("Claude Code MCP source could not be parsed; skipping", { file, error }).pipe(
          Effect.as(undefined),
        ),
      ),
    )
    if (!parsed || typeof parsed !== "object") return {}
    const servers = (parsed as ClaudeMcpConfig).mcpServers
    if (!servers || typeof servers !== "object") return {}
    return servers
  })
}

// Collect MCP servers from Claude-Code-compatible sources:
//   ~/.claude/settings.json   ~/.zcode/settings.json   project-up .mcp.json
// Sources are merged in order; earlier definitions win on name conflicts so a
// user's home config is not overridden by a project file. opencode.json (handled
// by the caller) always takes final precedence over these discovered entries.
//
// Home configs are always read (the user's own machine). Project-local .mcp.json
// travels with a repo and can spawn arbitrary local commands, so it is only read
// when `includeProject` is true (opt-in) to avoid auto-executing an untrusted
// file's server just by opening the directory.
export function discoverClaudeCodeMcpServers(
  fsys: FSUtil.Interface,
  global: Global.Interface,
  directory: string,
  worktree: string,
  includeProject: boolean,
) {
  return Effect.gen(function* () {
    const result: Record<string, ConfigMCPV1.Info> = {}

    const homeFiles = [
      path.join(global.home, ".claude", "settings.json"),
      path.join(global.home, ".zcode", "settings.json"),
    ]
    for (const file of homeFiles) {
      const servers = yield* readMcpServers(fsys, file)
      for (const [name, entry] of Object.entries(servers)) {
        if (name in result) continue
        const converted = convertClaudeMcpEntry(entry)
        if (converted) result[name] = converted
      }
    }

    if (!includeProject) return result

    // Project-local .mcp.json files, walked up from the workspace to the worktree root.
    // fsys.up returns the full path to each .mcp.json it finds.
    const projectFiles = yield* fsys
      .up({ targets: [".mcp.json"], start: directory, stop: worktree })
      .pipe(Effect.catch(() => Effect.succeed([] as string[])))

    for (const file of projectFiles) {
      // .mcp.json itself is the target (not a directory), so read it directly.
      const servers = yield* readMcpServers(fsys, file)
      for (const [name, entry] of Object.entries(servers)) {
        if (name in result) continue
        const converted = convertClaudeMcpEntry(entry)
        if (converted) result[name] = converted
      }
    }

    return result
  })
}
