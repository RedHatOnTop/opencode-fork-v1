import type { Tool, ModelMessage } from "ai"
import type { Provider } from "@/provider/provider"

/**
 * Tool calling fallback mechanism types
 * 
 * These types are used only when model.capabilities.toolcall === false
 * Native tool calling models never execute this code (performance isolation)
 */

export type FallbackStrategy = "react" | "json-mode" | "auto"

export interface FallbackConfig {
  /** Strategy for handling tool calls */
  strategy: FallbackStrategy
  /** Maximum iterations for multi-step tool calling */
  maxIterations: number
  /** How to inject tool results back into the conversation */
  toolResultInjection: "inline" | "separate-message"
  /** Timeout for each LLM call in ms */
  timeoutMs: number
}

export interface ReActStep {
  type: "thought" | "tool_call" | "final_answer"
  thought?: string
  name?: string
  arguments?: Record<string, unknown>
  content?: string
}

export interface ParsedToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolExecutionResult {
  toolCallId: string
  toolName: string
  result: string
  error?: string
}

export interface FallbackExecutionResult {
  text?: string
  toolCalls: ToolExecutionResult[]
  iterations: number
  aborted?: boolean
}

export type StreamEvent =
  | { type: "text-delta"; textDelta: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: "tool-result"; toolCallId: string; result: string; error?: string }
  | { type: "error"; error: string }

export interface LLMInterface {
  stream(
    messages: ModelMessage[],
    options?: Record<string, unknown>
  ): Promise<{ content: string; fullResponse?: unknown }>
}

export interface StrategySelector {
  select(model: Provider.Model): FallbackStrategy
}

// Default configuration
export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  strategy: "auto",
  maxIterations: 5,
  toolResultInjection: "inline",
  timeoutMs: 30000,
}

// Tool prompt templates
export const REACT_TEMPLATE = `You have access to the following tools:

{toolDescriptions}

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
- Use Final Answer only when you have all the information needed`

export const JSON_MODE_TEMPLATE = `You have access to the following tools:

{toolDescriptions}

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
