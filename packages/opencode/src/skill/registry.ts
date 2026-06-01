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
  CategoryNode,
  AlwaysSkillsData,
  SkillRegistryData,
  InvertedIndexData,
  CategoryTreeData,
} from "./types"
import type { AgentSkillProfile } from "./agent-skill-profile"
import { isSkillAccessible } from "./agent-skill-profile"
import { extractTags } from "./tag-extractor"
import { search as bm25Search, buildInvertedIndex } from "./search"
import { browse as categoryBrowse, suggestCategories } from "./category"
import { Skill } from "./index"

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
  readonly canLoadSkill: (skillName: string, agentType: string) => Effect.Effect<boolean>
  readonly getAgentProfile: (agentType: string) => Effect.Effect<AgentSkillProfile | undefined>
  readonly getSkillsForAgent: (agentType: string) => Effect.Effect<ReadonlyArray<SkillRegistryEntry>>
  readonly searchForAgent: (agentType: string, query: string, options?: { limit?: number }) => Effect.Effect<import("./types").SearchResult[]>
  readonly systemPromptSectionForAgent: (agentType: string) => Effect.Effect<string>
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

let _agentProfilesData: { profiles: AgentSkillProfile[] } | null = null

/**
 * Load the build-time generated data files.
 * These are imported as JSON — Bun natively supports JSON imports.
 */
