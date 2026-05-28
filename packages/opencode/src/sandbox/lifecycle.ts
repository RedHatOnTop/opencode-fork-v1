/**
 * Sandbox lifecycle management (session-level).
 *
 * Starts a Docker sandbox container when a session begins and
 * tears it down when the session ends.
 *
 * Design: One container per session. The container persists across
 * multiple agent turns within the same session. Installed packages
 * and temporary files survive until the session ends.
 */
import { Sandbox } from "./state"
import * as Docker from "./docker"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "sandbox.lifecycle" })

const DEFAULT_NETWORK = "bridge" as const

export interface LifecycleConfig {
  enabled: boolean
  image?: string
  network?: "bridge" | "none"
}

/**
 * Start a sandbox session.
 *
 * Called at the beginning of a new opencode session.
 * - If sandbox is enabled and Docker is available → creates Alpine container
 * - If Docker is unavailable → falls back to host mode with a warning
 * - If sandbox is disabled → stays in host mode
 */
export async function start(
  workspaceDir: string,
  sessionId: string,
  config: LifecycleConfig,
): Promise<{ mode: "docker" | "host"; warning?: string }> {
  if (!config.enabled) {
    log.info("sandbox disabled by config")
    Sandbox.clear()
    return { mode: "host" }
  }

  const available = await Docker.isAvailable()
  if (!available) {
    log.warn("Docker not available, falling back to host mode")
    Sandbox.clear()
    return {
      mode: "host",
      warning: "⚠️  Docker not found. Sandbox isolation is disabled — commands run on host.",
    }
  }

  try {
    const { containerId } = await Docker.createContainer(workspaceDir, sessionId, {
      image: config.image,
      network: config.network ?? DEFAULT_NETWORK,
    })

    Sandbox.docker = {
      type: "docker",
      containerId,
      workspaceDir,
    }

    log.info("sandbox session started", { containerId, workspaceDir })
    return { mode: "docker" }
  } catch (error) {
    log.error("failed to create sandbox container", { error: String(error) })
    Sandbox.clear()
    return {
      mode: "host",
      warning: `⚠️  Sandbox container creation failed: ${String(error)}. Running on host.`,
    }
  }
}

/**
 * Stop the current sandbox session.
 *
 * Removes the Docker container and cleans up.
 * Safe to call even if no sandbox is active (no-op).
 */
export async function stop(): Promise<void> {
  if (!Sandbox.isDocker) return

  const id = Sandbox.containerId!
  try {
    await Docker.removeContainer(id)
    log.info("sandbox session stopped", { containerId: id })
  } catch (error) {
    log.error("failed to remove sandbox container", { containerId: id, error: String(error) })
  } finally {
    Sandbox.clear()
  }
}

/**
 * Clean up any orphaned sandbox containers (e.g. from a crash).
 * Called during startup or via `opencode sandbox cleanup`.
 */
export async function cleanupOrphans(): Promise<void> {
  const containers = await Docker.listContainers()
  if (containers.length === 0) return
  log.info("cleaning up orphaned sandbox containers", { count: containers.length })
  for (const name of containers) {
    await Process.run(["docker", "rm", "-f", name], { nothrow: true })
  }
}

// Lazy import to avoid cycle at module load time
import { Process } from "@/util/process"
