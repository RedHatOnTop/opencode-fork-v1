---
description: Full delivery pipeline for a feature or change (recon -> plan -> implement -> verify)
agent: conductor
---

Execute the full delivery pipeline for the task below. Do not skip phases unless the task is genuinely trivial (single obvious edit) — in that case say so and do it directly.

Phase 1 — Recon (parallel, single message):
- scout: locate all code, tests, and config the task touches ("very thorough" for unfamiliar areas).
- historian: how the affected area evolved and why it is shaped this way (skip only if the area is brand new).
- researcher: only if the task involves an external library or API behavior.

Phase 2 — Plan:
- Send everything recon found to planner and get a file-by-file plan. For small, well-understood changes you may plan yourself, but say that you did.

Phase 3 — Implement:
- Delegate mechanical or well-specified parts to implementer with the complete plan section, constraints, and verification commands. Keep judgment-heavy integration work yourself. Read every diff produced.

Phase 4 — Verify (parallel, single message):
- reviewer with lens "correctness" on the full diff.
- reviewer with a second lens chosen by risk (edge-cases, security, or api-contract).
- tester scoped to the affected packages.
- Send severe or disputed findings to skeptic before large reworks. Fix confirmed findings and re-verify until clean (max 3 rounds), then report per your reporting format.

Task: $ARGUMENTS
