/**
 * Workflow Engine - Spec and Vibe Mode Management
 *
 * Manages workflow modes and their associated system prompt injections.
 * - spec: Detailed planning mode with step-by-step task execution
 *   - 4-phase pipeline: Plan → Execute → Verify → Ship
 * - vibe: Quick exploration mode with minimal planning
 *
 * Spec ref: opencode-enhanced R6, R7
 *
 * @module workflow
 */

import { Schema, Context, Effect, Layer, Option, Ref } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"

const log = Log.create({ service: "workflow" })

// ---------------------------------------------------------------------------
// Workflow mode types
// ---------------------------------------------------------------------------

export const WorkflowMode = Schema.Literals(["spec", "vibe"])
export type WorkflowMode = "spec" | "vibe"

// ---------------------------------------------------------------------------
// Spec mode phase types (4-step pipeline)
// ---------------------------------------------------------------------------

export const WorkflowPhase = Schema.Literals(["plan", "execute", "verify", "ship", "idle"])
export type WorkflowPhase = "plan" | "execute" | "verify" | "ship" | "idle"

// ---------------------------------------------------------------------------
// Phase transition events
// ---------------------------------------------------------------------------

export const Event = {
  PhaseChanged: BusEvent.define(
    "workflow.phase_changed",
    Schema.Struct({
      previousPhase: WorkflowPhase,
      newPhase: WorkflowPhase,
      mode: WorkflowMode,
    }),
  ),
  ModeChanged: BusEvent.define(
    "workflow.mode_changed",
    Schema.Struct({
      previousMode: WorkflowMode,
      newMode: WorkflowMode,
    }),
  ),
}

// ---------------------------------------------------------------------------
// Mode configuration
// ---------------------------------------------------------------------------

export interface ModeConfig {
  mode: WorkflowMode
  specFile?: string // Path to .md spec file (for spec mode)
  autoConvertTasks: boolean // Auto-convert spec to tasks
  enableReflection: boolean // Enable quality checkpoints
}

// ---------------------------------------------------------------------------
// Workflow state
// ---------------------------------------------------------------------------

export interface WorkflowState {
  currentMode: WorkflowMode
  config: ModeConfig
  activeSpec?: string // Content of loaded spec file
  taskIds: string[] // Tracked task IDs for spec mode
  // 4-phase pipeline state
  currentPhase: WorkflowPhase
  phaseHistory: Array<{ phase: WorkflowPhase; enteredAt: number; exitedAt?: number }>
  verificationResults?: Array<{ command: string; success: boolean; output?: string }>
}

// ---------------------------------------------------------------------------
// Phase transition logic
// ---------------------------------------------------------------------------

/**
 * Determine the next phase based on current phase and conditions.
 *
 * Pipeline: idle → plan → execute → verify → (execute if failed | ship if passed) → idle
 */
