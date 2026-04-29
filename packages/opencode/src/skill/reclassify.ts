/**
 * Reclassify Engine for the Skill Search Engine.
 *
 * Pure functions that:
 * 1. Reclassify CORE security skills to HIGH tier
 * 2. Select ALWAYS-tier skills from CORE candidates
 *
 * @module skill/reclassify
 */

import type { AssessmentRecord, AuditTier, ReclassifyConfig, BuildConfig, Tier } from "./types"

// ---------------------------------------------------------------------------
// Default reclassify config
// ---------------------------------------------------------------------------

export const DEFAULT_RECLASSIFY_CONFIG: ReclassifyConfig = {
  securityKeywords: [
    "trivy", "sast", "dast", "pentest", "vulnerability",
    "incident", "forensic", "threat-model", "devsecops", "sbom", "kubesec",
  ],
  alwaysCriteria: {
    minNoviceCLI: 6,
    minLowModelBoost: 7,
    excludeSections: [
      "Cybersecurity",
      "Security Skills",
      "Security",
    ],
  },
}

/**
 * Explicit allowlist of skill IDs that should be ALWAYS tier.
 * These are curated for universal applicability — they improve model performance,
 * accuracy, work attitude, and result consistency across ALL coding tasks.
 *
 * Selection criteria:
 * - Applicable to every coding session regardless of language/framework
 * - Improves debugging methodology, safety, or workflow quality
 * - Not domain-specific (not security-only, not platform-specific)
 */
export const ALWAYS_SKILL_ALLOWLIST = new Set([
  "garrytan/investigate",       // Systematic root-cause debugging methodology
  "garrytan/careful",           // Safety guardrails before destructive commands
  "github.com/executing-plans", // Strategic plan execution
  "callstackincubator/github",  // GitHub workflow patterns (PR, code review, branching)
  "openai/security-best-practices", // Language-specific security vulnerability review
])

/** Sections that indicate vendor/platform-specific skills (not general coding workflows) */
const VENDOR_SECTIONS = [
  "Skills by",  // "Skills by Netlify Team", "Skills by Trail of Bits Team", etc.
]

// ---------------------------------------------------------------------------
// Security skill detection
// ---------------------------------------------------------------------------

/**
 * Check if a skill is a security-only skill based on:
 * 1. skillId containing security keywords
 * 2. section containing security-related section names
 * 3. securityHygiene score being dominant over other scores
 */
export function isSecurityOnlySkill(
  record: AssessmentRecord,
  config: ReclassifyConfig = DEFAULT_RECLASSIFY_CONFIG,
): boolean {
  const skillIdLower = record.skillId.toLowerCase()

  // Check skillId for security keywords
  for (const keyword of config.securityKeywords) {
    if (skillIdLower.includes(keyword)) {
      return true
    }
  }

  // Check section for excluded sections
  const sectionLower = record.section.toLowerCase()
  for (const excluded of config.alwaysCriteria.excludeSections) {
    if (sectionLower.includes(excluded.toLowerCase())) {
      return true
    }
  }

  // Check if securityHygiene score is dominant (≥2 points higher than average of other scores)
  const scores = record.scores
  const otherAvg =
    (scores.noviceCLI +
      scores.lowModelBoost +
      scores.tokenEfficiency +
      scores.autonomySafety +
      scores.staleDependencyDefense +
      scores.nonTriviality +
      scores.lowFriction) / 7

  if (scores.securityHygiene >= otherAvg + 2) {
    return true
  }

  return false
}

// ---------------------------------------------------------------------------
// Reclassify tiers
// ---------------------------------------------------------------------------

export interface ReclassifyLog {
  skillId: string
  from: string
  to: string
  reason: string
}

/**
 * Reclassify CORE security skills to HIGH tier.
 *
 * Rules:
 * - CORE skills that are security-only → HIGH
 * - Non-security CORE skills remain CORE
 * - HIGH and LONGTAIL skills are unchanged
 * - DROP skills are unchanged (filtered out later)
 */
export function reclassifyTiers(
  records: AssessmentRecord[],
  config: ReclassifyConfig = DEFAULT_RECLASSIFY_CONFIG,
): { records: AssessmentRecord[]; logs: ReclassifyLog[] } {
  const logs: ReclassifyLog[] = []

  const reclassified = records.map((record) => {
    if (record.tier !== "CORE") return record

    if (isSecurityOnlySkill(record, config)) {
      logs.push({
        skillId: record.skillId,
        from: "CORE",
        to: "HIGH",
        reason: "Security-only skill reclassified from CORE to HIGH",
      })
      return { ...record, tier: "HIGH" as AuditTier }
    }

    return record
  })

  return { records: reclassified, logs }
}

