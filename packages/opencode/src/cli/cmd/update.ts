import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { EOL } from "os"
import fs from "fs"
import path from "path"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "update-cmd" })

const GITHUB_REPO = "RedHatOnTop/opencode-fork-v1"
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

interface GitHubRelease {
  tag_name: string
  name: string
  html_url: string
  body: string
  published_at: string
}

async function fetchLatestVersion(): Promise<GitHubRelease | null> {
  try {
    const response = await fetch(GITHUB_API, {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "opencode-fork-update-checker",
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) {
      log.warn("github-api-error", { status: response.status })
      return null
    }
    return (await response.json()) as GitHubRelease
  } catch (e) {
    log.warn("update-check-failed", { error: String(e) })
    return null
  }
}

function compareVersions(current: string, latest: string): number {
  // Strip leading 'v' if present
  const a = current.replace(/^v/, "").split(/[\-+]/)[0]
  const b = latest.replace(/^v/, "").split(/[\-+]/)[0]

  const partsA = a.split(".").map(Number)
  const partsB = b.split(".").map(Number)

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const va = partsA[i] ?? 0
    const vb = partsB[i] ?? 0
    if (va < vb) return -1
    if (va > vb) return 1
  }
  return 0
}

export const UpdateCommand = cmd({
  command: "update",
  describe: "check for updates and optionally auto-update",
  builder: (yargs: Argv) =>
    yargs.option("yes", {
      alias: "y",
      describe: "auto-update without confirmation (runs git pull + rebuild)",
      type: "boolean",
    }),
  handler: async (args: { yes?: boolean }) => {
    UI.println(UI.Style.TEXT_HIGHLIGHT + "Checking for updates..." + UI.Style.TEXT_NORMAL)
    UI.empty()

    const release = await fetchLatestVersion()
    if (!release) {
      UI.println(UI.Style.TEXT_WARNING + "Could not check for updates. You may be offline or rate-limited." + UI.Style.TEXT_NORMAL)
      UI.println(UI.Style.TEXT_DIM + `  API: ${GITHUB_API}` + UI.Style.TEXT_NORMAL)
      return
    }

    const latestTag = release.tag_name
    const latestVersion = latestTag.replace(/^v/, "")

    UI.println(`  Current version: ${InstallationVersion}`)
    UI.println(`  Latest version:  ${latestVersion}`)
    UI.empty()

    const comparison = compareVersions(InstallationVersion, latestVersion)

    if (comparison >= 0) {
      UI.println(UI.Style.TEXT_SUCCESS + "✓ You are already on the latest version." + UI.Style.TEXT_NORMAL)
      return
    }

    // Newer version available
    UI.println(UI.Style.TEXT_WARNING + "⚡ A new version is available!" + UI.Style.TEXT_NORMAL)
    UI.println(`  ${InstallationVersion} → ${latestVersion}`)
    if (release.body) {
      UI.empty()
      UI.println(UI.Style.TEXT_DIM + "Release notes:" + UI.Style.TEXT_NORMAL)
      const notes = release.body.split("\n").slice(0, 10).join("\n")
      UI.println(UI.Style.TEXT_DIM + notes + UI.Style.TEXT_NORMAL)
    }
    UI.empty()
    UI.println(`  Release: ${release.html_url}`)

    if (args.yes) {
      UI.empty()
      UI.println(UI.Style.TEXT_HIGHLIGHT + "Auto-updating..." + UI.Style.TEXT_NORMAL)

      try {
        const proc = Bun.spawn(["git", "pull"], {
          cwd: import.meta.dir + "/../../../../..",
          stdout: "pipe",
          stderr: "pipe",
        })
        const exitCode = await proc.exited
        if (exitCode !== 0) {
          const stderr = await new Response(proc.stderr).text()
          UI.println(UI.Style.TEXT_DANGER + `git pull failed: ${stderr.trim()}` + UI.Style.TEXT_NORMAL)
          return
        }

        UI.println("  ✓ git pull succeeded")

        const installProc = Bun.spawn(["bun", "install"], {
          cwd: import.meta.dir + "/../../../../..",
          stdout: "pipe",
          stderr: "pipe",
        })
        const installExit = await installProc.exited
        if (installExit !== 0) {
          const stderr = await new Response(installProc.stderr).text()
          UI.println(UI.Style.TEXT_DANGER + `bun install failed: ${stderr.trim()}` + UI.Style.TEXT_NORMAL)
          return
        }

        UI.println("  ✓ bun install succeeded")

        const buildProc = Bun.spawn(["bun", "run", "build"], {
          cwd: import.meta.dir + "/../../../../..",
          stdout: "pipe",
          stderr: "pipe",
        })
        const buildExit = await buildProc.exited
        if (buildExit !== 0) {
          const stderr = await new Response(buildProc.stderr).text()
          UI.println(UI.Style.TEXT_DANGER + `build failed: ${stderr.trim()}` + UI.Style.TEXT_NORMAL)
          return
        }

        UI.println("  ✓ build succeeded")
        UI.empty()
        UI.println(UI.Style.TEXT_SUCCESS + "✓ Update complete!" + UI.Style.TEXT_NORMAL)
      } catch (e) {
        UI.println(UI.Style.TEXT_DANGER + `Update failed: ${(e as Error).message}` + UI.Style.TEXT_NORMAL)
      }
    } else {
      UI.empty()
      UI.println("To update manually:")
      UI.println(UI.Style.TEXT_DIM + "  git pull && bun install && bun run build" + UI.Style.TEXT_NORMAL)
      UI.println(UI.Style.TEXT_DIM + "  Or run: opencode update --yes" + UI.Style.TEXT_NORMAL)
    }
  },
})

