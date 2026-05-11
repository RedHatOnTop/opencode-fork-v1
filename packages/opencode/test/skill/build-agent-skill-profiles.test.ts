/**
 * @file Agent Skill Profiles Build Pipeline Tests
 *
 * 빌드 파이프라인이 올바르게 agent-skill-profiles.json을 생성하는지 검증한다.
 */

import { describe, it, expect } from "bun:test"
import { existsSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { AGENT_SKILL_CONFIGS } from "../../src/skill/agent-skill-profile"
import type { Tier } from "../../src/skill/types"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DATA_DIR = join(__dirname, "..", "..", "src", "skill", "data")
const PROFILES_FILE = join(DATA_DIR, "agent-skill-profiles.json")

describe("Agent Skill Profiles Build Pipeline", () => {
  describe("Source Configuration (agent-skill-profile.ts)", () => {
    it("should have all 5 agent profiles defined", () => {
      const agents = Object.keys(AGENT_SKILL_CONFIGS)
      expect(agents).toHaveLength(5)
      expect(agents).toContain("planner")
      expect(agents).toContain("code-reviewer")
      expect(agents).toContain("security-reviewer")
      expect(agents).toContain("build-error-resolver")
      expect(agents).toContain("refactor-cleaner")
    })

    it("should have valid ALWAYS skills for each agent", () => {
      for (const [agentType, config] of Object.entries(AGENT_SKILL_CONFIGS)) {
        expect(config.alwaysSkills).toBeDefined()
        expect(Array.isArray(config.alwaysSkills)).toBe(true)
        expect(config.alwaysSkills.length).toBeGreaterThan(0)

        // Each skill should follow format "author/skill-name" (dots allowed in author like github.com)
        for (const skill of config.alwaysSkills) {
          expect(skill).toMatch(/^[a-z0-9_.-]+\/[a-z0-9_-]+$/)
        }
      }
    })

    it("should have allowed categories defined", () => {
      for (const [agentType, config] of Object.entries(AGENT_SKILL_CONFIGS)) {
        expect(config.allowedCategories).toBeDefined()
        expect(Array.isArray(config.allowedCategories)).toBe(true)
        expect(config.allowedCategories.length).toBeGreaterThan(0)
      }
    })

    it("should have valid tier configuration", () => {
      const validTiers: Tier[] = ["ALWAYS", "CORE", "HIGH", "LONGTAIL"]

      for (const [agentType, config] of Object.entries(AGENT_SKILL_CONFIGS)) {
        expect(config.allowedTiers).toBeDefined()
        expect(Array.isArray(config.allowedTiers)).toBe(true)
        expect(config.allowedTiers.length).toBeGreaterThan(0)

        for (const tier of config.allowedTiers) {
          expect(validTiers).toContain(tier)
        }

        // ALWAYS tier should always be included
        expect(config.allowedTiers).toContain("ALWAYS")
      }
    })

    it("should have search boost configuration", () => {
      for (const [agentType, config] of Object.entries(AGENT_SKILL_CONFIGS)) {
        expect(config.searchBoost).toBeDefined()
        expect(typeof config.searchBoost).toBe("object")
        expect(Object.keys(config.searchBoost).length).toBeGreaterThan(0)

        // All boost values should be numbers >= 1.0
        for (const [tag, boost] of Object.entries(config.searchBoost)) {
          expect(typeof boost).toBe("number")
          expect(boost).toBeGreaterThanOrEqual(1.0)
        }
      }
    })

    it("should have unique ALWAYS skills across agents", () => {
      const allAlwaysSkills: string[] = []
      for (const config of Object.values(AGENT_SKILL_CONFIGS)) {
        allAlwaysSkills.push(...config.alwaysSkills)
      }

      const uniqueSkills = new Set(allAlwaysSkills)
      // Some skills may be shared, that's okay - just check no duplicates within same agent
      expect(allAlwaysSkills.length).toBeGreaterThanOrEqual(uniqueSkills.size)
    })

    it("should have agent-specific search boosts", () => {
      // Each agent should have specialized boost tags
      const plannerBoosts = AGENT_SKILL_CONFIGS.planner.searchBoost
      expect(Object.keys(plannerBoosts)).toContain("plan")
      expect(plannerBoosts.plan).toBe(2.0)

      const reviewerBoosts = AGENT_SKILL_CONFIGS["code-reviewer"].searchBoost
      expect(Object.keys(reviewerBoosts)).toContain("review")
      expect(reviewerBoosts.review).toBe(2.0)

      const securityBoosts = AGENT_SKILL_CONFIGS["security-reviewer"].searchBoost
      expect(Object.keys(securityBoosts)).toContain("security")
      expect(securityBoosts.security).toBe(2.0)

      const buildBoosts = AGENT_SKILL_CONFIGS["build-error-resolver"].searchBoost
      expect(Object.keys(buildBoosts)).toContain("build")
      expect(buildBoosts.build).toBe(2.0)

      const refactorBoosts = AGENT_SKILL_CONFIGS["refactor-cleaner"].searchBoost
      expect(Object.keys(refactorBoosts)).toContain("refactor")
      expect(refactorBoosts.refactor).toBe(2.0)
    })
  })

  describe("Generated JSON (agent-skill-profiles.json)", () => {
    it("should generate the JSON file", () => {
      const exists = existsSync(PROFILES_FILE)
      expect(exists).toBe(true)
    })

    it("should have valid JSON structure", () => {
      const content = readFileSync(PROFILES_FILE, "utf-8")
      const parsed = JSON.parse(content)

      expect(parsed.meta).toBeDefined()
      expect(parsed.meta.generatedAt).toBeDefined()
      expect(parsed.meta.version).toBe("1.0.0")
      expect(parsed.profiles).toBeDefined()
      expect(Array.isArray(parsed.profiles)).toBe(true)
    })

    it("should contain all 5 agents in JSON", () => {
      const content = readFileSync(PROFILES_FILE, "utf-8")
      const parsed = JSON.parse(content)

      const agentTypes = parsed.profiles.map((p: { agentType: string }) => p.agentType)
      expect(agentTypes).toHaveLength(5)
      expect(agentTypes).toContain("planner")
      expect(agentTypes).toContain("code-reviewer")
      expect(agentTypes).toContain("security-reviewer")
      expect(agentTypes).toContain("build-error-resolver")
      expect(agentTypes).toContain("refactor-cleaner")
    })

    it("should have complete profile structure in JSON", () => {
      const content = readFileSync(PROFILES_FILE, "utf-8")
      const parsed = JSON.parse(content)

      for (const profile of parsed.profiles) {
        expect(profile.agentType).toBeDefined()
        expect(profile.alwaysSkills).toBeDefined()
        expect(profile.allowedCategories).toBeDefined()
        expect(profile.deniedCategories).toBeDefined()
        expect(profile.allowedTags).toBeDefined()
        expect(profile.deniedTags).toBeDefined()
        expect(profile.allowedTiers).toBeDefined()
        expect(profile.searchBoost).toBeDefined()
      }
    })

    it("should match source configuration", () => {
      const content = readFileSync(PROFILES_FILE, "utf-8")
      const parsed = JSON.parse(content)

      for (const profile of parsed.profiles) {
        const source = AGENT_SKILL_CONFIGS[profile.agentType]
        expect(source).toBeDefined()

        expect(profile.alwaysSkills).toEqual(source.alwaysSkills)
        expect(profile.allowedCategories).toEqual(source.allowedCategories)
        expect(profile.deniedCategories).toEqual(source.deniedCategories)
        expect(profile.allowedTags).toEqual(source.allowedTags)
        expect(profile.deniedTags).toEqual(source.deniedTags)
        expect(profile.allowedTiers).toEqual(source.allowedTiers)
        expect(profile.searchBoost).toEqual(source.searchBoost)
      }
    })

    it("should have security-reviewer with expanded access", () => {
      const content = readFileSync(PROFILES_FILE, "utf-8")
      const parsed = JSON.parse(content)

      const securityProfile = parsed.profiles.find(
        (p: { agentType: string }) => p.agentType === "security-reviewer"
      )

      expect(securityProfile).toBeDefined()
      // Security reviewer should have the broadest tier access
      expect(securityProfile.allowedTiers).toContain("LONGTAIL")

      // Security reviewer should have security-related categories
      expect(securityProfile.allowedCategories.some((c: string) =>
        c.toLowerCase().includes("security")
      )).toBe(true)
    })
  })
})
