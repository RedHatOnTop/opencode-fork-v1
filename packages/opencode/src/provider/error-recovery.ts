/**
 * Error Recovery System - Provider Error Handling
 *
 * Handles API errors with intelligent recovery strategies:
 * - Error classification by category
 * - Automatic retry with exponential backoff
 * - Fallback model switching
 * - Context compression for prompt overflow
 * - Structured error logging
 */

import { Schema, Context, Effect, Layer } from "effect"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "error-recovery" })

/**
 * Error categories
 */
export const ErrorCategory = Schema.Union([
  Schema.Literal("connection"),
  Schema.Literal("authentication"),
  Schema.Literal("rate_limit"),
  Schema.Literal("server_overload"),
  Schema.Literal("model_error"),
  Schema.Literal("prompt_overflow"),
  Schema.Literal("media_size"),
  Schema.Literal("unknown"),
])
export type ErrorCategory = Schema.Schema.Type<typeof ErrorCategory>

/**
 * Recovery strategy types
 */
export const RecoveryStrategy = Schema.Union([
  Schema.Literal("retry"),
  Schema.Literal("fallback"),
  Schema.Literal("compact_and_retry"),
  Schema.Literal("non_streaming_fallback"),
  Schema.Literal("permanent_retry"),
  Schema.Literal("abort"),
])
export type RecoveryStrategy = "retry" | "fallback" | "compact_and_retry" | "non_streaming_fallback" | "permanent_retry" | "abort"

/**
 * Error classification result
 */
export interface ClassifiedError {
  category: ErrorCategory
  message: string
  retryable: boolean
  suggestedStrategy: RecoveryStrategy
  metadata?: Record<string, unknown>
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number
  baseDelay: number      // milliseconds
  maxDelay: number       // milliseconds
  jitter: boolean
  fallbackModels: string[]
}

/**
 * Error recovery state
 */
interface RecoveryState {
  consecutiveErrors: Map<string, number>
  lastError: Map<string, ClassifiedError>
  totalRetries: number
  fallbackIndex: number
}

/**
 * Classify an error into category and suggest recovery strategy
 */
export function classify(error: unknown): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error)
  const errorStr = message.toLowerCase()

  // Connection errors
  if (
    errorStr.includes("etimedout") ||
    errorStr.includes("econnrefused") ||
    errorStr.includes("ENOTFOUND") ||
    errorStr.includes("socket hang up") ||
    errorStr.includes("network error") ||
    errorStr.includes("fetch failed") ||
    errorStr.includes("connection")
  ) {
    return {
      category: "connection",
      message,
      retryable: true,
      suggestedStrategy: "retry",
      metadata: { transient: true },
    }
  }

  // Authentication errors
  if (
    errorStr.includes("unauthorized") ||
    errorStr.includes("authentication") ||
    errorStr.includes("invalid api key") ||
    errorStr.includes("401") ||
    errorStr.includes("403")
  ) {
    return {
      category: "authentication",
      message,
      retryable: false,
      suggestedStrategy: "abort",
      metadata: { requiresReauth: true },
    }
  }

  // Rate limit errors
  if (
    errorStr.includes("rate limit") ||
    errorStr.includes("too many requests") ||
    errorStr.includes("429") ||
    errorStr.includes("throttled")
  ) {
    // Try to extract retry-after header
    const retryAfterMatch = errorStr.match(/retry after (\d+)s/)
    const retryAfter = retryAfterMatch ? parseInt(retryAfterMatch[1]) * 1000 : undefined

    return {
      category: "rate_limit",
      message,
      retryable: true,
      suggestedStrategy: "retry",
      metadata: { retryAfter },
    }
  }

  // Server overload
  if (
    errorStr.includes("overloaded") ||
    errorStr.includes("server error") ||
    errorStr.includes("503") ||
    errorStr.includes("502") ||
    errorStr.includes("504")
  ) {
    return {
      category: "server_overload",
      message,
      retryable: true,
      suggestedStrategy: "fallback",
      metadata: { transient: true },
    }
  }

  // Model errors
  if (
    errorStr.includes("model not found") ||
    errorStr.includes("model is not available") ||
    errorStr.includes("invalid model") ||
    errorStr.includes("unsupported model")
  ) {
    return {
      category: "model_error",
      message,
      retryable: true,
      suggestedStrategy: "fallback",
      metadata: { requiresFallback: true },
    }
  }

  // Prompt overflow
  if (
    errorStr.includes("context window") ||
    errorStr.includes("token limit") ||
    errorStr.includes("too many tokens") ||
    errorStr.includes("prompt is too long") ||
    errorStr.includes("413") ||
    errorStr.includes("context length")
  ) {
    return {
      category: "prompt_overflow",
      message,
      retryable: true,
      suggestedStrategy: "compact_and_retry",
      metadata: { requiresCompression: true },
    }
  }

  // Media size errors
  if (
    errorStr.includes("image too large") ||
    errorStr.includes("file too large") ||
    errorStr.includes("media size") ||
    errorStr.includes("payload too large")
  ) {
    return {
      category: "media_size",
      message,
      retryable: false,
      suggestedStrategy: "abort",
      metadata: { requiresResize: true },
    }
  }

  // Default to unknown
  return {
    category: "unknown",
    message,
    retryable: false,
    suggestedStrategy: "abort",
  }
}

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateDelay(
  attempt: number,
  config: RetryConfig,
  classified?: ClassifiedError
): number {
  // If rate limit with retry-after, use that
  if (classified?.category === "rate_limit" && classified.metadata?.retryAfter) {
    return classified.metadata.retryAfter as number
  }

  // Exponential backoff: baseDelay * 2^attempt
  let delay = config.baseDelay * Math.pow(2, attempt)
  delay = Math.min(delay, config.maxDelay)

  // Add jitter (±25%)
  if (config.jitter) {
    const jitterAmount = delay * 0.25
    delay += (Math.random() - 0.5) * 2 * jitterAmount
  }

  return Math.max(delay, config.baseDelay)
}

