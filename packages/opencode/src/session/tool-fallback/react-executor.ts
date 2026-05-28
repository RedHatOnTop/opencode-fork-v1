import type { Tool, ModelMessage } from "ai"
import type { ReActStep, ParsedToolCall, ToolExecutionResult, StreamEvent, LLMInterface } from "./types"
import { generateReActPrompt } from "./prompts"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "tool-fallback:react" })

/**
 * ReAct (Reasoning + Acting) pattern executor for tool calling fallback
 * 
 * This executor is only used when model.capabilities.toolcall === false
 * Native tool calling models never execute this code (performance isolation)
 */

export interface ReActExecutorOptions {
  maxIterations: number
  toolResultInjection: "inline" | "separate-message"
  timeoutMs: number
  abortSignal?: AbortSignal
}

export class ReActExecutor {
  private options: ReActExecutorOptions

  constructor(options: Partial<ReActExecutorOptions> = {}) {
    this.options = {
      maxIterations: 5,
      toolResultInjection: "inline",
      timeoutMs: 30000,
      ...options,
    }
  }

  /**
   * Execute ReAct pattern with tool calling
   */
  async *execute(
    messages: ModelMessage[],
    tools: Record<string, Tool>,
    llm: LLMInterface
  ): AsyncIterable<StreamEvent> {
    const toolPrompt = generateReActPrompt(tools)
    let currentMessages = this.injectToolPrompt(messages, toolPrompt)
    let iteration = 0
    const executedTools: ToolExecutionResult[] = []

    log.info("Starting ReAct execution", { 
      maxIterations: this.options.maxIterations,
      toolCount: Object.keys(tools).length 
    })

    while (iteration < this.options.maxIterations) {
      iteration++
      log.debug("ReAct iteration", { iteration })

      try {
        // Stream LLM response
        const response = await llm.stream(currentMessages)
        const content = response.content

        log.debug("LLM response received", { contentLength: content.length })

        // Parse ReAct steps
        const steps = this.parseReActSteps(content)

        if (steps.length === 0) {
          // No recognizable pattern, treat as text response
          log.info("No ReAct pattern found, yielding text response")
          yield { type: "text-delta", textDelta: content }
          return
        }

        // Process steps
        for (const step of steps) {
          if (step.type === "tool_call" && step.name && step.arguments) {
            // Validate tool exists
            if (!tools[step.name]) {
              log.warn("Unknown tool requested", { toolName: step.name })
              const errorMsg = `Error: Tool "${step.name}" not found. Available tools: ${Object.keys(tools).join(", ")}`
              
              // Add error to conversation and continue
              currentMessages = this.addObservation(currentMessages, content, errorMsg)
              break
            }

            // Generate tool call ID
            const toolCallId = this.generateId()

            // Yield tool call event
            yield {
              type: "tool-call",
              toolCallId,
              toolName: step.name,
              args: step.arguments,
            }

            // Execute tool
            log.info("Executing tool", { toolName: step.name, iteration })
            const result = await this.executeTool(step, tools)
            
            executedTools.push({
              toolCallId,
              toolName: step.name,
              result: result.output,
              error: result.error,
            })

            // Yield tool result event
            yield {
              type: "tool-result",
              toolCallId,
              result: result.output,
              error: result.error,
            }

            // Add observation to conversation
            const observation = result.error 
              ? `Observation: Error executing tool: ${result.error}`
              : `Observation: ${result.output}`
            
            currentMessages = this.addObservation(currentMessages, content, observation)
            
            // Break to get next LLM response
            break
          }

          if (step.type === "final_answer" && step.content) {
            log.info("Final answer received", { iteration })
            yield { type: "text-delta", textDelta: step.content }
            return
          }

          if (step.type === "thought") {
            // Yield thought as text for visibility
            if (step.thought) {
              yield { type: "text-delta", textDelta: `Thinking: ${step.thought}\n\n` }
            }
          }
        }
      } catch (error) {
        log.error("Error in ReAct execution", { error, iteration })
        yield { 
          type: "error", 
          error: `ReAct execution error: ${error instanceof Error ? error.message : String(error)}` 
        }
        return
      }
    }

    log.warn("Max iterations reached", { maxIterations: this.options.maxIterations })
    yield { 
      type: "error", 
      error: `Maximum tool calling iterations (${this.options.maxIterations}) exceeded` 
    }
  }

