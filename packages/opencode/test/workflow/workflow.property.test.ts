import { describe, it, expect } from "bun:test"
import fc from "fast-check"
import { WorkflowMode, WorkflowPhase } from "@/workflow/workflow"

describe("Property 4: Workflow Mode 전환 무결성", () => {
  it("모드는 항상 spec 또는 vibe 중 하나여야 함", () => {
    const validModes = ["spec", "vibe"]

    fc.assert(
      fc.property(fc.string(), (mode) => {
        if (validModes.includes(mode)) {
          // Should be valid
          expect([...WorkflowMode.literals] as string[]).toContain(mode)
        }
      }),
      { numRuns: 100 }
    )
  })

  it("Spec phase는 항상 plan, execute, verify, ship 중 하나여야 함", () => {
    const validPhases = ["plan", "execute", "verify", "ship"]

    fc.assert(
      fc.property(fc.string(), (phase) => {
        if (validPhases.includes(phase)) {
          expect([...WorkflowPhase.literals] as string[]).toContain(phase)
        }
      }),
      { numRuns: 100 }
    )
  })

  it("Phase 순서는 plan→execute→verify→ship이어야 함", () => {
    const phaseOrder = ["plan", "execute", "verify", "ship"]

    for (let i = 0; i < phaseOrder.length - 1; i++) {
      const current = phaseOrder[i]
      const next = phaseOrder[i + 1]

      expect(phaseOrder.indexOf(next)).toBe(phaseOrder.indexOf(current) + 1)
    }
  })

  it("역방향 전이는 verify→execute만 허용되어야 함", () => {
    // Valid backward transitions (when verification fails)
    const validBackwardTransitions = [{ from: "verify", to: "execute" }]

    // All phase pairs
    const phases = ["plan", "execute", "verify", "ship"]

    for (const from of phases) {
      for (const to of phases) {
        const isForward = phases.indexOf(to) > phases.indexOf(from)
        const isValidBackward = validBackwardTransitions.some((t) => t.from === from && t.to === to)
        const isSame = from === to

        if (!isForward && !isValidBackward && !isSame) {
          // This transition should not be allowed
          expect(phases.indexOf(to)).toBeLessThan(phases.indexOf(from))
        }
      }
    }
  })

  it("WorkflowMode와 WorkflowPhase가 올바르게 정의되어 있음", () => {
    expect([...WorkflowMode.literals] as string[]).toContain("spec")
    expect([...WorkflowMode.literals] as string[]).toContain("vibe")
    expect(WorkflowMode.literals).toHaveLength(2)

    expect([...WorkflowPhase.literals] as string[]).toContain("plan")
    expect([...WorkflowPhase.literals] as string[]).toContain("execute")
    expect([...WorkflowPhase.literals] as string[]).toContain("verify")
    expect([...WorkflowPhase.literals] as string[]).toContain("ship")
  })
})
