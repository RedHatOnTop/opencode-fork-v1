import type { Tool, ModelMessage } from "ai"
import type { Provider } from "@/provider/provider"
import type { FallbackConfig, StreamEvent, LLMInterface } from "./types"
import { DEFAULT_FALLBACK_CONFIG } from "./types"
import { ReActExecutor } from "./react-executor"
import { JsonModeExecutor } from "./json-mode-executor"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "tool-fallback" })

/**
 * Tool Call Fallback Service
 * 
 * This service provides tool calling for models that don't support native tool calling.
 * It's only instantiated when model.capabilities.toolcall === false.
 * 
 * Native tool calling models never execute this code (performance isolation).
 */

export interface FallbackServiceConfig extends Partial<FallbackConfig> {
  /** Whether to enable fallback tool calling */
  enabled?: boolean
}

export class ToolCallFallbackService {
  private model: Provider.Model
  private tools: Record<string, Tool>
  private config: FallbackConfig

  constructor(
    model: Provider.Model,
    tools: Record<string, Tool>,
    config: Partial<FallbackConfig> = {}
  ) {
    this.model = model
    this.tools = tools
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config }

    log.info("ToolCallFallbackService initialized", {
      modelId: model.id,
      strategy: this.config.strategy,
      toolCount: Object.keys(tools).length,
    })
  }

  /**
   * Select the appropriate fallback strategy based on model capabilities
   */
  private selectStrategy(): "react" | "json-mode" {
    const { strategy } = this.config

    if (strategy !== "auto") {
      return strategy
    }

    // Auto-select based on model capabilities
    // Prefer JSON mode for models with structured output support
    // Otherwise use ReAct
    
    // Check if model supports structured output (json mode)
    // This is a heuristic - in practice, you'd check model metadata
    const supportsJsonMode = this.inferJsonModeSupport()
    
    if (supportsJsonMode) {
      log.debug("Auto-selected JSON mode strategy")
      return "json-mode"
    }

    log.debug("Auto-selected ReAct strategy")
    return "react"
  }

  /**
   * Heuristic to determine if model supports JSON mode
   */
  private inferJsonModeSupport(): boolean {
    // Check model family or capabilities
    const modelId = this.model.id.toLowerCase()
    const family = this.model.family?.toLowerCase() || ""

    // Models known to support structured output well
    const jsonCapableFamilies = ["gpt", "claude", "gemini"]
    const jsonCapableModels = ["llama", "mistral", "qwen", "deepseek"]

    return (
      jsonCapableFamilies.some((f) => family.includes(f)) ||
      jsonCapableModels.some((m) => modelId.includes(m))
    )
  }

  /**
   * Execute tool calling with fallback mechanism
   */
  async *executeWithFallback(
    messages: ModelMessage[],
    llm: LLMInterface
  ): AsyncIterable<StreamEvent> {
    const strategy = this.selectStrategy()

    log.info("Executing fallback tool calling", {
      strategy,
      iterationLimit: this.config.maxIterations,
    })

    try {
      if (strategy === "json-mode") {
        const executor = new JsonModeExecutor({
          maxIterations: this.config.maxIterations,
          timeoutMs: this.config.timeoutMs,
        })

        yield* executor.execute(messages, this.tools, llm)
      } else {
        const executor = new ReActExecutor({
          maxIterations: this.config.maxIterations,
          toolResultInjection: this.config.toolResultInjection,
          timeoutMs: this.config.timeoutMs,
        })

        yield* executor.execute(messages, this.tools, llm)
      }
    } catch (error) {
      log.error("Fallback execution failed", { error, strategy })
      
      yield {
        type: "error",
        error: `Fallback tool calling failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
}

// Re-export types and executors for external use
export { ReActExecutor, JsonModeExecutor }
export * from "./types"
export * from "./prompts"
