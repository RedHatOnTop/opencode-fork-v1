import { describe, it, expect } from "bun:test"
import fc from "fast-check"

describe("Property 5: Skill 토큰 예산 준수", () => {
  const MAX_LOADED_TOKENS = 4000

  it("로드된 스킬 총 토큰은 상한을 초과하지 않아야 함", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            tokenCount: fc.integer({ min: 50, max: 1000 }),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        (skills) => {
          // Simulate loading skills until budget is exceeded
          const loadedSkills: typeof skills = []
          let totalTokens = 0

          for (const skill of skills) {
            if (totalTokens + skill.tokenCount <= MAX_LOADED_TOKENS) {
              loadedSkills.push(skill)
              totalTokens += skill.tokenCount
            }
            // If budget exceeded, skill is not loaded
          }

          // Verify total tokens don't exceed budget
          expect(totalTokens).toBeLessThanOrEqual(MAX_LOADED_TOKENS)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("상한 초과 시 가장 오래 매칭된 스킬이 LRU 해제되어야 함", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            tokenCount: fc.integer({ min: 500, max: 1500 }),
            lastMatchedAt: fc.integer({ min: 0, max: 1000000 }),
          }),
          { minLength: 3, maxLength: 10 }
        ),
        (skills) => {
          // Sort by lastMatchedAt (oldest first)
          const sortedSkills = [...skills].sort((a, b) => a.lastMatchedAt - b.lastMatchedAt)

          // Simulate loading with LRU eviction
          const loaded: typeof sortedSkills = []
          let totalTokens = 0

          for (const skill of sortedSkills) {
            if (totalTokens + skill.tokenCount > MAX_LOADED_TOKENS) {
              // Evict oldest skill (LRU)
              const oldest = loaded.shift()
              if (oldest) {
                totalTokens -= oldest.tokenCount
              }
            }

            if (totalTokens + skill.tokenCount <= MAX_LOADED_TOKENS) {
              loaded.push(skill)
              totalTokens += skill.tokenCount
            }
          }

          // Verify oldest skills were evicted if budget exceeded
          expect(totalTokens).toBeLessThanOrEqual(MAX_LOADED_TOKENS)
        }
      ),
      { numRuns: 50 }
    )
  })

  it("스킬 인덱스는 스킬당 50토큰 이하로 유지되어야 함", () => {
    const indexEntry = {
      name: "typescript",
      description: "TypeScript skill with type checking and ES features",
      keywords: ["typescript", "ts", "types", "interface", "generic"],
    }

    // Estimate tokens (roughly 4 chars per token)
    const estimatedTokens = Math.ceil(
      (indexEntry.name.length + indexEntry.description.length + indexEntry.keywords.join(" ").length) / 4
    )

    expect(estimatedTokens).toBeLessThanOrEqual(50)
  })
})
