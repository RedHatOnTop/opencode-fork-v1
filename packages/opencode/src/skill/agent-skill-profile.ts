/**
 * Agent-Scoped Skill Trees — 에이전트별 스킬 접근 정책
 *
 * 각 서브에이전트가 접근할 수 있는 스킬 풀, ALWAYS 스킬, 검색 부스트를 정의한다.
 * 빌드 파이프라인이 이 설정을 기반으로 agent-skill-profiles.json을 생성한다.
 *
 * @module skill/agent-skill-profile
 */

import type { Tier } from "./types"

// ---------------------------------------------------------------------------
// Agent Skill Profile 타입
// ---------------------------------------------------------------------------

export interface AgentSkillProfile {
  /** 에이전트 식별자 */
  agentType: string
  /** 해당 에이전트의 ALWAYS 스킬 ID 목록 (글로벌 ALWAYS와 별개로 추가) */
  alwaysSkills: string[]
  /** 접근 허용된 카테고리 패턴 (부분 매칭, 대소문자 무시) */
  allowedCategories: string[]
  /** 접근 거부된 카테고리 패턴 (allowedCategories보다 우선) */
  deniedCategories: string[]
  /** 허용 태그 패턴 (검색 시 이 태그가 포함된 스킬에 추가 부스트) */
  allowedTags: string[]
  /** 거부 태그 패턴 (이 태그만 있는 스킬은 제외) */
  deniedTags: string[]
  /** 접근 허용된 등급 */
  allowedTiers: Tier[]
  /** 태그 → 추가 부스트 계수 (BM25 점수에 곱해짐) */
  searchBoost: Record<string, number>
}

// ---------------------------------------------------------------------------
// 에이전트 스킬 프로파일 설정
// ---------------------------------------------------------------------------

export const AGENT_SKILL_CONFIGS: Record<string, Omit<AgentSkillProfile, "agentType">> = {
  planner: {
    alwaysSkills: [
      "github.com/executing-plans",
      "garrytan/investigate",
    ],
    allowedCategories: [
      "Development and Testing",
      "Skills by GitHub",
      "Community Skills",
    ],
    deniedCategories: [
      "Security Skills",
      "Skills by Netlify",
      "Skills by Trail of Bits",
      "Skills by Voltagent",
      "Skills by Better",
      "Skills by Google",
      "Skills by Microsoft",
      "Skills by WordPress",
      "Skills by Sentry",
    ],
    allowedTags: [
      "plan", "architecture", "design", "workflow", "git", "task",
      "organize", "strategy", "context", "compression", "agent",
      "subagent", "orchestration", "memory",
    ],
    deniedTags: [
      "vulnerability", "pentest", "exploit", "forensic",
      "netlify", "vercel", "deploy",
    ],
    allowedTiers: ["ALWAYS", "CORE", "HIGH"],
    searchBoost: {
      plan: 2.0,
      architecture: 1.5,
      strategy: 1.5,
      git: 1.3,
      workflow: 1.3,
    },
  },

  "code-reviewer": {
    alwaysSkills: [
      "callstackincubator/github",
      "openai/security-best-practices",
    ],
    allowedCategories: [
      "Development and Testing",
      "Skills by GitHub",
      "Community Skills",
    ],
    deniedCategories: [
      "Security Skills by Trail of Bits",
      "Skills by Netlify",
      "Skills by Voltagent",
      "Skills by Better",
      "Skills by Google",
      "Skills by Microsoft",
      "Skills by WordPress",
    ],
    allowedTags: [
      "review", "code", "quality", "pattern", "test", "debug",
      "refactor", "git", "pr", "maintainability", "clean",
      "design", "performance",
    ],
    deniedTags: [
      "vulnerability", "pentest", "exploit", "forensic",
      "netlify", "vercel", "deploy", "infrastructure",
    ],
    allowedTiers: ["ALWAYS", "CORE", "HIGH"],
    searchBoost: {
      review: 2.0,
      code: 1.5,
      quality: 1.5,
      pattern: 1.3,
      test: 1.3,
    },
  },

  "security-reviewer": {
    alwaysSkills: [
      "openai/security-best-practices",
      "garrytan/careful",
    ],
    allowedCategories: [
      // Security reviewer has the broadest access — all security-related categories
      "Security",
      "Security Skills",
      "Cybersecurity",
      "Development and Testing",
      "Community Skills",
    ],
    deniedCategories: [
      "Skills by Netlify",
      "Skills by Voltagent",
      "Skills by Better",
      "Skills by Google",
      "Skills by Microsoft",
      "Skills by WordPress",
      "Skills by Sentry",
    ],
    allowedTags: [
      "security", "vulnerability", "audit", "compliance", "threat",
      "owasp", "pentest", "sast", "dast", "scanning", "encryption",
      "authentication", "authorization", "jwt", "oauth", "iam",
      "secrets", "tls", "ssl", "container", "kubernetes", "terraform",
      "infrastructure", "trivy", "sbom", "devsecops", "forensic",
      "incident", "review", "code", "debug",
    ],
    deniedTags: [
      "netlify", "vercel", "deploy", "documentation", "readme",
      "ui", "component", "shadcn",
    ],
    allowedTiers: ["ALWAYS", "CORE", "HIGH", "LONGTAIL"],
    searchBoost: {
      security: 2.0,
      vulnerability: 1.8,
      audit: 1.5,
      owasp: 1.5,
      threat: 1.5,
      scanning: 1.3,
    },
  },

  "build-error-resolver": {
    alwaysSkills: [
      "garrytan/investigate",
      "garrytan/careful",
    ],
    allowedCategories: [
      "Development and Testing",
      "Skills by GitHub",
      "Community Skills",
    ],
    deniedCategories: [
      "Security Skills by Trail of Bits",
      "Skills by Netlify",
      "Skills by Voltagent",
      "Skills by Better",
      "Skills by Google",
      "Skills by Microsoft",
      "Skills by WordPress",
    ],
    allowedTags: [
      "build", "ci", "cd", "pipeline", "compile", "error", "debug",
      "test", "lint", "typecheck", "deploy", "container", "docker",
      "package", "dependency", "github", "actions", "workflow",
    ],
    deniedTags: [
      "vulnerability", "pentest", "exploit", "forensic",
      "documentation", "readme", "refactor", "clean",
    ],
    allowedTiers: ["ALWAYS", "CORE", "HIGH"],
    searchBoost: {
      build: 2.0,
      error: 1.8,
      debug: 1.5,
      ci: 1.5,
      pipeline: 1.5,
      test: 1.3,
    },
  },

  "refactor-cleaner": {
    alwaysSkills: [
      "callstackincubator/github",
      "garrytan/careful",
    ],
    allowedCategories: [
      "Development and Testing",
      "Skills by GitHub",
      "Community Skills",
    ],
    deniedCategories: [
      "Security Skills by Trail of Bits",
      "Skills by Netlify",
      "Skills by Voltagent",
      "Skills by Better",
      "Skills by Google",
      "Skills by Microsoft",
      "Skills by WordPress",
    ],
    allowedTags: [
      "refactor", "clean", "code", "pattern", "quality", "test",
      "simplify", "optimize", "deduplicate", "maintainability",
      "review", "git",
    ],
    deniedTags: [
      "vulnerability", "pentest", "exploit", "forensic",
      "netlify", "vercel", "deploy", "infrastructure", "build",
      "pipeline", "ci",
    ],
    allowedTiers: ["ALWAYS", "CORE", "HIGH"],
    searchBoost: {
      refactor: 2.0,
      clean: 1.8,
      pattern: 1.5,
      quality: 1.5,
      simplify: 1.3,
    },
  },
}

