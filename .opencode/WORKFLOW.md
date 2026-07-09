# Subagent workflow

A delegation-first agent suite for this fork. One orchestrator primary (`conductor`) fans work out to nine specialized subagents, each pinned to a mid-tier model chosen for its role, with reasoning variants turned up (results over token savings). Reviewers and verifiers deliberately run on different model families than the code writers — cross-family checking catches what same-model review misses.

## Quick start

- Press Tab (or `/agents`) and switch to **conductor**, then work normally — it triages and delegates on its own.
- Or run a pipeline command directly:
  - `/ship <task>` — recon -> plan -> implement -> verify
  - `/fix <bug report>` — reproduce -> root-cause -> fix -> prove
  - `/deep-review [base|PR]` — 4-lens parallel review, skeptic-verified findings
  - `/investigate <question>` — parallel multi-angle investigation
- Any subagent can be invoked directly with an `@` mention (e.g. `@scout find where variants are resolved`).

## Roster and model routing

| Agent | Mode | Model | Variant | Access | Role |
|---|---|---|---|---|---|
| conductor | primary | claude-sonnet-4-6 | high | full | Orchestrator, integrator, quality gate |
| scout | subagent | gemini-3.5-flash | medium | read-only + git read | Fast file/symbol location |
| analyzer | subagent | gpt-5.4 | xhigh | read-only + git read | Deep comprehension, root-cause |
| planner | subagent | claude-sonnet-4-6 | max | read-only, can task scout/explore/researcher/historian | File-by-file implementation plans |
| implementer | subagent | kimi-k2.6 | — | edit + bash | Executes complete specs |
| reviewer | subagent | gpt-5.4 | high | read-only + git read | One-lens adversarial diff review |
| skeptic | subagent | glm-5.2 | high | read + bash, no edit | Refute-or-confirm claim verification |
| tester | subagent | gpt-5.4-mini | high | read + bash, no edit | Runs typecheck/tests, classifies failures |
| researcher | subagent | gemini-3.5-flash | high | read + web | Version-pinned external docs research |
| historian | subagent | claude-haiku-4-5 | — | read + git read | Git archaeology |

All models are OpenCode Zen (`opencode/` prefix). Variants map to each provider's reasoning-effort controls and are silently ignored if a model stops supporting them, so pinning them is safe.

## Design notes

- **Why cross-family**: implementer (Kimi) is reviewed by GPT-5.4 and verified by GLM-5.2 under a Sonnet orchestrator. Different families have different blind spots; disagreement between them is signal, and the skeptic settles it with executed evidence.
- **Why tight permissions**: read-only agents physically cannot drift into editing; the skeptic and tester can execute but not modify. This keeps every claim attributable and every change reviewed.
- **Two-level delegation**: subagents normally cannot spawn subagents; `planner` is explicitly granted `task` access to scout/explore/researcher/historian so plans are grounded in fresh recon.
- **Output contracts**: every subagent prompt ends with a literal output template. Mid-tier models perform dramatically better with explicit process steps and a fixed report shape — that is where most of the quality headroom lives.
- **Honesty rules**: every agent must cite file:line or executed output for load-bearing claims, may not ask questions (they state assumptions instead), and must report deviations rather than improvising.

## Using this outside the repo

Copy the agent files to your global config to get the same suite in every project:

```sh
mkdir -p ~/.config/opencode/agent ~/.config/opencode/command
cp .opencode/agent/{conductor,scout,analyzer,planner,implementer,reviewer,skeptic,tester,researcher,historian}.md ~/.config/opencode/agent/
cp .opencode/command/{ship,fix,deep-review,investigate}.md ~/.config/opencode/command/
```

Repo-specific lines (bun typecheck / package-dir tests / `dev` default branch) live in `conductor`, `tester`, `planner`, and `historian`; adjust or delete those bullets for other projects.

## Tuning

- Model swaps are one-line frontmatter edits (`model: opencode/...`). Current non-deprecated alternatives worth trying per role: `qwen3.7-max` or `deepseek-v4-pro` for analyzer/skeptic, `minimax-m2.7` for implementer, `gpt-5.4-nano` for scout if latency matters more than depth.
- To bias harder toward quality, raise variants (`high` -> `max` on Sonnet agents, `high` -> `xhigh` on GPT-5.4 agents).
- To make conductor the default agent, set `"default_agent": "conductor"` in `opencode.jsonc`.
