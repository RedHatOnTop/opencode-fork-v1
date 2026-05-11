import type { Tool } from "ai"

/**
 * Tool prompt generators for fallback mechanism
 * 
 * These prompts are injected into the system message when using
 * ReAct or JSON mode tool calling for models without native support
 */

interface ToolDescription {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/**
 * Format a tool's schema into a readable description
 */
function formatToolDescription(name: string, tool: Tool): string {
  const description = tool.description || "No description provided"
  const parameters = (tool as any).parameters || (tool as any).inputSchema || {}
  
  return `Tool: ${name}
Description: ${description}
Parameters: ${JSON.stringify(parameters, null, 2)}`
}

/**
 * Generate ReAct prompt with tool descriptions
 */
export function generateReActPrompt(tools: Record<string, Tool>): string {
  const toolDescriptions = Object.entries(tools)
    .map(([name, tool]) => formatToolDescription(name, tool))
    .join("\n\n")

  return `You have access to the following tools:

${toolDescriptions}

When you need to use a tool, follow this exact format:

Thought: [your reasoning about what tool to use and why]
Action: [tool_name]
Action Input: [JSON object with parameters]

The system will execute the tool and respond with:
Observation: [tool execution result]

You can then continue with another tool or provide your final answer:
Thought: [your reasoning about the observation]
Final Answer: [your response to the user]

Important:
- Always include "Thought:" before "Action:"
- Action Input must be valid JSON
- Use Final Answer only when you have all the information needed
- If no tool is needed, respond directly with Final Answer`
}

/**
 * Generate JSON mode prompt with tool descriptions
 */
export function generateJsonModePrompt(tools: Record<string, Tool>): string {
  const toolDescriptions = Object.entries(tools)
    .map(([name, tool]) => formatToolDescription(name, tool))
    .join("\n\n")

  return `You have access to the following tools:

${toolDescriptions}

When you need to use a tool, respond with ONLY a JSON object in this exact format:

{
  "tool_calls": [
    {
      "name": "tool_name",
      "arguments": { ... }
    }
  ]
}

Do not include any text outside the JSON object when making tool calls.

After receiving tool results, respond normally to the user.`
}

/**
 * Generate simple tool listing for minimal context
 */
export function generateToolList(tools: Record<string, Tool>): string {
  return Object.entries(tools)
    .map(([name, tool]) => `- ${name}: ${tool.description || "No description"}`)
    .join("\n")
}