export function nextPhase(
  current: WorkflowPhase,
  verificationPassed?: boolean,
  hasPendingTasks?: boolean,
): WorkflowPhase {
  switch (current) {
    case "idle":
      return "plan"
    case "plan":
      return "execute"
    case "execute":
      return "verify"
    case "verify":
      if (verificationPassed === false && hasPendingTasks) {
        return "execute" // Loop back for auto-fix
      }
      return "ship"
    case "ship":
      return "idle"
    default:
      return "idle"
  }
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface Interface {
  // Mode management
  readonly getMode: () => Effect.Effect<WorkflowMode>
  readonly setMode: (mode: WorkflowMode, config?: Partial<ModeConfig>) => Effect.Effect<void>
  readonly getConfig: () => Effect.Effect<ModeConfig>
  readonly loadSpec: (filepath: string) => Effect.Effect<string>
  readonly getSystemPromptInjection: () => Effect.Effect<Option.Option<string>>
  readonly isSpecMode: () => Effect.Effect<boolean>
  readonly isVibeMode: () => Effect.Effect<boolean>

  // 4-phase pipeline management
  readonly getPhase: () => Effect.Effect<WorkflowPhase>
  readonly advancePhase: (verificationPassed?: boolean, hasPendingTasks?: boolean) => Effect.Effect<WorkflowPhase>
  readonly resetPhase: () => Effect.Effect<void>
  readonly getPhaseHistory: () => Effect.Effect<Array<{ phase: WorkflowPhase; enteredAt: number; exitedAt?: number }>>
  readonly setVerificationResults: (results: Array<{ command: string; success: boolean; output?: string }>) => Effect.Effect<void>
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/Workflow") {}

// ---------------------------------------------------------------------------
// System prompt injections
// ---------------------------------------------------------------------------

const SPEC_MODE_PROMPT = `
# SPEC MODE ACTIVATED

You are in detailed specification mode. Follow these guidelines:

## Task Planning
1. Break down all requests into explicit, numbered steps
2. Create a task list before starting implementation
3. Mark tasks as [IN_PROGRESS], [BLOCKED], or [DONE]
4. Update task status after each significant action

## Quality Checkpoints
- Verify each step before proceeding
- Ask clarifying questions for ambiguous requirements
- Validate assumptions explicitly
- Document design decisions

## Completion Criteria
- All tasks must be marked [DONE]
- Summary of changes must be provided
- Tests must pass (if applicable)
- User confirmation required before major architectural changes

Current mode: SPEC
Focus: Thoroughness and accuracy over speed
`

const VIBE_MODE_PROMPT = `
# VIBE MODE ACTIVATED

You are in quick exploration mode. Follow these guidelines:

## Approach
- Move fast and iterate quickly
- Make reasonable assumptions without excessive questioning
- Prefer working code over perfect documentation
- Learn by doing

## Constraints
- Focus on core functionality
- Skip edge cases initially (mark with TODO comments)
- Minimal test coverage for now
- Quick prototypes are valued

## When to Switch
If you find yourself:
- Writing more than 5 steps of planning
- Spending >10 minutes on a single file
- The task involves critical/sensitive operations

Consider switching to /spec mode for better tracking.

Current mode: VIBE
Focus: Speed and exploration over perfection
`

// ---------------------------------------------------------------------------
// Phase-specific prompt additions
// ---------------------------------------------------------------------------

function phasePrompt(phase: WorkflowPhase): string {
  switch (phase) {
    case "plan":
      return `
## CURRENT PHASE: PLAN
You are in the PLAN phase. Your job is to:
1. Explore the codebase to understand the current state
2. Break down the task into a structured checklist
3. Identify dependencies between tasks
4. Present the plan to the user before executing
Do NOT make any code changes yet. Only read and analyze.
`
    case "execute":
      return `
## CURRENT PHASE: EXECUTE
You are in the EXECUTE phase. Your job is to:
1. Execute tasks one at a time in dependency order
2. Mark each task as [IN_PROGRESS] before starting
3. Mark each task as [DONE] after completion
4. Report progress after each task
`
    case "verify":
      return `
## CURRENT PHASE: VERIFY
You are in the VERIFY phase. Your job is to:
1. Run all configured verification commands (lint, typecheck, test)
2. If failures are found, attempt automatic fixes
3. Re-run verification after fixes
4. Report final verification status
`
    case "ship":
      return `
## CURRENT PHASE: SHIP
You are in the SHIP phase. Your job is to:
1. Commit all changes with a descriptive message
2. Generate a summary of all changes made
3. Report the final status to the user
`
    default:
      return ""
  }
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

function createDefaultConfig(mode: WorkflowMode): ModeConfig {
  return {
    mode,
    autoConvertTasks: mode === "spec",
    enableReflection: mode === "spec",
  }
}

// ---------------------------------------------------------------------------
// Service Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service

    const state = yield* Ref.make<WorkflowState>({
      currentMode: "vibe",
      config: createDefaultConfig("vibe"),
      taskIds: [],
      currentPhase: "idle",
      phaseHistory: [],
    })

    // -----------------------------------------------------------------------
    // Mode management
    // -----------------------------------------------------------------------

    const getMode = Effect.fn("Workflow.getMode")(function* () {
      const s = yield* Ref.get(state)
      return s.currentMode
    })

    const setMode = Effect.fn("Workflow.setMode")(function* (mode: WorkflowMode, config?: Partial<ModeConfig>) {
      const s = yield* Ref.get(state)
      const previousMode = s.currentMode

      const newConfig: ModeConfig = {
        ...createDefaultConfig(mode),
        ...config,
        mode,
      }

      const newState: WorkflowState = {
        ...s,
        currentMode: mode,
        config: newConfig,
        // Reset phase pipeline when switching modes
        currentPhase: mode === "spec" ? "idle" : "idle",
        phaseHistory: mode === "spec" ? s.phaseHistory : [],
      }

      yield* Ref.set(state, newState)

      yield* bus.publish(Event.ModeChanged, {
        previousMode,
        newMode: mode,
      })

      log.info("Workflow mode changed", { from: previousMode, to: mode })
    })

    const getConfig = Effect.fn("Workflow.getConfig")(function* () {
      const s = yield* Ref.get(state)
      return s.config
    })

    const loadSpec = Effect.fn("Workflow.loadSpec")(function* (filepath: string) {
      const content = yield* Effect.tryPromise({
        try: () => import("fs/promises").then((fs) => fs.readFile(filepath, "utf-8")),
        catch: (e: unknown) => new Error(`Failed to load spec file: ${filepath}: ${e}`),
      }).pipe(Effect.orDie)

      yield* Ref.update(state, (s) => ({
        ...s,
        activeSpec: content,
        config: {
          ...s.config,
          specFile: filepath,
        },
      }))

      log.info("Spec file loaded", { filepath })
      return content
    })

    const getSystemPromptInjection = Effect.fn("Workflow.getSystemPromptInjection")(function* () {
      const s = yield* Ref.get(state)

      if (s.currentMode === "spec") {
        const basePrompt = SPEC_MODE_PROMPT
        const phaseAddition = s.currentPhase !== "idle" ? phasePrompt(s.currentPhase) : ""
        return Option.some(basePrompt + "\n" + phaseAddition)
      } else if (s.currentMode === "vibe") {
        return Option.some(VIBE_MODE_PROMPT)
      }
      return Option.none()
    })

    const isSpecMode = Effect.fn("Workflow.isSpecMode")(function* () {
      const s = yield* Ref.get(state)
      return s.currentMode === "spec"
    })

    const isVibeMode = Effect.fn("Workflow.isVibeMode")(function* () {
      const s = yield* Ref.get(state)
      return s.currentMode === "vibe"
    })

    // -----------------------------------------------------------------------
    // 4-phase pipeline management
    // -----------------------------------------------------------------------

    const getPhase = Effect.fn("Workflow.getPhase")(function* () {
      const s = yield* Ref.get(state)
      return s.currentPhase
    })

    const advancePhase = Effect.fn("Workflow.advancePhase")(
      function* (verificationPassed?: boolean, hasPendingTasks?: boolean) {
        const s = yield* Ref.get(state)

        // Only advance in spec mode
        if (s.currentMode !== "spec") {
          return s.currentPhase
        }

        const previousPhase = s.currentPhase
        const newPhase = nextPhase(previousPhase, verificationPassed, hasPendingTasks)

        if (newPhase === previousPhase) {
          return previousPhase
        }

        // Record phase exit
        const updatedHistory = s.phaseHistory.map((entry, i) => {
          if (i === s.phaseHistory.length - 1 && entry.exitedAt === undefined) {
            return { ...entry, exitedAt: Date.now() }
          }
          return entry
        })

        // Record phase entry
        updatedHistory.push({
          phase: newPhase,
          enteredAt: Date.now(),
        })

        yield* Ref.update(state, (s) => ({
          ...s,
          currentPhase: newPhase,
          phaseHistory: updatedHistory,
        }))

        yield* bus.publish(Event.PhaseChanged, {
          previousPhase,
          newPhase,
          mode: s.currentMode,
        })

        log.info("Workflow phase advanced", {
          from: previousPhase,
          to: newPhase,
          verificationPassed,
          hasPendingTasks,
        })

        return newPhase
      },
    )

    const resetPhase = Effect.fn("Workflow.resetPhase")(function* () {
      yield* Ref.update(state, (s): WorkflowState => ({
        ...s,
        currentPhase: "idle",
        phaseHistory: [],
        verificationResults: undefined,
      }))

      log.info("Workflow phase reset")
    })

    const getPhaseHistory = Effect.fn("Workflow.getPhaseHistory")(function* () {
      const s = yield* Ref.get(state)
      return s.phaseHistory
    })

    const setVerificationResults = Effect.fn("Workflow.setVerificationResults")(
      function* (results: Array<{ command: string; success: boolean; output?: string }>) {
        yield* Ref.update(state, (s) => ({
          ...s,
          verificationResults: results,
        }))

        log.info("Verification results stored", {
          total: results.length,
          passed: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
        })
      },
    )

    // -----------------------------------------------------------------------
    // Return service
    // -----------------------------------------------------------------------

    return Service.of({
      getMode,
      setMode,
      getConfig,
      loadSpec,
      getSystemPromptInjection,
      isSpecMode,
      isVibeMode,
      getPhase,
      advancePhase,
      resetPhase,
      getPhaseHistory,
      setVerificationResults,
    })
  }),
)

export const defaultLayer = layer

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Helper: Get prompt injection for session system builder
 */
export function getWorkflowPrompt() {
  return Effect.gen(function* () {
    const service = yield* Service
    return yield* service.getSystemPromptInjection()
  })
}

/**
 * Helper: Check if in spec mode
 */
export function isSpecMode() {
  return Effect.gen(function* () {
    const service = yield* Service
    return yield* service.isSpecMode()
  })
}

/**
 * Helper: Check if in vibe mode
 */
export function isVibeMode() {
  return Effect.gen(function* () {
    const service = yield* Service
    return yield* service.isVibeMode()
  })
}

export * as Workflow from "./workflow"
