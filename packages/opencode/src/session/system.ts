import { Context, Effect, Layer } from "effect"

import { Instance } from "../project/instance"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_DEFAULT from "./prompt/default.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_GPT from "./prompt/gpt.txt"
import PROMPT_KIMI from "./prompt/kimi.txt"

import PROMPT_CODEX from "./prompt/codex.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { SkillRegistry } from "@/skill/registry"
import { getCompactInstructions } from "@/agent/prompt/quality"
import { Config } from "@/config/config"

export function provider(model: Provider.Model) {
  if (model.api.id.includes("gpt-4") || model.api.id.includes("o1") || model.api.id.includes("o3"))
    return [PROMPT_BEAST]
  if (model.api.id.includes("gpt")) {
    if (model.api.id.includes("codex")) {
      return [PROMPT_CODEX]
    }
    return [PROMPT_GPT]
  }
  if (model.api.id.includes("gemini-")) return [PROMPT_GEMINI]
  if (model.api.id.includes("claude")) return [PROMPT_ANTHROPIC]
  if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_TRINITY]
  if (model.api.id.toLowerCase().includes("kimi")) return [PROMPT_KIMI]
  return [PROMPT_DEFAULT]
}

export interface Interface {
  readonly environment: (model: Provider.Model) => string[]
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SystemPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const registry = yield* SkillRegistry.Service

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

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        // Use the new SkillRegistry for system prompt generation
        // This replaces the old Skill.fmt(list, { verbose: true }) full injection
        const registrySection = yield* registry.systemPromptSection()

        // Also include locally discovered skills (backward compatibility)
        const localList = yield* skill.available(agent)
        const localOnly = localList.filter(
          (s) => !s.name.includes("/"), // Local skills don't have owner/ prefix
        )

        const parts: string[] = []

        // Add the registry-based section (ALWAYS skills + tool guide + categories)
        if (registrySection) {
          parts.push(registrySection)
        }

        // Add local skills that aren't in the registry
        if (localOnly.length > 0) {
          parts.push("")
          parts.push("## Local Skills")
          parts.push(Skill.fmt(localOnly, { verbose: false }))
        }

        // Inject quality instructions into skill prompts
        parts.push("\n" + getCompactInstructions())

        return parts.join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Skill.defaultLayer),
  Layer.provide(SkillRegistry.layer),
)

export * as SystemPrompt from "./system"
