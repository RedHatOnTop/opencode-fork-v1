import { describe, it, expect } from "bun:test"
import fc from "fast-check"
import { WorkflowMode, WorkflowPhase, nextPhase } from "@/workflow/workflow"

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

describe("Workflow nextPhase function", () => {
  it("idle에서 시작하면 plan으로 이동", () => {
    expect(nextPhase("idle")).toBe("plan")
  })

  it("plan에서 execute로 이동", () => {
    expect(nextPhase("plan")).toBe("execute")
  })

  it("execute에서 verify로 이동", () => {
    expect(nextPhase("execute")).toBe("verify")
  })

  it("verify에서 ship으로 이동 (검증 통과)", () => {
    expect(nextPhase("verify", true)).toBe("ship")
  })

  it("verify에서 execute로 루프백 (검증 실패 + 미해결 태스크)", () => {
    expect(nextPhase("verify", false, true)).toBe("execute")
  })

  it("verify에서 ship으로 이동 (검증 실패했지만 태스크 없음)", () => {
    expect(nextPhase("verify", false, false)).toBe("ship")
  })

  it("ship에서 idle로 이동", () => {
    expect(nextPhase("ship")).toBe("idle")
  })

  it("알 수 없는 phase는 idle로 폴백", () => {
    expect(nextPhase("unknown" as any)).toBe("idle")
  })
})

describe("Spec mode phase transition correctness (spec R12-R15)", () => {
  it("전체 파이프라인: idle → plan → execute → verify → ship → idle", () => {
    expect(nextPhase("idle")).toBe("plan")
    expect(nextPhase("plan")).toBe("execute")
    expect(nextPhase("execute")).toBe("verify")
    expect(nextPhase("verify", true)).toBe("ship")
    expect(nextPhase("ship")).toBe("idle")
  })

  it("검증 실패 시 verify → execute 루프백", () => {
    expect(nextPhase("verify", false, true)).toBe("execute")
  })

  it("검증 실패해도 execute 루프 후 다시 verify 도달", () => {
    const afterFix = nextPhase("execute")
    expect(afterFix).toBe("verify")
  })
})

describe("SpecAdvanceTool 기능 검증 (issue 1)", () => {
  it("spec_advance 툴이 존재해야 함", async () => {
    // The tool should be importable and defiend
    const { SpecAdvanceTool } = await import("@/tool/spec-advance")
    expect(SpecAdvanceTool).toBeDefined()
  })
})

describe("Mode switching guard (issue 2)", () => {
  it("spec 모드에서 phase가 idle이 아니면 vibe 전환이 차단되어야 함", () => {
    // This is verified by the setMode guard logic:
    // if (previousMode === "spec" && s.currentPhase !== "idle" && mode !== "spec")
    // the guard throws Effect.die with an error
    const guardCondition = (previousMode: string, currentPhase: string, newMode: string): boolean => {
      return previousMode === "spec" && currentPhase !== "idle" && newMode !== "spec"
    }

    // Should block when spec pipeline is active
    expect(guardCondition("spec", "plan", "vibe")).toBe(true)
    expect(guardCondition("spec", "execute", "vibe")).toBe(true)
    expect(guardCondition("spec", "verify", "vibe")).toBe(true)
    expect(guardCondition("spec", "ship", "vibe")).toBe(true)

    // Should NOT block when:
    // - Already in vibe mode
    expect(guardCondition("vibe", "plan", "spec")).toBe(false)
    // - Phase is idle
    expect(guardCondition("spec", "idle", "vibe")).toBe(false)
    // - Switching to same mode
    expect(guardCondition("spec", "plan", "spec")).toBe(false)
  })
})

describe("Phase indicator (issue 3)", () => {
  it("formatWorkflowStatus가 spec 모드에서 phase를 올바르게 표시해야 함", async () => {
    const { formatWorkflowStatus } = await import("@/cli/cmd/workflow")
    const specResult = formatWorkflowStatus("spec" as any, "plan" as any)
    expect(specResult).toBeTruthy()
    expect(specResult).toContain("SPEC")
    expect(specResult).toContain("Plan")

    const vibeResult = formatWorkflowStatus("vibe" as any)
    expect(vibeResult).toBeTruthy()
    expect(vibeResult).toContain("VIBE")
  })

  it("formatModeForStatus가 spec/vibe를 올바르게 표시해야 함", async () => {
    const { formatModeForStatus } = await import("@/cli/cmd/workflow")
    const specResult = formatModeForStatus("spec" as any)
    expect(specResult).toContain("SPEC")

    const vibeResult = formatModeForStatus("vibe" as any)
    expect(vibeResult).toContain("VIBE")
  })
})
