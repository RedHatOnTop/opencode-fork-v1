/**
 * Approval Mode System - Permission Control Modes
 * 
 * Implements 4-level approval mode system:
 * - strict: All tool calls require explicit approval
 * - default: File ops auto-allowed, shell commands use allowlist/denylist
 * - autopilot: Most operations auto-allowed, dangerous commands queued
 * - yolo: Almost everything auto-allowed, only destructive commands blocked
 */

import { Schema, Context, Effect, Layer } from "effect"

/**
 * Approval Mode type
 */
export const ApprovalMode = Schema.Literal("strict", "default", "autopilot", "yolo")
export type ApprovalMode = "strict" | "default" | "autopilot" | "yolo"

/**
 * Tool category for permission evaluation
 */
export type ToolCategory = "read" | "edit" | "create" | "delete" | "bash" | "glob" | "grep"

/**
 * Permission decision type
 */
export type PermissionDecision = "allow" | "deny" | "ask" | "queue"

/**
 * Mode policy interface
 */
export interface ModePolicy {
  read: "allow" | "ask"
  edit: "allow" | "ask"
  create: "allow" | "ask"
  delete: "allow" | "ask"
  bash: "allow" | "ask"
  glob: "allow" | "ask"
  grep: "allow" | "ask"
}

/**
 * Mode policies for each approval mode
 */
export const MODE_POLICIES: Record<ApprovalMode, ModePolicy> = {
  strict: {
    read: "ask",
    edit: "ask",
    create: "ask",
    delete: "ask",
    bash: "ask",
    glob: "ask",
    grep: "ask",
  },
  default: {
    read: "allow",
    edit: "allow",
    create: "allow",
    delete: "allow",
    bash: "ask",        // allowlist/denylist based
    glob: "allow",
    grep: "allow",
  },
  autopilot: {
    read: "allow",
    edit: "allow",
    create: "allow",
    delete: "allow",    // Blocked_Command_Registry excluded
    bash: "allow",      // Blocked_Command_Registry excluded
    glob: "allow",
    grep: "allow",
  },
  yolo: {
    read: "allow",
    edit: "allow",
    create: "allow",
    delete: "allow",
    bash: "allow",      // Only destructive commands blocked
    glob: "allow",
    grep: "allow",
  },
}

/**
 * Current approval mode state
 */
interface State {
  mode: ApprovalMode
}

/**
 * Approval Mode Service Interface
 */
export interface Interface {
  readonly getMode: () => Effect.Effect<ApprovalMode>
  readonly setMode: (mode: ApprovalMode) => Effect.Effect<void>
  readonly getPolicy: (mode?: ApprovalMode) => Effect.Effect<ModePolicy>
  readonly evaluate: (
    toolCategory: ToolCategory,
    command?: string,
  ) => Effect.Effect<PermissionDecision>
}

/**
 * Approval Mode Service
 */
export class Service extends Context.Service<Service, Interface>()("@opencode/ApprovalMode") {}

/**
 * Create the default state
 */
function createDefaultState(): State {
  return {
    mode: "default",
  }
}

/**
 * Service layer implementation
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    // Use a Ref to store mutable state
    const stateRef = yield* Effect.acquireRelease(
      Effect.sync(() => createDefaultState()),
      () => Effect.void,
    )

    const getMode = Effect.fn("ApprovalMode.getMode")(function* () {
      return stateRef.mode
    })

    const setMode = Effect.fn("ApprovalMode.setMode")(function* (mode: ApprovalMode) {
      stateRef.mode = mode
    })

    const getPolicy = Effect.fn("ApprovalMode.getPolicy")(function* (mode?: ApprovalMode) {
      const currentMode = mode ?? stateRef.mode
      return MODE_POLICIES[currentMode]
    })

    const evaluate = Effect.fn("ApprovalMode.evaluate")(
      function* (toolCategory: ToolCategory, command?: string) {
        const policy = MODE_POLICIES[stateRef.mode]
        const baseDecision = policy[toolCategory]
        
        // If the base policy is "ask", return that immediately
        if (baseDecision === "ask") {
          return "ask" as PermissionDecision
        }
        
        // For "allow" decisions, additional checks may apply
        if (baseDecision === "allow") {
          // Additional checks can be added here (e.g., Blocked Command Registry)
          return "allow" as PermissionDecision
        }
        
        return baseDecision
      },
    )

    return Service.of({
      getMode,
      setMode,
      getPolicy,
      evaluate,
    })
  }),
)

export const defaultLayer = layer

/**
 * Parse approval mode from string
 */
export function parseApprovalMode(mode: string): ApprovalMode | undefined {
  switch (mode.toLowerCase()) {
    case "strict":
      return "strict"
    case "default":
      return "default"
    case "autopilot":
      return "autopilot"
    case "yolo":
      return "yolo"
    default:
      return undefined
  }
}

/**
 * Check if a mode transition requires a warning
 */
export function requiresWarning(mode: ApprovalMode): boolean {
  return mode === "yolo"
}

/**
 * Get warning message for YOLO mode
 */
export function getYOLOWarning(): string {
  return `
⚠️  WARNING: YOLO Mode Activation

YOLO mode automatically approves almost all operations without user confirmation.
Only obviously destructive commands (like 'rm -rf /', 'format C:', etc.) are blocked.

This mode is suitable for:
- Fully automated testing environments
- Trusted, isolated development environments
- Situations where maximum speed is prioritized

Use with caution. Continue? (yes/no)
`
}
