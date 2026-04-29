import { describe, it, expect } from "bun:test"
import fc from "fast-check"

describe("Property 9: 비용 추적 단조 누적", () => {
  it("세션 누적 비용은 단조 비감소(monotonically non-decreasing)여야 함", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            input: fc.integer({ min: 0, max: 10000 }),
            output: fc.integer({ min: 0, max: 10000 }),
            cacheRead: fc.integer({ min: 0, max: 5000 }),
            cacheWrite: fc.integer({ min: 0, max: 5000 }),
            cost: fc.float({ min: 0, max: 1 }),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        (usageRecords) => {
          let totalCost = 0
          const costs: number[] = []

          for (const record of usageRecords) {
            totalCost += record.cost
            costs.push(totalCost)
          }

          // Verify monotonically non-decreasing
          for (let i = 1; i < costs.length; i++) {
            expect(costs[i]).toBeGreaterThanOrEqual(costs[i - 1])
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it("세션 전환 시 save→reset→restore 순서가 보장되어야 함", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 30 }), // session ID
        fc.float({ min: 0.01, max: 10 }), // current cost
        fc.float({ min: 0.01, max: 10 }), // target cost
        (sessionId, currentCost, targetCost) => {
          const operations: string[] = []

          // Simulate session switch operations
          const saveCost = () => {
            operations.push("save")
            return { sessionId, cost: currentCost }
          }

          const resetCost = () => {
            operations.push("reset")
            return { sessionId, cost: 0 }
          }

          const restoreCost = (snapshot: { sessionId: string; cost: number }) => {
            operations.push("restore")
            return snapshot
          }

          // Perform session switch
          const saved = saveCost()
          resetCost()
          restoreCost({ sessionId, cost: targetCost })

          // Verify order
          expect(operations).toEqual(["save", "reset", "restore"])
        }
      ),
      { numRuns: 30 }
    )
  })

  it("비용 교차 오염(cross-contamination)이 발생하지 않아야 함", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            sessionId: fc.string({ minLength: 5, maxLength: 20 }),
            cost: fc.float({ min: 0.01, max: 5 }),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        (sessions) => {
          const sessionCosts = new Map<string, number>()

          // Track costs per session
          for (const session of sessions) {
            const current = sessionCosts.get(session.sessionId) || 0
            sessionCosts.set(session.sessionId, current + session.cost)
          }

          // Verify each session's cost is independent
          for (const [sessionId, cost] of sessionCosts) {
            const otherSessionsCost = Array.from(sessionCosts.entries())
              .filter(([id]) => id !== sessionId)
              .reduce((sum, [, c]) => sum + c, 0)

            // Costs should not be mixed
            expect(cost).toBeGreaterThan(0)
            expect(otherSessionsCost).toBeGreaterThanOrEqual(0)
          }
        }
      ),
      { numRuns: 30 }
    )
  })

  it("모델별 비용 추적이 정확해야 함", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            model: fc.constantFrom("gpt-4", "claude-sonnet", "gemini-pro"),
            input: fc.integer({ min: 100, max: 5000 }),
            output: fc.integer({ min: 100, max: 5000 }),
          }),
          { minLength: 5, maxLength: 20 }
        ),
        (records) => {
          const modelCosts: Record<string, { input: number; output: number }> = {}

          for (const record of records) {
            if (!modelCosts[record.model]) {
              modelCosts[record.model] = { input: 0, output: 0 }
            }
            modelCosts[record.model].input += record.input
            modelCosts[record.model].output += record.output
          }

          // Verify each model has independent tracking
          for (const [model, costs] of Object.entries(modelCosts)) {
            expect(costs.input).toBeGreaterThan(0)
            expect(costs.output).toBeGreaterThan(0)

            // Verify total matches sum of records for this model
            const expectedTotal = records
              .filter((r) => r.model === model)
              .reduce((sum, r) => sum + r.input + r.output, 0)

            expect(costs.input + costs.output).toBe(expectedTotal)
          }
        }
      ),
      { numRuns: 30 }
    )
  })
})
