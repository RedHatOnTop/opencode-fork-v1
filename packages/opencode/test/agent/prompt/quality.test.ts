/**
 * Quality Instructor Tests
 * 
 * Tests for the quality instructor module, including:
 * - Instructions content verification
 * - Token count estimation
 * - Compact instructions format
 */

import { describe, expect, it } from "bun:test"
import {
  QUALITY_INSTRUCTIONS,
  KARPATHY_PRINCIPLES,
  ECC_PATTERNS,
  VERIFY_LOOP_INSTRUCTIONS,
  getQualityInstructions,
  getCompactInstructions,
  estimateTokenCount,
  isWithinTokenBudget,
} from "@/agent/prompt/quality"

describe("Quality Instructor", () => {
  describe("Principles Content", () => {
    it("should include Karpathy's 4 principles", () => {
      expect(KARPATHY_PRINCIPLES).toInclude("Think Before Coding")
      expect(KARPATHY_PRINCIPLES).toInclude("Simplicity First")
      expect(KARPATHY_PRINCIPLES).toInclude("Surgical Changes")
      expect(KARPATHY_PRINCIPLES).toInclude("Goal-Driven Execution")
    })

    it("should include ECC patterns", () => {
      expect(ECC_PATTERNS).toInclude("early returns")
      expect(ECC_PATTERNS).toInclude("const over let")
    })

    it("should include verification loop instructions", () => {
      expect(VERIFY_LOOP_INSTRUCTIONS).toInclude("Verification Loop")
      expect(VERIFY_LOOP_INSTRUCTIONS).toInclude("lint")
      expect(VERIFY_LOOP_INSTRUCTIONS).toInclude("typecheck")
      expect(VERIFY_LOOP_INSTRUCTIONS).toInclude("test")
    })
  })

  describe("getQualityInstructions", () => {
    it("should return full instructions when enabled", () => {
      const result = getQualityInstructions(true)
      expect(result).toBeDefined()
      expect(result).toInclude("Think Before Coding")
      expect(result).toInclude("Verification Loop")
    })

    it("should return undefined when disabled", () => {
      const result = getQualityInstructions(false)
      expect(result).toBeUndefined()
    })

    it("should default to enabled", () => {
      const result = getQualityInstructions()
      expect(result).toBeDefined()
    })
  })

  describe("getCompactInstructions", () => {
    it("should return compact version", () => {
      const compact = getCompactInstructions()
      expect(compact).toBeDefined()
      expect(compact.length).toBeLessThan(QUALITY_INSTRUCTIONS.length)
    })

    it("should include essential principles in compact form", () => {
      const compact = getCompactInstructions()
      expect(compact).toInclude("Think before coding")
      expect(compact).toInclude("Simplicity first")
      expect(compact).toInclude("Surgical changes")
      expect(compact).toInclude("Goal-driven")
    })
  })

  describe("Token Estimation", () => {
    it("should estimate tokens for a simple string", () => {
      const text = "Hello world"
      const estimate = estimateTokenCount(text)
      // ~2.6 tokens for 2 words
      expect(estimate).toBeGreaterThan(0)
    })

    it("should scale with text length", () => {
      const shortText = "Hi"
      const longText = "This is a much longer text with many more words to test token estimation"
      
      const shortEstimate = estimateTokenCount(shortText)
      const longEstimate = estimateTokenCount(longText)
      
      expect(longEstimate).toBeGreaterThan(shortEstimate)
    })

    it("should estimate QUALITY_INSTRUCTIONS under 500 tokens", () => {
      const estimate = estimateTokenCount(QUALITY_INSTRUCTIONS)
      expect(estimate).toBeLessThan(500)
    })

    it("should estimate compact instructions under 200 tokens", () => {
      const compact = getCompactInstructions()
      const estimate = estimateTokenCount(compact)
      expect(estimate).toBeLessThan(200)
    })
  })

  describe("Token Budget Check", () => {
    it("should return true for short text within budget", () => {
      expect(isWithinTokenBudget("Hello", 100)).toBe(true)
    })

    it("should return false for text exceeding budget", () => {
      const longText = "a ".repeat(1000) // Long text
      expect(isWithinTokenBudget(longText, 10)).toBe(false)
    })

    it("should pass for compact instructions with default budget", () => {
      const compact = getCompactInstructions()
      expect(isWithinTokenBudget(compact)).toBe(true)
    })
  })
})
