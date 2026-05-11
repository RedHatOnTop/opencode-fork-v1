import { Context, Effect, Layer } from "effect"

import { Instance } from "../project/instance"

import PROMPT_UNIFIED from "./prompt/unified.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { SkillRegistry } from "@/skill/registry"
import { getCompactInstructions } from "@/agent/prompt/quality"
import { GraphifyFeature } from "@/feature/graphify"
import { SubAgent, SubAgentType } from "@/agent/subagent"
import { Workflow } from "@/workflow/workflow"
import { Memory } from "@/memory/memory"

/**
 * Get unified system prompt for all providers.
 * Provider-specific prompts removed in favor of a single high-quality unified prompt.
 */
export function provider(model: Provider.Model) {
  return [PROMPT_UNIFIED]
}

export interface Interface {
  readonly environment: (model: Provider.Model) => string[]
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
  readonly graphify: () => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SystemPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const registry = yield* SkillRegistry.Service
    const graphify = yield* GraphifyFeature.Service

    return Service.of({
      environment(model) {
        const project = Instance.project
        
        const sections = [
          [
            `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
            `Here is some useful information about the environment you are running in:`,
            `<env>`,
            `  Working directory: ${Instance.directory}`,
            `  Workspace root folder: ${Instance.worktree}`,
            `  Is directory a git repo: ${project.vcs === "git" ? "yes" : "no"}`,
            `  Platform: ${process.platform}`,
            `  Today's date: ${new Date().toDateString()}`,
            `</env>`,
          ].join("\n"),
        ]
        
        // Always inject quality instructions by default
        sections.push(getCompactInstructions())
        
        return sections
      },

      skills: ((agent: Agent.Info) =>
        Effect.gen(function* () {
          const workflowOpt = yield* Effect.serviceOption(Workflow.Service)
          const memoryOpt = yield* Effect.serviceOption(Memory.Service)
          const subAgentOpt = yield* Effect.serviceOption(SubAgent.Service)
        
        const parts: string[] = []

        if (subAgentOpt._tag === "Some") {
          const subAgentPrompt = yield* subAgentOpt.value.getSystemPromptInjection(agent.name as SubAgentType)
          if (subAgentPrompt._tag === "Some") {
            parts.push(subAgentPrompt.value)
          }
        }

        if (workflowOpt._tag === "Some") {
          const workflowPrompt = yield* workflowOpt.value.getSystemPromptInjection()
          if (workflowPrompt._tag === "Some") {
            parts.push(workflowPrompt.value)
          }
        }

        if (memoryOpt._tag === "Some") {
          // Pass the last user message or just generic context
          const memoryPrompt = yield* memoryOpt.value.getSystemPromptInjection()
          if (memoryPrompt._tag === "Some") {
            parts.push(memoryPrompt.value)
          }
        }
        // Defensive check: agent might be undefined or not have permission
        if (!agent || !agent.permission) {
          // Fallback to default system prompt section when agent info is incomplete
          const registrySection = yield* registry.systemPromptSection()
          return registrySection
        }
        
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        // Use the new SkillRegistry for system prompt generation
        // Check if agent has a specific type for agent-scoped skill access
        const agentType = agent.name
        const registrySection = agentType
          ? yield* registry.systemPromptSectionForAgent(agentType)
          : yield* registry.systemPromptSection()

        if (registrySection) {
          parts.push(registrySection)
        }

        return parts.join("\n")
      })) as Interface["skills"],

      graphify: Effect.fn("SystemPrompt.graphify")(function* () {
        return yield* graphify.systemPromptSection()
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Skill.defaultLayer),
  Layer.provide(SkillRegistry.layer),
  Layer.provide(GraphifyFeature.layer),
  Layer.provide(SubAgent.defaultLayer),
  Layer.provide(Workflow.defaultLayer),
  Layer.provide(Memory.defaultLayer),
)

export * as SystemPrompt from "./system"
