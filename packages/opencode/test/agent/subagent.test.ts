/**
 * Sub-Agent Tool Permission Unit Tests
 *
 * Tests scoped tool permissions for different agent types.
 */

import { describe, expect, it } from "bun:test"
import { Effect, Option } from "effect"
import {
  Service as SubAgentService,
  SubAgentType,
  ToolPermissions,
  defaultLayer as subAgentLayer,
  isToolAllowed,
  isToolAsk,
} from "@/agent/subagent"

// Helper to run Effect with the test layer
const runWithLayer = <A>(effect: Effect.Effect<A>) =>
  Effect.runPromise(Effect.provide(effect, subAgentLayer))

describe("Sub-Agent Tool Permissions", () => {
  describe("Orchestrator Agent", () => {
    const agentType: SubAgentType = "orchestrator"

    it("should have full read permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "read"))
      expect(result).toBe(true)
    })

    it("should have full edit permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "edit"))
      expect(result).toBe(true)
    })

    it("should have full create permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "create"))
      expect(result).toBe(true)
    })

    it("should have full delete permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "delete"))
      expect(result).toBe(true)
    })

    it("should have full bash permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "bash"))
      expect(result).toBe(true)
    })

    it("should have full glob permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "glob"))
      expect(result).toBe(true)
    })

    it("should have full grep permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "grep"))
      expect(result).toBe(true)
    })

    it("should have full task permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "task"))
      expect(result).toBe(true)
    })
  })

  describe("Security Auditor Agent", () => {
    const agentType: SubAgentType = "security-auditor"

    it("should have read permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "read"))
      expect(result).toBe(true)
    })

    it("should have glob permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "glob"))
      expect(result).toBe(true)
    })

    it("should have grep permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "grep"))
      expect(result).toBe(true)
    })

    it("should require ask for edit", async () => {
      const result = await runWithLayer(isToolAsk(agentType, "edit"))
      expect(result).toBe(true)
    })

    it("should deny create", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "create"))
      expect(result).toBe(false)
    })

    it("should deny delete", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "delete"))
      expect(result).toBe(false)
    })

    it("should deny bash (security risk)", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "bash"))
      expect(result).toBe(false)
    })

    it("should deny task", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "task"))
      expect(result).toBe(false)
    })

    it("should not be able to edit directly", async () => {
      const allowed = await runWithLayer(isToolAllowed(agentType, "edit"))
      expect(allowed).toBe(false)
    })
  })

  describe("Code Reviewer Agent", () => {
    const agentType: SubAgentType = "code-reviewer"

    it("should have read permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "read"))
      expect(result).toBe(true)
    })

    it("should have glob permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "glob"))
      expect(result).toBe(true)
    })

    it("should have grep permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "grep"))
      expect(result).toBe(true)
    })

    it("should require ask for edit", async () => {
      const result = await runWithLayer(isToolAsk(agentType, "edit"))
      expect(result).toBe(true)
    })

    it("should require ask for create", async () => {
      const result = await runWithLayer(isToolAsk(agentType, "create"))
      expect(result).toBe(true)
    })

    it("should deny delete", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "delete"))
      expect(result).toBe(false)
    })

    it("should deny bash", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "bash"))
      expect(result).toBe(false)
    })

    it("should deny task", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "task"))
      expect(result).toBe(false)
    })
  })

  describe("Test Writer Agent", () => {
    const agentType: SubAgentType = "test-writer"

    it("should have read permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "read"))
      expect(result).toBe(true)
    })

    it("should have create permission (for test files)", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "create"))
      expect(result).toBe(true)
    })

    it("should require ask for edit", async () => {
      const result = await runWithLayer(isToolAsk(agentType, "edit"))
      expect(result).toBe(true)
    })

    it("should deny delete", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "delete"))
      expect(result).toBe(false)
    })

    it("should deny bash", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "bash"))
      expect(result).toBe(false)
    })
  })

  describe("Docs Writer Agent", () => {
    const agentType: SubAgentType = "docs-writer"

    it("should have read permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "read"))
      expect(result).toBe(true)
    })

    it("should have create permission (for doc files)", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "create"))
      expect(result).toBe(true)
    })

    it("should require ask for edit", async () => {
      const result = await runWithLayer(isToolAsk(agentType, "edit"))
      expect(result).toBe(true)
    })

    it("should deny delete", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "delete"))
      expect(result).toBe(false)
    })

    it("should deny bash", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "bash"))
      expect(result).toBe(false)
    })
  })

  describe("Debugger Agent", () => {
    const agentType: SubAgentType = "debugger"

    it("should have read permission", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "read"))
      expect(result).toBe(true)
    })

    it("should have bash permission (for debug commands)", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "bash"))
      expect(result).toBe(true)
    })

    it("should require ask for edit", async () => {
      const result = await runWithLayer(isToolAsk(agentType, "edit"))
      expect(result).toBe(true)
    })

    it("should require ask for create", async () => {
      const result = await runWithLayer(isToolAsk(agentType, "create"))
      expect(result).toBe(true)
    })

    it("should deny delete", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "delete"))
      expect(result).toBe(false)
    })

    it("should deny task", async () => {
      const result = await runWithLayer(isToolAllowed(agentType, "task"))
      expect(result).toBe(false)
    })
  })

  describe("Agent Definitions", () => {
    it("should return orchestrator definition", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.getAgent("orchestrator")
      })
      const result = await runWithLayer(program)
      expect(result.type).toBe("orchestrator")
      expect(result.name).toBe("Orchestrator")
    })

    it("should return security-auditor definition", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.getAgent("security-auditor")
      })
      const result = await runWithLayer(program)
      expect(result.type).toBe("security-auditor")
      expect(result.name).toBe("Security Auditor")
    })

    it("should return all agent definitions", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.getAllAgents()
      })
      const result = await runWithLayer(program)
      expect(result.length).toBeGreaterThanOrEqual(6)
      const types = result.map((a) => a.type)
      expect(types).toContain("orchestrator")
      expect(types).toContain("security-auditor")
      expect(types).toContain("code-reviewer")
      expect(types).toContain("test-writer")
      expect(types).toContain("docs-writer")
      expect(types).toContain("debugger")
    })
  })

  describe("Agent Detection by Keywords", () => {
    it("should detect security audit keyword", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.findAgentByKeyword("Please do a security audit")
      })
      const result = await runWithLayer(program)
      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toBe("security-auditor")
      }
    })

    it("should detect code review keyword", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.findAgentByKeyword("Can you review this code?")
      })
      const result = await runWithLayer(program)
      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toBe("code-reviewer")
      }
    })

    it("should detect test keyword", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.findAgentByKeyword("Write unit tests for this")
      })
      const result = await runWithLayer(program)
      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toBe("test-writer")
      }
    })

    it("should detect documentation keyword", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.findAgentByKeyword("Add documentation")
      })
      const result = await runWithLayer(program)
      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toBe("docs-writer")
      }
    })

    it("should detect debug keyword", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.findAgentByKeyword("Debug this error")
      })
      const result = await runWithLayer(program)
      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toBe("debugger")
      }
    })

    it("should return none for no match", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.findAgentByKeyword("Hello world")
      })
      const result = await runWithLayer(program)
      expect(Option.isNone(result)).toBe(true)
    })
  })

  describe("Tool Permission Lookup", () => {
    it("should return correct permission for orchestrator", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.checkToolPermission("orchestrator", "edit")
      })
      const result = await runWithLayer(program)
      expect(result).toBe("allow")
    })

    it("should return correct permission for security-auditor edit", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.checkToolPermission("security-auditor", "edit")
      })
      const result = await runWithLayer(program)
      expect(result).toBe("ask")
    })

    it("should return correct permission for security-auditor create", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.checkToolPermission("security-auditor", "create")
      })
      const result = await runWithLayer(program)
      expect(result).toBe("deny")
    })
  })

  describe("Orchestrator Check", () => {
    it("should return true for orchestrator", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.isOrchestrator("orchestrator")
      })
      const result = await runWithLayer(program)
      expect(result).toBe(true)
    })

    it("should return false for other agents", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SubAgentService
        return yield* service.isOrchestrator("security-auditor")
      })
      const result = await runWithLayer(program)
      expect(result).toBe(false)
    })
  })
})