/**
 * Doctor Command - System Diagnostics & Health Check
 *
 * Displays system health report including environment checks,
 * recent errors, retry events, and recommendations.
 */

import type { Argv } from "yargs"
import { Effect } from "effect"
import { bootstrap } from "../bootstrap"
import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { Service as ErrorRecoveryService, getDoctorReport } from "@/provider/error-recovery"
import { defaultLayer as errorRecoveryLayer } from "@/provider/error-recovery"
import { Global } from "@opencode-ai/core/global"
import { existsSync } from "fs"
import fs from "fs"
import os from "os"
import path from "path"
import { execSync } from "child_process"

// ============================================================================
// Health Check Types
// ============================================================================

interface CheckResult {
  name: string
  status: "ok" | "warn" | "fail"
  message: string
  fix?: string
}

// ============================================================================
// Health Check Functions
// ============================================================================

function checkBun(): CheckResult {
  try {
    const version = execSync("bun --version 2>/dev/null", { encoding: "utf-8" }).trim()
    if (!version) {
      return {
        name: "Bun Runtime",
        status: "warn",
        message: "Bun not detected",
        fix: "Install Bun: curl -fsSL https://bun.sh/install | bash",
      }
    }
    return { name: "Bun Runtime", status: "ok", message: `v${version}` }
  } catch {
    return {
      name: "Bun Runtime",
      status: "warn",
      message: "Bun not found",
      fix: "Install Bun: curl -fsSL https://bun.sh/install | bash",
    }
  }
}

function checkNode(): CheckResult {
  try {
    const version = execSync("node --version 2>/dev/null", { encoding: "utf-8" }).trim()
    if (!version) {
      return { name: "Node.js", status: "warn", message: "Node.js not detected" }
    }
    return { name: "Node.js", status: "ok", message: version }
  } catch {
    return { name: "Node.js", status: "warn", message: "Node.js not found" }
  }
}

function checkGit(): CheckResult {
  try {
    const version = execSync("git --version 2>/dev/null", { encoding: "utf-8" }).trim()
    if (!version) {
      return {
        name: "Git",
        status: "fail",
        message: "Git not found",
        fix: "Install Git: https://git-scm.com/downloads",
      }
    }
    return { name: "Git", status: "ok", message: version }
  } catch {
    return {
      name: "Git",
      status: "fail",
      message: "Git not found",
      fix: "Install Git: https://git-scm.com/downloads",
    }
  }
}

function checkShell(): CheckResult {
  const shell = process.env.SHELL || process.env.COMSPEC || undefined
  if (!shell) {
    return { name: "Shell", status: "warn", message: "No shell detected via $SHELL or $COMSPEC" }
  }
  const shellName = path.basename(shell)
  return { name: "Shell", status: "ok", message: `${shellName} (${shell})` }
}

function checkDiskSpace(): CheckResult {
  try {
    const configDir = Global.Path.config
    fs.statSync(configDir)
    return { name: "Config Directory", status: "ok", message: configDir }
  } catch {
    return {
      name: "Config Directory",
      status: "warn",
      message: `Cannot access ${Global.Path.config}`,
      fix: "Ensure the directory exists and is accessible",
    }
  }
}

function checkConfigFile(): CheckResult {
  const candidates = [
    path.join(Global.Path.config, "opencode.json"),
    path.join(Global.Path.config, "opencode.jsonc"),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { name: "Config File", status: "ok", message: candidate }
    }
  }

  return {
    name: "Config File",
    status: "warn",
    message: "No opencode.json found",
    fix: "Run `opencode setup` to create one, or create manually in ~/.config/opencode/",
  }
}

function checkDatabase(): CheckResult {
  const dbPath = path.join(Global.Path.data, "opencode.db")
  if (existsSync(dbPath)) {
    return { name: "Database", status: "ok", message: dbPath }
  }
  return {
    name: "Database",
    status: "warn",
    message: "Database not found (will be created on first run)",
  }
}

function checkApiKeys(): CheckResult[] {
  const envKeys = [
    { key: "ANTHROPIC_API_KEY", provider: "Anthropic" },
    { key: "OPENAI_API_KEY", provider: "OpenAI" },
    { key: "GOOGLE_GENERATIVE_AI_API_KEY", provider: "Google" },
    { key: "XAI_API_KEY", provider: "xAI" },
    { key: "OPENROUTER_API_KEY", provider: "OpenRouter" },
  ]

  const results: CheckResult[] = []
  const configured: string[] = []
  const missing: string[] = []

  for (const { key, provider } of envKeys) {
    if (process.env[key]) {
      configured.push(provider)
    } else {
      missing.push(provider)
    }
  }

  if (configured.length > 0) {
    results.push({
      name: "API Keys",
      status: "ok",
      message: `Configured: ${configured.join(", ")}`,
    })
  }

  if (missing.length > 0) {
    results.push({
      name: "Missing API Keys",
      status: missing.length === envKeys.length ? "warn" : "ok",
      message: `Not set: ${missing.join(", ")}`,
      fix: "Set environment variables or run `opencode setup` to configure",
    })
  }

  if (configured.length === 0 && missing.length === envKeys.length) {
    results.push({
      name: "API Keys",
      status: "warn",
      message: "No API keys detected",
      fix: "Run `opencode setup` to configure providers, or set environment variables",
    })
  }

  return results
}

