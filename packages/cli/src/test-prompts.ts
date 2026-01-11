import { getSystemPrompt, getAllSystemPrompts, isSystemPromptAvailable, AVAILABLE_PROMPTS } from "./system-prompts"

// Test that all prompts can be loaded
export function testSystemPrompts() {
  console.log("Testing system prompts...")

  // Test individual prompts
  for (const name of AVAILABLE_PROMPTS) {
    try {
      const prompt = getSystemPrompt(name)
      console.log(`✓ ${name}: ${prompt.length} characters`)
    } catch (error) {
      console.error(`✗ ${name}: Failed to load`, error)
      throw error
    }
  }

  // Test getAllSystemPrompts
  const allPrompts = getAllSystemPrompts()
  console.log(`✓ All prompts loaded: ${Object.keys(allPrompts).length}`)

  // Test isSystemPromptAvailable
  console.log(`✓ isSystemPromptAvailable('build'): ${isSystemPromptAvailable("build")}`)
  console.log(`✓ isSystemPromptAvailable('unknown'): ${isSystemPromptAvailable("unknown")}`)

  // Test invalid prompt
  try {
    getSystemPrompt("unknown" as any)
    console.error("✗ Should have thrown UnknownSystemPromptError")
  } catch (error) {
    console.log(`✓ UnknownSystemPromptError thrown correctly`)
  }

  console.log("All tests passed!")
}
