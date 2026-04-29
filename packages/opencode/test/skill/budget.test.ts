import { describe, it, expect } from "bun:test"
import fc from "fast-check"
import { estimateTokens } from "../../src/skill/budget"

// ---------------------------------------------------------------------------
// Property 12: Token estimation correctness
// ---------------------------------------------------------------------------

describe("Token Budget — Property 12: Token estimation", () => {
  it("should match Math.ceil(string.length / 4)", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const expected = text.length === 0 ? 0 : Math.ceil(text.length / 4)
        expect(estimateTokens(text)).toEqual(expected)
      }),
      { numRuns: 200 },
    )
  })

  it("should return 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0)
  })

  it("should estimate 1 token for 4 characters", () => {
    expect(estimateTokens("abcd")).toBe(1)
  })

  it("should estimate 1 token for 1 character", () => {
    expect(estimateTokens("a")).toBe(1)
  })

  it("should estimate 2 tokens for 5 characters", () => {
    expect(estimateTokens("abcde")).toBe(2)
  })
})
