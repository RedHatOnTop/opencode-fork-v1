# @opencode-ai/cli

AgentCLI system prompts package for creating and managing AI agents with predefined system prompts.

## Overview

This package provides a collection of system prompts for different types of AI agents used in AgentCLI. These prompts are extracted from OpenCode and adapted for AgentCLI's multi-agent orchestration system.

## Installation

```bash
bun add @opencode-ai/cli
```

## Available System Prompts

### Build Agent (`build.md`)

Primary coding agent for implementing changes, writing code, and executing tasks.

**Characteristics:**

- Can make file modifications
- Can run shell commands
- Concise, direct, and action-oriented
- Focuses on getting things done

### Plan Agent (`plan.md`)

Read-only planning agent for analysis, research, and creating implementation plans.

**Characteristics:**

- Read-only mode (cannot modify files)
- Focuses on analysis and planning
- Asks clarifying questions
- Constructs well-researched plans

### General Agent (`general.md`)

Multi-purpose agent for research, analysis, and parallel task execution.

**Characteristics:**

- Can handle diverse task types
- Executes multiple work units in parallel
- Research-oriented
- Flexible and adaptable

### Orchestrator Agent (`orchestrator.md`)

Meta-cognitive layer that intelligently routes tasks between specialized agents.

**Characteristics:**

- Does not execute tasks directly
- Routes and coordinates between agents
- Synthesizes agent outputs
- Optimizes for task completion quality and efficiency

## Usage

### Importing System Prompts

```typescript
import {
  getSystemPrompt,
  getAllSystemPrompts,
  isSystemPromptAvailable,
  AVAILABLE_PROMPTS,
} from "@opencode-ai/cli/system-prompts"
```

### Get a Specific Prompt

```typescript
const buildPrompt = getSystemPrompt("build")
const planPrompt = getSystemPrompt("plan")
const orchestratorPrompt = getSystemPrompt("orchestrator")
```

### Check if a Prompt is Available

```typescript
if (isSystemPromptAvailable("build")) {
  const prompt = getSystemPrompt("build")
}
```

### Get All Prompts

```typescript
const allPrompts = getAllSystemPrompts()
console.log(allPrompts.build)
console.log(allPrompts.plan)
```

### Create an Agent with a System Prompt

```typescript
import { getSystemPrompt } from "@opencode-ai/cli/system-prompts"

class Agent {
  constructor(
    public name: string,
    public systemPrompt: string,
  ) {}

  execute(task: string) {
    // Use systemPrompt for LLM interaction
    console.log(`${this.name} executing: ${task}`)
  }
}

// Create a build agent
const buildAgent = new Agent("build", getSystemPrompt("build"))
```

## TypeScript Types

```typescript
type SystemPromptName = "build" | "plan" | "general" | "orchestrator"

class UnknownSystemPromptError extends Error {
  constructor(name: string)
}
```

## Integration Example

```typescript
import { getSystemPrompt } from "@opencode-ai/cli/system-prompts"

class AgentRegistry {
  private agents = new Map<string, Agent>()

  registerAgent(name: string, type: SystemPromptName) {
    const agent = new Agent(name, getSystemPrompt(type))
    this.agents.set(name, agent)
  }

  getAgent(name: string) {
    return this.agents.get(name)
  }
}

// Register agents
const registry = new AgentRegistry()
registry.registerAgent("build", "build")
registry.registerAgent("plan", "plan")
registry.registerAgent("orchestrator", "orchestrator")

// Use agents
const buildAgent = registry.getAgent("build")
const orchestrator = registry.getAgent("orchestrator")
```

## Error Handling

```typescript
import { getSystemPrompt, UnknownSystemPromptError } from "@opencode-ai/cli/system-prompts"

try {
  const prompt = getSystemPrompt("unknown" as any)
} catch (error) {
  if (error instanceof UnknownSystemPromptError) {
    console.error(error.message)
    // Available prompts: build, plan, general, orchestrator
  }
}
```

## Documentation

- [System Prompts README](./src/system-prompts/README.md) - Detailed documentation of each prompt
- [Integration Guide](./INTEGRATION.md) - How to integrate prompts into AgentCLI

## Development

### Type Checking

```bash
cd packages/cli
bun run typecheck
```

### Testing

```bash
cd packages/cli
bun run test
```

## License

MIT

## Contributing

When adding new system prompts:

1. Create a new `.md` file in `src/system-prompts/`
2. Add the prompt name to the `SystemPromptName` type in `index.ts`
3. Add the name to the `AVAILABLE_PROMPTS` array in `index.ts`
4. Include comprehensive documentation in the prompt file
5. Update this README with the new prompt's description

## Related Packages

- `@opencode-ai/opencode` - Main OpenCode CLI package
- `@opencode-ai/sdk` - TypeScript SDK for OpenCode
- `@opencode-ai/util` - Shared utility functions
