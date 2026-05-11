/**
 * @file SubAgent tests - 5-agent model validation
 */

import { describe, it, expect } from "bun:test"
import { Effect, Option, Exit } from "effect"
import * as SubAgent from "../../src/agent/subagent"

describe("SubAgent Service", () => {
  describe("Agent Definitions", () => {
    it("should have exactly 5 specialized agents + orchestrator", async () => {
      // Count the agent types from the SubAgentType literal
      const agentTypes = [
        "orchestrator",
        "planner",
        "code-reviewer",
        "security-reviewer",
        "build-error-resolver",
        "refactor-cleaner",
      ] as const
      expect(agentTypes).toHaveLength(6)
      
      // Verify each agent can be retrieved via the helper
      const tests = agentTypes.map(async (type) => {
        const program = Effect.gen(function* () {
          const service = yield* SubAgent.Service
          return yield* service.getAgent(type)
        }).pipe(Effect.provide(SubAgent.layer))
        
        const agent = await Effect.runPromise(program)
        expect(agent.type).toBe(type)
      })
      
      await Promise.all(tests)
    })

    it("should have correct agent types", async () => {
      const agentTypes: SubAgent.SubAgentType[] = [
        "orchestrator",
        "planner",
        "code-reviewer",
        "security-reviewer",
        "build-error-resolver",
        "refactor-cleaner",
      ]
      
      const results: string[] = []
      for (const type of agentTypes) {
        const program = Effect.gen(function* () {
          const service = yield* SubAgent.Service
          const agent = yield* service.getAgent(type)
          return agent.type
        }).pipe(Effect.provide(SubAgent.layer))
        
        results.push(await Effect.runPromise(program))
      }
      
      expect(results.sort()).toEqual([
        "build-error-resolver",
        "code-reviewer",
        "orchestrator",
        "planner",
        "refactor-cleaner",
        "security-reviewer",
      ])
    })

    it("should have unique activation keywords", async () => {
      const agentTypes: SubAgent.SubAgentType[] = [
        "orchestrator",
        "planner",
        "code-reviewer",
        "security-reviewer",
        "build-error-resolver",
        "refactor-cleaner",
      ]
      
      const allKeywords: string[] = []
      for (const type of agentTypes) {
        const program = Effect.gen(function* () {
          const service = yield* SubAgent.Service
          const agent = yield* service.getAgent(type)
          return agent.activationKeywords
        }).pipe(Effect.provide(SubAgent.layer))
        
        const keywords = await Effect.runPromise(program)
        allKeywords.push(...keywords)
      }
      
      const uniqueKeywords = new Set(allKeywords)
      expect(uniqueKeywords.size).toBe(allKeywords.length)
    })
  })

  describe("Planner Agent", () => {
    it("should have correct permissions", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        const agent = yield* service.getAgent("planner")
        return agent.permissions
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result.read).toBe("allow")
      expect(result.edit).toBe("deny")
      expect(result.create).toBe("deny")
      expect(result.delete).toBe("deny")
      expect(result.bash).toBe("allow") // Planner has bash for exploration
    })

    it("should have planning-related keywords", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        const agent = yield* service.getAgent("planner")
        return agent.activationKeywords
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result).toContain("plan")
      expect(result).toContain("architecture")
      expect(result).toContain("roadmap")
      expect(result).toContain("design system")
    })
  })

  describe("Code Reviewer Agent", () => {
    it("should have correct permissions", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        const agent = yield* service.getAgent("code-reviewer")
        return agent.permissions
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result.read).toBe("allow")
      expect(result.edit).toBe("ask")
      expect(result.create).toBe("ask")
      expect(result.delete).toBe("deny")
      expect(result.bash).toBe("deny") // No bash for security
    })

    it("should have code review keywords", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        const agent = yield* service.getAgent("code-reviewer")
        return agent.activationKeywords
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result).toContain("code review")
      expect(result).toContain("quality check")
      expect(result).toContain("design pattern")
    })
  })

  describe("Security Reviewer Agent", () => {
    it("should have correct permissions", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        const agent = yield* service.getAgent("security-reviewer")
        return agent.permissions
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result.read).toBe("allow")
      expect(result.edit).toBe("ask")
      expect(result.bash).toBe("deny") // High security - no bash
    })

    it("should have security-related keywords", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        const agent = yield* service.getAgent("security-reviewer")
        return agent.activationKeywords
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result).toContain("security audit")
      expect(result).toContain("vulnerability")
      expect(result).toContain("XSS")
      expect(result).toContain("SQL injection")
      expect(result).toContain("OWASP")
    })
  })

  describe("Build Error Resolver Agent", () => {
    it("should have correct permissions", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        const agent = yield* service.getAgent("build-error-resolver")
        return agent.permissions
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result.read).toBe("allow")
      expect(result.edit).toBe("allow") // Can edit to fix errors
      expect(result.create).toBe("ask")
      expect(result.bash).toBe("allow") // Bash required for debugging
    })

    it("should have build error keywords", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        const agent = yield* service.getAgent("build-error-resolver")
        return agent.activationKeywords
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result).toContain("build error")
      expect(result).toContain("compilation error")
      expect(result).toContain("CI/CD failure")
      expect(result).toContain("type error")
    })
  })

  describe("Refactor Cleaner Agent", () => {
    it("should have correct permissions", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        const agent = yield* service.getAgent("refactor-cleaner")
        return agent.permissions
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result.read).toBe("allow")
      expect(result.edit).toBe("allow") // Can edit to refactor
      expect(result.delete).toBe("ask")
      expect(result.bash).toBe("deny") // No bash needed
    })

    it("should have refactoring keywords", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        const agent = yield* service.getAgent("refactor-cleaner")
        return agent.activationKeywords
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result).toContain("refactor")
      expect(result).toContain("technical debt")
      expect(result).toContain("clean up")
      expect(result).toContain("deduplicate")
    })
  })

  describe("Orchestrator Agent", () => {
    it("should have full permissions", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        const agent = yield* service.getAgent("orchestrator")
        return agent.permissions
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result.read).toBe("allow")
      expect(result.edit).toBe("allow")
      expect(result.create).toBe("allow")
      expect(result.delete).toBe("allow")
      expect(result.bash).toBe("allow")
    })

    it("should have no activation keywords", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        const agent = yield* service.getAgent("orchestrator")
        return agent.activationKeywords
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result).toHaveLength(0)
    })

    it("should be identified as orchestrator", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        return yield* service.isOrchestrator("orchestrator")
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result).toBe(true)
    })
  })

  describe("Keyword Matching", () => {
    it("should find agent by planner keywords", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        return yield* service.findAgentByKeyword("help me plan the architecture")
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(Option.isSome(result)).toBe(true)
      expect(Option.getOrNull(result)).toBe("planner")
    })

    it("should find agent by code review keywords", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        return yield* service.findAgentByKeyword("can you review this code")
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(Option.isSome(result)).toBe(true)
      expect(Option.getOrNull(result)).toBe("code-reviewer")
    })

    it("should find agent by security keywords", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        return yield* service.findAgentByKeyword("audit for security vulnerabilities")
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(Option.isSome(result)).toBe(true)
      expect(Option.getOrNull(result)).toBe("security-reviewer")
    })

    it("should find agent by build error keywords", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        return yield* service.findAgentByKeyword("fix this build error")
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(Option.isSome(result)).toBe(true)
      expect(Option.getOrNull(result)).toBe("build-error-resolver")
    })

    it("should find agent by refactor keywords", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        return yield* service.findAgentByKeyword("clean up this technical debt")
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(Option.isSome(result)).toBe(true)
      expect(Option.getOrNull(result)).toBe("refactor-cleaner")
    })

    it("should return none for unmatched keywords", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        return yield* service.findAgentByKeyword("random unrelated text")
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(Option.isNone(result)).toBe(true)
    })
  })

  describe("Tool Permission Helpers", () => {
    it("should check if tool is allowed", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        return yield* service.checkToolPermission("planner", "read")
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result).toBe("allow")
    })

    it("should return deny for restricted tool", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        return yield* service.checkToolPermission("planner", "edit")
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result).toBe("deny")
    })

    it("should return ask for approval-required tools", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        return yield* service.checkToolPermission("code-reviewer", "edit")
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(result).toBe("ask")
    })
  })

  describe("System Prompt Injection", () => {
    it("should return none for orchestrator", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        return yield* service.getSystemPromptInjection("orchestrator")
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(Option.isNone(result)).toBe(true)
    })

    it("should return injection for planner", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgent.Service
        return yield* service.getSystemPromptInjection("planner")
      }).pipe(Effect.provide(SubAgent.layer))

      const result = await Effect.runPromise(program)
      expect(Option.isSome(result)).toBe(true)
      const injection = Option.getOrNull(result)
      expect(injection).toContain("PLANNER")
      expect(injection).toContain("read: allow")
      expect(injection).toContain("edit: deny")
    })
  })
})
