/**
 * BM25 Search Engine for the Skill Search Engine.
 *
 * Pure functions implementing:
 * - BM25 score computation
 * - IDF calculation
 * - Query tokenization
 * - Inverted index building
 * - Search execution
 * - JSON serialization/deserialization (round-trip)
 *
 * @module skill/search
 */

import type {
  InvertedIndex,
  InvertedIndexData,
  SearchOptions,
  SearchResult,
  SkillDescriptor,
  SkillRegistryEntry,
  Tier,
} from "./types"
import { STOPWORDS, normalizeTag, tokenize } from "./tag-extractor"
import type { AssessmentRecord } from "./types"
import { computeTermFrequencies, extractTags } from "./tag-extractor"

// ---------------------------------------------------------------------------
// BM25 score computation
// ---------------------------------------------------------------------------

/**
 * Compute BM25 score for a single query term in a document.
 *
 * Formula: IDF(qi) × (f(qi,D) × (k1+1)) / (f(qi,D) + k1 × (1 - b + b × |D|/avgdl))
 *
 * @param tf     - Term frequency of the query term in the document
 * @param idf    - Inverse document frequency of the query term
 * @param docLength - Document length (number of tags)
 * @param avgdl  - Average document length across all documents
 * @param k1     - TF saturation parameter (default: 1.2)
 * @param b      - Length normalization parameter (default: 0.75)
 */
export function bm25Score(
  tf: number,
  idf: number,
  docLength: number,
  avgdl: number,
  k1: number,
  b: number,
): number {
  if (tf === 0) return 0
  const numerator = tf * (k1 + 1)
  const denominator = tf + k1 * (1 - b + b * (docLength / avgdl))
  return idf * (numerator / denominator)
}

// ---------------------------------------------------------------------------
// IDF computation
// ---------------------------------------------------------------------------

/**
 * Compute Inverse Document Frequency.
 *
 * Formula: log((N - df + 0.5) / (df + 0.5) + 1)
 *
 * @param df        - Document frequency (number of docs containing the term)
 * @param totalDocs - Total number of documents
 */
export function computeIDF(df: number, totalDocs: number): number {
  return Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1)
}

// ---------------------------------------------------------------------------
// Query tokenization
// ---------------------------------------------------------------------------

/**
 * Tokenize a search query for BM25 search.
 *
 * - Splits on whitespace
 * - Preserves hyphen-connected compounds
 * - Removes stopwords
 * - Lowercases all tokens
 * - Removes empty tokens
 */
