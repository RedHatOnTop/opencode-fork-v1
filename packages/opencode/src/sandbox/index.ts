/**
 * Sandbox module for opencode-fork-v1.
 *
 * Provides Docker-based sandbox isolation where the AI agent's
 * bash commands execute inside an Alpine Linux container rather
 * than directly on the host.
 *
 * Usage:
 *   import { Sandbox } from "@/sandbox"
 *   // Session start
 *   await SandboxLifecycle.start(workspaceDir, sessionId, config)
 *   // ... agent runs with tools ...
 *   // Session end
 *   await SandboxLifecycle.stop()
 */
export { Sandbox } from "./state"
export * as Docker from "./docker"
export * as Lifecycle from "./lifecycle"
