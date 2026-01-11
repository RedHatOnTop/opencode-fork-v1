import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Available system prompt types
 */
export type SystemPromptName = "build" | "plan" | "general" | "orchestrator"

/**
 * List of all available system prompt names
 */
export const AVAILABLE_PROMPTS: SystemPromptName[] = ["build", "plan", "general", "orchestrator"]

/**
 * Error thrown when an unknown system prompt is requested
 */
export class UnknownSystemPromptError extends Error {
  constructor(name: string) {
    super(`Unknown system prompt: "${name}". Available prompts: ${AVAILABLE_PROMPTS.join(", ")}`)
    this.name = "UnknownSystemPromptError"
  }
}

/**
 * Get a system prompt by name
 *
 * @param name - The name of the system prompt to retrieve
 * @returns The system prompt content as a string
 * @throws {UnknownSystemPromptError} If the requested prompt name is not available
 *
 * @example
 * ```ts
 * import { getSystemPrompt } from '@/system-prompts'
 *
 * const buildPrompt = getSystemPrompt('build')
 * const planPrompt = getSystemPrompt('plan')
 * const orchestratorPrompt = getSystemPrompt('orchestrator')
 * ```
 */
export function getSystemPrompt(name: SystemPromptName): string {
  const promptPath = join(__dirname, `${name}.md`)

  try {
    const content = readFileSync(promptPath, "utf-8")
    // Remove the header comment (lines between <!-- and -->)
    // Keep the rest of the content
    return content
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UnknownSystemPromptError(name)
    }
    throw error
  }
}

/**
 * Check if a system prompt name is valid
 *
 * @param name - The name to check
 * @returns True if the prompt name is available, false otherwise
 */
export function isSystemPromptAvailable(name: string): name is SystemPromptName {
  return AVAILABLE_PROMPTS.includes(name as SystemPromptName)
}

/**
 * Get all available system prompts
 *
 * @returns An object mapping prompt names to their content
 */
export function getAllSystemPrompts(): Record<SystemPromptName, string> {
  const prompts: Partial<Record<SystemPromptName, string>> = {}

  for (const name of AVAILABLE_PROMPTS) {
    prompts[name] = getSystemPrompt(name)
  }

  return prompts as Record<SystemPromptName, string>
}
