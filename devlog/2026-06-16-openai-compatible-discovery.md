# Generic OpenAI-compatible model discovery — 2026-06-16

## Context
- Symptom: editing/reconnecting a provider in `/connect` never refreshed the model
  list from the provider's own `GET /v1/models`. Custom OpenAI-compatible providers
  configured in `opencode.json` (e.g. a self-hosted proxy) showed no models unless
  every model was declared explicitly in config.
- Root cause: `Provider.Service.load` only ran dynamic model discovery for gitlab.
  The `discoveryLoaders` map was populated for any custom loader that supplied
  `discoverModels`, but the consumer (`provider.ts`, formerly gitlab-only) was
  hardcoded to `gitlab`, and no loader existed for generic OpenAI-compatible
  endpoints. The gitlab path also swallowed all errors silently (`catch (e) {}`).

## Changes
- `packages/opencode/src/provider/provider.ts`
  - Added `discoverOpenAICompatibleModels(baseURL, apiKey, providerID)`: fetches the
    live model list, trying `{base}/models` then `{base}/v1/models`, parses the
    OpenAI `{ data: [{ id }] }` shape (and bare arrays), and builds `Model` entries
    with conservative defaults (`@ai-sdk/openai-compatible`, toolcall enabled,
    zero cost). 15s per-request timeout.
  - Generalized the discovery consumer: iterate every `discoveryLoaders` entry
    instead of the hardcoded gitlab branch. Errors are surfaced via
    `Effect.logWarning` rather than swallowed.
  - Added a generic OpenAI-compatible discovery pass over loaded providers.
    Eligible = connected (has `key`), allowed, no specific discovery loader, a
    resolvable base URL (provider options `baseURL` -> config `options.baseURL` ->
    config `api` -> any model `api.url`, with `${ENV}` substitution), OpenAI-shaped
    npm, and either no catalog models or a custom endpoint (so stock catalog
    providers like `openai`/`anthropic` are not probed unless proxied).
- `packages/opencode/test/provider/discover-models.test.ts`: unit tests for the
  helper (data-shape, array-shape, `/v1/models` fallback, non-OK, non-OpenAI body,
  bearer auth).

## How it fixes the report
- `/connect` "Reconnect" -> `auth.set` -> `instance.dispose()` -> `sync.bootstrap()`
  -> `config.providers` -> fresh `Provider.Service.load`. The new discovery pass now
  runs during that load, so editing a custom provider repopulates its model list
  from the live endpoint.

## Verified
- `bun typecheck` (packages/opencode): clean.
- `bun test test/provider`: 393 pass, 0 fail (incl. 6 new tests).

## Notes / risks
- Discovery runs on every load (mirrors gitlab). Hermetic down endpoints fail fast
  (connection refused); only hanging endpoints hit the 15s timeout. Consider
  caching/non-blocking discovery if load latency becomes an issue.
- `api.url` on discovered models is set to the resolved base (consistent with what
  `resolveSDK` uses for chat); it does not rewrite a misconfigured base.
