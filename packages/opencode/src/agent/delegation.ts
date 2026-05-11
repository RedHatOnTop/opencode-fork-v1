/**
 * Sub-Agent Delegation Engine — Keyword-based auto-routing
 *
 * Analyzes user input and task context to determine which specialized
 * sub-agent should handle the task, then delegates accordingly.
 *
 * Spec ref: opencode-enhanced R9
 *
 * @module agent/delegation
 */

import { Context, Effect, Layer, Option, Schema } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { SubAgent, type SubAgentType } from "./subagent"

const log = Log.create({ service: "delegation" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const DelegationResult = Schema.Struct({
  /** The selected agent type */
  agentType: Schema.String,
  /** Confidence score (0-1) */
  confidence: Schema.Number,
  /** Matched keywords that triggered the delegation */
  matchedKeywords: Schema.Array(Schema.String),
  /** Whether this was an automatic or manual delegation */
  automatic: Schema.Boolean,
})
export type DelegationResult = Schema.Schema.Type<typeof DelegationResult>

// ---------------------------------------------------------------------------
// Keyword patterns for each agent type
// ---------------------------------------------------------------------------

const DELEGATION_KEYWORDS: Record<string, Array<{ pattern: RegExp; weight: number }>> = {
  planner: [
    { pattern: /\b(plan|planning|plans)\b/i, weight: 3.0 },
    { pattern: /\b(architecture|architectural|design system)\b/i, weight: 2.5 },
    { pattern: /\b(roadmap|strategy|milestone)\b/i, weight: 2.5 },
    { pattern: /\b(break down|decompose|work breakdown)\b/i, weight: 3.0 },
    { pattern: /\b(task list|task plan|step by step)\b/i, weight: 2.0 },
    { pattern: /\b(organize|structure|phase)\b/i, weight: 1.5 },
    { pattern: /\b(WBS|technical design|system design)\b/i, weight: 3.0 },
  ],
  "code-reviewer": [
    { pattern: /\b(code review|review code|review this|review my)\b/i, weight: 3.0 },
    { pattern: /\b(quality check|code quality)\b/i, weight: 2.5 },
    { pattern: /\b(maintainability|clean code)\b/i, weight: 2.0 },
    { pattern: /\b(design pattern|anti-pattern|code smell)\b/i, weight: 2.5 },
    { pattern: /\b(PR review|pull request review)\b/i, weight: 3.0 },
    { pattern: /\b(refactor suggestion|improve code|best practice)\b/i, weight: 2.0 },
    { pattern: /\b(review)\b/i, weight: 1.0 },
  ],
  "security-reviewer": [
    { pattern: /\b(security audit|security review)\b/i, weight: 3.0 },
    { pattern: /\b(vulnerability|vulnerable)\b/i, weight: 3.0 },
    { pattern: /\b(authentication|authorization)\b/i, weight: 2.5 },
    { pattern: /\b(sanitize|sanitize|XSS|CSRF|SQL injection)\b/i, weight: 3.0 },
    { pattern: /\b(encrypt|encryption|TLS|SSL)\b/i, weight: 2.5 },
    { pattern: /\b(compliance|OWASP|threat model)\b/i, weight: 3.0 },
    { pattern: /\b(security|secure)\b/i, weight: 1.5 },
    { pattern: /\b(pentest|SAST|DAST|SBOM)\b/i, weight: 3.0 },
  ],
  "build-error-resolver": [
    { pattern: /\b(build error|build fail|build failure)\b/i, weight: 3.0 },
    { pattern: /\b(compilation error|compile error|won't compile)\b/i, weight: 3.0 },
    { pattern: /\b(CI|CD|pipeline|GitHub Actions)\b/i, weight: 2.0 },
    { pattern: /\b(type error|typecheck error|type error)\b/i, weight: 2.5 },
    { pattern: /\b(lint error|lint fail)\b/i, weight: 2.5 },
    { pattern: /\b(test fail|test failure|tests failing)\b/i, weight: 2.0 },
    { pattern: /\b(debug|fix error|fix build)\b/i, weight: 2.0 },
    { pattern: /\b(error|failed|failure)\b/i, weight: 0.5 },
  ],
  "refactor-cleaner": [
    { pattern: /\b(refactor|refactoring)\b/i, weight: 3.0 },
    { pattern: /\b(clean up|cleanup|code cleanup)\b/i, weight: 2.5 },
    { pattern: /\b(tech debt|technical debt)\b/i, weight: 3.0 },
    { pattern: /\b(simplify|simplification)\b/i, weight: 2.0 },
    { pattern: /\b(restructure|reorganize code)\b/i, weight: 2.0 },
    { pattern: /\b(deduplicate|remove duplication)\b/i, weight: 2.5 },
    { pattern: /\b(improve structure|code organization)\b/i, weight: 2.0 },
  ],
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface Interface {
  /** Analyze input text and determine the best sub-agent */
  readonly analyze: (input: string) => Effect.Effect<DelegationResult>
  /** Get all agent scores for an input (for debugging/display) */
  readonly getScores: (input: string) => Effect.Effect<Record<string, number>>
  /** Check if a specific agent should be used for the given input */
  readonly shouldDelegate: (input: string, agentType: SubAgentType) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Delegation") {}

// ---------------------------------------------------------------------------
// Scoring logic
// ---------------------------------------------------------------------------

function scoreInput(input: string): Record<string, { score: number; keywords: string[] }> {
  const results: Record<string, { score: number; keywords: string[] }> = {}

  for (const [agentType, patterns] of Object.entries(DELEGATION_KEYWORDS)) {
    let score = 0
    const keywords: string[] = []

    for (const { pattern, weight } of patterns) {
      const matches = input.match(pattern)
      if (matches) {
        score += weight
        keywords.push(...matches.map((m) => m.toLowerCase()))
      }
    }

    results[agentType] = { score, keywords: [...new Set(keywords)] }
  }

  return results
}

// ---------------------------------------------------------------------------
// Service Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const subAgent = yield* SubAgent.Service

    const analyze = Effect.fn("Delegation.analyze")(function* (input: string) {
      const scores = scoreInput(input)

      // Find the agent with the highest score
      let bestAgent: string = "orchestrator"
      let bestScore = 0
      let bestKeywords: string[] = []

      for (const [agentType, { score, keywords }] of Object.entries(scores)) {
        if (score > bestScore) {
          bestScore = score
          bestAgent = agentType
          bestKeywords = keywords
        }
      }

      // Require minimum confidence threshold
      const confidence = Math.min(bestScore / 5.0, 1.0)
      const threshold = 0.4

      if (confidence < threshold) {
        log.info("No strong delegation match, using orchestrator", {
          bestAgent,
          confidence,
          threshold,
        })
        return {
          agentType: "orchestrator",
          confidence: 0,
          matchedKeywords: [],
          automatic: false,
        }
      }

      log.info("Delegation analysis complete", {
        input: input.slice(0, 100),
        bestAgent,
        confidence,
        keywords: bestKeywords,
      })

      return {
        agentType: bestAgent,
        confidence,
        matchedKeywords: bestKeywords,
        automatic: true,
      }
    })

    const getScores = Effect.fn("Delegation.getScores")(function* (input: string) {
      const scores = scoreInput(input)
      const result: Record<string, number> = {}
      for (const [agent, { score }] of Object.entries(scores)) {
        result[agent] = score
      }
      return result
    })

    const shouldDelegate = Effect.fn("Delegation.shouldDelegate")(
      function* (input: string, agentType: SubAgentType) {
        const result = yield* analyze(input)
        return result.agentType === agentType && result.confidence >= 0.4
      },
    )

    return Service.of({ analyze, getScores, shouldDelegate })
  }),
)

export const defaultLayer = layer
