---
description: Multi-lens parallel review of the current branch diff, with skeptic-verified findings
agent: conductor
---

Run a deep, multi-lens review of the current changes.

Setup:
- Determine the diff under review: if arguments name a base, ref, or PR, use that; otherwise review `git diff dev...HEAD` plus uncommitted changes (`git diff` / `git status --short`). State exactly what you are reviewing before starting.

Round 1 — Parallel review (single message, all at once):
- reviewer, lens "correctness"
- reviewer, lens "edge-cases"
- reviewer, lens "security" (skip only if the diff has no input handling, IO, or auth surface — say so)
- reviewer, lens "simplification"
Give each reviewer the exact diff command and the list of changed files.

Round 2 — Adjudicate:
- Deduplicate overlapping findings.
- Send every critical/major finding to skeptic for confirmation (parallel, one skeptic per finding). Minor findings pass through unverified but marked as such.
- Drop anything skeptic refutes; keep its refutation in your notes.

Report:
- Verdict first: CLEAN or FINDINGS with counts by severity.
- Confirmed findings ranked by severity, each with file:line, failure scenario, and suggested fix direction.
- A short "refuted by skeptic" section so the effort is visible and not re-raised later.
- Do NOT apply fixes unless the arguments explicitly ask for it.

Arguments: $ARGUMENTS
