import { Context, Effect, Schema, Layer } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { z } from "zod"

const log = Log.create({ service: "provider-wizard" })

// ============================================================================
// Schema Definitions
// ============================================================================

export const ModelInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
})
export type ModelInfo = Schema.Schema.Type<typeof ModelInfo>

export const ProviderConfig = Schema.Struct({
  name: Schema.String,
  baseUrl: Schema.String,
  apiKey: Schema.String,
  models: Schema.Array(ModelInfo),
})
export type ProviderConfig = Schema.Schema.Type<typeof ProviderConfig>

export const WizardState = Schema.Literals("idle", "awaiting_url", "awaiting_key", "fetching_models", "selecting_models", "saving")
export type WizardState = Schema.Schema.Type<typeof WizardState>

// ============================================================================
// Errors
// ============================================================================

export class WizardValidationError extends Schema.TaggedError<WizardValidationError>("WizardValidationError")(
  "WizardValidationError",
  { field: Schema.String, message: Schema.String }
) {}

export class FetchModelsError extends Schema.TaggedError<FetchModelsError>("FetchModelsError")(
  "FetchModelsError",
  { url: Schema.String, message: Schema.String }
) {}

// ============================================================================
// Validation Functions
// ============================================================================

const validateUrl = (url: string): Effect.Effect<string, WizardValidationError> => {
  if (!url || url.trim().length === 0) {
    return Effect.fail(new WizardValidationError({ field: "url", message: "URL is required" }))
  }

  try {
    const parsed = new URL(url)
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return Effect.fail(new WizardValidationError({ field: "url", message: "URL must use HTTP or HTTPS protocol" }))
    }
    return Effect.succeed(url.trim())
  } catch {
    return Effect.fail(new WizardValidationError({ field: "url", message: "Invalid URL format" }))
  }
}

const validateApiKey = (apiKey: string): Effect.Effect<string, WizardValidationError> => {
  if (!apiKey || apiKey.trim().length === 0) {
    return Effect.fail(new WizardValidationError({ field: "apiKey", message: "API key is required" }))
  }
  return Effect.succeed(apiKey.trim())
}

// ============================================================================
// Model Fetching
// ============================================================================

