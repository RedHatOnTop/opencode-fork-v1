/**
 * Workflow Engine - Spec and Vibe Mode Management
 *
 * Manages workflow modes and their associated system prompt injections.
 * - spec: Detailed planning mode with step-by-step task execution
 * - vibe: Quick exploration mode with minimal planning
 */

import { Schema, Context, Effect, Layer, Option, Array as EffectArray } from "effect"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "workflow" })

/**
 * Workflow mode types
 */
export const WorkflowMode = Schema.Literal("spec", "vibe")
export type WorkflowMode = "spec" | "vibe"

/**
 * Mode configuration
 */
export interface ModeConfig {
  mode: WorkflowMode
  specFile?: string // Path to .md spec file (for spec mode)
  autoConvertTasks: boolean // Auto-convert spec to tasks
  enableReflection: boolean // Enable quality checkpoints
}

/**
 * Workflow state
 */
export interface WorkflowState {
  currentMode: WorkflowMode
  config: ModeConfig
  activeSpec?: string // Content of loaded spec file
  taskIds: string[] // Tracked task IDs for spec mode
}

/**
 * Workflow Service Interface
 */
export interface Interface {
  readonly getMode: Effect.Effect<WorkflowMode>
  readonly setMode: (mode: WorkflowMode, config?: Partial<ModeConfig>) => Effect.Effect<void>
  readonly getConfig: Effect.Effect<ModeConfig>
  readonly loadSpec: (filepath: string) => Effect.Effect<string>
  readonly getSystemPromptInjection: Effect.Effect<Option.Option<string>>
  readonly isSpecMode: Effect.Effect<boolean>
  readonly isVibeMode: Effect.Effect<boolean>
}

/**
 * Workflow Service
 */
export class Service extends Context.Service<Service, Interface>()("@opencode/Workflow") {}

// In-memory state
interface State {
  state: WorkflowState
}

/**
 * Spec mode system prompt injection
 */
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

/**
 * Vibe mode system prompt injection
 */
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

/**
 * Create default mode config
 */
function createDefaultConfig(mode: WorkflowMode): ModeConfig {
  return {
    mode,
    autoConvertTasks: mode === "spec",
    enableReflection: mode === "spec",
  }
}

/**
 * Service layer implementation
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state: State = {
      state: {
        currentMode: "vibe", // Default to vibe mode
        config: createDefaultConfig("vibe"),
        taskIds: [],
      },
    }

    // Create the service implementation
    const serviceImpl: Interface = {
      getMode: Effect.sync(() => state.state.currentMode),
      setMode: (mode: WorkflowMode, config?: Partial<ModeConfig>) =>
        Effect.sync(() => {
          const newConfig = {
            ...createDefaultConfig(mode),
            ...config,
            mode,
          }

          state.state = {
            ...state.state,
            currentMode: mode,
            config: newConfig,
          }

          log.info("Workflow mode changed", { from: state.state.currentMode, to: mode })
        }),
      getConfig: Effect.sync(() => state.state.config),
      loadSpec: (filepath: string) =>
        Effect.sync(() => {
          // In actual implementation, this would read from filesystem
          // For now, return a placeholder
          const content = `[Spec file: ${filepath}]\n\n# Specification\n\nThis is a placeholder for the actual spec file content.\nIn production, this would load from: ${filepath}`

          state.state = {
            ...state.state,
            activeSpec: content,
            config: {
              ...state.state.config,
              specFile: filepath,
            },
          }

          log.info("Spec file loaded", { filepath })
          return content
        }),
      getSystemPromptInjection: Effect.sync(() => {
        if (state.state.currentMode === "spec") {
          return Option.some(SPEC_MODE_PROMPT)
        } else if (state.state.currentMode === "vibe") {
          return Option.some(VIBE_MODE_PROMPT)
        }
        return Option.none()
      }),
      isSpecMode: Effect.sync(() => state.state.currentMode === "spec"),
      isVibeMode: Effect.sync(() => state.state.currentMode === "vibe"),
    }

    return Service.of(serviceImpl)
  })
)

export const defaultLayer = layer

/**
 * Helper: Get prompt injection for session system builder
 */
export function getWorkflowPrompt(): Effect.Effect<Option.Option<string>> {
  return Effect.gen(function* () {
    const service = yield* Service
    return yield* service.getSystemPromptInjection
  })
}

/**
 * Helper: Check if in spec mode
 */
export function isSpecMode(): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    const service = yield* Service
    return yield* service.isSpecMode
  })
}

/**
 * Helper: Check if in vibe mode
 */
export function isVibeMode(): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    const service = yield* Service
    return yield* service.isVibeMode
  })
}
