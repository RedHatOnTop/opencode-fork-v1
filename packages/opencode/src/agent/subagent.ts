/**
 * Sub-Agent System - Orchestrator Delegation and Tool Scoping
 *
 * Manages specialized sub-agents with scoped tool permissions:
 * - Orchestrator: Primary agent with full access
 * - Planner: Planning specialist (read + bash only)
 * - Code Reviewer: Code quality analysis (read + ask for edits)
 * - Security Reviewer: Security audit specialist (read + ask for edits)
 * - Build Error Resolver: Build failure diagnosis (read + edit + bash)
 * - Refactor Cleaner: Refactoring specialist (read + edit, no bash)
 *
 * NOTE: This uses the 5 sub-agent design from opencode-enhanced spec.
 * Previous agents (security-auditor, test-writer, docs-writer, debugger) have been
 * consolidated into the new structure.
 */

import { Schema, Context, Effect, Layer, Option } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { InstanceState } from "@/effect/instance-state"
import { Agent } from "./agent"

const log = Log.create({ service: "subagent" })

/**
 * Sub-agent types (5-agent model)
 */
export const SubAgentType = Schema.Literals([
  "orchestrator",
  "planner",
  "code-reviewer",
  "security-reviewer",
  "build-error-resolver",
  "refactor-cleaner",
])
export type SubAgentType = "orchestrator" | "planner" | "code-reviewer" | "security-reviewer" | "build-error-resolver" | "refactor-cleaner"

/**
 * Tool action permissions
 */
export const ToolAction = Schema.Literals(["allow", "deny", "ask"])
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

