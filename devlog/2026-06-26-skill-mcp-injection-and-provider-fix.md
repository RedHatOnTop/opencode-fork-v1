# Skill/MCP auto-injection + provider registration fix — 2026-06-26

## Two requests in one session
1. Add skill + MCP server auto-injection (sources by analogy to the Claude Code
   config on this system).
2. Fix provider registration not working.

## Problem 1 — provider registration silently failed (root cause)

The 2026-06-16 generic OpenAI-compatible discovery loop gated on `provider.key`:

    if (!provider.key) continue   // provider.ts (old line 1635)

But `provider.key` is set in only two places during state build — the env path
(needs a populated `env[]` var) and the auth path (needs a prior `/connect`). It
is NEVER derived from `cfg.provider[id].options.apiKey`. So a custom
OpenAI-compatible provider declared purely in `opencode.json` with
`options.apiKey` + `options.baseURL` (no `env`, no `/connect`) was skipped by
discovery, left with zero models, and then DELETED at the final filter
(`Object.keys(provider.models).length === 0` -> `delete providers[providerID]`).
It silently vanished. Same gap in `refreshModels`, which resolved the key only
from stored auth, so the TUI "Refresh models" button was a no-op for config-only
providers.

### Fix — `packages/opencode/src/provider/provider.ts`
- New exported `resolveApiKey(provider, configProvider, envs)` helper: returns
  `provider.key` || `provider.options.apiKey` || `configProvider.options.apiKey`
  || bearer token from `options.headers.Authorization`, each with `${ENV}`
  substitution (mirrors the existing baseURL substitution). Mirrors the runtime
  key resolution already in `resolveSDK`.
- The discovery loop now resolves the key via `resolveApiKey` instead of gating
  on `provider.key`, and passes the resolved key to
  `discoverOpenAICompatibleModels`.
- `refreshModels` resolves stored-auth key first, then falls back to
  `resolveApiKey`, so manual refresh works for config-only providers too.

### Test — `packages/opencode/test/provider/resolve-api-key.test.ts`
10 cases: provider.key precedence, options.apiKey fallback (provider + config),
`${ENV}` substitution, Bearer-header fallback, empty-value rejection, undefined
when no source.

## Problem 2a — skill discovery now reads `.zcode`

opencode already scanned `~/.claude/skills` and `~/.agents/skills`
(`skill/index.ts`). It did NOT scan `.zcode`, where this fork's skills live
(e.g. `~/.zcode/skills/tdd-workflow`) and plugin-bundled skills
(`~/.zcode/cli/plugins/cache/**/skills`).

### Fix — `packages/opencode/src/skill/index.ts`
- New `ZCODE_EXTERNAL_DIR = ".zcode"` constant; pushed into `externalDirs`
  (home + project-up scan), gated by a new `disableZcodeSkills` flag.
- New plugin-cache scan: `~/.zcode/cli/plugins/cache` with pattern
  `**/skills/**/SKILL.md` so versioned plugin skills (superpowers,
  document-skills, etc.) are discovered. Existing `.claude`/`.agents` behavior
  unchanged.

## Problem 2b — MCP servers now read Claude-Code-format configs

opencode seeded MCP state only from `cfg.mcp` (`opencode.json`). It never read
Claude-Code-format `mcpServers` (shape `{command, args, env}`), so the
github/context7/filesystem/memory servers in `~/.claude/settings.json` were
invisible.

### Fix — new `packages/opencode/src/mcp/claude-code-sources.ts`
- `convertClaudeMcpEntry(entry)`: pure converter. Bare string -> remote URL;
  `{command, args, env}` -> `{type:"local", command:[command, ...args],
  environment}`; `{url, headers}` -> `{type:"remote", url, headers}`. Narrows
  field-by-field so extra metadata (description, type) is ignored. Skips
  `enabled:false` / `disabled:true` / empty-command entries.
- `discoverClaudeCodeMcpServers(fsys, global, directory, worktree)`: reads
  `mcpServers` from `~/.claude/settings.json`, `~/.zcode/settings.json`, and
  project-up `.mcp.json`. Earlier sources win on name conflicts.
- Wired into `mcp/index.ts` state builder: discovered servers merge into the
  `config` record before iteration, with `cfg.mcp` (opencode.json) always taking
  precedence. Discovery errors are logged, not fatal. Each resolved server is
  tracked in `s.config` so `status()` reports it.

### Fix — `packages/opencode/src/effect/runtime-flags.ts`
- `disableZcodeSkills` (env `OPENCODE_DISABLE_ZCODE_SKILLS`).
- `disableClaudeCodeMcp` (env `OPENCODE_DISABLE_CLAUDE_CODE_MCP` or broad
  `OPENCODE_DISABLE_CLAUDE_CODE`), mirroring the existing skill flags.

### Layer wiring — `packages/opencode/src/mcp/index.ts`
- Layer now yields `FSUtil`, `Global`, `RuntimeFlags` services; `defaultLayer`
  and `node` provide them.

### Test — `packages/opencode/test/mcp/claude-code-sources.test.ts`
10 cases: local stdio conversion, bare-string remote, remote with headers,
command-only, cwd/timeout preservation, both disable forms, empty command, empty
URL, object without command/url.

### Test layer updates
- `test/mcp/oauth-auto-connect.test.ts`, `test/mcp/oauth-browser.test.ts`: added
  `Global.layer` + `RuntimeFlags.defaultLayer` to satisfy the new layer deps.

## Verification
- `bun typecheck` (packages/opencode): clean.
- `bun test test/provider test/mcp` (19 files): 473 pass, 0 fail.
