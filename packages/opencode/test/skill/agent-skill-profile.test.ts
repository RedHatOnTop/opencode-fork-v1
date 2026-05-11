import { describe, it, expect } from "bun:test"
import {
  AGENT_SKILL_CONFIGS,
  getAgentTypes,
  getAgentProfile,
  getAllAgentProfiles,
  isCategoryAllowed,
  isSkillAllowedByTags,
  isTierAllowed,
  isSkillAccessible,
} from "../../src/skill/agent-skill-profile"
import type { Tier } from "../../src/skill/types"

// ---------------------------------------------------------------------------
// Agent Skill Profile tests
// ---------------------------------------------------------------------------

describe("Agent Skill Profile — Configuration", () => {
  it("should define exactly 5 agent types", () => {
    const types = getAgentTypes()
    expect(types).toHaveLength(5)
    expect(types).toContain("planner")
    expect(types).toContain("code-reviewer")
    expect(types).toContain("security-reviewer")
    expect(types).toContain("build-error-resolver")
    expect(types).toContain("refactor-cleaner")
  })

  it("each agent should have valid ALWAYS skills", () => {
    const profiles = getAllAgentProfiles()
    for (const profile of profiles) {
      expect(profile.alwaysSkills.length).toBeGreaterThanOrEqual(2)
      for (const skillId of profile.alwaysSkills) {
        expect(typeof skillId).toBe("string")
        expect(skillId.length).toBeGreaterThan(0)
      }
    }
  })

  it("each agent should have allowed tiers", () => {
    const profiles = getAllAgentProfiles()
    for (const profile of profiles) {
      expect(profile.allowedTiers.length).toBeGreaterThan(0)
      expect(profile.allowedTiers).toContain("ALWAYS")
      expect(profile.allowedTiers).toContain("CORE")
    }
  })

  it("security-reviewer should have the broadest tier access", () => {
    const secProfile = getAgentProfile("security-reviewer")
    expect(secProfile).toBeDefined()
    expect(secProfile!.allowedTiers).toContain("LONGTAIL")
  })

  it("other agents should not have LONGTAIL access", () => {
    const nonSecAgents = ["planner", "code-reviewer", "build-error-resolver", "refactor-cleaner"]
    for (const agentType of nonSecAgents) {
      const profile = getAgentProfile(agentType)
      expect(profile).toBeDefined()
      expect(profile!.allowedTiers).not.toContain("LONGTAIL")
    }
  })

  it("each agent should have non-empty allowed and denied categories", () => {
    const profiles = getAllAgentProfiles()
    for (const profile of profiles) {
      expect(profile.allowedCategories.length).toBeGreaterThan(0)
      expect(profile.deniedCategories.length).toBeGreaterThan(0)
    }
  })
})

describe("Agent Skill Profile — Category filtering", () => {
  it("should allow Development and Testing for planner", () => {
    const profile = getAgentProfile("planner")!
    expect(isCategoryAllowed("Community Skills > Development and Testing", profile)).toBe(true)
  })

  it("should deny Security Skills for planner", () => {
    const profile = getAgentProfile("planner")!
    expect(isCategoryAllowed("Security Skills by Trail of Bits Team", profile)).toBe(false)
  })

  it("should allow Security categories for security-reviewer", () => {
    const profile = getAgentProfile("security-reviewer")!
    expect(isCategoryAllowed("Security Skills by Trail of Bits Team", profile)).toBe(true)
    expect(isCategoryAllowed("Community Skills > Development and Testing", profile)).toBe(true)
  })

  it("should deny Netlify categories for all agents", () => {
    const profiles = getAllAgentProfiles()
    for (const profile of profiles) {
      expect(isCategoryAllowed("Skills by Netlify Team", profile)).toBe(false)
    }
  })

  it("should deny unknown categories when no allowed pattern matches", () => {
    const profile = getAgentProfile("planner")!
    expect(isCategoryAllowed("Some Random Category", profile)).toBe(false)
  })
})

describe("Agent Skill Profile — Tag filtering", () => {
  it("should allow skills with matching allowed tags", () => {
    const profile = getAgentProfile("planner")!
    expect(isSkillAllowedByTags(["plan", "architecture", "git"], profile)).toBe(true)
  })

  it("should deny skills with only denied tags", () => {
    const profile = getAgentProfile("planner")!
    expect(isSkillAllowedByTags(["vulnerability", "pentest"], profile)).toBe(false)
  })

  it("should deny skills with denied tags even if allowed tags present", () => {
    const profile = getAgentProfile("build-error-resolver")!
    // "documentation" is denied, so even with "debug" it should be denied
    expect(isSkillAllowedByTags(["documentation", "readme"], profile)).toBe(false)
  })
})

describe("Agent Skill Profile — Tier filtering", () => {
  it("should allow ALWAYS and CORE for all agents", () => {
    const profiles = getAllAgentProfiles()
    for (const profile of profiles) {
      expect(isTierAllowed("ALWAYS", profile)).toBe(true)
      expect(isTierAllowed("CORE", profile)).toBe(true)
    }
  })

  it("should deny LONGTAIL for non-security agents", () => {
    const profile = getAgentProfile("planner")!
    expect(isTierAllowed("LONGTAIL", profile)).toBe(false)
  })

  it("should allow LONGTAIL for security-reviewer", () => {
    const profile = getAgentProfile("security-reviewer")!
    expect(isTierAllowed("LONGTAIL", profile)).toBe(true)
  })
})

describe("Agent Skill Profile — Comprehensive accessibility", () => {
  it("security-reviewer should access security skills", () => {
    const profile = getAgentProfile("security-reviewer")!
    const accessible = isSkillAccessible(
      {
        tier: "HIGH",
        tags: ["security", "vulnerability", "scanning", "trivy"],
        section: "Community Skills > Development and Testing",
      },
      profile,
    )
    expect(accessible).toBe(true)
  })

  it("planner should not access security-only skills", () => {
    const profile = getAgentProfile("planner")!
    const accessible = isSkillAccessible(
      {
        tier: "HIGH",
        tags: ["vulnerability", "pentest", "exploit"],
        section: "Security Skills by Trail of Bits Team",
      },
      profile,
    )
    expect(accessible).toBe(false)
  })

  it("build-error-resolver should access CI/CD skills", () => {
    const profile = getAgentProfile("build-error-resolver")!
    const accessible = isSkillAccessible(
      {
        tier: "CORE",
        tags: ["github", "actions", "ci", "debug", "error"],
        section: "Skills by GitHub",
      },
      profile,
    )
    expect(accessible).toBe(true)
  })

  it("refactor-cleaner should not access deployment skills", () => {
    const profile = getAgentProfile("refactor-cleaner")!
    const accessible = isSkillAccessible(
      {
        tier: "CORE",
        tags: ["deploy", "netlify", "vercel"],
        section: "Skills by Netlify Team",
      },
      profile,
    )
    expect(accessible).toBe(false)
  })
})
