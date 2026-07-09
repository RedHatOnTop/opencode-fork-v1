# Subagent workflow suite — 2026-07-09

## Request

Make the fork's agent setup production-ready for daily use: broad use of
subagents, maximum quality out of mid-tier (Sonnet/GPT-5.4-class) models,
token spend explicitly not a concern.

## What was added

### Agents (`.opencode/agent/`)

One orchestrator primary + nine specialized subagents, each pinned to a Zen
model chosen for the role, with reasoning variants raised:

- `conductor` (primary, claude-sonnet-4-6 @ high) — triage, parallel fan-out,
  mandatory post-change verification loop (max 3 rounds), evidence-required
  integration.
- `scout` (gemini-3.5-flash @ medium) — read-only file/symbol locator with a
  FOUND/RELATED/NOT FOUND contract.
- `analyzer` (gpt-5.4 @ xhigh) — read-only tracing/root-cause with
  hypothesis-elimination and file:line evidence requirements.
- `planner` (claude-sonnet-4-6 @ max) — read-only planner; explicitly granted
  `task` permission for scout/explore/researcher/historian (subagents are
  otherwise task-denied by `deriveSubagentSessionPermission`).
- `implementer` (kimi-k2.6) — edit+bash executor for complete specs; must run
  package-dir typecheck; reports DEVIATIONS instead of improvising.
- `reviewer` (gpt-5.4 @ high) — read-only single-lens adversarial review
  (correctness/edge-cases/security/api-contract/simplification); findings
  require a concrete failure scenario.
- `skeptic` (glm-5.2 @ high) — bash-but-no-edit claim verifier; refute-first,
  CONFIRMED/REFUTED/UNCERTAIN verdicts with executed evidence.
- `tester` (gpt-5.4-mini @ high) — bash-but-no-edit test runner; encodes repo
  rules (no tests from root, `bun typecheck` from package dirs); classifies
  failures REGRESSION/PRE-EXISTING/ENVIRONMENT.
- `historian` (claude-haiku-4-5) — git-read-only archaeology (log -S, blame
  re-runs past cosmetic commits).
- `researcher` (gemini-3.5-flash @ high) — web+read researcher pinned to the
  repo's actual dependency versions.

### Commands (`.opencode/command/`)

`/ship`, `/fix`, `/deep-review`, `/investigate` — all run as `conductor` and
script the fan-out phases (parallel recon, plan, implement, parallel
multi-lens verify with skeptic adjudication).

### Docs

`.opencode/WORKFLOW.md` — roster/routing table, design rationale, global
install instructions, tuning knobs.

## Design decisions

- Cross-family verification: Kimi writes, GPT-5.4 reviews, GLM-5.2 verifies,
  Sonnet integrates. Disagreement between families is treated as signal and
  settled by executed evidence, not majority vote.
- `variant` (first-class agent field) used instead of raw `reasoningEffort`
  pass-through: variants are derived per-model in
  `packages/opencode/src/provider/transform.ts` (`variants()`), and
  `session/prompt.ts:655` drops unknown variants silently, so pinning is
  safe across model swaps. Verified sonnet-4-6 -> low/medium/high/max,
  gpt-5.4(-mini) -> ...xhigh, glm-5.2 -> high/max, gemini-3.5-flash ->
  minimal/low/medium/high; kimi-k2.6 has none.
- Permission rulesets mirror the built-in `explore` agent pattern
  (`"*": deny` first, then allows; last-match-wins per
  `config/permission.ts`), with per-command git allowlists for read-only
  agents.
- No temperatures set anywhere — provider transforms own sampling defaults.
- Prompts are contract-heavy (numbered process + literal output template +
  "no questions, state assumptions") because mid-tier models gain the most
  from explicit scaffolding.
