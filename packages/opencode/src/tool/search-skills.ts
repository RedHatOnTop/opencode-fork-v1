import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { SkillRegistry } from "../skill/registry"
import type { Tier } from "../skill/types"
import DESCRIPTION from "./search-skills.txt"

export const Parameters = Schema.Struct({
  query: Schema.String.annotate({
    description: "Search query (e.g., 'git worktree branch management')",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "Maximum number of results to return (default: 10)",
  }),
  tier: Schema.optional(Schema.String).annotate({
    description: "Filter by tier: CORE, HIGH, LONGTAIL",
  }),
  category: Schema.optional(Schema.String).annotate({
    description: "Filter by category name",
  }),
})

const VALID_TIERS = new Set(["ALWAYS", "CORE", "HIGH", "LONGTAIL"])

export const SearchSkillsTool = Tool.define(
  "search_skills",
  Effect.gen(function* () {
    const registry = yield* SkillRegistry.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const tierFilter: Tier[] | undefined = params.tier
            ? VALID_TIERS.has(params.tier)
              ? [params.tier as Tier]
              : undefined
            : undefined

          // Check if agent context is available
          const agentType = ctx.agent
          
          let results
          if (agentType) {
            // Use agent-scoped search when agent context is present
            results = yield* registry.searchForAgent(agentType, params.query, {
              limit: params.limit ?? 10,
            })
          } else {
            // Use default search without agent filtering
            results = yield* registry.search(params.query, {
              limit: params.limit ?? 10,
              tierFilter,
              categoryFilter: params.category,
            })
          }

          if (results.length === 0) {
            // Suggest categories when no results found
            const browseResult = yield* registry.browse()
            const categorySuggestions = browseResult.categories
              .slice(0, 5)
              .map((c) => `  - ${c.name} (${c.skillCount} skills)`)

            return {
              title: `No results for: ${params.query}`,
              output: [
                `No skills found matching "${params.query}".`,
                agentType ? ` (filtered for ${agentType} agent)` : "",
                "",
                "Try browsing these categories:",
                ...categorySuggestions,
                "",
                "Or try different keywords in your search.",
              ].join("\n"),
              metadata: { resultCount: 0, agentType, query: params.query },
            }
          }

          const lines: string[] = [
            `Found ${results.length} skill${results.length === 1 ? "" : "s"} matching "${params.query}":`,
            agentType ? ` (filtered for ${agentType} agent)` : "",
            "",
          ]

          for (const result of results) {
            const d = result.descriptor
            lines.push(
              `### ${d.name} [${d.tier}] (score: ${d.score.toFixed(2)})`,
              `> ${d.description}`,
              `Tags: ${d.tags.join(", ")}`,
              "",
            )
          }

          lines.push("Use load_skill to load the full content of any skill listed above.")

          return {
            title: `Search results: ${params.query}`,
            output: lines.join("\n"),
            metadata: {
              resultCount: results.length,
              query: params.query,
              agentType,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
