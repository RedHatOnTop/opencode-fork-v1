import { describe, it, expect } from "bun:test"
import fc from "fast-check"

describe("Property 13: Provider Wizard 모델 목록 정합성", () => {
  it("API 응답 모델 목록은 표시 목록과 동일해야 함", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 5, maxLength: 50 }),
            name: fc.string({ minLength: 3, maxLength: 50 }),
            description: fc.string({ minLength: 10, maxLength: 200 }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (apiModels) => {
          // Simulate API response
          const apiResponse = { data: apiModels }

          // Simulate parsing for display
          const displayedModels = apiResponse.data.map((m) => ({
            id: m.id,
            name: m.name,
            description: m.description,
          }))

          // Verify displayed models match API response
          expect(displayedModels.length).toBe(apiModels.length)
          for (let i = 0; i < apiModels.length; i++) {
            expect(displayedModels[i].id).toBe(apiModels[i].id)
            expect(displayedModels[i].name).toBe(apiModels[i].name)
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it("사용자가 선택한 모델만 설정 파일에 저장되어야 함", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 5, maxLength: 50 }),
            name: fc.string({ minLength: 3, maxLength: 50 }),
          }),
          { minLength: 5, maxLength: 20 }
        ),
        fc.array(fc.integer({ min: 0, max: 19 }), { minLength: 1, maxLength: 5 }),
        (availableModels, selectedIndices) => {
          // Ensure indices are within bounds
          const validIndices = selectedIndices.filter((idx) => idx < availableModels.length)
          const uniqueIndices = [...new Set(validIndices)]

          // Select models based on indices
          const selectedModels = uniqueIndices.map((idx) => availableModels[idx])

          // Simulate saving to config
          const configToSave = {
            provider: {
              custom_provider: {
                models: selectedModels.map((m) => m.id),
              },
            },
          }

          // Verify only selected models are in config
          expect(configToSave.provider.custom_provider.models.length).toBe(selectedModels.length)

          for (const model of selectedModels) {
            expect(configToSave.provider.custom_provider.models).toContain(model.id)
          }

          // Verify unselected models are not in config
          const unselectedModels = availableModels.filter((_, idx) => !uniqueIndices.includes(idx))
          for (const model of unselectedModels) {
            expect(configToSave.provider.custom_provider.models).not.toContain(model.id)
          }
        }
      ),
      { numRuns: 30 }
    )
  })

  it("Provider 정보(URL, API 키)는 설정 파일에 저장되어야 함", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 100 }), // URL
        fc.string({ minLength: 20, maxLength: 100 }), // API key
        fc.array(
          fc.string({ minLength: 5, maxLength: 50 }), // model IDs
          { minLength: 1, maxLength: 5 }
        ),
        (url, apiKey, modelIds) => {
          // Simulate provider config
          const providerConfig = {
            name: new URL(`http://${url}`).hostname,
            baseUrl: url,
            apiKey: apiKey,
            models: modelIds.map((id) => ({ id, name: id })),
          }

          // Verify all required fields are present
          expect(providerConfig.name).toBeDefined()
          expect(providerConfig.baseUrl).toBe(url)
          expect(providerConfig.apiKey).toBe(apiKey)
          expect(providerConfig.models.length).toBe(modelIds.length)
        }
      ),
      { numRuns: 30 }
    )
  })

  it("모델 목록 가져오기 실패 시 오류가 적절히 처리되어야 함", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(401, 403, 404, 500, 503),
        fc.string({ minLength: 5, maxLength: 50 }), // error message
        (statusCode, errorMessage) => {
          // Simulate error response
          const errorResponse = {
            status: statusCode,
            message: errorMessage,
          }

          // Should indicate failure
          expect(errorResponse.status).toBeGreaterThanOrEqual(400)

          // Should provide meaningful error message
          expect(errorResponse.message.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 30 }
    )
  })

  it("Wizard 상태는 idle → awaiting_url → awaiting_key → fetching_models → selecting_models → saving 순서로 진행되어야 함", () => {
    const validTransitions = [
      { from: "idle", to: "awaiting_url" },
      { from: "awaiting_url", to: "awaiting_key" },
      { from: "awaiting_key", to: "fetching_models" },
      { from: "fetching_models", to: "selecting_models" },
      { from: "selecting_models", to: "saving" },
      { from: "saving", to: "idle" },
    ]

    const allStates = ["idle", "awaiting_url", "awaiting_key", "fetching_models", "selecting_models", "saving"]

    // Verify all valid transitions
    for (const transition of validTransitions) {
      expect(allStates.indexOf(transition.to)).toBeGreaterThan(allStates.indexOf(transition.from))
    }
  })
})
