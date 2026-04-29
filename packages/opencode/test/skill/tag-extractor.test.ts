import { describe, it, expect } from "bun:test"
import fc from "fast-check"
import {
  extractTags,
  tokenize,
  normalizeTag,
  computeTermFrequencies,
  STOPWORDS,
  extractSectionTags,
  extractSkillIdTags,
} from "../../src/skill/tag-extractor"
import type { AssessmentRecord } from "../../src/skill/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<AssessmentRecord> = {}): AssessmentRecord {
  return {
    skillId: "owner/skill-name",
    tier: "CORE",
    include: true,
    confidence: 90,
    scores: {
      noviceCLI: 7,
      lowModelBoost: 8,
      tokenEfficiency: 7,
      autonomySafety: 8,
      securityHygiene: 5,
      staleDependencyDefense: 6,
      nonTriviality: 7,
      lowFriction: 6,
    },
    reason: "Test skill",
    riskNotes: "",
    tokenNotes: "",
    owner: "owner",
    description: "A code-review workflow for git branches",
    section: "Community Skills > Development and Testing",
    sourceUrl: "https://example.com/skill",
    sourceKind: "test",
    priorScore: 50,
    priorDecision: "INCLUDE",
    modelUsed: "test",
    assessedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Property 4: Tag extraction invariants
// ---------------------------------------------------------------------------

describe("Tag Extractor — Property 4: Tag extraction invariants", () => {
  it("all tags should be lowercase", () => {
    fc.assert(
      fc.property(
        fc.record({
          skillId: fc.string({ minLength: 1, maxLength: 100 }),
          description: fc.string({ minLength: 0, maxLength: 500 }),
          section: fc.string({ minLength: 0, maxLength: 200 }),
        }),
        ({ skillId, description, section }) => {
          const record = makeRecord({ skillId, description, section })
          const tags = extractTags(record)
          for (const tag of tags) {
            expect(tag).toEqual(tag.toLowerCase())
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it("should have no duplicate tags", () => {
    fc.assert(
      fc.property(
        fc.record({
          skillId: fc.string({ minLength: 1, maxLength: 100 }),
          description: fc.string({ minLength: 0, maxLength: 500 }),
          section: fc.string({ minLength: 0, maxLength: 200 }),
        }),
        ({ skillId, description, section }) => {
          const record = makeRecord({ skillId, description, section })
          const tags = extractTags(record)
          expect(new Set(tags).size).toEqual(tags.length)
        },
      ),
      { numRuns: 100 },
    )
  })

  it("should not contain stopwords", () => {
    fc.assert(
      fc.property(
        fc.record({
          skillId: fc.string({ minLength: 1, maxLength: 100 }),
          description: fc.string({ minLength: 0, maxLength: 500 }),
          section: fc.string({ minLength: 0, maxLength: 200 }),
        }),
        ({ skillId, description, section }) => {
          const record = makeRecord({ skillId, description, section })
          const tags = extractTags(record)
          for (const tag of tags) {
            expect(STOPWORDS.has(tag)).toBe(false)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it("should produce between 3 and 15 tags for records with meaningful content", () => {
    const word = fc.string({ minLength: 3, maxLength: 20 }).filter(
      (s) => /^[a-zA-Z0-9\-]+$/.test(s),
    )
    const sentence = fc.array(word, { minLength: 3, maxLength: 20 }).map((ws) => ws.join(" "))
    fc.assert(
      fc.property(
        fc.record({
          skillId: fc.tuple(word, word).map(([a, b]) => `${a}/${b}`),
          description: sentence,
          section: sentence,
        }),
        ({ skillId, description, section }) => {
          const record = makeRecord({ skillId, description, section })
          const tags = extractTags(record)
          expect(tags.length).toBeGreaterThanOrEqual(3)
          expect(tags.length).toBeLessThanOrEqual(15)
        },
      ),
      { numRuns: 100 },
    )
  })

  it("should include category tags from non-empty section", () => {
    const record = makeRecord({ section: "Community Skills > Development and Testing" })
    const tags = extractTags(record)
    // Should have at least one tag derived from section
    const sectionTags = extractSectionTags(record.section)
    expect(tags.some((t) => sectionTags.includes(t))).toBe(true)
  })

  it("should preserve hyphen-connected compounds", () => {
    const record = makeRecord({
      description: "A code-review workflow for ci-cd pipelines",
      skillId: "owner/code-review-ci-cd",
    })
    const tags = extractTags(record)
    // "code-review" should be preserved as a compound
    expect(tags.some((t) => t.includes("-"))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("Tag Extractor — Unit tests", () => {
  it("should handle empty description", () => {
    const record = makeRecord({ description: "", skillId: "owner/my-skill-name" })
    const tags = extractTags(record)
    expect(tags.length).toBeGreaterThanOrEqual(3)
  })

  it("should handle description with only stopwords", () => {
    const record = makeRecord({
      description: "the a an is are for with and or to in of by on at this that",
      skillId: "owner/my-skill-name",
    })
    const tags = extractTags(record)
    expect(tags.length).toBeGreaterThanOrEqual(3)
    for (const tag of tags) {
      expect(STOPWORDS.has(tag)).toBe(false)
    }
  })

  it("should handle empty section", () => {
    const record = makeRecord({ section: "", description: "A useful testing skill" })
    const tags = extractTags(record)
    expect(tags.length).toBeGreaterThanOrEqual(3)
  })

  it("should produce correct term frequencies", () => {
    const record = makeRecord({
      description: "git git git workflow workflow",
      skillId: "owner/git-workflow",
      section: "Development",
    })
    const tags = extractTags(record)
    const tfs = computeTermFrequencies(tags, record)
    // "git" appears multiple times in description
    expect(tfs["git"]).toBeGreaterThanOrEqual(3)
    // All tags should have at least tf=1
    for (const tag of tags) {
      expect(tfs[tag]).toBeGreaterThanOrEqual(1)
    }
  })

  it("tokenize should preserve hyphenated compounds", () => {
    expect(tokenize("code-review workflow")).toEqual(["code-review", "workflow"])
    expect(tokenize("git worktree branch")).toEqual(["git", "worktree", "branch"])
  })

  it("normalizeTag should lowercase and remove special chars except hyphens and slashes", () => {
    expect(normalizeTag("Code-Review!")).toEqual("code-review")
    expect(normalizeTag("CI/CD")).toEqual("ci/cd")
    expect(normalizeTag("Hello, World!")).toEqual("helloworld")
    expect(normalizeTag("test-skill")).toEqual("test-skill")
  })
})
