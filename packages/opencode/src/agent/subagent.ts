/**
 * Sub-Agent System - Orchestrator Delegation and Tool Scoping
 *
 * Manages specialized sub-agents with scoped tool permissions:
 * - Orchestrator: Primary agent with full access
 * - Security Auditor: Read-only security analysis
 * - Code Reviewer: Read and suggest (edit requires approval)
 * - Test Writer: Test generation capabilities
 * - Docs Writer: Documentation generation
 * - Debugger: Debugging assistance
 */

import { Schema, Context, Effect, Layer, Option } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { Agent } from "./agent"

const log = Log.create({ service: "subagent" })

/**
 * Sub-agent types
 */
export const SubAgentType = Schema.Literal(
  "orchestrator",
  "security-auditor",
  "code-reviewer",
  "test-writer",
  "docs-writer",
  "debugger"
)
export type SubAgentType = "orchestrator" | "security-auditor" | "code-reviewer" | "test-writer" | "docs-writer" | "debugger"

/**
 * Tool action permissions
 */
export const ToolAction = Schema.Literal("allow", "deny", "ask")
export type ToolAction = Schema.Schema.Type<typeof ToolAction>

/**
 * Tool permissions for a sub-agent
 */
export interface ToolPermissions {
  read: ToolAction
  edit: ToolAction
  create: ToolAction
  delete: ToolAction
  bash: ToolAction
  glob: ToolAction
  grep: ToolAction
  task: ToolAction
}

/**
 * Sub-agent definition
 */
export interface SubAgentDefinition {
  type: SubAgentType
  name: string
  description: string
  markdownFile: string
  permissions: ToolPermissions
  activationKeywords: string[]
}

/**
 * Sub-agent service interface
 */
export interface Interface {
  readonly getAgent: (type: SubAgentType) => Effect.Effect<SubAgentDefinition>
  readonly getAllAgents: Effect.Effect<ReadonlyArray<SubAgentDefinition>>
  readonly findAgentByKeyword: (text: string) => Effect.Effect<Option.Option<SubAgentType>>
  readonly checkToolPermission: (
    agentType: SubAgentType,
    tool: keyof ToolPermissions
  ) => Effect.Effect<ToolAction>
  readonly getSystemPromptInjection: (agentType: SubAgentType) => Effect.Effect<Option.Option<string>>
  readonly isOrchestrator: (agentType: SubAgentType) => Effect.Effect<boolean>
}

/**
 * Sub-agent service
 */
export class Service extends Context.Service<Service, Interface>()("@opencode/SubAgent") {}

// Agent definitions with scoped permissions
const AGENT_DEFINITIONS: Record<SubAgentType, SubAgentDefinition> = {
  orchestrator: {
    type: "orchestrator",
    name: "Orchestrator",
    description: "Primary agent with full tool access that coordinates other agents",
    markdownFile: ".opencode/agents/orchestrator.md",
    permissions: {
      read: "allow",
      edit: "allow",
      create: "allow",
      delete: "allow",
      bash: "allow",
      glob: "allow",
      grep: "allow",
      task: "allow",
    },
    activationKeywords: [], // Always active
  },
  "security-auditor": {
    type: "security-auditor",
    name: "Security Auditor",
    description: "Specialized agent for security-sensitive operations and vulnerability analysis",
    markdownFile: ".opencode/agents/security-auditor.md",
    permissions: {
      read: "allow",
      edit: "ask", // Requires orchestrator approval
      create: "deny",
      delete: "deny",
      bash: "deny", // Security risk
      glob: "allow",
      grep: "allow",
      task: "deny",
    },
    activationKeywords: [
      "security audit",
      "vulnerability",
      "authentication",
      "authorization",
      "sanitize",
      "encrypt",
      "XSS",
      "SQL injection",
      "security",
      "exploit",
    ],
  },
  "code-reviewer": {
    type: "code-reviewer",
    name: "Code Reviewer",
    description: "Specialized agent for code quality review and refactoring suggestions",
    markdownFile: ".opencode/agents/code-reviewer.md",
    permissions: {
      read: "allow",
      edit: "ask", // Requires orchestrator approval
      create: "ask",
      delete: "deny",
      bash: "deny",
      glob: "allow",
      grep: "allow",
      task: "deny",
    },
    activationKeywords: [
      "code review",
      "refactor",
      "clean code",
      "design pattern",
      "maintainability",
      "performance",
      "review",
      "quality",
    ],
  },
  "test-writer": {
    type: "test-writer",
    name: "Test Writer",
    description: "Specialized agent for test case generation and coverage analysis",
    markdownFile: ".opencode/agents/test-writer.md",
    permissions: {
      read: "allow",
      edit: "ask",
      create: "allow", // Can create test files
      delete: "deny",
      bash: "deny",
      glob: "allow",
      grep: "allow",
      task: "deny",
    },
    activationKeywords: [
      "test",
      "testing",
      "coverage",
      "unit test",
      "integration test",
      "TDD",
      "test case",
      "mock",
    ],
  },
  "docs-writer": {
    type: "docs-writer",
    name: "Docs Writer",
    description: "Specialized agent for documentation generation and API documentation",
    markdownFile: ".opencode/agents/docs-writer.md",
    permissions: {
      read: "allow",
      edit: "ask",
      create: "allow", // Can create doc files
      delete: "deny",
      bash: "deny",
      glob: "allow",
      grep: "allow",
      task: "deny",
    },
    activationKeywords: [
      "documentation",
      "docs",
      "README",
      "API docs",
      "JSDoc",
      "comment",
      "explain",
      "tutorial",
    ],
  },
  debugger: {
    type: "debugger",
    name: "Debugger",
    description: "Specialized agent for debugging assistance and error analysis",
    markdownFile: ".opencode/agents/debugger.md",
    permissions: {
      read: "allow",
      edit: "ask",
      create: "ask",
      delete: "deny",
      bash: "allow", // May need to run debug commands
      glob: "allow",
      grep: "allow",
      task: "deny",
    },
    activationKeywords: [
      "debug",
      "bug",
      "error",
      "exception",
      "crash",
      "trace",
      "stack trace",
      "breakpoint",
      "log",
    ],
  },
}

