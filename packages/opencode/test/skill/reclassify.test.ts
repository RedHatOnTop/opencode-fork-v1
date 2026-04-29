import { describe, it, expect } from "bun:test"
import fc from "fast-check"
import {
  reclassifyTiers,
  selectAlwaysSkills,
  isSecurityOnlySkill,
  DEFAULT_RECLASSIFY_CONFIG,
} from "../../src/skill/reclassify"
import type { AssessmentRecord, AssessmentScores } from "../../src/skill/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScores(overrides: Partial<AssessmentScores> = {}): AssessmentScores {
  return {
    noviceCLI: 7,
    lowModelBoost: 8,
    tokenEfficiency: 7,
    autonomySafety: 8,
    securityHygiene: 5,
    staleDependencyDefense: 6,
    nonTriviality: 7,
    lowFriction: 6,
    ...overrides,
  }
}

function makeRecord(overrides: Partial<AssessmentRecord> = {}): AssessmentRecord {
  return {
    skillId: "owner/test-skill",
    tier: "CORE",
    include: true,
    confidence: 90,
    scores: makeScores(),
    reason: "",
    riskNotes: "",
    tokenNotes: "",
    owner: "owner",
    description: "A useful coding skill",
    section: "Development and Testing",
    sourceUrl: "https://example.com",
    sourceKind: "test",
    priorScore: 50,
    priorDecision: "INCLUDE",
    modelUsed: "test",
    assessedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Property 3: Security skill reclassification
// ---------------------------------------------------------------------------

describe("Reclassify — Property 3: Security skill reclassification", () => {
  it("CORE skills with security keywords should be reclassified to HIGH", () => {
    const securityKeywords = DEFAULT_RECLASSIFY_CONFIG.securityKeywords
    for (const keyword of securityKeywords) {
      const record = makeRecord({
        skillId: `owner/skill-with-${keyword}`,
        tier: "CORE",
      })
      const { records } = reclassifyTiers([record])
      expect(records[0].tier).toBe("HIGH")
    }
  })

  it("CORE skills without security keywords should remain CORE", () => {
    const record = makeRecord({
      skillId: "owner/git-workflow",
      tier: "CORE",
      scores: makeScores({ securityHygiene: 3 }),
    })
    const { records } = reclassifyTiers([record])
    expect(records[0].tier).toBe("CORE")
  })

  it("HIGH tier skills should not be affected", () => {
    const record = makeRecord({
      skillId: "owner/trivy-scanner",
      tier: "HIGH",
    })
    const { records } = reclassifyTiers([record])
    expect(records[0].tier).toBe("HIGH")
  })

  it("LONGTAIL tier skills should not be affected", () => {
    const record = makeRecord({
      skillId: "owner/some-skill",
      tier: "LONGTAIL",
    })
    const { records } = reclassifyTiers([record])
    expect(records[0].tier).toBe("LONGTAIL")
  })
})

// ---------------------------------------------------------------------------
// Property 2: ALWAYS selection criteria and invariants
// ---------------------------------------------------------------------------

describe("Reclassify — Property 2: ALWAYS selection invariants", () => {
  it("ALWAYS skills should meet all criteria", () => {
    const records = [
      makeRecord({
        skillId: "owner/good-skill-1",
        tier: "CORE",
        scores: makeScores({ noviceCLI: 8, lowModelBoost: 9 }),
      }),
      makeRecord({
        skillId: "owner/good-skill-2",
        tier: "CORE",
        scores: makeScores({ noviceCLI: 7, lowModelBoost: 8 }),
      }),
      // Should NOT be selected — low scores
      makeRecord({
        skillId: "owner/low-score",
        tier: "CORE",
        scores: makeScores({ noviceCLI: 3, lowModelBoost: 4 }),
      }),
      // Should NOT be selected — security keyword
      makeRecord({
        skillId: "owner/trivy-scan",
        tier: "CORE",
        scores: makeScores({ noviceCLI: 8, lowModelBoost: 9 }),
      }),
    ]

    const { alwaysSkills } = selectAlwaysSkills(records, {
      alwaysMaxCount: 5,
      alwaysMaxTokens: 2000,
    })

    expect(alwaysSkills.length).toBeLessThanOrEqual(5)
    for (const skill of alwaysSkills) {
      expect(skill.scores.noviceCLI).toBeGreaterThanOrEqual(6)
      expect(skill.scores.lowModelBoost).toBeGreaterThanOrEqual(7)
      expect(isSecurityOnlySkill(skill)).toBe(false)
    }
  })

  it("ALWAYS count should not exceed maxCount", () => {
    const records = Array.from({ length: 20 }, (_, i) =>
      makeRecord({
        skillId: `owner/skill-${i}`,
        tier: "CORE",
        scores: makeScores({ noviceCLI: 8, lowModelBoost: 9 }),
      }),
    )

    const { alwaysSkills } = selectAlwaysSkills(records, {
      alwaysMaxCount: 5,
      alwaysMaxTokens: 10000,
    })

    expect(alwaysSkills.length).toBeLessThanOrEqual(5)
  })

  it("ALWAYS total tokens should not exceed maxTokens", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({
        skillId: `owner/skill-${i}`,
        tier: "CORE",
        description: "A".repeat(100), // 25 tokens each
        scores: makeScores({ noviceCLI: 8, lowModelBoost: 9 }),
      }),
    )

    const { alwaysSkills } = selectAlwaysSkills(records, {
      alwaysMaxCount: 10,
      alwaysMaxTokens: 100,
    })

    const totalTokens = alwaysSkills.reduce(
      (sum, s) => sum + Math.ceil(s.description.length / 4),
      0,
    )
    expect(totalTokens).toBeLessThanOrEqual(100)
  })
})
