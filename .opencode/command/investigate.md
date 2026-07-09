---
description: Parallel multi-angle investigation of a codebase or technical question
agent: conductor
---

Investigate the question below by attacking it from several angles at once, then synthesize one answer.

Round 1 — Parallel sweep (single message; pick the 2-4 angles that fit the question):
- scout: where the relevant code lives ("very thorough" if the question spans subsystems).
- analyzer: how the mechanism actually works, traced through real code.
- historian: how it got this way — commits, PRs, stated intent.
- researcher: external behavior — library docs, upstream issues, version quirks.
Give each agent the question verbatim plus the specific sub-question it owns and the required output contract.

Round 2 — Reconcile:
- Where agents disagree or an important claim rests on a single uncited source, task skeptic (or a follow-up analyzer) to settle it. Do not average contradictory answers.

Report:
- ANSWER first, in plain sentences.
- MECHANISM: how it works, with file:line references.
- HISTORY: why it is this way, if relevant.
- CONFIDENCE and open unknowns, with what it would take to close them.
- This is an investigation: change nothing, propose fixes only if asked.

Question: $ARGUMENTS
