import { expect, test } from "bun:test"
import { resolveApiKey } from "@/provider/provider"
import type { Info } from "@/provider/provider"
import type { ConfigV1 } from "@opencode-ai/core/v1/config/config"

type ConfigProvider = NonNullable<ConfigV1.Info["provider"]>[string]

const emptyEnvs = {}

// A provider with only provider.key (the env/auth path) resolves to it directly.
test("prefers provider.key when present", () => {
  const provider = { key: "from-key" } as unknown as Info
  const result = resolveApiKey(provider, undefined, emptyEnvs)
  expect(result).toBe("from-key")
})

// The regression this guards: a custom provider configured purely in opencode.json
// via options.apiKey, with no env var and no stored auth, still resolves a key.
test("falls back to provider.options.apiKey when key is absent", () => {
  const provider = { options: { apiKey: "from-options" } } as unknown as Info
  const result = resolveApiKey(provider, undefined, emptyEnvs)
  expect(result).toBe("from-options")
})

test("falls back to configProvider.options.apiKey", () => {
  const provider = { options: {} } as unknown as Info
  const configProvider = { options: { apiKey: "from-config" } } as ConfigProvider
  const result = resolveApiKey(provider, configProvider, emptyEnvs)
  expect(result).toBe("from-config")
})

// ${VAR} placeholders in a configured key are substituted from the environment.
test("substitutes ${ENV} placeholders in options.apiKey", () => {
  const provider = { options: { apiKey: "${MY_KEY}" } } as unknown as Info
  const result = resolveApiKey(provider, undefined, { MY_KEY: "resolved-key" })
  expect(result).toBe("resolved-key")
})

test("leaves unknown ${ENV} placeholders intact", () => {
  const provider = { options: { apiKey: "${MISSING}" } } as unknown as Info
  const result = resolveApiKey(provider, undefined, emptyEnvs)
  expect(result).toBe("${MISSING}")
})

test("falls back to a Bearer Authorization header, stripping the prefix", () => {
  const provider = { options: { headers: { Authorization: "Bearer token-from-header" } } } as unknown as Info
  const result = resolveApiKey(provider, undefined, emptyEnvs)
  expect(result).toBe("token-from-header")
})

test("falls back to a Bearer header from configProvider", () => {
  const provider = { options: {} } as unknown as Info
  const configProvider = {
    options: { headers: { Authorization: "Bearer cfg-token" } },
  } as ConfigProvider
  const result = resolveApiKey(provider, configProvider, emptyEnvs)
  expect(result).toBe("cfg-token")
})

// provider.key takes precedence over options.apiKey.
test("provider.key wins over options.apiKey", () => {
  const provider = { key: "from-key", options: { apiKey: "from-options" } } as unknown as Info
  const result = resolveApiKey(provider, undefined, emptyEnvs)
  expect(result).toBe("from-key")
})

test("returns undefined when no key source is available", () => {
  const provider = { options: {} } as unknown as Info
  const result = resolveApiKey(provider, undefined, emptyEnvs)
  expect(result).toBeUndefined()
})

test("ignores empty-string apiKey and header values", () => {
  const provider = {
    options: { apiKey: "", headers: { Authorization: "" } },
  } as unknown as Info
  const result = resolveApiKey(provider, undefined, emptyEnvs)
  expect(result).toBeUndefined()
})