/**
 * Service layer implementation
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const getAgent = Effect.fn("SubAgent.getAgent")(
      function* (type: SubAgentType) {
        const agent = AGENT_DEFINITIONS[type]
        if (!agent) {
          return yield* Effect.fail(new Error(`Unknown sub-agent type: ${type}`))
        }
        return agent
      }
    )

    const getAllAgents = Effect.fn("SubAgent.getAllAgents")(
      function* () {
        return Object.values(AGENT_DEFINITIONS)
      }
    )

    const findAgentByKeyword = Effect.fn("SubAgent.findAgentByKeyword")(
      function* (text: string) {
        const lowerText = text.toLowerCase()
        
        for (const [type, definition] of Object.entries(AGENT_DEFINITIONS)) {
          if (definition.activationKeywords.some((keyword) =>
            lowerText.includes(keyword.toLowerCase())
          )) {
            return Option.some(type as SubAgentType)
          }
        }
        
        return Option.none()
      }
    )

    const checkToolPermission = Effect.fn("SubAgent.checkToolPermission")(
      function* (agentType: SubAgentType, tool: keyof ToolPermissions) {
        const agent = yield* getAgent(agentType)
        return agent.permissions[tool]
      }
    )

    const getSystemPromptInjection = Effect.fn("SubAgent.getSystemPromptInjection")(
      function* (agentType: SubAgentType) {
        const agent = yield* getAgent(agentType)
        
        // In production, this would load the markdown file content
        // For MVP, return a placeholder with agent info
        if (agentType === "orchestrator") {
          return Option.none() // Orchestrator uses base system prompt
        }

        const injection = `
# SUB-AGENT MODE: ${agent.name.toUpperCase()}

You are operating as the ${agent.name} sub-agent with scoped permissions.

## Your Role
${agent.description}

## Tool Permissions
- read: ${agent.permissions.read}
- edit: ${agent.permissions.edit}
- create: ${agent.permissions.create}
- delete: ${agent.permissions.delete}
- bash: ${agent.permissions.bash}
- glob: ${agent.permissions.glob}
- grep: ${agent.permissions.grep}
- task: ${agent.permissions.task}

## Guidelines
1. Operate within your scoped permissions
2. Request orchestrator approval for restricted actions
3. Use @orchestrator to escalate when needed
4. Provide specialized expertise for your domain

Agent Type: ${agentType}
`
        return Option.some(injection)
      }
    )

    const isOrchestrator = Effect.fn("SubAgent.isOrchestrator")(
      function* (agentType: SubAgentType) {
        return agentType === "orchestrator"
      }
    )

    return Service.of({
      getAgent,
      getAllAgents,
      findAgentByKeyword,
      checkToolPermission,
      getSystemPromptInjection,
      isOrchestrator,
    })
  })
)

export const defaultLayer = layer

/**
 * Helper: Get agent by keyword
 */
export function findAgentByKeyword(text: string): Effect.Effect<Option.Option<SubAgentType>> {
  return Effect.gen(function* () {
    const service = yield* Service
    return yield* service.findAgentByKeyword(text)
  })
}

/**
 * Helper: Check if tool is allowed
 */
export function isToolAllowed(
  agentType: SubAgentType,
  tool: keyof ToolPermissions
): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    const service = yield* Service
    const permission = yield* service.checkToolPermission(agentType, tool)
    return permission === "allow"
  })
}

/**
 * Helper: Check if tool requires approval
 */
export function isToolAsk(
  agentType: SubAgentType,
  tool: keyof ToolPermissions
): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    const service = yield* Service
    const permission = yield* service.checkToolPermission(agentType, tool)
    return permission === "ask"
  })
}