export function tokenizeQuery(query: string): string[] {
  if (!query) return []

  const tokens = tokenize(query)
  const result: string[] = []

  for (const token of tokens) {
    const normalized = normalizeTag(token)
    if (normalized.length > 0 && !STOPWORDS.has(normalized)) {
      result.push(normalized)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Inverted index building
// ---------------------------------------------------------------------------

/**
 * Build an inverted index from skill registry entries.
 *
 * For each skill's tags, creates postings with term frequencies computed
 * from the original text (description + section + skillId), not just
 * tag presence.
 *
 * Also pre-computes IDF values and metadata (avgdl, totalDocs).
 */
export function buildInvertedIndex(
  registry: SkillRegistryEntry[],
  records?: AssessmentRecord[],
  k1: number = 1.2,
  b: number = 0.75,
): InvertedIndex {
  const postings: Record<string, Array<{ skillId: string; tf: number }>> = {}
  const docLengths: Record<string, number> = {}
  const tagDocCounts: Record<string, number> = {}

  // Build a map from skillId to AssessmentRecord for TF computation
  const recordMap = new Map<string, AssessmentRecord>()
  if (records) {
    for (const r of records) {
      recordMap.set(r.skillId, r)
    }
  }

  let totalTagCount = 0

  for (const entry of registry) {
    const tagCount = entry.tags.length
    docLengths[entry.skillId] = tagCount
    totalTagCount += tagCount

    // Compute term frequencies
    let tfs: Record<string, number>
    const record = recordMap.get(entry.skillId)
    if (record) {
      tfs = computeTermFrequencies(entry.tags, record)
    } else {
      // Fallback: each tag has tf=1
      tfs = {}
      for (const tag of entry.tags) {
        tfs[tag] = 1
      }
    }

    for (const tag of entry.tags) {
      if (!postings[tag]) {
        postings[tag] = []
      }
      postings[tag].push({
        skillId: entry.skillId,
        tf: tfs[tag] || 1,
      })

      tagDocCounts[tag] = (tagDocCounts[tag] || 0) + 1
    }
  }

  const totalDocs = registry.length
  const avgdl = totalDocs > 0 ? totalTagCount / totalDocs : 0

  // Pre-compute IDF for each tag
  const idf: Record<string, number> = {}
  for (const tag of Object.keys(tagDocCounts)) {
    idf[tag] = computeIDF(tagDocCounts[tag], totalDocs)
  }

  return {
    postings,
    idf,
    meta: { totalDocs, avgdl, k1, b },
    docLengths,
  }
}

// ---------------------------------------------------------------------------
// Search execution
// ---------------------------------------------------------------------------

/**
 * Execute a BM25 search query against the inverted index.
 *
 * Steps:
 * 1. Tokenize query
 * 2. Look up postings for each query token
 * 3. Compute BM25 score for each matching document
 * 4. Apply CORE tier boost
 * 5. Sort by score descending
 * 6. Apply filters (tier, category)
 * 7. Return top N results
 */
export function search(
  query: string,
  index: InvertedIndex,
  registryMap: Map<string, SkillRegistryEntry>,
  options?: SearchOptions,
): SearchResult[] {
  const queryTokens = tokenizeQuery(query)
  if (queryTokens.length === 0) return []

  const limit = options?.limit ?? 10
  const coreBoost = options?.coreBoost ?? 1.5
  const tierFilter = options?.tierFilter
  const categoryFilter = options?.categoryFilter

  // Accumulate scores per skill
  const scores = new Map<string, number>()

  for (const token of queryTokens) {
    const postingsList = index.postings[token]
    if (!postingsList) continue

    const tokenIDF = index.idf[token] ?? 0

    for (const posting of postingsList) {
      const entry = registryMap.get(posting.skillId)
      if (!entry) continue

      // Apply filters before scoring
      if (tierFilter && !tierFilter.includes(entry.tier)) continue
      if (categoryFilter && !entry.section.toLowerCase().includes(categoryFilter.toLowerCase())) continue

      const docLength = index.docLengths[posting.skillId] ?? 1
      const score = bm25Score(
        posting.tf,
        tokenIDF,
        docLength,
        index.meta.avgdl || 1,
        index.meta.k1,
        index.meta.b,
      )

      const prev = scores.get(posting.skillId) ?? 0
      scores.set(posting.skillId, prev + score)
    }
  }

  // Apply CORE boost and build results
  const results: SearchResult[] = []
  for (const [skillId, rawScore] of scores) {
    const entry = registryMap.get(skillId)
    if (!entry) continue

    let finalScore = rawScore
    if (entry.tier === "CORE" || entry.tier === "ALWAYS") {
      finalScore = rawScore * coreBoost
    }

    const descriptor: SkillDescriptor = {
      name: entry.name,
      description: entry.description,
      tags: entry.tags,
      tier: entry.tier,
      score: finalScore,
    }

    results.push({ skillId, score: finalScore, descriptor })
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  return results.slice(0, limit)
}

// ---------------------------------------------------------------------------
// Serialization / Deserialization (round-trip)
// ---------------------------------------------------------------------------

export function serializeIndex(index: InvertedIndex): string {
  return JSON.stringify(index, null, 2)
}

export function deserializeIndex(json: string): InvertedIndex {
  return JSON.parse(json) as InvertedIndex
}

/**
 * Build a SkillRegistryEntry from an AssessmentRecord.
 */
export function entryFromRecord(record: AssessmentRecord, tier?: Tier): SkillRegistryEntry {
  const tags = extractTags(record)
  const name = record.skillId.includes("/")
    ? record.skillId.split("/").slice(1).join("/")
    : record.skillId

  return {
    skillId: record.skillId,
    name,
    description: record.description,
    tier: tier ?? (record.tier as unknown as Tier),
    tags,
    section: record.section,
    location: record.sourceUrl,
  }
}
