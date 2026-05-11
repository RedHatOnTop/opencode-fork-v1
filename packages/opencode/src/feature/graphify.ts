import { Context, Effect, Layer } from "effect"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Config } from "@/config/config"
import { Instance } from "@/project/instance"
import path from "path"
import fs from "fs"
import PROMPT_GRAPHIFY from "../session/prompt/graphify.txt"

export interface Interface {
  readonly isEnabled: () => Effect.Effect<boolean>
  readonly graphExists: () => Effect.Effect<boolean>
  readonly graphReportPath: () => Effect.Effect<string>
  readonly graphJsonPath: () => Effect.Effect<string>
  readonly systemPromptSection: () => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/GraphifyFeature") {}

export const make = Effect.gen(function* () {
  const configSvc = yield* Config.Service

  const isEnabled = Effect.fn("GraphifyFeature.isEnabled")(function* () {
    if (Flag.OPENCODE_ENABLE_GRAPHIFY) return true
    const config = yield* configSvc.get()
    return config.graphify?.enabled === true
  })

  const graphReportPath = Effect.fn("GraphifyFeature.graphReportPath")(function* () {
    const config = yield* configSvc.get()
    const basePath = config.graphify?.graph_path
      ? path.dirname(config.graphify.graph_path)
      : "graphify-out"
    return path.join(Instance.directory, basePath, "GRAPH_REPORT.md")
  })

  const graphJsonPath = Effect.fn("GraphifyFeature.graphJsonPath")(function* () {
    const config = yield* configSvc.get()
    const basePath = config.graphify?.graph_path
      ? config.graphify.graph_path
      : "graphify-out/graph.json"
    return path.join(Instance.directory, basePath)
  })

  const graphExists = Effect.fn("GraphifyFeature.graphExists")(function* () {
    const reportPath = yield* graphReportPath()
    return fs.existsSync(reportPath)
  })

  const systemPromptSection = Effect.fn("GraphifyFeature.systemPromptSection")(function* () {
    const enabled = yield* isEnabled()
    if (!enabled) return undefined

    const parts: string[] = [PROMPT_GRAPHIFY]

    const exists = yield* graphExists()
    if (exists) {
      parts.push("")
      parts.push("## Active Knowledge Graph")
      parts.push("A knowledge graph already exists in this project.")
      parts.push("- Read `graphify-out/GRAPH_REPORT.md` BEFORE searching raw files for architecture questions.")
      parts.push("- Use graph queries for precise relationship tracing.")
    } else {
      parts.push("")
      parts.push("## No Knowledge Graph Yet")
      parts.push("No graphify graph found. Consider suggesting the user run `graphify .` to build one.")
      parts.push("This is especially valuable for large codebases or when working with mixed content (code + docs + papers).")
    }

    const config = yield* configSvc.get()
    if (config.graphify?.auto_query !== false) {
      parts.push("")
      parts.push("## Auto-Query Behavior")
      parts.push("When asked about architecture, design decisions, or codebase structure:")
      parts.push("1. First check `graphify-out/GRAPH_REPORT.md`")
      parts.push("2. If the graph exists, prefer it over grep/glob for structural questions")
      parts.push("3. Suggest running `graphify --update` if files have changed since last build")
    }

    return parts.join("\n")
  })

  return Service.of({
    isEnabled,
    graphExists,
    graphReportPath,
    graphJsonPath,
    systemPromptSection,
  })
})

export const layer = Layer.effect(Service, make).pipe(
  Layer.provide(Config.layer),
)

export * as GraphifyFeature from "./graphify"