/**
 * Determine recovery strategy based on error category and state
 */
export function determineStrategy(
  classified: ClassifiedError,
  state: RecoveryState,
  config: RetryConfig,
  currentModel: string
): RecoveryStrategy {
  // Check consecutive errors
  const consecutiveCount = state.consecutiveErrors.get(currentModel) || 0

  // If too many consecutive errors on same model, switch to fallback
  if (consecutiveCount >= 3 && config.fallbackModels.length > 0) {
    return "fallback"
  }

  // Use suggested strategy
  if (classified.suggestedStrategy === "retry") {
    const totalRetries = state.totalRetries
    if (totalRetries >= config.maxRetries) {
      // Out of retries, try fallback if available
      if (config.fallbackModels.length > 0) {
        return "fallback"
      }
      return "abort"
    }
    return "retry"
  }

  return classified.suggestedStrategy
}

/**
 * Structured error log entry
 */
export interface ErrorLogEntry {
  id: string
  timestamp: number
  category: ErrorCategory
  message: string
  strategy: RecoveryStrategy
  attempt: number
  maxRetries: number
  resolved: boolean
  model: string
  sessionId?: string
}

/**
 * Error Recovery Service Interface
 */
export interface Interface {
  readonly classify: (error: unknown) => ClassifiedError
  readonly calculateDelay: (attempt: number, config: RetryConfig, classified?: ClassifiedError) => number
  readonly determineStrategy: (
    classified: ClassifiedError,
    currentModel: string,
    isAutopilot: boolean
  ) => Effect.Effect<RecoveryStrategy>
  readonly recordError: (entry: ErrorLogEntry) => Effect.Effect<void>
  readonly getRecentErrors: (limit?: number) => Effect.Effect<ReadonlyArray<ErrorLogEntry>>
  readonly getErrorsByCategory: (category: ErrorCategory) => Effect.Effect<ReadonlyArray<ErrorLogEntry>>
  readonly shouldFallback: (currentModel: string) => Effect.Effect<boolean>
  readonly getNextFallbackModel: (currentModel: string) => Effect.Effect<string | undefined>
  readonly resetConsecutiveErrors: (model: string) => Effect.Effect<void>
  // Enhanced methods (R23)
  readonly getDoctorReport: () => Effect.Effect<string>
  readonly markResolved: (errorId: string) => Effect.Effect<void>
  readonly getConsecutiveErrorCount: (model: string) => Effect.Effect<number>
}

/**
 * Error Recovery Service
 */
export class Service extends Context.Service<Service, Interface>()("@opencode/ErrorRecovery") {}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 60000,
  jitter: true,
  fallbackModels: [],
}

