# Tool Calling Fallback Mechanism

이 모듈은 Native Tool Calling을 지원하지 않는 모델에 대한 대응책을 제공합니다.

## Performance Isolation

**중요**: Native Tool Calling을 지원하는 모델은 이 모듈의 코드를 **전혀 실행하지 않습니다**.

```
┌──────────────────────────────────────────────────────────────┐
│  Native Path (toolcall=true)                                  │
│  ├─ Early return check (boolean only)                        │
│  ├─ 기존 streamText() 코드 그대로 실행                       │
│  └─ Fallback 모듈 로드하지 않음                              │
└──────────────────────────────────────────────────────────────┘
                           ↓ (100% Isolated)
┌──────────────────────────────────────────────────────────────┐
│  Fallback Path (toolcall=false)                             │
│  ├─ Dynamic import (lazy loading)                              │
│  └─ ReAct or JSON Mode 실행                                  │
└──────────────────────────────────────────────────────────────┘
```

## Usage

```typescript
// session/llm.ts
if (input.model.capabilities.toolcall === false) {
  const { ToolCallFallbackService } = await import("./tool-fallback")
  const fallback = new ToolCallFallbackService(model, tools, config)
  yield* fallback.executeWithFallback(messages, llmInterface)
} else {
  // Native tool calling path
  return streamText({ tools, ... })
}
```

## Strategies

1. **ReAct Pattern**: Thought → Action → Observation → Final Answer
2. **JSON Mode**: Structured output for tool calls
3. **Auto**: Automatically selects best strategy based on model capabilities

## Files

- `types.ts` - Type definitions
- `prompts.ts` - Prompt generators
- `react-executor.ts` - ReAct pattern implementation
- `json-mode-executor.ts` - JSON mode implementation
- `index.ts` - Main service