// ---------- Background update checker ----------

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface UpdateCheckState {
  lastCheck: string
  latestVersion: string | null
}

function getUpdateCheckPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || ""
  const configDir = process.env.XDG_CONFIG_HOME || (home ? path.join(home, ".config") : "")
  if (!configDir) return ""
  return path.join(configDir, "opencode", "update-check.json")
}

async function readUpdateCheckState(): Promise<UpdateCheckState | null> {
  const filePath = getUpdateCheckPath()
  if (!filePath) return null
  try {
    const file = Bun.file(filePath)
    if (!(await file.exists())) return null
    return await file.json()
  } catch {
    return null
  }
}

async function writeUpdateCheckState(state: UpdateCheckState): Promise<void> {
  const filePath = getUpdateCheckPath()
  if (!filePath) return
  try {
    const dir = path.dirname(filePath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8")
  } catch {
    // Silently fail — this is non-critical
  }
}

/**
 * Non-blocking background update check.  Call this early in the startup
 * sequence.  It fires off an async check that resolves in the background
 * and prints a subtle notification if an update is available.
 *
 * The check runs at most once per 24 hours.
 */
export async function backgroundUpdateCheck(): Promise<void> {
  const filePath = getUpdateCheckPath()
  if (!filePath) return

  const state = await readUpdateCheckState()

  // Check if we've already checked recently
  if (state?.lastCheck) {
    const lastCheck = new Date(state.lastCheck).getTime()
    const now = Date.now()
    if (now - lastCheck < CHECK_INTERVAL_MS) {
      // Already checked recently — but still show notification if update available
      if (state.latestVersion && compareVersions(InstallationVersion, state.latestVersion) < 0) {
        printUpdateNotification(state.latestVersion)
      }
      return
    }
  }

  // Fire off the check in the background (non-blocking)
  ;(async () => {
    try {
      const release = await fetchLatestVersion()
      const now = new Date().toISOString()
      const latestVersion = release?.tag_name?.replace(/^v/, "") ?? null

      await writeUpdateCheckState({
        lastCheck: now,
        latestVersion,
      })

      if (latestVersion && compareVersions(InstallationVersion, latestVersion) < 0) {
        printUpdateNotification(latestVersion)
      }
    } catch {
      // Silently ignore — update checks are non-critical
    }
  })()
}

function printUpdateNotification(latestVersion: string): void {
  const dim = UI.Style.TEXT_DIM
  const reset = UI.Style.TEXT_NORMAL
  const yellow = UI.Style.TEXT_WARNING
  process.stderr.write(
    `${dim}┃ ${yellow}Update available${reset}${dim}: ${InstallationVersion} → ${latestVersion}  Run ${reset}opencode update${dim} for details.${reset}${EOL}`,
  )
}