function checkPlatform(): CheckResult {
  const platform = os.platform()
  const arch = os.arch()
  const release = os.release()
  const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024)
  const freeMem = Math.round(os.freemem() / 1024 / 1024 / 1024)

  return {
    name: "Platform",
    status: "ok",
    message: `${platform} ${arch} (kernel ${release}), ${freeMem}GB free / ${totalMem}GB RAM`,
  }
}

// ============================================================================
// Display Helpers
// ============================================================================

function statusIcon(status: "ok" | "warn" | "fail"): string {
  switch (status) {
    case "ok":
      return "✅"
    case "warn":
      return "⚠️"
    case "fail":
      return "❌"
  }
}

function displayResults(results: CheckResult[]) {
  for (const result of results) {
    const icon = statusIcon(result.status)
    console.log(`  ${icon}  ${result.name}: ${result.message}`)
    if (result.fix && result.status !== "ok") {
      console.log(`     💡 Fix: ${result.fix}`)
    }
  }
}

// ============================================================================
// Command
// ============================================================================

export const DoctorCommand = cmd({
  command: "doctor",
  describe: "Display system health report and diagnostics",
  builder: (yargs: Argv) =>
    yargs
      .option("full", {
        type: "boolean",
        describe: "Show full diagnostic report including error history",
        default: false,
      })
      .example([
        ["opencode doctor", "Show system health check"],
        ["opencode doctor --full", "Show full diagnostic report with error history"],
      ]),
  async handler(args: { full: boolean }) {
    UI.empty()
    prompts.intro("OpenCode Doctor")

    // ── System Health Checks ──────────────────────────────────────────────
    console.log("")
    console.log("  📋 System Environment")
    console.log("  ─────────────────────")

    const systemChecks: CheckResult[] = [
      checkPlatform(),
      checkBun(),
      checkNode(),
      checkGit(),
      checkShell(),
    ]
    displayResults(systemChecks)

    // ── Configuration Checks ──────────────────────────────────────────────
    console.log("")
    console.log("  ⚙️  Configuration")
    console.log("  ─────────────────────")

    const configChecks: CheckResult[] = [checkConfigFile(), checkDatabase(), checkDiskSpace()]
    displayResults(configChecks)

    // ── API Key Checks ────────────────────────────────────────────────────
    console.log("")
    console.log("  🔑 API Keys")
    console.log("  ─────────────────────")

    const apiKeyChecks = checkApiKeys()
    displayResults(apiKeyChecks)

    // ── Summary ───────────────────────────────────────────────────────────
    const allChecks = [...systemChecks, ...configChecks, ...apiKeyChecks]
    const failures = allChecks.filter((c) => c.status === "fail").length
    const warnings = allChecks.filter((c) => c.status === "warn").length
    const passes = allChecks.filter((c) => c.status === "ok").length

    console.log("")
    console.log("  ─────────────────────")
    console.log(
      `  Total: ${passes} passed, ${warnings} warnings, ${failures} failures`,
    )

    if (failures > 0) {
      console.log("")
      console.log("  ❌ Some checks failed. Please review the items above.")
    } else if (warnings > 0) {
      console.log("")
      console.log("  ⚠️  Some warnings detected. Review optional items above.")
    } else {
      console.log("")
      console.log("  ✅ All checks passed! OpenCode is ready to use.")
    }

    // ── Full Error Report (optional) ──────────────────────────────────────
    if (args.full) {
      console.log("")
      console.log("  📊 Error Recovery Report")
      console.log("  ─────────────────────")

      await bootstrap(process.cwd(), async () => {
        const program = Effect.gen(function* () {
          const errorService = yield* ErrorRecoveryService

          // Get recent errors
          const recentErrors = yield* errorService.getRecentErrors(10)

          if (recentErrors.length === 0) {
            console.log("  ✅ No recent errors recorded")
          } else {
            // Generate report
            const report = getDoctorReport(recentErrors)
            console.log(report)
          }

          // Error categories
          console.log("")
          console.log("  Error Categories:")

          const categories = [
            "connection",
            "authentication",
            "rate_limit",
            "server_overload",
            "model_error",
            "prompt_overflow",
            "media_size",
            "unknown",
          ] as const

          let hasCategories = false
          for (const category of categories) {
            const errors = yield* errorService.getErrorsByCategory(category)
            if (errors.length > 0) {
              console.log(`    - ${category}: ${errors.length} errors`)
              hasCategories = true
            }
          }
          if (!hasCategories) {
            console.log("    ✅ No errors in any category")
          }

          console.log("")
          console.log("  System Status:")
          console.log("    - Error Recovery: Active")
          console.log("    - Retry Strategy: Exponential backoff with jitter")
          console.log("    - Context Compression: Available")
          console.log("    - Fallback Models: Configurable")
        })

        await Effect.runPromise(Effect.provide(program, errorRecoveryLayer))
      })
    }

    prompts.outro("Doctor check complete")
  },
})