/**
 * Service layer implementation
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state: RecoveryState = {
      consecutiveErrors: new Map(),
      lastError: new Map(),
      totalRetries: 0,
      fallbackIndex: 0,
    }

    // In-memory error log (could be persisted to storage)
    const errorLog: ErrorLogEntry[] = []
    const MAX_LOG_SIZE = 1000

    const recordError = Effect.fn("ErrorRecovery.recordError")(
      function* (entry: ErrorLogEntry) {
        errorLog.unshift(entry)
        
        // Keep log size bounded
        if (errorLog.length > MAX_LOG_SIZE) {
          errorLog.pop()
        }

        // Update consecutive error count
        const currentCount = state.consecutiveErrors.get(entry.model) || 0
        state.consecutiveErrors.set(entry.model, currentCount + 1)
        
        state.totalRetries++
        // Decay: reset totalRetries after a successful resolution period
        if (errorLog.length > 0 && errorLog[0].resolved) {
          state.totalRetries = Math.max(0, state.totalRetries - 1)
        }

        log.info("Error recorded", {
          id: entry.id,
          category: entry.category,
          strategy: entry.strategy,
          attempt: entry.attempt,
        })
      }
    )

    const getRecentErrors = Effect.fn("ErrorRecovery.getRecentErrors")(
      function* (limit = 10) {
        return errorLog.slice(0, limit)
      }
    )

    const getErrorsByCategory = Effect.fn("ErrorRecovery.getErrorsByCategory")(
      function* (category: ErrorCategory) {
        return errorLog.filter((e) => e.category === category)
      }
    )

    const shouldFallback = Effect.fn("ErrorRecovery.shouldFallback")(
      function* (currentModel: string) {
        const consecutiveCount = state.consecutiveErrors.get(currentModel) || 0
        return consecutiveCount >= 3
      }
    )

    const getNextFallbackModel = Effect.fn("ErrorRecovery.getNextFallbackModel")(
      function* (currentModel: string) {
        // Return next model in fallback chain
        const currentIndex = DEFAULT_RETRY_CONFIG.fallbackModels.indexOf(currentModel)
        const nextIndex = (currentIndex + 1) % DEFAULT_RETRY_CONFIG.fallbackModels.length
        
        if (DEFAULT_RETRY_CONFIG.fallbackModels.length === 0) {
          return undefined
        }

        // If current model not in list, return first fallback
        if (currentIndex === -1) {
          return DEFAULT_RETRY_CONFIG.fallbackModels[0]
        }

        // Return next fallback
        return DEFAULT_RETRY_CONFIG.fallbackModels[nextIndex]
      }
    )

    const resetConsecutiveErrors = Effect.fn("ErrorRecovery.resetConsecutiveErrors")(
      function* (model: string) {
        state.consecutiveErrors.delete(model)
        log.info("Consecutive errors reset", { model })
      }
    )

    const determineStrategy = Effect.fn("ErrorRecovery.determineStrategy")(
      function* (
        classified: ClassifiedError,
        currentModel: string,
        isAutopilot: boolean
      ) {
        // Check consecutive errors
        const consecutiveCount = state.consecutiveErrors.get(currentModel) || 0

        // If too many consecutive errors, switch to fallback
        if (consecutiveCount >= 3 && DEFAULT_RETRY_CONFIG.fallbackModels.length > 0) {
          return "fallback" as RecoveryStrategy
        }

        // In autopilot mode, use permanent_retry for transient errors
        if (isAutopilot && classified.retryable && classified.category !== "prompt_overflow") {
          return "permanent_retry" as RecoveryStrategy
        }

        // For prompt overflow, always compact
        if (classified.category === "prompt_overflow") {
          return "compact_and_retry" as RecoveryStrategy
        }

        // Check if we've exceeded max retries
        if (state.totalRetries >= DEFAULT_RETRY_CONFIG.maxRetries) {
          if (DEFAULT_RETRY_CONFIG.fallbackModels.length > 0) {
            return "fallback" as RecoveryStrategy
          }
          return "abort" as RecoveryStrategy
        }

        return classified.suggestedStrategy
      }
    )

    // Enhanced: Mark error as resolved
    const markResolved = Effect.fn("ErrorRecovery.markResolved")(function* (errorId: string) {
      const entry = errorLog.find((e) => e.id === errorId)
      if (entry) {
        entry.resolved = true
        log.info("Error marked as resolved", { errorId })
      }
    })

    // Enhanced: Get consecutive error count for a model
    const getConsecutiveErrorCount = Effect.fn("ErrorRecovery.getConsecutiveErrorCount")(
      function* (model: string) {
        return state.consecutiveErrors.get(model) || 0
      },
    )

    // Enhanced: Generate doctor report from internal state
    const getDoctorReport = Effect.fn("ErrorRecovery.getDoctorReport")(function* () {
      const recentErrors = errorLog.slice(0, 20)
      const report = getDoctorReportInternal(recentErrors, state)
      return report
    })

    return Service.of({
      classify,
      calculateDelay,
      determineStrategy,
      recordError,
      getRecentErrors,
      getErrorsByCategory,
      shouldFallback,
      getNextFallbackModel,
      resetConsecutiveErrors,
      markResolved,
      getConsecutiveErrorCount,
      getDoctorReport,
    })
  })
)

export const defaultLayer = layer

/**
 * Helper: Create error log entry
 */
