/**
 * Setup Command - Interactive Provider Configuration
 *
 * Guides users through initial provider setup with preset configurations
 * and API key entry for popular AI providers.
 */

import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { Auth } from "../../auth"
import { AppRuntime } from "../../effect/app-runtime"
import { Config } from "@/config/config"
import { Effect } from "effect"
import { Global } from "@opencode-ai/core/global"
import fs from "fs"
import path from "path"

// ============================================================================
// Provider Presets
// ============================================================================

interface ProviderPreset {
  id: string
  name: string
  api: string
  envKey: string
  baseURL?: string
  models: Record<string, { id: string; name: string }>
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    api: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    models: {
      "claude-sonnet-4-20250514": { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      "claude-opus-4-20250514": { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
      "claude-haiku-3-5-20241022": { id: "claude-haiku-3-5-20241022", name: "Claude 3.5 Haiku" },
    },
  },
  {
    id: "openai",
    name: "OpenAI (GPT)",
    api: "openai",
    envKey: "OPENAI_API_KEY",
    models: {
      "gpt-4.1": { id: "gpt-4.1", name: "GPT-4.1" },
      "gpt-4.1-mini": { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
      "o3": { id: "o3", name: "o3" },
      "o4-mini": { id: "o4-mini", name: "o4-mini" },
    },
  },
  {
    id: "google",
    name: "Google (Gemini)",
    api: "google",
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    models: {
      "gemini-2.5-pro": { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      "gemini-2.5-flash": { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    },
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    api: "openai",
    envKey: "XAI_API_KEY",
    baseURL: "https://api.x.ai/v1",
    models: {
      "grok-3": { id: "grok-3", name: "Grok 3" },
      "grok-3-mini": { id: "grok-3-mini", name: "Grok 3 Mini" },
    },
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    api: "openai",
    envKey: "OPENROUTER_API_KEY",
    baseURL: "https://openrouter.ai/api/v1",
    models: {},
  },
]

// ============================================================================
// Helpers
// ============================================================================

const put = (key: string, info: Auth.Info) =>
  AppRuntime.runPromise(
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set(key, info)
    }),
  )

function checkEnvKey(envKey: string): string | undefined {
  return process.env[envKey]
}

// ============================================================================
// Command
// ============================================================================

export const SetupCommand = cmd({
  command: "setup",
  describe: "interactively configure AI providers and API keys",
  builder: (yargs) =>
    yargs
      .option("preset", {
        type: "boolean",
        describe: "Show preset provider configurations",
        default: false,
      })
      .example([
        ["opencode setup", "Run interactive setup wizard"],
        ["opencode setup --preset", "Show available provider presets"],
      ]),
  async handler(args) {
    UI.empty()
    prompts.intro("OpenCode Setup")

    // Show presets mode
    if (args.preset) {
      prompts.log.info("Available provider presets:\n")
      for (const preset of PROVIDER_PRESETS) {
        const modelCount = Object.keys(preset.models).length
        const envStatus = checkEnvKey(preset.envKey) ? "✅ set" : "❌ not set"
        console.log(`  ${preset.name}`)
        console.log(`    Env: ${preset.envKey} (${envStatus})`)
        if (modelCount > 0) {
          console.log(`    Models: ${Object.values(preset.models).map((m) => m.name).join(", ")}`)
        }
        if (preset.baseURL) {
          console.log(`    Base URL: ${preset.baseURL}`)
        }
        console.log("")
      }
      prompts.outro("Run `opencode setup` to configure providers interactively.")
      return
    }

    // Check for existing environment variables
    const detectedProviders = PROVIDER_PRESETS.filter(
      (p) => checkEnvKey(p.envKey) !== undefined,
    )

    if (detectedProviders.length > 0) {
      prompts.log.info("Detected API keys in environment:")
      for (const p of detectedProviders) {
        prompts.log.success(`  ${p.name} (${p.envKey})`)
      }
      console.log("")
    }

    // Provider selection
    const selectedProviders = await prompts.multiselect({
      message: "Select providers to configure",
      options: PROVIDER_PRESETS.map((p) => ({
        label: p.name,
        value: p.id,
        hint: checkEnvKey(p.envKey) ? "API key detected in env" : `Set ${p.envKey}`,
      })),
      required: false,
    })

    if (prompts.isCancel(selectedProviders) || (selectedProviders as string[]).length === 0) {
      prompts.outro("Setup cancelled.")
      return
    }

    const selected = selectedProviders as string[]

    for (const providerId of selected) {
      const preset = PROVIDER_PRESETS.find((p) => p.id === providerId)!
      const existingKey = checkEnvKey(preset.envKey)

      console.log("")
      prompts.log.info(`Configuring ${preset.name}...`)

      // If env key exists, ask if they want to use it or enter a new one
      let apiKey: string | symbol | undefined

      if (existingKey) {
        const useEnv = await prompts.confirm({
          message: `Use existing ${preset.envKey} from environment?`,
          initialValue: true,
        })
        if (prompts.isCancel(useEnv)) continue

        if (!useEnv) {
          apiKey = await prompts.password({
            message: `Enter ${preset.name} API key`,
          })
        } else {
          apiKey = existingKey
        }
      } else {
        apiKey = await prompts.password({
          message: `Enter ${preset.name} API key`,
        })
      }

      if (prompts.isCancel(apiKey) || !apiKey) {
        prompts.log.warn(`Skipped ${preset.name}`)
        continue
      }

      // Store the API key
      await put(providerId, {
        type: "api",
        key: apiKey as string,
      })

      prompts.log.success(`API key stored for ${preset.name}`)

      // Write provider config to opencode.json
      const spinner = prompts.spinner()
      spinner.start("Updating configuration...")

      await AppRuntime.runPromise(
        Config.Service.use((cfg) =>
          Effect.gen(function* () {
            const currentConfig = (yield* cfg.getGlobal()) || {}

            const providerConfig = currentConfig.provider || {}
            const modelsConfig: Record<string, any> = {}
            for (const [modelId, modelInfo] of Object.entries(preset.models)) {
              modelsConfig[modelId] = {
                id: modelInfo.id,
                name: modelInfo.name,
              }
            }

            providerConfig[providerId] = {
              ...providerConfig[providerId],
              name: preset.name,
              api: preset.api,
              ...(preset.baseURL
                ? { options: { ...(providerConfig[providerId]?.options || {}), baseURL: preset.baseURL } }
                : {}),
              models: {
                ...(providerConfig[providerId]?.models || {}),
                ...modelsConfig,
              },
            }

            yield* cfg.updateGlobal({
              ...currentConfig,
              provider: providerConfig,
            })
          }),
        ),
      )

      spinner.stop(`${preset.name} configured successfully`)
    }

    console.log("")
    prompts.log.info("Configuration saved to opencode.json")
    prompts.log.info("API keys stored securely in auth.json")
    prompts.outro("Setup complete! Run `opencode` to start coding.")
  },
})
