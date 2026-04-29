import { Schema } from "effect"
import { zod } from "@/util/effect-zod"
import { withStatics } from "@/util/schema"

export const Info = Schema.Struct({
  paths: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Additional paths to skill folders",
  }),
  urls: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "URLs to fetch skills from (e.g., https://example.com/.well-known/skills/)",
  }),
  max_loaded_tokens: Schema.optional(Schema.Number).annotate({
    description: "Maximum tokens for on-demand loaded skills (default: 4000)",
  }),
  core_boost: Schema.optional(Schema.Number).annotate({
    description: "BM25 score boost multiplier for CORE tier skills (default: 1.5)",
  }),
  search_limit: Schema.optional(Schema.Number).annotate({
    description: "Default number of search results (default: 10)",
  }),
}).pipe(withStatics((s) => ({ zod: zod(s) })))

export type Info = Schema.Schema.Type<typeof Info>

export * as ConfigSkills from "./skills"