// ---------------------------------------------------------------------------
// 헬퍼 함수
// ---------------------------------------------------------------------------

/**
 * 에이전트 타입 목록 반환
 */
export function getAgentTypes(): string[] {
  return Object.keys(AGENT_SKILL_CONFIGS)
}

/**
 * 에이전트 프로파일 조회
 */
export function getAgentProfile(agentType: string): AgentSkillProfile | undefined {
  const config = AGENT_SKILL_CONFIGS[agentType]
  if (!config) return undefined
  return { agentType, ...config }
}

/**
 * 모든 에이전트 프로파일 반환
 */
export function getAllAgentProfiles(): AgentSkillProfile[] {
  return Object.entries(AGENT_SKILL_CONFIGS).map(([agentType, config]) => ({
    agentType,
    ...config,
  }))
}

/**
 * 카테고리가 에이전트의 허용 목록에 매칭되는지 확인
 */
export function isCategoryAllowed(
  category: string,
  profile: AgentSkillProfile,
): boolean {
  const categoryLower = category.toLowerCase()

  // 거부 목록 먼저 확인 (우선순위)
  for (const denied of profile.deniedCategories) {
    if (categoryLower.includes(denied.toLowerCase())) {
      return false
    }
  }

  // 허용 목록 확인
  for (const allowed of profile.allowedCategories) {
    if (categoryLower.includes(allowed.toLowerCase())) {
      return true
    }
  }

  // 허용 목록에 매칭되지 않으면 거부
  return false
}

/**
 * 스킬이 에이전트의 태그 필터를 통과하는지 확인
 */
export function isSkillAllowedByTags(
  skillTags: string[],
  profile: AgentSkillProfile,
): boolean {
  // 거부 태그가 모든 스킬 태그와 매칭되면 거부
  const hasDeniedTag = skillTags.some((tag) =>
    profile.deniedTags.some((denied) =>
      tag.toLowerCase().includes(denied.toLowerCase()),
    ),
  )
  if (hasDeniedTag) return false

  // 허용 태그가 하나라도 매칭되면 허용
  if (profile.allowedTags.length === 0) return true
  const hasAllowedTag = skillTags.some((tag) =>
    profile.allowedTags.some((allowed) =>
      tag.toLowerCase().includes(allowed.toLowerCase()),
    ),
  )
  return hasAllowedTag
}

/**
 * 스킬이 에이전트의 등급 필터를 통과하는지 확인
 */
export function isTierAllowed(tier: Tier, profile: AgentSkillProfile): boolean {
  return profile.allowedTiers.includes(tier)
}

/**
 * 스킬이 에이전트의 스킬 풀에 포함되는지 종합 판단
 */
export function isSkillAccessible(
  skill: {
    tier: Tier
    tags: string[]
    section: string,
  },
  profile: AgentSkillProfile,
): boolean {
  // 1. 등급 확인
  if (!isTierAllowed(skill.tier, profile)) return false

  // 2. 카테고리 확인
  if (!isCategoryAllowed(skill.section, profile)) return false

  // 3. 태그 확인
  if (!isSkillAllowedByTags(skill.tags, profile)) return false

  return true
}
