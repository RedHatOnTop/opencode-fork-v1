/**
 * Skill Registry for the Skill Search Engine.
 *
 * Effect Service that provides runtime access to:
 * - Build-time generated skill metadata (from data/ JSON files)
 * - ALWAYS-tier skill identification
 * - Local skill integration (runtime discovery)
 * - System prompt section generation
 *
 * Maintains backward compatibility with the existing Skill.Service interface.
 *
 * @module skill/registry
 */

import { Context, Effect, Layer, Ref } from "effect"
import type {
  SkillRegistryEntry,
  SkillDescriptor,
  Tier,
  InvertedIndex,
  CategoryTree,
  AlwaysSkillsData,
  SkillRegistryData,
  InvertedIndexData,
  CategoryTreeData,
} from "./types"
import { extractTags } from "./tag-extractor"
import { search as bm25Search, buildInvertedIndex } from "./search"
import { browse as categoryBrowse, suggestCategories } from "./category"

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Interface {
  readonly get: (name: string) => Effect.Effect<SkillRegistryEntry | undefined>
  readonly all: () => Effect.Effect<ReadonlyArray<SkillRegistryEntry>>
  readonly byTier: (tier: Tier) => Effect.Effect<ReadonlyArray<SkillRegistryEntry>>
  readonly alwaysSkills: () => Effect.Effect<ReadonlyArray<SkillRegistryEntry>>
  readonly systemPromptSection: () => Effect.Effect<string>
  readonly addLocalSkill: (skill: SkillRegistryEntry) => Effect.Effect<void>
  readonly search: (query: string, options?: { limit?: number; tierFilter?: Tier[]; categoryFilter?: string }) => Effect.Effect<import("./types").SearchResult[]>
  readonly browse: (path?: string[]) => Effect.Effect<import("./category").BrowseResult>
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/SkillRegistry") {}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

let _registryData: SkillRegistryData | null = null
let _indexData: InvertedIndexData | null = null
let _treeData: CategoryTreeData | null = null
let _alwaysData: AlwaysSkillsData | null = null

/**
 * Load the build-time generated data files.
 * These are imported as JSON — Bun natively supports JSON imports.
 */
async function loadData(): Promise<{
  registry: SkillRegistryData
  index: InvertedIndexData
  tree: CategoryTreeData
  always: AlwaysSkillsData
}> {
  if (_registryData && _indexData && _treeData && _alwaysData) {
    return { registry: _registryData, index: _indexData, tree: _treeData, always: _alwaysData }
  }

  const dataDir = new URL("./data/", import.meta.url).pathname

  try {
    const [registryStr, indexStr, treeStr, alwaysStr] = await Promise.all([
      Bun.file(dataDir + "skill-registry.json").text(),
      Bun.file(dataDir + "inverted-index.json").text(),
      Bun.file(dataDir + "category-tree.json").text(),
      Bun.file(dataDir + "always-skills.json").text(),
    ])

    _registryData = JSON.parse(registryStr)
    _indexData = JSON.parse(indexStr)
    _treeData = JSON.parse(treeStr)
    _alwaysData = JSON.parse(alwaysStr)
  } catch {
    // Data files don't exist yet — return empty defaults
    _registryData = { version: 1, generatedAt: new Date().toISOString(), entries: [], stats: { total: 0, byTier: {}, reclassified: [] } }
    _indexData = { version: 1, meta: { totalDocs: 0, avgdl: 0, k1: 1.2, b: 0.75 }, postings: {}, idf: {}, docLengths: {} }
    _treeData = { version: 1, totalSkills: 0, roots: [] }
    _alwaysData = { version: 1, skills: [], totalEstimatedTokens: 0 }
  }

  return { registry: _registryData, index: _indexData, tree: _treeData, always: _alwaysData }
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const make = Effect.gen(function* () {
  const data = yield* Effect.tryPromise(() => loadData())

  // Mutable state for local skill integration
  const entriesMap = yield* Ref.make(new Map<string, SkillRegistryEntry>())
  const alwaysSet = yield* Ref.make(new Set(data.always.skills.map((s) => s.skillId)))

  // Initialize with build-time entries
  for (const entry of data.registry.entries) {
    yield* Ref.update(entriesMap, (m) => {
      const copy = new Map(m)
      copy.set(entry.skillId, entry)
      return copy
    })
  }

  // Build inverted index from loaded data
  const invertedIndex: InvertedIndex = {
    postings: data.index.postings,
    idf: data.index.idf,
    meta: data.index.meta,
    docLengths: data.index.docLengths,
  }

  // Build category tree from loaded data
  const categoryTree: CategoryTree = {
    roots: data.tree.roots,
    totalSkills: data.tree.totalSkills,
  }

  const get = Effect.fn("SkillRegistry.get")(function* (name: string) {
    const map = yield* Ref.get(entriesMap)
    // Try exact match first
    if (map.has(name)) return map.get(name)
    // Try matching by skill name (after the /)
    for (const entry of map.values()) {
      if (entry.name === name) return entry
    }
    return undefined
  })

  const all = Effect.fn("SkillRegistry.all")(function* () {
    const map = yield* Ref.get(entriesMap)
    return Array.from(map.values())
  })

  const byTier = Effect.fn("SkillRegistry.byTier")(function* (tier: Tier) {
    const map = yield* Ref.get(entriesMap)
    return Array.from(map.values()).filter((e) => e.tier === tier)
  })

  const alwaysSkills = Effect.fn("SkillRegistry.alwaysSkills")(function* () {
    const map = yield* Ref.get(entriesMap)
    const ids = yield* Ref.get(alwaysSet)
    return Array.from(map.values()).filter((e) => ids.has(e.skillId))
  })

  const addLocalSkill = Effect.fn("SkillRegistry.addLocalSkill")(function* (skill: SkillRegistryEntry) {
    // Local skills get HIGH tier by default
    const entry: SkillRegistryEntry = {
      ...skill,
      tier: skill.tier || "HIGH",
      tags: skill.tags.length > 0 ? skill.tags : extractTags({
        skillId: skill.skillId,
        tier: "HIGH",
        include: true,
        confidence: 0,
        scores: {
          noviceCLI: 0, lowModelBoost: 0, tokenEfficiency: 0,
          autonomySafety: 0, securityHygiene: 0, staleDependencyDefense: 0,
          nonTriviality: 0, lowFriction: 0,
        },
        reason: "",
        riskNotes: "",
        tokenNotes: "",
        owner: "",
        description: skill.description,
        section: skill.section,
        sourceUrl: skill.location,
        sourceKind: "local",
        priorScore: 0,
        priorDecision: "",
        modelUsed: "",
        assessedAt: "",
      }),
    }

    yield* Ref.update(entriesMap, (m) => {
      const copy = new Map(m)
      copy.set(entry.skillId, entry)
      return copy
    })

    // Dynamically update inverted index (IDF not recalculated — intentional tradeoff)
    for (const tag of entry.tags) {
      if (!invertedIndex.postings[tag]) {
        invertedIndex.postings[tag] = []
      }
      invertedIndex.postings[tag].push({ skillId: entry.skillId, tf: 1 })
      if (!invertedIndex.idf[tag]) {
        invertedIndex.idf[tag] = 0 // Approximate — local skills are few
      }
    }
    invertedIndex.docLengths[entry.skillId] = entry.tags.length
    invertedIndex.meta.totalDocs += 1
  })

  const searchSkills = Effect.fn("SkillRegistry.search")(function* (
    query: string,
    options?: { limit?: number; tierFilter?: Tier[]; categoryFilter?: string },
  ) {
    const map = yield* Ref.get(entriesMap)
    const registryMap = new Map<string, SkillRegistryEntry>()
    for (const [key, val] of map) {
      registryMap.set(key, val)
    }
    return bm25Search(query, invertedIndex, registryMap, options)
  })

  const browseCategories = Effect.fn("SkillRegistry.browse")(function* (path?: string[]) {
    return categoryBrowse(categoryTree, path)
  })

  const systemPromptSection = Effect.fn("SkillRegistry.systemPromptSection")(function* () {
    const always = yield* alwaysSkills()

    const sections: string[] = []

    // ALWAYS skills section
    if (always.length > 0) {
      sections.push("<always_skills>")
      for (const skill of always) {
        sections.push(`  <skill name="${skill.name}">`)
        sections.push(`    ${skill.description}`)
        sections.push(`    Tags: ${skill.tags.join(", ")}`)
        sections.push(`  </skill>`)
      }
      sections.push("</always_skills>")
    }

    // Tool usage guide
    sections.push("")
    sections.push("## Skill Search Tools")
    sections.push("Over 400 curated skills are indexed and available. Use these tools to find and load skills:")
    sections.push("- browse_skills: Explore skills by category hierarchy")
    sections.push("- search_skills: Search skills by keywords (BM25 search)")
    sections.push("- load_skill: Load a specific skill's full content")
    sections.push("")

    // Category overview
    const topCategories = categoryTree.roots
      .map((r) => `  - ${r.name} (${r.skillCount} skills)`)
      .join("\n")

    if (topCategories) {
      sections.push("## Category Overview")
      sections.push(topCategories)
    }

    return sections.join("\n")
  })

  return Service.of({
    get,
    all,
    byTier,
    alwaysSkills,
    systemPromptSection,
    addLocalSkill,
    search: searchSkills,
    browse: browseCategories,
  })
})

export const layer = Layer.effect(Service, make)
