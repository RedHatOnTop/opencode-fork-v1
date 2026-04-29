import { describe, it, expect } from "bun:test"
import fc from "fast-check"
import {
  parseSectionPath,
  buildCategoryTree,
  browse,
  suggestCategories,
  serializeTree,
  deserializeTree,
} from "../../src/skill/category"
import type { SkillRegistryEntry, Tier } from "../../src/skill/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<SkillRegistryEntry> = {}): SkillRegistryEntry {
  return {
    skillId: "owner/test-skill",
    name: "test-skill",
    description: "A test skill",
    tier: "HIGH",
    tags: ["test"],
    section: "Community Skills > Development and Testing",
    location: "https://example.com",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Property 6: Category tree structural invariants
// ---------------------------------------------------------------------------

describe("Category Tree — Property 6: Structural invariants", () => {
  it("total skills should match input count", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            skillId: fc.string({ minLength: 1 }).map((s) => `owner/${s}`),
            name: fc.string({ minLength: 1 }),
            description: fc.string({ minLength: 0 }),
            tier: fc.constantFrom("ALWAYS", "CORE", "HIGH", "LONGTAIL") as fc.Arbitrary<Tier>,
            tags: fc.array(fc.string({ minLength: 1 }), { minLength: 3, maxLength: 15 }),
            section: fc.oneof(
              fc.constant(""),
              fc.constant("Community Skills > Development and Testing"),
              fc.constant("Security Skills"),
              fc.string({ minLength: 1, maxLength: 100 }),
            ),
            location: fc.constant("https://example.com"),
          }),
          { minLength: 1, maxLength: 50 },
        ),
        (entries) => {
          const tree = buildCategoryTree(entries as SkillRegistryEntry[])
          // Count total skills in tree
          function countSkills(nodes: typeof tree.roots): number {
            let count = 0
            for (const node of nodes) {
              count += node.skills.length
              count += countSkills(node.children)
            }
            return count
          }
          expect(countSkills(tree.roots)).toEqual(entries.length)
          expect(tree.totalSkills).toEqual(entries.length)
        },
      ),
      { numRuns: 50 },
    )
  })

  it("empty section skills should go to Uncategorized", () => {
    const entries = [
      makeEntry({ skillId: "a", section: "" }),
      makeEntry({ skillId: "b", section: "   " }),
    ]
    const tree = buildCategoryTree(entries)
    const uncategorized = tree.roots.find((n) => n.name === "Uncategorized")
    expect(uncategorized).toBeDefined()
    expect(uncategorized!.skillCount).toBe(2)
  })

  it("each node skillCount should match direct skills + children skillCounts", () => {
    const entries = [
      makeEntry({ skillId: "a", section: "Cat > Sub1" }),
      makeEntry({ skillId: "b", section: "Cat > Sub1" }),
      makeEntry({ skillId: "c", section: "Cat > Sub2" }),
      makeEntry({ skillId: "d", section: "Cat" }),
    ]
    const tree = buildCategoryTree(entries)
    const cat = tree.roots.find((n) => n.name === "Cat")
    expect(cat).toBeDefined()
    expect(cat!.skillCount).toBe(4) // a + b + c + d
  })
})

// ---------------------------------------------------------------------------
// Property 10: Category browse correctness
// ---------------------------------------------------------------------------

describe("Category Tree — Property 10: Browse correctness", () => {
  it("browse without path should return top-level categories", () => {
    const entries = [
      makeEntry({ skillId: "a", section: "Category A" }),
      makeEntry({ skillId: "b", section: "Category B" }),
    ]
    const tree = buildCategoryTree(entries)
    const result = browse(tree)
    expect(result.categories.length).toBe(2)
    expect(result.categories.map((c) => c.name)).toContain("Category A")
    expect(result.categories.map((c) => c.name)).toContain("Category B")
    expect(result.skills).toEqual([])
  })

  it("browse with path should return sub-categories and skills", () => {
    const entries = [
      makeEntry({ skillId: "a", section: "Parent > Child" }),
      makeEntry({ skillId: "b", section: "Parent > Child" }),
      makeEntry({ skillId: "c", section: "Parent > Other" }),
    ]
    const tree = buildCategoryTree(entries)
    const result = browse(tree, ["Parent", "Child"])
    expect(result.skills.length).toBe(2)
    expect(result.categories.length).toBe(0) // No sub-categories under Child
  })

  it("browse with non-existent path should return empty", () => {
    const entries = [makeEntry({ skillId: "a", section: "Category A" })]
    const tree = buildCategoryTree(entries)
    const result = browse(tree, ["NonExistent"])
    expect(result.categories).toEqual([])
    expect(result.skills).toEqual([])
  })

  it("skills should be sorted by tier priority", () => {
    const entries = [
      makeEntry({ skillId: "a", section: "Cat", tier: "LONGTAIL" }),
      makeEntry({ skillId: "b", section: "Cat", tier: "CORE" }),
      makeEntry({ skillId: "c", section: "Cat", tier: "HIGH" }),
      makeEntry({ skillId: "d", section: "Cat", tier: "ALWAYS" }),
    ]
    const tree = buildCategoryTree(entries)
    const result = browse(tree, ["Cat"])
    const tiers = result.skills.map((s) => s.tier)
    const tierOrder: Record<string, number> = { ALWAYS: 0, CORE: 1, HIGH: 2, LONGTAIL: 3 }
    for (let i = 1; i < tiers.length; i++) {
      expect(tierOrder[tiers[i]]).toBeGreaterThanOrEqual(tierOrder[tiers[i - 1]])
    }
  })

  it("each category should have name, skillCount, childCount", () => {
    const entries = [
      makeEntry({ skillId: "a", section: "Parent > Child1" }),
      makeEntry({ skillId: "b", section: "Parent > Child2" }),
    ]
    const tree = buildCategoryTree(entries)
    const result = browse(tree, ["Parent"])
    for (const cat of result.categories) {
      expect(cat).toHaveProperty("name")
      expect(cat).toHaveProperty("skillCount")
      expect(cat).toHaveProperty("childCount")
      expect(typeof cat.name).toBe("string")
      expect(typeof cat.skillCount).toBe("number")
      expect(typeof cat.childCount).toBe("number")
    }
  })
})

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("Category Tree — Unit tests", () => {
  it("parseSectionPath should split on >", () => {
    expect(parseSectionPath("A > B > C")).toEqual(["A", "B", "C"])
    expect(parseSectionPath("Single")).toEqual(["Single"])
    expect(parseSectionPath("")).toEqual([])
    expect(parseSectionPath("  ")).toEqual([])
  })

  it("suggestCategories should return similar names", () => {
    const entries = [
      makeEntry({ skillId: "a", section: "Development and Testing" }),
      makeEntry({ skillId: "b", section: "DevOps" }),
      makeEntry({ skillId: "c", section: "Security" }),
    ]
    const tree = buildCategoryTree(entries)
    const suggestions = suggestCategories(tree, "Developmnt")
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions).toContain("Development and Testing")
  })

  it("should survive JSON round-trip", () => {
    const entries = [
      makeEntry({ skillId: "a", section: "Cat > Sub" }),
      makeEntry({ skillId: "b", section: "Other" }),
    ]
    const tree = buildCategoryTree(entries)
    const json = serializeTree(tree)
    const restored = deserializeTree(json)
    expect(restored.totalSkills).toEqual(tree.totalSkills)
    expect(restored.roots.length).toEqual(tree.roots.length)
  })
})
