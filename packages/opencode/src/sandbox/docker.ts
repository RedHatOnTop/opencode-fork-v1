/**
 * Docker container utilities for the sandbox provider.
 *
 * Manages Alpine container lifecycle: create, exec, destroy.
 * All bash commands are routed through the container when sandbox mode is active.
 */
import { Process } from "@/util/process"
import type { Child } from "@/util/process"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "sandbox.docker" })

const DEFAULT_IMAGE = "opencode-sandbox:alpine"

/**
 * Check whether Docker daemon is available on the host.
 * Returns false if Docker is not installed or not running.
 */
export async function isAvailable(): Promise<boolean> {
  try {
    const result = await Process.run(["docker", "ps"], { nothrow: true, timeout: 5000 })
    return result.code === 0
  } catch {
    return false
  }
}

/**
 * Ensure the sandbox image is available locally.
 *
 * For the default image (opencode-sandbox:alpine) we pull alpine:3.21
 * from Docker Hub, tag it, and install the required packages.
 * This avoids filesystem path issues in both dev and bundled production builds.
 *
 * For custom images, we attempt a `docker pull` from a registry.
 */
export async function ensureImage(image: string = DEFAULT_IMAGE): Promise<void> {
  const result = await Process.run(["docker", "image", "inspect", image], { nothrow: true })
  if (result.code === 0) return

  if (image === DEFAULT_IMAGE) {
    // Build the sandbox image from alpine:3.21 base.
    // We build directly from alpine:3.21 (not a pre-tagged copy) to avoid
    // a half-baked image persisting if the build fails mid-way.
    log.info("building sandbox image")
    await Process.run(["docker", "pull", "alpine:3.21"])
    // Create temp container from alpine:3.21, install packages, commit as target
    const cid = await Process.text(["docker", "run", "-d", "alpine:3.21", "tail", "-f", "/dev/null"])
    const id = cid.text.trim()
    try {
      await Process.run(["docker", "exec", id, "apk", "add", "--no-cache",
        "bash", "curl", "git", "jq", "nodejs", "npm", "python3", "py3-pip", "ripgrep", "build-base"])
      await Process.run(["docker", "commit", "--change", "WORKDIR /workspace", id, image])
    } finally {
      await Process.run(["docker", "rm", "-f", id], { nothrow: true })
    }
    return
  }

  log.info("pulling sandbox image", { image })
  await Process.run(["docker", "pull", image])
}

/**
 * Create a new Alpine sandbox container for the given session.
 *
 * The container's /workspace is volume-mounted from the host project directory
 * so that file changes are reflected on both sides instantly.
 */
export async function createContainer(
  workspaceDir: string,
  sessionId: string,
  options?: { image?: string; network?: "bridge" | "none" },
): Promise<{ containerId: string; image: string }> {
  const image = options?.image ?? DEFAULT_IMAGE
  const network = options?.network ?? "bridge"
  const name = `opencode-sandbox-${sessionId}`

  await ensureImage(image)

  // Remove any leftover container with the same name
  await Process.run(["docker", "rm", "-f", name], { nothrow: true })

  const { text } = await Process.text([
    "docker",
    "run",
    "-d",
    "--name",
    name,
    "--network",
    network,
    "-v",
    `${workspaceDir}:/workspace`,
    "-w",
    "/workspace",
    image,
    "tail",
    "-f",
    "/dev/null",
  ])

  const containerId = text.trim()
  log.info("sandbox container created", { containerId, name, workspaceDir })
  return { containerId, image }
}

/**
 * Execute a shell command inside the container via `docker exec`.
 *
 * Returns a Child (from @/util/process) that streams stdout/stderr in real time.
 * For Effect-based callers (e.g., the bash tool), use the ChildProcess.make
 * pattern directly — this function targets non-Effect call paths.
 */
export function exec(containerId: string, command: string, env?: Record<string, string>): Child {
  const args = ["docker", "exec", "-i"]

  if (env) {
    for (const [key, value] of Object.entries(env)) {
      args.push("-e", `${key}=${value}`)
    }
  }

  // Use `sh -c` so that shell features (pipes, redirects, etc.) work.
  // The container has bash installed, but `sh` is always available in Alpine.
  args.push(containerId, "sh", "-c", command)

  return Process.spawn(args, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
}

/**
 * Forcefully stop and remove the sandbox container.
 * All ephemeral state inside the container is lost.
 * Files on the mounted volume (host project directory) are preserved.
 */
export async function removeContainer(containerId: string): Promise<void> {
  log.info("removing sandbox container", { containerId })
  await Process.run(["docker", "rm", "-f", containerId], { nothrow: true })
}

/**
 * List currently running sandbox containers.
 * Useful for cleanup and diagnostics.
 */
export async function listContainers(): Promise<string[]> {
  const { text } = await Process.text(
    ["docker", "ps", "--filter", "name=opencode-sandbox-", "--format", "{{.Names}}"],
    { nothrow: true },
  )
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
}
