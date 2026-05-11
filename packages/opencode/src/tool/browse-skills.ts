import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { SkillRegistry } from "../skill/registry"
import { suggestCategories } from "../skill/category"
import type { Tier } from "../skill/types"
import DESCRIPTION from "./browse-skills.txt"

export const Parameters = Schema.Struct({
  category: Schema.optional(Schema.String).annotate({
    description:
      "Category path to browse (e.g., 'Development and Testing'). Omit to list top-level categories.",
  }),
})

export const BrowseSkillsTool = Tool.define(
  "browse_skills",
  Effect.gen(function* () {
    const registry = yield* SkillRegistry.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const pathParts = params.category
            ? params.category.split(">").map((s: string) => s.trim()).filter((s: string) => s.length > 0)
            : undefined

          const agentType = ctx.agent
          let result = yield* registry.browse(pathParts)

          if (agentType) {
            const agentSkills = yield* registry.getSkillsForAgent(agentType)
            const allowedIds = new Set(agentSkills.map((s) => s.skillId))
            const filteredSkills = result.skills.filter((s) => allowedIds.has(s.name) || allowedIds.size === 0)
            result = {
              categories: result.categories,
              skills: filteredSkills,
            }
          }

          if (params.category && result.categories.length === 0 && result.skills.length === 0) {
            const allEntries = yield* registry.all()
            const { buildCategoryTree } = yield* Effect.promise(() => import("../skill/category"))
            const tree = buildCategoryTree(Array.from(allEntries))
            const suggestions = suggestCategories(tree, params.category)

            return {
              title: `Category not found: ${params.category}`,
              output: [
                `Category "${params.category}" not found.`,
                agentType ? ` (filtered for ${agentType} agent)` : "",
                "",
                "Did you mean one of these?",
                ...suggestions.map((s) => `  - ${s}`),
              ].join("\n"),
              metadata: {
                categoryCount: 0,
                skillCount: 0,
                agentType,
              },
            }
          }

          const lines: string[] = []

          if (result.categories.length > 0) {
            lines.push("## Categories")
            for (const cat of result.categories) {
              lines.push(`- **${cat.name}** (${cat.skillCount} skills, ${cat.childCount} sub-categories)`)
            }
            lines.push("")
          }

          if (result.skills.length > 0) {
            lines.push("## Skills")
            const tierOrder: Record<string, number> = { ALWAYS: 0, CORE: 1, HIGH: 2, LONGTAIL: 3 }
            const sorted = [...result.skills].sort(
              (a, b) => (tierOrder[a.tier] ?? 99) - (tierOrder[b.tier] ?? 99),
            )
            for (const skill of sorted) {
              lines.push(
                `- **${skill.name}** [${skill.tier}] — ${skill.description}${skill.tags.length > 0 ? ` (tags: ${skill.tags.slice(0, 5).join(", ")})` : ""}`,
              )
            }
          }

          if (agentType && result.skills.length === 0 && !params.category) {
            lines.push("")
            lines.push(`Showing categories only. Skills filtered for ${agentType} agent.`)
          }

          return {
            title: params.category ? `Category: ${params.category}` : "Skill Categories",
            output: lines.join("\n"),
            metadata: {
              categoryCount: result.categories.length,
              skillCount: result.skills.length,
              agentType,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