// Agent definitions with scoped permissions (5-agent model)
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
    activationKeywords: [],
  },
  planner: {
    type: "planner",
    name: "Planner",
    description: "Planning specialist that breaks down tasks, designs architecture, and creates strategic roadmaps",
    markdownFile: ".opencode/agents/planner.md",
    permissions: {
      read: "allow",
      edit: "deny",
      create: "deny",
      delete: "deny",
      bash: "allow",
      glob: "allow",
      grep: "allow",
      task: "allow",
    },
    activationKeywords: [
      "plan",
      "planning",
      "architecture",
      "design system",
      "roadmap",
      "strategy",
      "break down",
      "decompose",
      "structure",
      "organize",
      "milestone",
      "phase",
      "work breakdown",
      "WBS",
      "technical design",
      "system design",
    ],
  },
  "code-reviewer": {
    type: "code-reviewer",
    name: "Code Reviewer",
    description: "Code quality review specialist that analyzes patterns, maintainability, and suggests improvements",
    markdownFile: ".opencode/agents/code-reviewer.md",
    permissions: {
      read: "allow",
      edit: "ask",
      create: "ask",
      delete: "deny",
      bash: "deny",
      glob: "allow",
      grep: "allow",
      task: "deny",
    },
    activationKeywords: [
      "code review",
      "review code",
      "review this",
      "review my",
      "quality check",
      "maintainability",
      "clean code",
      "design pattern",
      "anti-pattern",
      "code smell",
      "refactor suggestion",
      "improve code",
      "best practice",
      "PR review",
      "pull request review",
    ],
  },
  "security-reviewer": {
    type: "security-reviewer",
    name: "Security Reviewer",
    description: "Security audit specialist that analyzes vulnerabilities, compliance, and threat models",
    markdownFile: ".opencode/agents/security-reviewer.md",
    permissions: {
      read: "allow",
      edit: "ask",
      create: "deny",
      delete: "deny",
      bash: "deny",
      glob: "allow",
      grep: "allow",
      task: "deny",
    },
    activationKeywords: [
      "security audit",
      "security review",
      "vulnerability",
      "authentication",
      "authorization",
      "sanitize",
      "encrypt",
      "XSS",
      "CSRF",
      "SQL injection",
      "security",
      "exploit",
      "CVE",
      "OWASP",
      "penetration test",
      "threat model",
      "compliance",
      "GDPR",
      "SOC2",
    ],
  },
  "build-error-resolver": {
    type: "build-error-resolver",
    name: "Build Error Resolver",
    description: "Build error specialist that diagnoses and fixes compilation, CI/CD, and deployment failures",
    markdownFile: ".opencode/agents/build-error-resolver.md",
    permissions: {
      read: "allow",
      edit: "allow",
      create: "ask",
      delete: "deny",
      bash: "allow",
      glob: "allow",
      grep: "allow",
      task: "deny",
    },
    activationKeywords: [
      "build error",
      "compilation error",
      "CI/CD failure",
      "deployment failed",
      "type error",
      "lint error",
      "webpack error",
      "vite error",
      "docker build failed",
      "npm error",
      "yarn error",
      "pnpm error",
      "test failed",
      "pipeline failed",
      "build failed",
      "cannot compile",
      "typescript error",
    ],
  },
  "refactor-cleaner": {
    type: "refactor-cleaner",
    name: "Refactor Cleaner",
    description: "Refactoring specialist that cleans up code, reduces technical debt, and improves code structure",
    markdownFile: ".opencode/agents/refactor-cleaner.md",
    permissions: {
      read: "allow",
      edit: "allow",
      create: "ask",
      delete: "ask",
      bash: "deny",
      glob: "allow",
      grep: "allow",
      task: "deny",
    },
    activationKeywords: [
      "refactor",
      "clean up",
      "cleanup",
      "technical debt",
      "deduplicate",
      "simplify",
      "rename",
      "extract method",
      "extract class",
      "inline method",
      "move method",
      "polish",
      "tidy up",
      "restructure",
      "improve structure",
      "remove duplication",
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
        return AGENT_DEFINITIONS[type]
      }
    )

    const getAllAgents = Effect.sync(() =>
      Object.values(AGENT_DEFINITIONS) as ReadonlyArray<SubAgentDefinition>
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

        if (agentType === "orchestrator") {
          return Option.none()
        }

        const ctx = yield* InstanceState.context
        const projectDir = ctx.directory ?? process.cwd()
        const markdownContent = yield* Effect.tryPromise(() =>
          import("fs/promises").then((fs) =>
            import("path").then((path) =>
              fs.readFile(path.resolve(projectDir, agent.markdownFile), "utf-8")
            )
          )
        ).pipe(Effect.orElseSucceed(() => undefined as string | undefined))

        const permissionLines = Object.entries(agent.permissions)
          .map(([tool, action]) => `- ${tool}: ${action}`)
          .join("\n")

        const parts: string[] = []
        parts.push(`# SUB-AGENT MODE: ${agent.name.toUpperCase()}`)
        parts.push("")
        parts.push(`You are operating as the ${agent.name} sub-agent with scoped permissions.`)
        parts.push("")

        if (markdownContent) {
          const contentWithoutFrontmatter = markdownContent
            .replace(/^---\n[\s\S]*?\n---\n/, "")
            .trim()
          if (contentWithoutFrontmatter) {
            parts.push(contentWithoutFrontmatter)
            parts.push("")
          }
        } else {
          parts.push("## Your Role")
          parts.push(agent.description)
          parts.push("")
        }

        parts.push("## Tool Permissions")
        parts.push(permissionLines)
        parts.push("")
        parts.push("## Guidelines")
        parts.push("1. Operate within your scoped permissions")
        parts.push("2. Request orchestrator approval for restricted actions via @orchestrator")
        parts.push("3. Provide specialized expertise for your domain")
        parts.push("")
        parts.push(`Agent Type: ${agentType}`)

        return Option.some(parts.join("\n"))
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
export function findAgentByKeyword(text: string): Effect.Effect<Option.Option<SubAgentType>, never, Service> {
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
): Effect.Effect<boolean, never, Service> {
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
): Effect.Effect<boolean, never, Service> {
  return Effect.gen(function* () {
    const service = yield* Service
    const permission = yield* service.checkToolPermission(agentType, tool)
    return permission === "ask"
  })
}

export * as SubAgent from "./subagent"
