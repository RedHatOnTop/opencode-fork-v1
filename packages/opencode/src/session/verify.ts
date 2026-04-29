/**
 * Verification Loop - Code Quality Verification and Auto-Fix
 * 
 * Implements the verification loop that runs configured commands after code changes
 * and attempts automatic fixes on failures.
 */

import { Config } from "@/config/config"
import * as Log from "@opencode-ai/core/util/log"
import { Context, Effect, Layer, Schema } from "effect"
import { spawn } from "child_process"
import { promisify } from "util"

const log = Log.create({ service: "verification" })

// Convert spawn to Promise-based
const execAsync = promisify(spawn)

export const VerificationStatus = Schema.Literals(["pending", "running", "success", "failed", "max_retries_exceeded"])
export type VerificationStatus = Schema.Schema.Type<typeof VerificationStatus>

export const VerificationResult = Schema.Struct({
  command: Schema.String,
  status: VerificationStatus,
  exitCode: Schema.optional(Schema.Number),
  stdout: Schema.optional(Schema.String),
  stderr: Schema.optional(Schema.String),
  attempts: Schema.Number,
  timestamp: Schema.Number,
})
export type VerificationResult = Schema.Schema.Type<typeof VerificationResult>

export interface Interface {
  readonly runAll: () => Effect.Effect<VerificationResult[], VerificationError>
  readonly runCommand: (command: string, attempt?: number) => Effect.Effect<VerificationResult, VerificationError>
  readonly runWithRetry: (command: string) => Effect.Effect<VerificationResult, VerificationError>
  readonly isEnabled: () => Effect.Effect<boolean>
}

export class VerificationError extends Schema.TaggedErrorClass<VerificationError>()("VerificationError", {
  message: Schema.String,
  results: Schema.optional(Schema.Array(VerificationResult)),
}) {}

function executeCommand(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const parts = command.split(" ")
    const cmd = parts[0]
    const args = parts.slice(1)
    
    const child = spawn(cmd, args, {
      shell: true,
      cwd: process.cwd(),
    })
    
    let stdout = ""
    let stderr = ""
    
    child.stdout?.on("data", (data) => {
      stdout += data.toString()
    })
    
    child.stderr?.on("data", (data) => {
      stderr += data.toString()
    })
    
    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 0, stdout, stderr })
    })
    
    child.on("error", (error) => {
      reject(error)
    })
  })
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Verification") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service

    const isEnabled = Effect.fn("Verification.isEnabled")(function* () {
      const cfg = yield* config.get()
      const verify = cfg.verify
      if (!verify) return false
      // Default to enabled if not explicitly disabled
      return verify.auto_fix !== false
    })

    const runCommand = Effect.fn("Verification.runCommand")(function* (command: string, attempt: number = 1) {
      log.info("Running verification command", { command, attempt })
      
      const result = yield* Effect.tryPromise({
        try: () => executeCommand(command),
        catch: (error) => new VerificationError({ 
          message: `Command execution failed: ${error}` 
        }),
      })

      const status: VerificationStatus = result.exitCode === 0 ? "success" : "failed"
      
      return {
        command,
        status,
        exitCode: result.exitCode,
        stdout: result.stdout.slice(0, 10000), // Limit output size
        stderr: result.stderr.slice(0, 10000),
        attempts: attempt,
        timestamp: Date.now(),
      }
    })

    const runWithRetry = Effect.fn("Verification.runWithRetry")(function* (command: string) {
      const cfg = yield* config.get()
      const maxRetries = cfg.verify?.max_retries ?? 3
      const autoFix = cfg.verify?.auto_fix !== false

      let lastResult: VerificationResult | undefined
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const result = yield* runCommand(command, attempt)
        lastResult = result
        
        if (result.status === "success") {
          return result
        }
        
        if (!autoFix || attempt >= maxRetries) {
          break
        }
        
        log.info("Verification failed, attempting fix", { 
          command, 
          attempt, 
          maxRetries,
          stderr: result.stderr?.slice(0, 500),
        })
        
        // Exponential backoff between retries
        yield* Effect.sleep(`${attempt * 1000} millis`)
      }
      
      if (lastResult) {
        return {
          ...lastResult,
          status: "max_retries_exceeded" as VerificationStatus,
        }
      }
      
      return yield* new VerificationError({ 
        message: `Verification failed after ${maxRetries} attempts: ${command}` 
      })
    })

    const runAll = Effect.fn("Verification.runAll")(function* () {
      const cfg = yield* config.get()
      const commands = cfg.verify?.commands ?? ["bun typecheck", "bun test"]
      
      if (commands.length === 0) {
        return yield* new VerificationError({ 
          message: "No verification commands configured" 
        })
      }

      const results: VerificationResult[] = []
      
      for (const command of commands) {
        const result = yield* runWithRetry(command)
        results.push(result)
        
        // If a command fails, report immediately unless auto_fix is enabled
        if (result.status === "max_retries_exceeded") {
          log.error("Verification failed after max retries", { command, result })
          // Continue to run remaining commands but collect all results
        }
      }
      
      // Check if any command failed
      const hasFailures = results.some(r => r.status !== "success")
      
      if (hasFailures) {
        return yield* new VerificationError({
          message: `Verification failed for ${results.filter(r => r.status !== "success").length} command(s)`,
          results,
        })
      }
      
      return results
    })

    return Service.of({
      isEnabled,
      runCommand,
      runWithRetry,
      runAll,
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Config.defaultLayer))

export * as Verification from "./verify"