export function createErrorLogEntry(
  category: ErrorCategory,
  message: string,
  strategy: RecoveryStrategy,
  attempt: number,
  maxRetries: number,
  model: string,
  sessionId?: string
): ErrorLogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    category,
    message,
    strategy,
    attempt,
    maxRetries,
    resolved: false,
    model,
    sessionId,
  }
}

/**
 * Helper: Format error for display
 */
export function formatErrorEntry(entry: ErrorLogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString()
  const status = entry.resolved ? "✓" : "✗"
  return `[${time}] ${status} ${entry.category}: ${entry.message.slice(0, 50)}... (attempt ${entry.attempt}/${entry.maxRetries})`
}

/**
 * Internal: Generate doctor report from error log and state
 */
function getDoctorReportInternal(errors: ReadonlyArray<ErrorLogEntry>, state: RecoveryState): string {
  const lines = [
    "## System Health Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Total recent errors: ${errors.length}`,
    `Total retries: ${state.totalRetries}`,
    "",
    "### Errors by category:",
  ]

  const byCategory = errors.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  for (const [category, count] of Object.entries(byCategory)) {
    lines.push(`- ${category}: ${count}`)
  }

  if (errors.length > 0) {
    lines.push("")
    lines.push("### Recent errors:")
    errors.slice(0, 10).forEach((e) => {
      lines.push(`- ${formatErrorEntry(e)}`)
    })
  }

  // Consecutive error status per model
  if (state.consecutiveErrors.size > 0) {
    lines.push("")
    lines.push("### Model health:")
    for (const [model, count] of state.consecutiveErrors) {
      const status = count >= 3 ? "🔴 UNHEALTHY" : count > 0 ? "🟡 DEGRADED" : "🟢 OK"
      lines.push(`- ${model}: ${status} (${count} consecutive errors)`)
    }
  }

  lines.push("")
  lines.push("### Recommendations:")

  if (byCategory["authentication"] && byCategory["authentication"] > 0) {
    lines.push("- ⚠️ Authentication errors detected. Check your API keys.")
  }

  if (byCategory["rate_limit"] && byCategory["rate_limit"] > 3) {
    lines.push("- ⚠️ Rate limit errors frequent. Consider reducing request rate or upgrading plan.")
  }

  if (byCategory["prompt_overflow"] && byCategory["prompt_overflow"] > 0) {
    lines.push("- ℹ️ Context window limits reached. Context compression is active.")
  }

  if (byCategory["server_overload"] && byCategory["server_overload"] > 5) {
    lines.push("- ⚠️ Server overload errors detected. Fallback models may be in use.")
  }

  if (byCategory["connection"] && byCategory["connection"] > 0) {
    lines.push("- ⚠️ Connection errors detected. Check your network connectivity.")
  }

  if (byCategory["media_size"] && byCategory["media_size"] > 0) {
    lines.push("- ℹ️ Media size errors. Consider reducing image/file sizes before upload.")
  }

  return lines.join("\n")
}

/**
 * Helper: Get doctor report (backward compatible)
 */
export function getDoctorReport(errors: ReadonlyArray<ErrorLogEntry>): string {
  return getDoctorReportInternal(errors, {
    consecutiveErrors: new Map(),
    lastError: new Map(),
    totalRetries: 0,
    fallbackIndex: 0,
  })
}
