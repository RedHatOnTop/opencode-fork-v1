/**
 * Context Mentions — @-mention resolution for user prompts
 *
 * Resolves special @-mentions like @current-errors, @git-diff, etc.
 * into text content that gets injected into the agent context.
 *
 * Spec ref: opencode-enhanced R28
 *
 * @module mention/mention
 */

import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { Instance } from "@/project/instance"
import { InstanceState } from "@/effect/instance-state"

const log = Log.create({ service: "mention" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const MentionMatch = Schema.Struct({
  /** The full matched text including @, e.g. "@current-errors" */
  full: Schema.String,
  /** The mention name without @, e.g. "current-errors" */
  name: Schema.String,
  /** Optional parameter in parentheses, e.g. "10" from @git-log(10) */
  param: Schema.optional(Schema.String),
  /** Start index in the original text */
  index: Schema.Number,
  /** End index in the original text */
  endIndex: Schema.Number,
})
export type MentionMatch = Schema.Schema.Type<typeof MentionMatch>

export const MentionResult = Schema.Struct({
  mention: MentionMatch,
  /** The resolved text content */
  content: Schema.String,
  /** Whether resolution succeeded */
  success: Schema.Boolean,
  /** Error message if resolution failed */
  error: Schema.optional(Schema.String),
})
export type MentionResult = Schema.Schema.Type<typeof MentionResult>

// ---------------------------------------------------------------------------
// Regex for matching context mentions
// ---------------------------------------------------------------------------

/**
 * Matches @current-errors, @current-warnings, @current-issues,
 * @git-diff, @git-staged, @git-log, @git-log(10), etc.
 *
 * Does NOT match file paths like @src/foo.ts or @./bar.md
 * (those contain dots or slashes after the first character).
 */
export const MENTION_REGEX = /@(?<name>current-errors|current-warnings|current-issues|git-diff|git-staged|git-log)(?:\((?<param>\d+)\))?/g

// ---------------------------------------------------------------------------
// Built-in mention definitions
// ---------------------------------------------------------------------------

export interface MentionDefinition {
  /** The mention name without @ */
  name: string
  /** Description shown in autocomplete */
  description: string
  /** Whether this mention accepts a parameter */
  acceptsParam: boolean
  /** Default parameter value if acceptsParam is true */
  defaultParam?: string
  /** Resolve the mention to text content */
  resolve: (param?: string) => Effect.Effect<string, unknown, unknown>
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface Interface {
  readonly findMentions: (text: string) => MentionMatch[]
  readonly resolve: (mention: MentionMatch) => Effect.Effect<MentionResult, never, unknown>
  readonly resolveAll: (text: string) => Effect.Effect<{ text: string; results: MentionResult[] }, never, unknown>
  readonly listMentions: () => MentionDefinition[]
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Mention") {}

// ---------------------------------------------------------------------------
// Mention finding
// ---------------------------------------------------------------------------

export function findMentions(text: string): MentionMatch[] {
  const results: MentionMatch[] = []
  const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags)
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    results.push({
      full: match[0],
      name: match.groups!["name"]!,
      param: match.groups!["param"] ?? undefined,
      index: match.index,
      endIndex: match.index + match[0].length,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Service Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service

    // -----------------------------------------------------------------------
    // Built-in mention definitions
    // -----------------------------------------------------------------------

    const runVerification = Effect.fn("Mention.runVerification")(
      function* (filter: "error" | "warning" | "all") {
        const cfg = yield* config.get()
        const commands = cfg.verify?.commands ?? []
        if (commands.length === 0) {
          return "No verification commands configured. Add `verify.commands` to your opencode.jsonc."
        }

        const results: string[] = []
        for (const cmd of commands) {
          const result = yield* Effect.tryPromise({
            try: () => {
              const { spawn } = require("child_process") as typeof import("child_process")
              return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
                const child = spawn(cmd, [], { shell: true, cwd: process.cwd() })
                let stdout = ""
                let stderr = ""
                child.stdout?.on("data", (d: Buffer) => { stdout += d.toString() })
                child.stderr?.on("data", (d: Buffer) => { stderr += d.toString() })
                child.on("close", (code: number | null) => {
                  resolve({ exitCode: code ?? 0, stdout, stderr })
                })
                child.on("error", () => {
                  resolve({ exitCode: 1, stdout: "", stderr: `Failed to run: ${cmd}` })
                })
              })
            },
            catch: (e: unknown) => new Error(String(e)),
          })

          const output = result.stdout + "\n" + result.stderr
          if (result.exitCode !== 0) {
            const lines = output.split("\n").filter((l: string) => {
              const lower = l.toLowerCase()
              if (filter === "error") return lower.includes("error") && !lower.includes("warning")
              if (filter === "warning") return lower.includes("warning")
              return true // "all"
            })
            if (lines.length > 0) {
              results.push(`$ ${cmd}\n${lines.join("\n")}`)
            }
          }
        }

        if (results.length === 0) {
          return filter === "all"
            ? "No issues found. All verification commands passed."
            : `No ${filter}s found. All verification commands passed.`
        }

        return results.join("\n\n")
      },
    )

    const getGitDiff = Effect.fn("Mention.getGitDiff")(function* (staged: boolean) {
      const ctx = yield* InstanceState.context
      const git = yield* Git.Service

      const args = staged
        ? ["diff", "--cached", "--stat", "-p"]
        : ["diff", "--stat", "-p"]

      const result = yield* git.run(args, { cwd: ctx.worktree })
      if (result.exitCode !== 0) {
        return `Failed to get git diff: ${result.stderr.toString().slice(0, 500)}`
      }

      const text = result.text()
      if (!text.trim()) {
        return staged ? "No staged changes." : "No unstaged changes."
      }

      // Truncate to reasonable size (spec R28: token budget)
      const MAX_CHARS = 20_000
      if (text.length > MAX_CHARS) {
        return text.slice(0, MAX_CHARS) + "\n\n... (truncated)"
      }
      return text
    })

    const getGitLog = Effect.fn("Mention.getGitLog")(function* (count: number) {
      const ctx = yield* InstanceState.context
      const git = yield* Git.Service

      const result = yield* git.run(
        ["log", `-${count}`, "--oneline", "--decorate", "--color=never"],
        { cwd: ctx.worktree },
      )

      if (result.exitCode !== 0) {
        return `Failed to get git log: ${result.stderr.toString().slice(0, 500)}`
      }

      const text = result.text()
      if (!text.trim()) {
        return "No commits found."
      }
      return text
    })

    // -----------------------------------------------------------------------
    // Mention definitions map
    // -----------------------------------------------------------------------

    const definitions: Record<string, MentionDefinition> = {
      "current-errors": {
        name: "current-errors",
        description: "Current project build/typecheck/lint errors",
        acceptsParam: false,
        resolve: () => runVerification("error"),
      },
      "current-warnings": {
        name: "current-warnings",
        description: "Current project build/typecheck/lint warnings",
        acceptsParam: false,
        resolve: () => runVerification("warning"),
      },
      "current-issues": {
        name: "current-issues",
        description: "All current project errors and warnings",
        acceptsParam: false,
        resolve: () => runVerification("all"),
      },
      "git-diff": {
        name: "git-diff",
        description: "Unstaged changes diff",
        acceptsParam: false,
        resolve: () => getGitDiff(false),
      },
      "git-staged": {
        name: "git-staged",
        description: "Staged changes diff",
        acceptsParam: false,
        resolve: () => getGitDiff(true),
      },
      "git-log": {
        name: "git-log",
        description: "Recent commit history",
        acceptsParam: true,
        defaultParam: "10",
        resolve: (param) => getGitLog(parseInt(param ?? "10", 10)),
      },
    }

    // -----------------------------------------------------------------------
    // Service methods
    // -----------------------------------------------------------------------

    const resolveMention = Effect.fn("Mention.resolve")(
      function* (mention: MentionMatch) {
        const def = definitions[mention.name]
        if (!def) {
          return {
            mention,
            content: "",
            success: false,
            error: `Unknown mention: @${mention.name}`,
          }
        }

        const result = yield* def
          .resolve(mention.param)
          .pipe(
            Effect.map((content: string) => ({
              mention,
              content,
              success: true,
            })),
            Effect.catch((err: unknown) =>
              Effect.succeed({
                mention,
                content: "",
                success: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            ),
          )

        return result
      },
    )

    const resolveAll = Effect.fn("Mention.resolveAll")(
      function* (text: string) {
        const mentions = findMentions(text)
        if (mentions.length === 0) {
          return { text, results: [] }
        }

        const results: MentionResult[] = []
        let modifiedText = text

        // Resolve mentions in reverse order to preserve indices
        const sorted = [...mentions].sort((a, b) => b.index - a.index)

        for (const mention of sorted) {
          const result = yield* resolveMention(mention)
          results.push(result)

          if (result.success && result.content) {
            // Replace the @mention with the resolved content wrapped in tags
            const replacement = `<context-mention name="${mention.name}">\n${result.content}\n</context-mention>`
            modifiedText =
              modifiedText.slice(0, mention.index) +
              replacement +
              modifiedText.slice(mention.endIndex)
          }
        }

        // Sort results by original index
        results.sort((a, b) => a.mention.index - b.mention.index)

        log.info("Resolved mentions", {
          count: results.length,
          names: results.map((r) => r.mention.name),
        })

        return { text: modifiedText, results }
      },
    )

    const listMentions = () => Object.values(definitions)

    return Service.of({
      findMentions,
      resolve: resolveMention,
      resolveAll,
      listMentions,
    })
  }),
)

export const defaultLayer = layer
