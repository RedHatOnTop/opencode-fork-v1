/**
 * Quality Instructor - System Prompt Quality Guidelines
 * 
 * Integrates Karpathy's 4 principles, ECC patterns, and verification loop instructions
 * into a minimal token format for system prompt injection.
 */

/**
 * Karpathy's 4 Principles - Coding Quality Guidelines
 * 1. Think Before Coding
 * 2. Simplicity First
 * 3. Surgical Changes
 * 4. Goal-Driven Execution
 */
export const KARPATHY_PRINCIPLES = `
## Coding Principles

1. Think Before Coding: State assumptions explicitly. If uncertain, ask questions rather than guess. Present multiple interpretations if ambiguity exists.

2. Simplicity First: Do not add features beyond what was requested. Avoid creating abstractions for single-use code. If 200 lines can be 50 lines, rewrite it.

3. Surgical Changes: Only modify code directly related to the request. Do not "improve" adjacent code, comments, or formatting. Follow existing style.

4. Goal-Driven Execution: Define success criteria and iterate until validated. After changes, run lint, typecheck, and tests. Retry up to 3 times on failure.
` as const

/**
 * ECC (Everything Claude Code) Verified Patterns
 * - coding-standards: Consistent code style enforcement
 * - security-review: Security best practices
 */
export const ECC_PATTERNS = `
## Quality Patterns

- Use early returns instead of nested conditionals
- Prefer const over let, never use var
- No destructuring in function parameters
- Follow existing code style in the codebase
- Validate all inputs, sanitize outputs
- Never expose secrets or sensitive data in logs
` as const

/**
 * Verification Loop Instructions
 * Auto-run verification commands after code changes
 */
export const VERIFY_LOOP_INSTRUCTIONS = `
## Verification Loop

After code changes:
1. Run configured verification commands (lint, typecheck, test)
2. If failed, analyze error output and attempt fix
3. Retry up to configured max attempts (default: 3)
4. After max attempts, report failure to user
` as const

/**
 * Combined Quality Instructions
 * Optimized for minimal token count while maintaining clarity
 */
export const QUALITY_INSTRUCTIONS = `${KARPATHY_PRINCIPLES}${ECC_PATTERNS}${VERIFY_LOOP_INSTRUCTIONS}` as const

/**
 * Get quality instructions based on configuration
 * @param enabled - Whether quality instructions are enabled
 * @returns Quality instructions string or undefined if disabled
 */
export function getQualityInstructions(enabled: boolean = true): string | undefined {
  if (!enabled) return undefined
  return QUALITY_INSTRUCTIONS.trim()
}

/**
 * Get compact version optimized for token efficiency
 * @returns Minified quality instructions
 */
export function getCompactInstructions(): string {
  return `
## Quality Guidelines
- Think before coding: state assumptions, ask when uncertain
- Simplicity first: no extra features, avoid premature abstractions
- Surgical changes: only modify relevant code, preserve style
- Goal-driven: define success, verify with lint/typecheck/tests, retry up to 3x
- Code style: early returns, const preferred, no param destructuring
- Security: validate inputs, sanitize outputs, no secrets in logs
`.trim()
}

/**
 * Calculate approximate token count of instructions
 * Rough estimation: ~1.3 tokens per word for English text
 */
export function estimateTokenCount(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0).length
  return Math.ceil(words * 1.3)
}

/**
 * Verify instructions are within token budget
 * @param maxTokens - Maximum allowed tokens (default: 500)
 * @returns Whether instructions fit within budget
 */
export function isWithinTokenBudget(text: string, maxTokens: number = 500): boolean {
  return estimateTokenCount(text) <= maxTokens
}
