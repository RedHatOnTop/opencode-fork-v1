import { test, expect, describe } from "bun:test"
import fs from "fs"
import path from "path"

// Fork-integrity guard: asserts that the fork's intentional customizations are
// still present in source. An upstream merge that silently drops one (as has
// happened before: archive.ts fix, lsp evictFileCache, alwaysSeparate decl)
// fails this test instead of shipping. Text-based on purpose — it must catch a
// clobbered customization regardless of whether the tree still compiles.
//
// Keep in sync with the inventory in FORK_MAINTENANCE.md: one assertion per
// must-survive customization.
const REPO = path.join(import.meta.dir, "..", "..", "..", "..")
const OPENCODE = path.join(REPO, "packages", "opencode", "src")
const TUI = path.join(REPO, "packages", "tui", "src")

const read = (p: string) => fs.readFileSync(p, "utf8")
const exists = (p: string) => fs.existsSync(p)

describe("fork integrity", () => {
  test("loop detection module present and wired into the prompt loop", () => {
    expect(exists(path.join(OPENCODE, "session", "loop-detect.ts"))).toBe(true)
    // The safety net is only real if the prompt loop actually consults it.
    expect(read(path.join(OPENCODE, "session", "prompt.ts"))).toContain("LoopDetect.check")
  })

  test("Claude Code MCP source discovery present", () => {
    const f = path.join(OPENCODE, "mcp", "claude-code-sources.ts")
    expect(exists(f)).toBe(true)
    expect(read(f)).toContain("discoverClaudeCodeMcpServers")
  })

  test("loopback no-proxy utility present", () => {
    expect(read(path.join(OPENCODE, "util", "network.ts"))).toContain("ensureLoopbackNoProxy")
  })

  test("binary identity renamed to opencode-mod", () => {
    // Two independent anchors so a rename in one file still trips the guard.
    expect(read(path.join(OPENCODE, "acp", "service.ts"))).toContain("opencode-mod")
    expect(read(path.join(OPENCODE, "config", "managed.ts"))).toContain("opencode-mod")
  })

  test("alwaysSeparate declaration present in TUI session route (regression guard)", () => {
    // This declaration was lost once, leaving 8 usages undefined. Guard it.
    const f = path.join(TUI, "routes", "session", "index.tsx")
    expect(read(f)).toMatch(/export const alwaysSeparate\s*=/)
  })

  test("upstream Go subscription upsell removed from the retry path", () => {
    // The free-tier limit path must not carry the upstream "subscribe to
    // OpenCode Go" promo or its link. (The GoUsageLimitError branch keeps its
    // account-status link on purpose — that is operational info for paying
    // users, not a cold upsell.)
    const retry = read(path.join(OPENCODE, "session", "retry.ts"))
    expect(retry).not.toContain("GO_UPSELL")
    expect(retry).not.toContain("Subscribe to OpenCode Go")
  })

  test("project-local .mcp.json discovery is gated (not auto-spawned)", () => {
    // Opening a repo with a malicious .mcp.json must not auto-spawn its server;
    // the project walk is behind an opt-in flag.
    const src = read(path.join(OPENCODE, "mcp", "claude-code-sources.ts"))
    expect(src).toContain("includeProject")
    expect(read(path.join(OPENCODE, "effect", "runtime-flags.ts"))).toContain("enableClaudeCodeProjectMcp")
  })
})
