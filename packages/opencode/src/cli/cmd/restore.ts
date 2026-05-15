import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { EOL } from "os"
import fs from "fs"
import path from "path"
import { Filesystem } from "@/util/filesystem"

interface BackupManifest {
  version: string
  created: string
  opencodeVersion: string
  projectPath: string
  files: Record<string, string>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export const RestoreCommand = cmd({
  command: "restore <file>",
  describe: "restore opencode sessions from a backup file",
  builder: (yargs: Argv) =>
    yargs
      .positional("file", {
        describe: "path to the backup file",
        type: "string",
        demandOption: true,
      })
      .option("force", {
        alias: "f",
        describe: "overwrite existing files without prompting",
        type: "boolean",
      })
      .option("dry-run", {
        describe: "show what would be restored without writing files",
        type: "boolean",
      }),
  handler: async (args: { file: string; force?: boolean; "dry-run"?: boolean }) => {
    const backupPath = path.resolve(args.file)

    // Validate file exists
    if (!(await Filesystem.exists(backupPath))) {
      UI.println(UI.Style.TEXT_DANGER + `Backup file not found: ${backupPath}` + UI.Style.TEXT_NORMAL)
      process.exit(1)
    }

    // Read and parse backup
    let manifest: BackupManifest
    try {
      const raw = fs.readFileSync(backupPath, "utf-8")
      manifest = JSON.parse(raw)
    } catch (e) {
      UI.println(UI.Style.TEXT_DANGER + "Invalid backup file: unable to parse JSON." + UI.Style.TEXT_NORMAL)
      process.exit(1)
    }

    // Validate manifest structure
    if (!manifest.version || !manifest.files || typeof manifest.files !== "object") {
      UI.println(UI.Style.TEXT_DANGER + "Invalid backup format: missing version or files." + UI.Style.TEXT_NORMAL)
      process.exit(1)
    }

    if (manifest.version !== "1.0") {
      UI.println(UI.Style.TEXT_WARNING + `Warning: backup version '${manifest.version}' may not be fully supported.` + UI.Style.TEXT_NORMAL)
    }

    // Determine target directory
    const projectDir = process.cwd()
    const opencodeDir = path.join(projectDir, ".opencode")

    UI.println(UI.Style.TEXT_HIGHLIGHT + "Restoring backup..." + UI.Style.TEXT_NORMAL)
    UI.println(`  Source: ${backupPath}`)
    UI.println(`  Created: ${manifest.created}`)
    UI.println(`  Version: ${manifest.opencodeVersion}`)
    UI.println(`  Origin project: ${manifest.projectPath}`)
    UI.empty()

    const fileEntries = Object.entries(manifest.files)
    let restored = 0
    let skipped = 0
    let errors = 0

    for (const [relPath, content] of fileEntries) {
      // Security: prevent path traversal
      const normalizedRel = path.normalize(relPath).replace(/^(\.\.[/\\])+/, "")
      if (normalizedRel !== relPath.replace(/\\/g, "/")) {
        UI.println(UI.Style.TEXT_WARNING + `  Skipping suspicious path: ${relPath}` + UI.Style.TEXT_NORMAL)
        skipped++
        continue
      }

      const targetPath = path.join(opencodeDir, relPath)

      // Check if file already exists
      if ((await Filesystem.exists(targetPath)) && !args.force) {
        UI.println(UI.Style.TEXT_DIM + `  Skip (exists): ${relPath}` + UI.Style.TEXT_NORMAL)
        skipped++
        continue
      }

      if (args.dryRun) {
        UI.println(UI.Style.TEXT_INFO + `  Would restore: ${relPath}` + UI.Style.TEXT_NORMAL)
        restored++
        continue
      }

      try {
        // Ensure directory exists
        const dir = path.dirname(targetPath)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(targetPath, content, "utf-8")
        restored++
      } catch (e) {
        UI.println(UI.Style.TEXT_DANGER + `  Error writing ${relPath}: ${(e as Error).message}` + UI.Style.TEXT_NORMAL)
        errors++
      }
    }

    UI.empty()
    if (args.dryRun) {
      UI.println(UI.Style.TEXT_INFO + "Dry run complete." + UI.Style.TEXT_NORMAL)
    } else {
      UI.println(UI.Style.TEXT_SUCCESS + "✓ Restore complete" + UI.Style.TEXT_NORMAL)
    }
    UI.println(`  Restored: ${restored}`)
    UI.println(`  Skipped: ${skipped}`)
    if (errors > 0) {
      UI.println(`  Errors: ${UI.Style.TEXT_DANGER}${errors}${UI.Style.TEXT_NORMAL}`)
    }
    UI.println(`  Total files in backup: ${fileEntries.length}`)
  },
})
