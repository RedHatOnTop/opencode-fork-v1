# Upstream sync — 2026-06-15

## Context
- fork `dev` was 652 commits behind `upstream/dev`; 53 custom fork commits on top.
- `git merge upstream/dev` produced 68 conflicts across core session/provider/tool/config/TUI/test files.
- Backup branch: `dev-backup-pre-sync-20260615`.
- User direction: resolve all conflicts incrementally, commit periodically, preserve fork identity (Effect v4, `opencode-mod` binary, agent-quality enforcement, upsell removal, loop detection, i18n/ko).

## Fork identity to preserve
- Binary renamed to `opencode-mod`.
- Effect v4 compatibility.
- Agent quality enforcement + upstream upsell removed.
- Loop detection (added 2026-06-15, `feat(session): add loop detection`).
- i18n ko.

## Progress

### Resolved
- Delete conflicts (4): `github-action.test.ts`, `github-copilot-models.test.ts` (fork removed GitHub Action integration), `file/index.test.ts` (upstream consolidated fs services), `json-migration.ts` (upstream removed; fork's last edit was a prior conflict fix only) — all `git rm`.
- Generated: `packages/sdk/js/src/v2/gen/types.gen.ts` → upstream version.
- `.github/workflows/sync-zed-extension.yml.disabled` (UD: upstream deleted) → `git rm`.

### Strategy decision: "줄 건 줴" (selective port onto upstream/dev)
- Abort the 62-file conflict merge. New branch `dev-next` from `upstream/dev` (5d0f86606).
- fork features that upstream already implements better (skill/task/theme/security/Effect-v4) are NOT ported — upstream versions used instead.
- Only fork-unique value is ported.

### Ported onto dev-next

**1. Binary rename → `opencode-mod` (460f15895)**
- bin entry, build outfile/binaryPath, scriptName (index.ts, temporary.ts), MCP client name + BUN_BE_BUN cmd check, managed-config dir.
- Dropped fork-local dead code: `globalConfigDir()` (defined but never imported).
- Dropped ignored fork-local scripts `script/build-skill-index.ts`, `script/build-agent-skill-profiles.ts` (referenced fork-only skill modules; upstream skill system is different).
- Verified: `bun typecheck` (packages/opencode) exit 0.

**2. Agent quality rules + Go upsell removal (604e24158)**
- Added No-TODOs + Preserve-Context rules to `default.txt` (Verification-First already in upstream).
- Added ENFORCE PERFECTION directive to `agent/generate.txt`.
- Removed Go upsell (constants, `goUpsellKeys`, `session.status` listener) from `packages/tui/src/routes/session/index.tsx`. Retry system preserved.
- Not ported: fork's `unified.txt` single-prompt system (upstream keeps provider-specific prompts; rules added to shared default instead).
- Verified: `bun typecheck` (packages/opencode, packages/tui) exit 0.

### Remaining port groups (deferred to separate session)
3. spec/vibe mode management (8716d7848) — fork-unique, needs multi-file wiring (workflow.ts + CLI cmd + command/index + session/system)
4. setup/doctor/backup/restore/update CLI (5cda16034) — 1313 lines / 7 files, doctor.ts conflicts with upstream
5. Korean i18n — upstream already ships ko.ts; fork's 652-commit-old translations would drop upstream's newer keys
8. Compare-then-port: deferred

### Audit + fixes during port
- **d.ts symlink fix (b00886f24):** app/enterprise `custom-elements.d.ts` were git symlinks (120000) that resolve to a literal path string on Windows, breaking typecheck. Replaced with real declaration files (100644). Workspace typecheck 23/23 passes.
- **Loop detection redesign:** fork's record()-based detector required Database.Service inside runLoop's Effect (whose annotation pins requirements to `never`). Redesigned as stateless `check(messages, step)` that scans the message history each turn — no mutable state, no Service dependency. Capped scan to newest WINDOW_SIZE*3 tool calls for O(1)-per-turn cost.
- **Binary rename audit:** no spawn/exec references to the "opencode" command remain; env vars (OPENCODE_*) and package names (@opencode-ai) intentionally kept as internal identifiers.

### Verification
- `bun run typecheck` (workspace): 23/23 tasks pass, exit 0.
- `bun run lint` (oxlint): 0 errors (3830 pre-existing warnings in upstream code), exit 0.

### Final dev-next commits (on upstream/dev base 5d0f86606)
```
1ac986fa0 perf(session): cap loop-detection scan to recent tool calls
f28d9983d feat(session): add stateless loop detection to prompt loop
b00886f24 fix: replace broken custom-elements.d.ts symlinks with real files
d3b9d6a47 ci: add fork OTA deployment workflow and install scripts
d7f657e70 feat: add loopback no-proxy utility for local server commands
604e24158 feat: enforce agent quality rules and remove Go upsell from TUI
460f15895 refactor: rename binary to opencode-mod for fork identity
```

Backup preserved: `dev-backup-pre-sync-20260615` (original fork dev + loop-detection commit).

## Usability & stability hardening pass

After the initial port, a focused audit of the fork-specific code paths found and fixed several gaps that the binary-rename and loop-detection ports had left behind:

### 5f26e5b68 — loop detection hardening + crash reporting
- **max-steps.txt** now covers both loop-detected and step-limit cases (old text said "MAXIMUM STEPS REACHED" even on a repetition/stagnation loop).
- **loopResult.reason** was computed but never used — now logged with session id, step, and trigger (`repetition | stagnation | max_steps`) when the step limit fires.
- **isToolPart** type guard validated only `part.type === "tool"`; now also checks `tool` is a string and `state` is an object, preventing a runtime crash on malformed part data.
- **Crash report writer** ported from the fork (`~/.opencode/crash.json` for Tauri launcher IPC) using proper `node:fs`/`node:path` imports instead of inline `require()`.

### 2d023d421 — binary spawn references
- The binary rename (460f15895) missed three subprocess invocations that still called `"opencode"`:
  - `acp/service.ts:102` — terminal-auth command editors use to authenticate
  - `cli/cmd/pr.ts:83` — session import subprocess
  - `cli/cmd/pr.ts:104` — new session launch subprocess
- All three now spawn `"opencode-mod"`. Other `"opencode"` string matches (provider config keys, URL schemes, test tags, stat provider names) are identifiers, not binary names — intentionally unchanged.

### Verification (final)
- `bun run typecheck` (workspace): 23/23 tasks pass, exit 0.
- `bunx oxlint` on 12 changed files: 0 errors (28 pre-existing upstream warnings).

### Updated dev-next commits
```
2d023d421 fix: update binary spawn references to opencode-mod
5f26e5b68 fix(session): harden loop detection and port crash reporting
1ac986fa0 perf(session): cap loop-detection scan to recent tool calls
f28d9983d feat(session): add stateless loop detection to prompt loop
b00886f24 fix: replace broken custom-elements.d.ts symlinks with real files
d3b9d6a47 ci: add fork OTA deployment workflow and install scripts
d7f657e70 feat: add loopback no-proxy utility for local server commands
604e24158 feat: enforce agent quality rules and remove Go upsell from TUI
460f15895 refactor: rename binary to opencode-mod for fork identity
```
