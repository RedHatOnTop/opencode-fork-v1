---
description: Bug-fix pipeline (reproduce -> root-cause -> fix -> prove)
agent: conductor
---

Fix the bug described below using a reproduce-first pipeline. A fix without a reproduction is a guess — do not skip Phase 1.

Phase 1 — Reproduce and locate (parallel, single message):
- tester: attempt to reproduce (existing failing test, or the exact steps/commands from the report). The deliverable is a reliable repro or a precise account of why it cannot be reproduced here.
- scout: locate the code paths implicated by the symptom ("medium" thoroughness).

Phase 2 — Root cause:
- analyzer: hand it the repro evidence and scout's map; require a root cause with file:line evidence and explicitly rejected alternative hypotheses.
- If analyzer's confidence is not high, have skeptic attack the proposed root cause before writing any fix.

Phase 3 — Fix:
- Implement the minimal fix for the confirmed root cause (yourself, or implementer with a complete spec). Add or update a test that fails without the fix and passes with it — this is mandatory unless truly untestable, in which case say why.

Phase 4 — Prove (parallel, single message):
- tester: the new test, the original repro, and the affected package suite.
- reviewer (lens "correctness"): the fix diff, with special attention to whether the fix masks the symptom instead of removing the cause, and what else the changed code path affects.
- Fix findings, re-verify until clean (max 3 rounds), then report: root cause, the fix, and the evidence it is gone.

Bug report: $ARGUMENTS