  /**
   * Parse ReAct steps from LLM response
   */
  private parseReActSteps(content: string): ReActStep[] {
    const steps: ReActStep[] = []

    // Pattern 1: Thought: ... Action: ... Action Input: ...
    // Match both "Thought: ... Action: ..." and "Action: ..." (without Thought:) patterns
    const actionPattern = /(?:Thought:\s*([^\n]*)\n*)?Action:\s*([^\n]*)\n*Action Input:\s*({[\s\S]*?}|\[[\s\S]*?\]|[^\n]*)/gi
    let match

    while ((match = actionPattern.exec(content)) !== null) {
      const thought = match[1]?.trim()
      const action = match[2]?.trim()
      const actionInput = match[3]?.trim()

      if (thought) {
        steps.push({ type: "thought", thought })
      }

      if (action) {
        const args = this.safeJsonParse(actionInput) || { raw: actionInput }
        steps.push({
          type: "tool_call",
          name: action,
          arguments: args,
        })
      }
    }

    // Pattern 2: Final Answer: ...
    const finalPattern = /Final Answer:\s*([\s\S]*?)(?=\nThought:|\nAction:|$)/i
    const finalMatch = content.match(finalPattern)
    if (finalMatch) {
      const finalContent = finalMatch[1]?.trim()
      if (finalContent) {
        steps.push({
          type: "final_answer",
          content: finalContent,
        })
      }
    }

    // If no patterns found but content exists, treat as potential text response
    if (steps.length === 0 && content.trim()) {
      steps.push({
        type: "final_answer",
        content: content.trim(),
      })
    }

    return steps
  }

  /**
   * Safely parse JSON, return null on failure
   */
  private safeJsonParse(input: string): Record<string, unknown> | null {
    if (!input || input.trim() === "") {
      return null
    }

    // Try direct JSON parse
    try {
      return JSON.parse(input) as Record<string, unknown>
    } catch {
      // Try extracting JSON from markdown code block
      const codeBlockPattern = /```(?:json)?\s*\n?([\s\S]*?)```/
      const match = input.match(codeBlockPattern)
      if (match && match[1]) {
        try {
          return JSON.parse(match[1]) as Record<string, unknown>
        } catch {
          return null
        }
      }
      return null
    }
  }

  /**
   * Execute a tool call
   */
  private async executeTool(
    step: ReActStep,
    tools: Record<string, Tool>
  ): Promise<{ output: string; error?: string }> {
    if (!step.name || !tools[step.name]) {
      return { output: "", error: `Tool "${step.name}" not found` }
    }

    const tool = tools[step.name]
    
    if (!tool.execute) {
      return { output: "", error: `Tool "${step.name}" has no execute function` }
    }

    try {
      const result = await tool.execute(step.arguments || {}, {
        toolCallId: this.generateId(),
        messages: [],
        abortSignal: this.options.abortSignal ?? new AbortController().signal,
      })

      const output = typeof result === "string" ? result : JSON.stringify(result)
      return { output }
    } catch (error) {
      return {
        output: "",
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Inject tool prompt into system message
   */
  private injectToolPrompt(messages: ModelMessage[], toolPrompt: string): ModelMessage[] {
    // Find existing system message or create new one
    const systemIndex = messages.findIndex((m) => m.role === "system")
    
    if (systemIndex >= 0) {
      // Append to existing system message
      const systemMsg = messages[systemIndex]
      const existingContent = typeof systemMsg.content === "string" 
        ? systemMsg.content 
        : JSON.stringify(systemMsg.content)
      
      const newContent = `${existingContent}\n\n${toolPrompt}`
      
      const newMessages = [...messages]
      newMessages[systemIndex] = {
        ...systemMsg,
        content: newContent,
      } as ModelMessage
      return newMessages
    }

    // Add new system message at the beginning
    return [
      { role: "system", content: toolPrompt },
      ...messages,
    ]
  }

  /**
   * Add observation to conversation history
   */
  private addObservation(
    messages: ModelMessage[],
    assistantResponse: string,
    observation: string
  ): ModelMessage[] {
    return [
      ...messages,
      { role: "assistant", content: assistantResponse },
      { role: "user", content: observation },
    ]
  }

  /**
   * Generate unique ID for tool calls
   */
  private generateId(): string {
    return `fallback_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }
}
