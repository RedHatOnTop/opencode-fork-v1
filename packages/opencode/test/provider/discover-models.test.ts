import { afterEach, expect, test } from "bun:test"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { discoverOpenAICompatibleModels } from "@/provider/provider"

const providerID = ProviderV2.ID.make("my-custom")

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function mockFetch(routes: Record<string, unknown | ((url: string) => Response)>) {
  globalThis.fetch = ((input: any) => {
    const url = typeof input === "string" ? input : input.url
    for (const [pattern, value] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return Promise.resolve(typeof value === "function" ? value(url) : jsonResponse(value))
      }
    }
    return Promise.resolve(jsonResponse({ error: "not found" }, 404))
  }) as typeof fetch
}

test("discovers models from an OpenAI-style {data: [...]} response at {base}/models", async () => {
  mockFetch({
    "/models": { data: [{ id: "gpt-discovered-1" }, { id: "gpt-discovered-2" }] },
  })

  const models = await discoverOpenAICompatibleModels("https://example.test/v1", "secret", providerID)

  expect(Object.keys(models).sort()).toEqual(["gpt-discovered-1", "gpt-discovered-2"])
  expect(models["gpt-discovered-1"].id).toBe(ModelV2.ID.make("gpt-discovered-1"))
  expect(models["gpt-discovered-1"].providerID).toBe(providerID)
  expect(models["gpt-discovered-1"].api).toEqual({
    id: "gpt-discovered-1",
    npm: "@ai-sdk/openai-compatible",
    url: "https://example.test/v1",
  })
  expect(models["gpt-discovered-1"].capabilities.toolcall).toBe(true)
})

test("falls back to {base}/v1/models when {base}/models is missing", async () => {
  mockFetch({
    "/v1/models": { data: [{ id: "deepseek-chat" }] },
  })

  const models = await discoverOpenAICompatibleModels("https://example.test", "secret", providerID)

  expect(Object.keys(models)).toEqual(["deepseek-chat"])
  expect(models["deepseek-chat"].api.url).toBe("https://example.test")
})

test("accepts a bare array response shape", async () => {
  mockFetch({
    "/models": [{ id: "llama-3" }, "llama-2"],
  })

  const models = await discoverOpenAICompatibleModels("https://example.test/v1", "secret", providerID)

  expect(Object.keys(models).sort()).toEqual(["llama-2", "llama-3"])
})

test("returns an empty record when the endpoint is not OpenAI-compatible", async () => {
  mockFetch({
    "/models": { object: "list", not_the_shape: true },
  })

  const models = await discoverOpenAICompatibleModels("https://example.test/v1", "secret", providerID)

  expect(models).toEqual({})
})

test("returns an empty record on a non-200 response", async () => {
  mockFetch({
    "/models": () => jsonResponse({ error: "unauthorized" }, 401),
  })

  const models = await discoverOpenAICompatibleModels("https://example.test/v1", "secret", providerID)

  expect(models).toEqual({})
})

test("sends the API key as a bearer token", async () => {
  let captured: string | undefined
  globalThis.fetch = ((input: any, init?: any) => {
    captured = init?.headers?.Authorization
    return Promise.resolve(jsonResponse({ data: [{ id: "m" }] }))
  }) as typeof fetch

  await discoverOpenAICompatibleModels("https://example.test/v1", "my-key", providerID)

  expect(captured).toBe("Bearer my-key")
})