async function loadData(): Promise<{
  registry: SkillRegistryData
  index: InvertedIndexData
  tree: CategoryTreeData
  always: AlwaysSkillsData
  agentProfiles: { profiles: AgentSkillProfile[] }
}> {
  if (_registryData && _indexData && _treeData && _alwaysData && _agentProfilesData) {
    return {
      registry: _registryData,
      index: _indexData,
      tree: _treeData,
      always: _alwaysData,
      agentProfiles: _agentProfilesData,
    }
  }

  const { fileURLToPath } = await import("url")
  const dataDir = fileURLToPath(new URL("./data/", import.meta.url))

  try {
    const [registryStr, indexStr, treeStr, alwaysStr, profilesStr] = await Promise.all([
      Bun.file(dataDir + "skill-registry.json").text(),
      Bun.file(dataDir + "inverted-index.json").text(),
      Bun.file(dataDir + "category-tree.json").text(),
      Bun.file(dataDir + "always-skills.json").text(),
      Bun.file(dataDir + "agent-skill-profiles.json").text(),
    ])

    _registryData = JSON.parse(registryStr)
    _indexData = JSON.parse(indexStr)
    _treeData = JSON.parse(treeStr)
    _alwaysData = JSON.parse(alwaysStr)
    _agentProfilesData = JSON.parse(profilesStr)
  } catch {
    // Data files don't exist yet — return empty defaults
    _registryData = { version: 1, generatedAt: new Date().toISOString(), entries: [], stats: { total: 0, byTier: {}, reclassified: [] } }
    _indexData = { version: 1, meta: { totalDocs: 0, avgdl: 0, k1: 1.2, b: 0.75 }, postings: {}, idf: {}, docLengths: {} }
    _treeData = { version: 1, totalSkills: 0, roots: [] }
    _alwaysData = { version: 1, skills: [], totalEstimatedTokens: 0 }
    _agentProfilesData = { profiles: [] }
  }

  return {
    registry: _registryData!,
    index: _indexData!,
    tree: _treeData!,
    always: _alwaysData!,
    agentProfiles: _agentProfilesData!,
  }
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
    roots: data.tree.roots as unknown as CategoryNode[],
    totalSkills: data.tree.totalSkills,
  }

  // Build agent profile map for fast lookup
  const agentProfileMap = new Map<string, AgentSkillProfile>()
  for (const profile of data.agentProfiles.profiles) {
    agentProfileMap.set(profile.agentType, profile)
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
    const skillService = yield* Effect.serviceOption(Skill.Service)

    const sections: string[] = []

    if (always.length > 0) {
      sections.push("<always_skills>")
      for (const skill of always) {
        let fullContent: string | undefined
        if (skillService._tag === "Some") {
          const info = yield* skillService.value.get(skill.skillId).pipe(
            Effect.catch(() => Effect.succeed(undefined)),
          )
          if (info) {
            fullContent = info.content
          }
        }
        if (fullContent) {
          sections.push(`  <skill name="${skill.name}">`)
          sections.push(fullContent.trim())
          sections.push(`  </skill>`)
        } else {
          sections.push(`  <skill name="${skill.name}">`)
          sections.push(`    ${skill.description}`)
          sections.push(`  </skill>`)
        }
      }
      sections.push("</always_skills>")
    }

    sections.push("Additional skills are available on-demand via: search_skills, browse_skills, load_skill.")

    return sections.join("\n")
  })

  // ---------------------------------------------------------------------------
  // Agent-scoped skill access (Task 6)
  // ---------------------------------------------------------------------------

  const canLoadSkill = Effect.fn("SkillRegistry.canLoadSkill")(function* (skillName: string, agentType: string) {
    const profile = agentProfileMap.get(agentType)
    if (!profile) return true

    const entry = yield* get(skillName)
    if (!entry) return false

    return isSkillAccessible(
      { tier: entry.tier, tags: entry.tags, section: entry.section },
      profile,
    )
  })

  const getAgentProfile = Effect.fn("SkillRegistry.getAgentProfile")(function* (agentType: string) {
    return agentProfileMap.get(agentType)
  })

  const getSkillsForAgent = Effect.fn("SkillRegistry.getSkillsForAgent")(function* (agentType: string) {
    const profile = agentProfileMap.get(agentType)
    if (!profile) {
      // If no profile found, return empty (fallback behavior)
      return []
    }

    const map = yield* Ref.get(entriesMap)
    const allEntries = Array.from(map.values())

    // Filter by allowed tiers
    const tierAllowed = allEntries.filter((e) => profile.allowedTiers.includes(e.tier))

    // Filter by category (partial match, case insensitive)
    const categoryAllowed = tierAllowed.filter((e) => {
      const section = e.section.toLowerCase()
      // Check denied categories first (takes precedence)
      const isDenied = profile.deniedCategories.some((dc) =>
        section.includes(dc.toLowerCase())
      )
      if (isDenied) return false

      // Check allowed categories
      return profile.allowedCategories.some((ac) =>
        section.includes(ac.toLowerCase())
      )
    })

    // Filter by tags (must have at least one allowed tag, unless denied)
    const tagAllowed = categoryAllowed.filter((e) => {
      // Check denied tags
      const hasDeniedTag = e.tags.some((t) =>
        profile.deniedTags.some((dt) => t.toLowerCase().includes(dt.toLowerCase()))
      )
      if (hasDeniedTag) return false

      // Check allowed tags (must have at least one)
      return e.tags.some((t) =>
        profile.allowedTags.some((at) => t.toLowerCase().includes(at.toLowerCase()))
      )
    })

    return tagAllowed
  })

  const searchForAgent = Effect.fn("SkillRegistry.searchForAgent")(function* (
    agentType: string,
    query: string,
    options?: { limit?: number },
  ) {
    const profile = agentProfileMap.get(agentType)
    if (!profile) {
      // Fallback to regular search with default options
      const map = yield* Ref.get(entriesMap)
      const registryMap = new Map<string, SkillRegistryEntry>()
      for (const [key, val] of map) {
        registryMap.set(key, val)
      }
      return bm25Search(query, invertedIndex, registryMap, { limit: options?.limit })
    }

    // Get skills accessible to this agent
    const agentSkills = yield* getSkillsForAgent(agentType)
    const allowedSkillIds = new Set(agentSkills.map((s) => s.skillId))

    // Create filtered registry map
    const map = yield* Ref.get(entriesMap)
    const filteredMap = new Map<string, SkillRegistryEntry>()
    for (const [key, val] of map) {
      if (allowedSkillIds.has(key)) {
        filteredMap.set(key, val)
      }
    }

    // Search within filtered skills
    const results = bm25Search(query, invertedIndex, filteredMap, { limit: options?.limit })

    // Apply search boost from agent profile
    return results.map((r) => {
      const entry = filteredMap.get(r.skillId)
      if (!entry) return r

      // Calculate boost multiplier
      let boost = 1.0
      for (const tag of entry.tags) {
        const tagBoost = profile.searchBoost[tag]
        if (tagBoost && tagBoost > boost) {
          boost = tagBoost
        }
      }

      return {
        ...r,
        score: r.score * boost,
      }
    }).sort((a, b) => b.score - a.score) // Re-sort after boost
  })

  const systemPromptSectionForAgent = Effect.fn("SkillRegistry.systemPromptSectionForAgent")(function* (agentType: string) {
    const profile = agentProfileMap.get(agentType)
    if (!profile) {
      return yield* systemPromptSection()
    }

    const skillService = yield* Effect.serviceOption(Skill.Service)
    const globalAlwaysIds = yield* Ref.get(alwaysSet)

    const sections: string[] = []

    const map = yield* Ref.get(entriesMap)
    const agentAlwaysSkills = profile.alwaysSkills
      .filter((id) => !globalAlwaysIds.has(id))
      .map((id) => map.get(id))
      .filter((s): s is SkillRegistryEntry => s !== undefined)

    if (agentAlwaysSkills.length > 0) {
      sections.push(`<always_skills agent="${agentType}">`)
      for (const skill of agentAlwaysSkills) {
        let fullContent: string | undefined
        if (skillService._tag === "Some") {
          const info = yield* skillService.value.get(skill.skillId).pipe(
            Effect.catch(() => Effect.succeed(undefined)),
          )
          if (info) {
            fullContent = info.content
          }
        }
        if (fullContent) {
          sections.push(`  <skill name="${skill.name}">`)
          sections.push(fullContent.trim())
          sections.push(`  </skill>`)
        } else {
          sections.push(`  <skill name="${skill.name}">`)
          sections.push(`    ${skill.description}`)
          sections.push(`  </skill>`)
        }
      }
      sections.push("</always_skills>")
    }

    sections.push(`Additional skills (${profile.allowedTiers.join(", ")} tier) available via: search_skills, browse_skills, load_skill.`)

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
    canLoadSkill,
    getAgentProfile,
    getSkillsForAgent,
    searchForAgent,
    systemPromptSectionForAgent,
  })
})

export const layer = Layer.effect(Service, make)

// Namespace export for convenience
export const SkillRegistry = { Service, layer }