// ---------------------------------------------------------------------------
// ALWAYS selection
// ---------------------------------------------------------------------------

/**
 * Check if a CORE skill qualifies for ALWAYS tier.
 *
 * Criteria:
 * - noviceCLI score ≥ minNoviceCLI (default: 6)
 * - lowModelBoost score ≥ minLowModelBoost (default: 7)
 * - Not a security-only skill
 * - Not a vendor/platform-specific skill
 * - Applicable to general coding workflows
 */
function qualifiesForAlways(
  record: AssessmentRecord,
  config: ReclassifyConfig = DEFAULT_RECLASSIFY_CONFIG,
): boolean {
  if (record.tier !== "CORE") return false

  const criteria = config.alwaysCriteria
  if (record.scores.noviceCLI < criteria.minNoviceCLI) return false
  if (record.scores.lowModelBoost < criteria.minLowModelBoost) return false
  if (isSecurityOnlySkill(record, config)) return false

  // Exclude vendor/platform-specific sections (not general coding workflows)
  const sectionLower = record.section.toLowerCase()
  for (const vendorPattern of VENDOR_SECTIONS) {
    if (sectionLower.includes(vendorPattern.toLowerCase())) return false
  }

  return true
}

/**
 * Estimate token count for a skill's description.
 * Uses the 1 token ≈ 4 characters heuristic.
 */
function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

/**
 * Select ALWAYS-tier skills using an explicit allowlist.
 *
 * The allowlist (`ALWAYS_SKILL_ALLOWLIST`) contains curated skill IDs that
 * are universally applicable across all coding sessions. These are selected
 * based on:
 * - Improves model performance, accuracy, or result consistency
 * - Applicable to every coding session regardless of language/framework
 * - Not domain-specific (not security-only, not platform-specific)
 *
 * Falls back to score-based automatic selection if the allowlist is empty.
 *
 * Constraints:
 * - Maximum `alwaysMaxCount` skills (default: 5)
 * - Total estimated tokens ≤ `alwaysMaxTokens` (default: 2000)
 */
export function selectAlwaysSkills(
  records: AssessmentRecord[],
  buildConfig: Pick<BuildConfig, "alwaysMaxCount" | "alwaysMaxTokens">,
  reclassifyConfig: ReclassifyConfig = DEFAULT_RECLASSIFY_CONFIG,
): { alwaysSkills: AssessmentRecord[]; logs: ReclassifyLog[] } {
  const logs: ReclassifyLog[] = []

  // Use allowlist if available
  const recordMap = new Map(records.map((r) => [r.skillId, r]))
  let candidates: AssessmentRecord[]

  if (ALWAYS_SKILL_ALLOWLIST.size > 0) {
    // Explicit allowlist mode: select only allowlisted skills
    candidates = Array.from(ALWAYS_SKILL_ALLOWLIST)
      .map((id) => recordMap.get(id))
      .filter((r): r is AssessmentRecord => r !== undefined)
  } else {
    // Fallback: automatic score-based selection
    candidates = records
      .filter((r) => qualifiesForAlways(r, reclassifyConfig))
      .sort((a, b) => {
        const scoreA = a.scores.noviceCLI + a.scores.lowModelBoost
        const scoreB = b.scores.noviceCLI + b.scores.lowModelBoost
        return scoreB - scoreA
      })
  }

  const selected: AssessmentRecord[] = []
  let totalTokens = 0

  for (const candidate of candidates) {
    if (selected.length >= buildConfig.alwaysMaxCount) break

    const tokens = estimateTokens(candidate.description)
    if (totalTokens + tokens > buildConfig.alwaysMaxTokens) {
      if (selected.length > 0) continue
    }

    selected.push(candidate)
    totalTokens += tokens

    logs.push({
      skillId: candidate.skillId,
      from: "CORE",
      to: "ALWAYS",
      reason: `Selected as ALWAYS (noviceCLI=${candidate.scores.noviceCLI}, lowModelBoost=${candidate.scores.lowModelBoost}, tokens=${tokens})`,
    })
  }

  return { alwaysSkills: selected, logs }
}

/**
 * Apply tier reassignment to records based on ALWAYS selection.
 * Converts selected ALWAYS skills' tier from CORE to ALWAYS.
 */
export function applyAlwaysTier(
  records: AssessmentRecord[],
  alwaysSkills: AssessmentRecord[],
): AssessmentRecord[] {
  const alwaysIds = new Set(alwaysSkills.map((s) => s.skillId))

  return records.map((record) => {
    if (alwaysIds.has(record.skillId)) {
      return { ...record, tier: "ALWAYS" as unknown as AuditTier }
    }
    return record
  })
}