const fetchModelsFromEndpoint = (url: string, apiKey: string) =>
  Effect.gen(function* () {
    log.debug("Fetching models from endpoint", { url })

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`
    }

    try {
      const response = yield* Effect.promise(() =>
        fetch(`${url}/v1/models`, {
          method: "GET",
          headers,
        })
      )

      if (!response.ok) {
        const errorText = yield* Effect.promise(() => response.text())
        log.error("Failed to fetch models", { status: response.status, error: errorText.slice(0, 200) })
        return yield* new FetchModelsError({
          url,
          message: `HTTP ${response.status}: ${errorText.slice(0, 100)}`,
        })
      }

      const data = yield* Effect.promise(() => response.json())

      // Validate response structure
      const modelsArray = data?.data || data?.models || data
      if (!Array.isArray(modelsArray)) {
        return yield* new FetchModelsError({
          url,
          message: "Invalid response format: expected array of models",
        })
      }

      // Parse and validate models
      const models: ModelInfo[] = []
      for (const item of modelsArray) {
        if (item?.id) {
          models.push({
            id: String(item.id),
            name: String(item.name || item.id),
            description: item.description ? String(item.description) : undefined,
          })
        }
      }

      log.debug("Successfully fetched models", { count: models.length })
      return models
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error("Error fetching models", { error: errorMessage })
      return yield* new FetchModelsError({
        url,
        message: `Network error: ${errorMessage.slice(0, 100)}`,
      })
    }
  })

// ============================================================================
// Service Interface
// ============================================================================

export interface Interface {
  readonly start: () => Effect.Effect<WizardState>
  readonly submitUrl: (url: string) => Effect.Effect<{ state: WizardState; error?: string }>
  readonly submitApiKey: (apiKey: string) => Effect.Effect<{ state: WizardState; error?: string }>
  readonly fetchModels: () => Effect.Effect<{ state: WizardState; models: ModelInfo[]; error?: string }>
  readonly selectModels: (selectedIds: string[]) => Effect.Effect<{ state: WizardState; error?: string }>
  readonly getAvailableModels: () => Effect.Effect<ModelInfo[]>
  readonly getSelectedModels: () => Effect.Effect<string[]>
  readonly getState: () => Effect.Effect<WizardState>
  readonly getProviderConfig: () => Effect.Effect<ProviderConfig | undefined>
  readonly reset: () => Effect.Effect<void>
}

// ============================================================================
// Service Implementation
// ============================================================================

const make = Effect.gen(function* () {
  let state: WizardState = "idle"
  let url: string | undefined
  let apiKey: string | undefined
  let availableModels: ModelInfo[] = []
  let selectedModels: string[] = []

  const getState = () => Effect.sync(() => state)

  const start = () =>
    Effect.sync(() => {
      state = "awaiting_url"
      url = undefined
      apiKey = undefined
      availableModels = []
      selectedModels = []
      log.debug("Wizard started")
      return state
    })

  const reset = () =>
    Effect.sync(() => {
      state = "idle"
      url = undefined
      apiKey = undefined
      availableModels = []
      selectedModels = []
      log.debug("Wizard reset")
    })

  const submitUrl = (inputUrl: string) =>
    Effect.gen(function* () {
      const validatedUrl = yield* validateUrl(inputUrl)
      url = validatedUrl
      state = "awaiting_key"
      log.debug("URL submitted", { url })
      return { state }
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => ({
          state: "awaiting_url" as const,
          error: error.message,
        }))
      )
    )

  const submitApiKey = (inputApiKey: string) =>
    Effect.gen(function* () {
      const validatedKey = yield* validateApiKey(inputApiKey)
      apiKey = validatedKey
      state = "fetching_models"
      log.debug("API key submitted")
      return { state }
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => ({
          state: "awaiting_key" as const,
          error: error.message,
        }))
      )
    )

  const fetchModels = () =>
    Effect.gen(function* () {
      if (!url || !apiKey) {
        return {
          state: "awaiting_url" as WizardState,
          models: [] as ModelInfo[],
          error: "URL and API key are required",
        }
      }

      const models = yield* fetchModelsFromEndpoint(url, apiKey)
      availableModels = models
      state = "selecting_models"
      log.debug("Models fetched", { count: models.length })
      return { state, models }
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => ({
          state: "awaiting_key" as WizardState,
          models: [] as ModelInfo[],
          error: error.message,
        }))
      )
    )

  const selectModels = (ids: string[]) =>
    Effect.gen(function* () {
      if (state !== "selecting_models") {
        return {
          state,
          error: "Invalid state: must be in selecting_models state",
        }
      }

      // Validate that selected IDs exist in available models
      const validIds = ids.filter((id) => availableModels.some((m) => m.id === id))
      selectedModels = validIds
      state = "saving"
      log.debug("Models selected", { count: validIds.length })
      return { state }
    })

  const getAvailableModels = () => Effect.sync(() => availableModels)

  const getSelectedModels = () => Effect.sync(() => selectedModels)

  const getProviderConfig = () =>
    Effect.sync((): ProviderConfig | undefined => {
      if (!url || !apiKey || selectedModels.length === 0) {
        return undefined
      }

      const selectedModelInfos = selectedModels
        .map((id) => availableModels.find((m) => m.id === id))
        .filter((m): m is ModelInfo => m !== undefined)

      return {
        name: new URL(url).hostname,
        baseUrl: url,
        apiKey,
        models: selectedModelInfos,
      }
    })

  return {
    start,
    submitUrl,
    submitApiKey,
    fetchModels,
    selectModels,
    getAvailableModels,
    getSelectedModels,
    getState,
    getProviderConfig,
    reset,
  } satisfies Interface
})

// ============================================================================
// Service Export
// ============================================================================

export class Service extends Context.Service<Service, Interface>()("@opencode/ProviderWizard") {}

export const layer = Layer.effect(Service, make)
export const defaultLayer = layer

export * as ProviderWizard from "./wizard"
