import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { UI } from "../ui"
import fs from "fs"
import path from "path"
import { Filesystem } from "@/util/filesystem"
import { InstallationVersion } from "@opencode-ai/core/installation/version"

interface BackupManifest {
  version: "1.0"
  created: string
  opencodeVersion: string
  projectPath: string
  files: Record<string, string>
}

const BACKUP_SIGNATURE = "opencode-backup-v1"

/**
 * Recursively reads all files under a directory, returning a map of
 * relative path → text content.  Skips binary files, node_modules, etc.
 */
async function readDirRecursive(
  dir: string,
  base: string = dir,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  if (!(await Filesystem.exists(dir))) return result

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // skip irrelevant directories
      if (["node_modules", ".git", "cache", "storage", "snapshot", "worktree"].includes(entry.name)) continue
      Object.assign(result, await readDirRecursive(fullPath, base))
    } else if (entry.isFile()) {
      const rel = path.relative(base, fullPath).replace(/\\/g, "/")
      try {
        const content = fs.readFileSync(fullPath, "utf-8")
        result[rel] = content
      } catch {
        // skip binary / unreadable files
      }
    }
  }
  return result
}

/**
 * Redact known sensitive keys from a JSON string.
 */
function redactJson(content: string): string {
  try {
    const obj = JSON.parse(content)
    redactRecursive(obj)
    return JSON.stringify(obj, null, 2)
  } catch {
    // not valid JSON — return as-is
    return content
  }
}

const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
]

function redactRecursive(obj: any): void {
  if (!obj || typeof obj !== "object") return
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEY_PATTERNS.some((p) => p.test(key))) {
      if (typeof obj[key] === "string" && obj[key].trim()) {
        obj[key] = "[REDACTED]"
      }
    } else if (typeof obj[key] === "object") {
      redactRecursive(obj[key])
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export const BackupCommand = cmd({
  command: "backup",
  describe: "backup opencode project data (sessions, config)",
  builder: (yargs: Argv) =>
    yargs
      .option("output", {
        alias: "o",
        describe: "output file path (default: ./opencode-backup-{date}.json)",
        type: "string",
      })
      .option("list", {
        alias: "l",
        describe: "list available backups in current directory",
        type: "boolean",
      }),
  handler: async (args: { output?: string; list?: boolean }) => {
    // --list: show existing backups
    if (args.list) {
      const cwd = process.cwd()
      const files = fs.readdirSync(cwd).filter((f) => f.startsWith("opencode-backup-") && f.endsWith(".json"))
      if (files.length === 0) {
        UI.println(UI.Style.TEXT_DIM + "No backups found in current directory." + UI.Style.TEXT_NORMAL)
        return
      }
      UI.println(UI.Style.TEXT_HIGHLIGHT + "Available backups:" + UI.Style.TEXT_NORMAL)
      for (const f of files) {
        const stat = fs.statSync(path.join(cwd, f))
        UI.println(`  ${f}  ${UI.Style.TEXT_DIM}${formatBytes(stat.size)}  ${stat.mtime.toISOString().slice(0, 10)}${UI.Style.TEXT_NORMAL}`)
      }
      return
    }

    // Find the project .opencode/ directory
    const projectDir = process.cwd()
    const opencodeDir = path.join(projectDir, ".opencode")

    if (!(await Filesystem.exists(opencodeDir))) {
      UI.println(UI.Style.TEXT_DANGER + "No .opencode/ directory found in current project." + UI.Style.TEXT_NORMAL)
      UI.println(UI.Style.TEXT_DIM + "Run 'opencode' first to initialize a project." + UI.Style.TEXT_NORMAL)
      process.exit(1)
    }

    UI.println(UI.Style.TEXT_HIGHLIGHT + "Creating backup..." + UI.Style.TEXT_NORMAL)

    // Read all files from .opencode/
    const files = await readDirRecursive(opencodeDir)

    // Redact sensitive values from config files
    const redactedFiles: Record<string, string> = {}
    for (const [relPath, content] of Object.entries(files)) {
      if (relPath === "auth.json" || relPath.endsWith("/auth.json")) {
        // Skip auth files entirely for security
        continue
      }
      if (relPath.endsWith(".json") || relPath.endsWith(".jsonc")) {
        redactedFiles[relPath] = redactJson(content)
      } else {
        redactedFiles[relPath] = content
      }
    }

    const manifest: BackupManifest = {
      version: "1.0",
      created: new Date().toISOString(),
      opencodeVersion: InstallationVersion,
      projectPath: path.basename(projectDir),
      files: redactedFiles,
    }

    // Determine output path
    const dateStr = new Date().toISOString().slice(0, 10)
    const defaultOutput = `opencode-backup-${dateStr}.json`
    const outputPath = args.output
      ? path.resolve(args.output)
      : path.join(projectDir, defaultOutput)

    // Write backup
    const jsonStr = JSON.stringify(manifest, null, 2)
    fs.writeFileSync(outputPath, jsonStr, "utf-8")

    const fileSize = fs.statSync(outputPath).size
    const fileCount = Object.keys(redactedFiles).length

    UI.empty()
    UI.println(UI.Style.TEXT_SUCCESS + "✓ Backup created successfully" + UI.Style.TEXT_NORMAL)
    UI.println(`  File: ${UI.Style.TEXT_HIGHLIGHT}${outputPath}${UI.Style.TEXT_NORMAL}`)
    UI.println(`  Size: ${formatBytes(fileSize)}`)
    UI.println(`  Files: ${fileCount}`)
    UI.println(`  Date: ${manifest.created}`)
    if (Object.keys(files).some((f) => f === "auth.json" || f.endsWith("/auth.json"))) {
      UI.println(UI.Style.TEXT_DIM + "  (auth.json excluded for security)" + UI.Style.TEXT_NORMAL)
    }
  },
})
