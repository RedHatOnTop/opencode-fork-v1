/**
 * Lightweight sandbox state tracking.
 *
 * Stores the current sandbox context (host or Docker container)
 * so that tools can route execution appropriately.
 */

export type SandboxType = "host" | "docker"

export interface DockerSandboxState {
  type: "docker"
  containerId: string
  workspaceDir: string
}

export interface HostSandboxState {
  type: "host"
}

export type SandboxState = DockerSandboxState | HostSandboxState

let current: SandboxState = { type: "host" }

export const Sandbox = {
  get current(): SandboxState {
    return current
  },

  set docker(sandbox: DockerSandboxState) {
    current = sandbox
  },

  clear() {
    current = { type: "host" }
  },

  get isDocker(): boolean {
    return current.type === "docker"
  },

  get containerId(): string | undefined {
    return current.type === "docker" ? current.containerId : undefined
  },

  get workspaceDir(): string | undefined {
    return current.type === "docker" ? current.workspaceDir : undefined
  },
}
