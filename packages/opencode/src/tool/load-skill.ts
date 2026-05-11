import path from "path"
import { pathToFileURL } from "url"
import { Effect, Schema } from "effect"
import * as Stream from "effect/Stream"
import { Ripgrep } from "../file/ripgrep"
import { Skill } from "../skill"
import { SkillRegistry } from "../skill/registry"
import * as TokenBudget from "../skill/budget"
import * as Tool from "./tool"
import DESCRIPTION from "./load-skill.txt"

export const Parameters = Schema.Struct({
  name: Schema.String.annotate({
    description: "The name of the skill to load (from search results or browse output)",
  }),
})

export const LoadSkillTool = Tool.define(
  "load_skill",
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const registry = yield* SkillRegistry.Service
    const budget = yield* TokenBudget.Service
    const rg = yield* Ripgrep.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const agentType = ctx.agent

          // First check the registry for metadata
          const entry = yield* registry.get(params.name)

          if (!entry) {
            // Skill not in registry — try searching for similar skills
            const searchResults = agentType
              ? yield* registry.searchForAgent(agentType, params.name, { limit: 5 })
              : yield* registry.search(params.name, { limit: 5 })

            const suggestions = searchResults.length > 0
              ? [
                  "",
                  "Similar skills found:",
                  ...searchResults.map(
                    (r) => `  - ${r.descriptor.name} [${r.descriptor.tier}] — ${r.descriptor.description}`,
                  ),
                ]
              : ["", "No similar skills found. Try search_skills with different keywords."]

            return {
              title: `Skill not found: ${params.name}`,
              output: [`Skill "${params.name}" not found in the registry.`, ...suggestions].join("\n"),
              metadata: { found: false, accessDenied: false, agentType: agentType ?? "", contentLoaded: false as boolean, name: "" as string, tier: "" as string, tokenCount: 0, budgetUsed: 0, budgetLimit: 0 },
            }
          }

          // Agent permission check: verify skill is accessible to current agent
          if (agentType) {
            const canLoad = yield* registry.canLoadSkill(params.name, agentType)
            if (!canLoad) {
              const alternatives = yield* registry.searchForAgent(agentType, params.name, { limit: 5 })
              const altLines = alternatives.length > 0
                ? [
                    "",
                    "Skills available to your agent role:",
                    ...alternatives.map(
                      (r) => `  - ${r.descriptor.name} [${r.descriptor.tier}] — ${r.descriptor.description}`,
                    ),
                  ]
                : ["", "No similar skills available for your agent role."]

              return {
                title: `Skill access denied: ${params.name}`,
                output: [
                  `Skill "${params.name}" is not available to the ${agentType} agent.`,
                  "This skill is outside your agent's skill profile scope.",
                  ...altLines,
                ].join("\n"),
                metadata: { found: true, accessDenied: true, agentType, contentLoaded: false, name: entry.name, tier: entry.tier, tokenCount: 0, budgetUsed: 0, budgetLimit: 0 },
              }
            }
          }

          // Try to load the skill content via existing Skill.Service
          const info = yield* skill.get(params.name).pipe(
            Effect.catch(() => Effect.succeed(undefined)),
          )

          // Also try by skillId
          const skillInfo = info ?? (yield* skill.get(entry.skillId).pipe(
            Effect.catch(() => Effect.succeed(undefined)),
          ))

          if (!skillInfo) {
            // Skill exists in registry but content not available locally
            return {
              title: `Skill metadata: ${params.name}`,
              output: [
                `Skill "${params.name}" found in registry but content is not available locally.`,
                "",
                `**Name:** ${entry.name}`,
                `**Tier:** ${entry.tier}`,
                `**Description:** ${entry.description}`,
                `**Tags:** ${entry.tags.join(", ")}`,
                `**Source:** ${entry.location}`,
                "",
                "This skill may need to be pulled from its remote source.",
              ].join("\n"),
              metadata: {
                found: true,
                accessDenied: false,
                agentType: agentType ?? "",
                contentLoaded: false,
                name: entry.name,
                tier: entry.tier,
                tokenCount: 0,
                budgetUsed: 0,
                budgetLimit: 0,
              },
            }
          }

          // Estimate tokens and manage budget
          const content = skillInfo.content
          const tokens = budget.estimateTokens(content)

          // Evict LRU skills if needed
          yield* TokenBudget.loadWithEviction(params.name, content, budget)

          // Get file listing (reuse existing skill tool logic)
          const dir = path.dirname(skillInfo.location)
          const base = pathToFileURL(dir).href
          const limit = 10
          const files = yield* rg.files({ cwd: dir, follow: false, hidden: true, signal: ctx.abort }).pipe(
            Stream.filter((file) => !file.includes("SKILL.md")),
            Stream.map((file) => path.resolve(dir, file)),
            Stream.take(limit),
            Stream.runCollect,
            Effect.map((chunk) => [...chunk].map((file) => `<file>${file}</file>`).join("\n")),
            Effect.catch(() => Effect.succeed("")),
          )

          // Get budget status
          const budgetStatus = yield* budget.status()

          return {
            title: `Loaded skill: ${skillInfo.name}`,
            output: [
              `<skill_content name="${skillInfo.name}">`,
              `# Skill: ${skillInfo.name}`,
              "",
              content.trim(),
              "",
              `Base directory for this skill: ${base}`,
              "Relative paths in this skill are relative to this base directory.",
              "",
              "<skill_files>",
              files,
              "</skill_files>",
              "</skill_content>",
              "",
              `---`,
              `Token budget: ${budgetStatus.used}/${budgetStatus.limit} tokens used`,
            ].join("\n"),
            metadata: {
              found: true,
              accessDenied: false,
              agentType: agentType ?? "",
              contentLoaded: true,
              name: skillInfo.name,
              tier: entry.tier,
              tokenCount: tokens,
              budgetUsed: budgetStatus.used,
              budgetLimit: budgetStatus.limit,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
