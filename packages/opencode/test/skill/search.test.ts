import { describe, it, expect } from "bun:test"
import fc from "fast-check"
import {
  bm25Score,
  computeIDF,
  tokenizeQuery,
  buildInvertedIndex,
  search,
  serializeIndex,
  deserializeIndex,
} from "../../src/skill/search"
import type { SkillRegistryEntry, AssessmentRecord, InvertedIndex } from "../../src/skill/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<SkillRegistryEntry> = {}): SkillRegistryEntry {
  return {
    skillId: "owner/test-skill",
    name: "test-skill",
    description: "A test skill for unit testing",
    tier: "HIGH",
    tags: ["test", "skill", "unit"],
    section: "Testing",
    location: "https://example.com",
    ...overrides,
  }
}

function makeRecord(overrides: Partial<AssessmentRecord> = {}): AssessmentRecord {
  return {
    skillId: "owner/test-skill",
    tier: "HIGH",
    include: true,
    confidence: 90,
    scores: {
      noviceCLI: 7, lowModelBoost: 8, tokenEfficiency: 7,
      autonomySafety: 8, securityHygiene: 5, staleDependencyDefense: 6,
      nonTriviality: 7, lowFriction: 6,
    },
    reason: "", riskNotes: "", tokenNotes: "",
    owner: "owner",
    description: "A test skill for unit testing",
    section: "Testing",
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
// Property 7: Query tokenization invariants
// ---------------------------------------------------------------------------

describe("BM25 Search — Property 7: Query tokenization invariants", () => {
  it("all tokens should be lowercase", () => {
    fc.assert(
      fc.property(fc.string(), (query) => {
        const tokens = tokenizeQuery(query)
        for (const token of tokens) {
          expect(token).toEqual(token.toLowerCase())
        }
      }),
      { numRuns: 100 },
    )
  })

  it("should not contain stopwords", () => {
    const stopwords = new Set([
      "the", "a", "an", "is", "are", "for", "with", "and", "or",
      "to", "in", "of", "by", "on", "at", "this", "that",
    ])
    fc.assert(
      fc.property(fc.string(), (query) => {
        const tokens = tokenizeQuery(query)
        for (const token of tokens) {
          expect(stopwords.has(token)).toBe(false)
        }
      }),
      { numRuns: 100 },
    )
  })

  it("should not contain empty string tokens", () => {
    fc.assert(
      fc.property(fc.string(), (query) => {
        const tokens = tokenizeQuery(query)
        for (const token of tokens) {
          expect(token.length).toBeGreaterThan(0)
        }
      }),
      { numRuns: 100 },
    )
  })

  it("should preserve hyphen-connected compounds", () => {
    expect(tokenizeQuery("code-review workflow")).toContain("code-review")
    expect(tokenizeQuery("ci-cd pipeline")).toContain("ci-cd")
  })

  it("should return empty array for empty query", () => {
    expect(tokenizeQuery("")).toEqual([])
    expect(tokenizeQuery("the a an is are")).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Property 8: BM25 score computation correctness
// ---------------------------------------------------------------------------

describe("BM25 Search — Property 8: BM25 score computation", () => {
  it("should match the BM25 formula", () => {
    fc.assert(
      fc.property(
        fc.record({
          tf: fc.double({ min: 0, max: 100, noNaN: true }),
          idf: fc.double({ min: -2, max: 10, noNaN: true }),
          docLength: fc.double({ min: 0.1, max: 100, noNaN: true }),
          avgdl: fc.double({ min: 0.1, max: 100, noNaN: true }),
          k1: fc.double({ min: 0.01, max: 10, noNaN: true }),
          b: fc.double({ min: 0, max: 1, noNaN: true }),
        }),
        ({ tf, idf, docLength, avgdl, k1, b }) => {
          const result = bm25Score(tf, idf, docLength, avgdl, k1, b)
          if (tf === 0) {
            expect(result).toBe(0)
          } else {
            const expected = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgdl))))
            expect(result).toBeCloseTo(expected, 10)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it("should return 0 when tf is 0", () => {
    expect(bm25Score(0, 2.5, 10, 15, 1.2, 0.75)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Property 5: Inverted index completeness
// ---------------------------------------------------------------------------

describe("BM25 Search — Property 5: Inverted index completeness", () => {
  it("all tags should exist in postings", () => {
    const entries = [
      makeEntry({ skillId: "a", tags: ["git", "workflow"] }),
      makeEntry({ skillId: "b", tags: ["git", "branch"] }),
      makeEntry({ skillId: "c", tags: ["testing", "unit"] }),
    ]
    const index = buildInvertedIndex(entries)
    for (const entry of entries) {
      for (const tag of entry.tags) {
        expect(index.postings[tag]).toBeDefined()
        expect(index.postings[tag].some((p) => p.skillId === entry.skillId)).toBe(true)
      }
    }
  })

  it("avgdl should match arithmetic mean of tag counts", () => {
    const entries = [
      makeEntry({ skillId: "a", tags: ["a", "b", "c"] }),
      makeEntry({ skillId: "b", tags: ["d", "e"] }),
      makeEntry({ skillId: "c", tags: ["f", "g", "h", "i"] }),
    ]
    const index = buildInvertedIndex(entries)
    const expectedAvgdl = (3 + 2 + 4) / 3
    expect(index.meta.avgdl).toBeCloseTo(expectedAvgdl, 10)
  })

  it("IDF should match the formula", () => {
    const entries = [
      makeEntry({ skillId: "a", tags: ["git", "workflow"] }),
      makeEntry({ skillId: "b", tags: ["git", "branch"] }),
      makeEntry({ skillId: "c", tags: ["testing"] }),
    ]
    const index = buildInvertedIndex(entries)
    const N = 3
    // "git" appears in 2 docs
    const expectedIDF = Math.log((N - 2 + 0.5) / (2 + 0.5) + 1)
    expect(index.idf["git"]).toBeCloseTo(expectedIDF, 10)
  })
})

// ---------------------------------------------------------------------------
// Property 9: Search result ordering and filtering
// ---------------------------------------------------------------------------

describe("BM25 Search — Property 9: Search result ordering and filtering", () => {
  it("results should be sorted by score descending", () => {
    const entries = [
      makeEntry({ skillId: "a", tags: ["git", "workflow", "branch"], tier: "HIGH" }),
      makeEntry({ skillId: "b", tags: ["git", "workflow"], tier: "HIGH" }),
      makeEntry({ skillId: "c", tags: ["testing"], tier: "HIGH" }),
    ]
    const index = buildInvertedIndex(entries)
    const registryMap = new Map(entries.map((e) => [e.skillId, e]))
    const results = search("git workflow", index, registryMap)
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score)
    }
  })

  it("results should not exceed limit", () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      makeEntry({ skillId: `skill-${i}`, tags: ["git", "workflow", `tag-${i}`], tier: "HIGH" }),
    )
    const index = buildInvertedIndex(entries)
    const registryMap = new Map(entries.map((e) => [e.skillId, e]))
    const results = search("git workflow", index, registryMap, { limit: 5 })
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it("CORE tier skills should get boosted score", () => {
    const entries = [
      makeEntry({ skillId: "core-skill", tags: ["git", "workflow"], tier: "CORE" }),
      makeEntry({ skillId: "high-skill", tags: ["git", "workflow"], tier: "HIGH" }),
    ]
    const index = buildInvertedIndex(entries)
    const registryMap = new Map(entries.map((e) => [e.skillId, e]))
    const results = search("git workflow", index, registryMap, { coreBoost: 1.5 })
    const coreResult = results.find((r) => r.skillId === "core-skill")
    const highResult = results.find((r) => r.skillId === "high-skill")
    // CORE should have higher score due to boost
    expect(coreResult!.score).toBeGreaterThan(highResult!.score)
  })

  it("tierFilter should filter results", () => {
    const entries = [
      makeEntry({ skillId: "a", tags: ["git"], tier: "CORE" }),
      makeEntry({ skillId: "b", tags: ["git"], tier: "HIGH" }),
      makeEntry({ skillId: "c", tags: ["git"], tier: "LONGTAIL" }),
    ]
    const index = buildInvertedIndex(entries)
    const registryMap = new Map(entries.map((e) => [e.skillId, e]))
    const results = search("git", index, registryMap, { tierFilter: ["HIGH"] })
    expect(results.every((r) => r.descriptor.tier === "HIGH")).toBe(true)
  })

  it("should return empty results for empty query", () => {
    const entries = [makeEntry({ tags: ["git"] })]
    const index = buildInvertedIndex(entries)
    const registryMap = new Map(entries.map((e) => [e.skillId, e]))
    const results = search("", index, registryMap)
    expect(results).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Property 13: JSON round-trip
// ---------------------------------------------------------------------------

describe("BM25 Search — Property 13: JSON round-trip", () => {
  it("inverted index should survive JSON round-trip", () => {
    const entries = [
      makeEntry({ skillId: "a", tags: ["git", "workflow"] }),
      makeEntry({ skillId: "b", tags: ["testing", "unit"] }),
    ]
    const index = buildInvertedIndex(entries)
    const json = serializeIndex(index)
    const restored = deserializeIndex(json)
    expect(restored).toEqual(index)
  })
})
