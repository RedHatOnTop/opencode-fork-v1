import { Context, Effect, Schema, Layer } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { platform } from "os"

const log = Log.create({ service: "notification" })

// ============================================================================
// Schema Definitions
// ============================================================================

export const NotificationType = Schema.Literals([
  "action_queue_item_added",
  "agent_blocked",
  "tasks_completed",
  "error_recovery_failed",
])
export type NotificationType = Schema.Schema.Type<typeof NotificationType>

export const NotificationConfig = Schema.Struct({
  enabled: Schema.Boolean,
})
export type NotificationConfig = Schema.Schema.Type<typeof NotificationConfig>

// ============================================================================
// Platform Detection
// ============================================================================

const getPlatform = (): "macos" | "linux" | "windows" | "unknown" => {
  const p = platform()
  if (p === "darwin") return "macos"
  if (p === "linux") return "linux"
  if (p === "win32") return "windows"
  return "unknown"
}

// ============================================================================
// Notification Commands
// ============================================================================

const macOSNotification = (title: string, message: string): string =>
  `osascript -e 'display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"'`

const linuxNotification = (title: string, message: string): string =>
  `notify-send "${title.replace(/"/g, '\\"')}" "${message.replace(/"/g, '\\"')}"`

const windowsNotification = (title: string, message: string): string =>
  `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${message.replace(/'/g, "''")}', '${title.replace(/'/g, "''")}', 'OK', 'Information')"`

// ============================================================================
// Service Interface
// ============================================================================

export interface Interface {
  readonly configure: (config: NotificationConfig) => Effect.Effect<void>
  readonly notify: (type: NotificationType, title: string, message: string) => Effect.Effect<void>
  readonly notifyActionQueueItemAdded: (count: number) => Effect.Effect<void>
  readonly notifyAgentBlocked: (reason: string) => Effect.Effect<void>
  readonly notifyTasksCompleted: () => Effect.Effect<void>
  readonly notifyErrorRecoveryFailed: (error: string) => Effect.Effect<void>
  readonly isEnabled: () => Effect.Effect<boolean>
}

// ============================================================================
// Service Implementation
// ============================================================================

const make = Effect.gen(function* () {
  let config: NotificationConfig = { enabled: true }
  const currentPlatform = getPlatform()

  const configure = (newConfig: NotificationConfig) =>
    Effect.sync(() => {
      config = newConfig
      log.debug("Notification configuration updated", { enabled: config.enabled })
    })

  const isEnabled = () => Effect.sync(() => config.enabled)

  const notify = (type: NotificationType, title: string, message: string) =>
    Effect.gen(function* () {
      if (!config.enabled) {
        log.debug("Notifications disabled, skipping", { type, title })
        return
      }

      log.debug("Sending notification", { type, title, platform: currentPlatform })

      if (currentPlatform === "unknown") {
        log.warn("Unknown platform, cannot send native notification")
        return
      }

      const command =
        currentPlatform === "macos"
          ? macOSNotification(title, message)
          : currentPlatform === "linux"
            ? linuxNotification(title, message)
            : windowsNotification(title, message)

      // Use Bun.spawn to execute the notification command
      const proc = Bun.spawn(command.split(" "), {
        stdout: "pipe",
        stderr: "pipe",
      })

      const exitCode = yield* Effect.promise(() => proc.exited)

      if (exitCode !== 0) {
        const stderr = yield* Effect.promise(() => new Response(proc.stderr).text())
        log.error("Notification command failed", { exitCode, stderr: stderr.slice(0, 200) })
      } else {
        log.debug("Notification sent successfully", { type, title })
      }
    })

  const notifyActionQueueItemAdded = (count: number) =>
    notify(
      "action_queue_item_added",
      "Opencode - Action Required",
      `${count} action${count === 1 ? "" : "s"} queued and waiting for your approval`
    )

  const notifyAgentBlocked = (reason: string) =>
    notify(
      "agent_blocked",
      "Opencode - Agent Blocked",
      `The agent needs your input to continue: ${reason.slice(0, 100)}`
    )

  const notifyTasksCompleted = () =>
    notify(
      "tasks_completed",
      "Opencode - Tasks Complete",
      "All tasks have been completed successfully"
    )

  const notifyErrorRecoveryFailed = (error: string) =>
    notify(
      "error_recovery_failed",
      "Opencode - Error Recovery Failed",
      `Could not recover from error: ${error.slice(0, 100)}`
    )

  return {
    configure,
    notify,
    notifyActionQueueItemAdded,
    notifyAgentBlocked,
    notifyTasksCompleted,
    notifyErrorRecoveryFailed,
    isEnabled,
  } satisfies Interface
})

// ============================================================================
// Service Export
// ============================================================================

export class Service extends Context.Service<Service, Interface>()("@opencode/Notification") {}

export const layer = Layer.effect(Service, make)
export const defaultLayer = layer

export * as Notification from "./notification"
