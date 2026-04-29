/**
 * Shared types and interfaces for the Skill Search Engine.
 *
 * These types are used by both the build-time pipeline (script/build-skill-index.ts)
 * and the runtime services (registry, search, category, budget).
 *
 * @module skill/types
 */

// ---------------------------------------------------------------------------
// Tier
// ---------------------------------------------------------------------------

export const TIER_VALUES = ["ALWAYS", "CORE", "HIGH", "LONGTAIL"] as const
export type Tier = (typeof TIER_VALUES)[number]

/** Original tier values from the audit result (no ALWAYS, has DROP) */
export const AUDIT_TIER_VALUES = ["CORE", "HIGH", "LONGTAIL", "DROP"] as const
export type AuditTier = (typeof AUDIT_TIER_VALUES)[number]

// ---------------------------------------------------------------------------
// Assessment Record (build-time input from audit result JSON)
// ---------------------------------------------------------------------------

export interface AssessmentScores {
  noviceCLI: number
  lowModelBoost: number
  tokenEfficiency: number
  autonomySafety: number
  securityHygiene: number
  staleDependencyDefense: number
  nonTriviality: number
  lowFriction: number
}

export interface AssessmentRecord {
  skillId: string
  tier: AuditTier
  include: boolean
  confidence: number
  scores: AssessmentScores
  reason: string
  riskNotes: string
  tokenNotes: string
  owner: string
  description: string
  section: string
  sourceUrl: string
  sourceKind: string
  priorScore: number
  priorDecision: string
  modelUsed: string
  assessedAt: string
}

// ---------------------------------------------------------------------------
// Skill Registry Entry (build-time output / runtime use)
// ---------------------------------------------------------------------------

export interface SkillRegistryEntry {
  skillId: string
  name: string
  description: string
  tier: Tier
  tags: string[]
  section: string
  location: string
}

// ---------------------------------------------------------------------------
// Skill Descriptor (search results, category tree nodes)
// ---------------------------------------------------------------------------

export interface SkillDescriptor {
  name: string
  description: string
  tags: string[]
  tier: Tier
  score: number
}

// ---------------------------------------------------------------------------
// Inverted Index (BM25)
// ---------------------------------------------------------------------------

export interface PostingEntry {
  skillId: string
  tf: number
}

export interface InvertedIndexMeta {
  totalDocs: number
  avgdl: number
  k1: number
  b: number
}

export interface InvertedIndex {
  postings: Record<string, PostingEntry[]>
  idf: Record<string, number>
  meta: InvertedIndexMeta
  docLengths: Record<string, number>
}

// ---------------------------------------------------------------------------
// Category Tree
// ---------------------------------------------------------------------------

export interface CategoryNode {
  name: string
  skillCount: number
  children: CategoryNode[]
  skills: SkillDescriptor[]
}

export interface CategoryTree {
  roots: CategoryNode[]
  totalSkills: number
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchOptions {
  limit?: number
  tierFilter?: Tier[]
  categoryFilter?: string
  coreBoost?: number
}

export interface SearchResult {
  skillId: string
  score: number
  descriptor: SkillDescriptor
}

// ---------------------------------------------------------------------------
// Build-time config types
// ---------------------------------------------------------------------------

export interface ReclassifyConfig {
  securityKeywords: string[]
  alwaysCriteria: {
    minNoviceCLI: number
    minLowModelBoost: number
    excludeSections: string[]
  }
}

export interface BuildConfig {
  auditResultPath: string
  outputDir: string
  reclassifyConfigPath?: string
  bm25: { k1: number; b: number }
  alwaysMaxCount: number
  alwaysMaxTokens: number
}

// ---------------------------------------------------------------------------
// Build-time output data types (JSON file structures)
// ---------------------------------------------------------------------------

export interface SkillRegistryData {
  version: number
  generatedAt: string
  entries: SkillRegistryEntry[]
  stats: {
    total: number
    byTier: Record<string, number>
    reclassified: Array<{ skillId: string; from: string; to: string; reason: string }>
  }
}

export interface InvertedIndexData {
  version: number
  meta: InvertedIndexMeta
  postings: Record<string, PostingEntry[]>
  idf: Record<string, number>
  docLengths: Record<string, number>
}

export interface CategoryTreeData {
  version: number
  totalSkills: number
  roots: CategoryNodeData[]
}

export interface CategoryNodeData {
  name: string
  skillCount: number
  children: CategoryNodeData[]
  skills: SkillDescriptorData[]
}

export interface SkillDescriptorData {
  name: string
  description: string
  tags: string[]
  tier: string
}

export interface AlwaysSkillsData {
  version: number
  skills: Array<{
    skillId: string
    name: string
    description: string
    tags: string[]
    reason: string
    sourceUrl: string
  }>
  totalEstimatedTokens: number
}

// ---------------------------------------------------------------------------
// Token Budget (runtime state)
// ---------------------------------------------------------------------------

export interface LoadedSkill {
  name: string
  tokenCount: number
  loadedAt: number
}

export interface BudgetStatus {
  used: number
  limit: number
  loaded: LoadedSkill[]
}

// ---------------------------------------------------------------------------
// Tier ordering helper
// ---------------------------------------------------------------------------

const TIER_ORDER: Record<Tier, number> = {
  ALWAYS: 0,
  CORE: 1,
  HIGH: 2,
  LONGTAIL: 3,
}

export function tierOrder(tier: Tier): number {
  return TIER_ORDER[tier]
}

export function compareTier(a: Tier, b: Tier): number {
  return tierOrder(a) - tierOrder(b)
}
