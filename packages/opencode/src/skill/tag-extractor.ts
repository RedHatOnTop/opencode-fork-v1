/**
 * Tag Extractor for the Skill Search Engine.
 *
 * Pure functions that extract search tags from skill metadata
 * (description, section, skillId). Used by both the build-time pipeline
 * and the runtime registry (for local skill integration).
 *
 * @module skill/tag-extractor
 */

import type { AssessmentRecord } from "./types"

// ---------------------------------------------------------------------------
// Stopwords
// ---------------------------------------------------------------------------

export const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "for", "with", "and", "or",
  "to", "in", "of", "by", "on", "at", "this", "that",
])

// ---------------------------------------------------------------------------
// Tokenize — preserve hyphenated compounds
// ---------------------------------------------------------------------------

/**
 * Tokenize text into individual tokens, preserving hyphen-connected compounds.
 *
 * Examples:
 * - "code-review workflow" → ["code-review", "workflow"]
 * - "CI/CD pipeline"       → ["ci/cd", "pipeline"]
 * - "git worktree branch"  → ["git", "worktree", "branch"]
 */
export function tokenize(text: string): string[] {
  if (!text) return []
  // Split on whitespace, keeping hyphen-connected and slash-connected tokens intact
  return text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

// ---------------------------------------------------------------------------
// Normalize tag
// ---------------------------------------------------------------------------

/**
 * Normalize a tag: lowercase, remove special characters except hyphens and slashes.
 */
export function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9\-\/]/g, "")
    .trim()
}

// ---------------------------------------------------------------------------
// Extract tags from an AssessmentRecord
// ---------------------------------------------------------------------------

/**
 * Extract search tags from a skill's metadata.
 *
 * Sources (in priority order):
 * 1. `description` — meaningful words extracted
 * 2. `section` — category-level tags (e.g. "development", "testing", "devops")
 * 3. `skillId` — split on hyphens and slashes for fallback tags
 *
 * Invariants:
 * - All tags are lowercase
 * - No duplicates
 * - No stopwords
 * - Hyphen-connected compounds preserved (e.g. "code-review")
 * - Minimum 3 tags, maximum 15 tags
 * - If fewer than 3 tags from description/section, supplement from skillId
 */
export function extractTags(record: AssessmentRecord): string[] {
  const tags = new Set<string>()

  // 1. Extract from description
  const descTokens = tokenize(record.description)
  for (const token of descTokens) {
    const normalized = normalizeTag(token)
    if (normalized.length > 0 && !STOPWORDS.has(normalized)) {
      tags.add(normalized)
    }
  }

  // 2. Extract category tags from section
  if (record.section) {
    const sectionTags = extractSectionTags(record.section)
    for (const tag of sectionTags) {
      tags.add(tag)
    }
  }

  // 3. Extract from skillId (split on / and -)
  const skillIdParts = extractSkillIdTags(record.skillId)
  for (const tag of skillIdParts) {
    tags.add(tag)
  }

  // Convert to array, enforce limits
  let result = Array.from(tags)

  // If fewer than 3 tags, try harder with skillId parts
  if (result.length < 3) {
    const extraParts = record.skillId
      .split(/[\/\-_]/)
      .map((p) => normalizeTag(p))
      .filter((p) => p.length > 0 && !STOPWORDS.has(p))
    for (const p of extraParts) {
      if (!tags.has(p)) {
        result.push(p)
        tags.add(p)
        if (result.length >= 3) break
      }
    }
  }

  // Cap at 15 tags
  result = result.slice(0, 15)

  return result
}

// ---------------------------------------------------------------------------
// Extract section-level tags
// ---------------------------------------------------------------------------

/**
 * Extract category-level tags from a section string like
 * "Community Skills > Development and Testing (expanded collection)".
 *
 * Returns meaningful lowercase tokens from the section path,
 * excluding stopwords and generic words like "skills", "collection", etc.
 */
export function extractSectionTags(section: string): string[] {
  if (!section) return []

  const GENERIC_WORDS = new Set([
    "skills", "collection", "expanded", "community", "team",
    "by", "the", "and", "of", "for", "with", "from",
    ...STOPWORDS,
  ])

  const tags: string[] = []
  // Split on > and parentheses
  const parts = section.split(/[>()]/)
  for (const part of parts) {
    const words = tokenize(part)
    for (const word of words) {
      const normalized = normalizeTag(word)
      if (normalized.length > 1 && !GENERIC_WORDS.has(normalized)) {
        tags.push(normalized)
      }
    }
  }

  // Deduplicate
  return Array.from(new Set(tags))
}

// ---------------------------------------------------------------------------
// Extract tags from skillId
// ---------------------------------------------------------------------------

/**
 * Extract tags from a skillId like "owner/skill-name".
 *
 * Splits on "/" and "-" to produce individual tokens.
 * The owner part is typically not very useful as a tag, so we focus on
 * the skill name part.
 */
export function extractSkillIdTags(skillId: string): string[] {
  if (!skillId) return []

  const tags: string[] = []

  // Split "owner/skill-name" → ["owner", "skill-name"]
  const parts = skillId.split("/")
  // Focus on the skill name part (last segment)
  const namePart = parts[parts.length - 1] || ""

  // Keep the full hyphenated name as a compound tag
  const normalized = normalizeTag(namePart)
  if (normalized.length > 1 && !STOPWORDS.has(normalized)) {
    tags.push(normalized)
  }

  // Also split into individual parts
  const subParts = namePart.split("-")
  if (subParts.length > 1) {
    for (const sub of subParts) {
      const n = normalizeTag(sub)
      if (n.length > 1 && !STOPWORDS.has(n)) {
        tags.push(n)
      }
    }
  }

  return Array.from(new Set(tags))
}

// ---------------------------------------------------------------------------
// Compute term frequencies from original text
// ---------------------------------------------------------------------------

/**
 * Compute the actual term frequency of each tag in the original text.
 *
 * The TF is based on how many times each tag (or its component words)
 * appears in the concatenated original text (description + section + skillId),
 * NOT just whether the tag exists in the tag list.
 *
 * This ensures BM25's TF saturation works correctly — a tag that appears
 * multiple times in the description should have a higher TF than one that
 * appears only once.
 *
 * @param tags - The extracted tags for the skill
 * @param record - The original assessment record
 * @returns A map from tag to its term frequency (minimum 1, since the tag was extracted)
 */
export function computeTermFrequencies(
  tags: string[],
  record: AssessmentRecord,
): Record<string, number> {
  const originalText = [
    record.description,
    record.section,
    record.skillId,
  ].join(" ").toLowerCase()

  const result: Record<string, number> = {}

  for (const tag of tags) {
    // Count occurrences of the tag in the original text
    let count = 0
    let pos = 0
    const tagLower = tag.toLowerCase()
    while (true) {
      const idx = originalText.indexOf(tagLower, pos)
      if (idx === -1) break
      count++
      pos = idx + 1 // Allow overlapping matches for short tags
    }

    // Minimum 1 because the tag was extracted from this record
    result[tag] = Math.max(count, 1)
  }

  return result
}
