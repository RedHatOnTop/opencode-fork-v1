# Integration Guide

This document describes how to integrate the system prompts into AgentCLI's agent creation and management system.

## Overview

The system prompts are stored in `/src/system-prompts/` and can be accessed via the exported functions from the index module. These prompts are designed to be loaded when creating agent instances.

## Creating Agents with System Prompts

### Basic Agent Creation

```typescript
import { getSystemPrompt } from "@/system-prompts"

interface AgentConfig {
  name: string
  systemPrompt: string
  permissions: Permission[]
  capabilities: string[]
}

function createAgent(type: "build" | "plan" | "general" | "orchestrator"): AgentConfig {
  return {
    name: type,
    systemPrompt: getSystemPrompt(type),
    permissions: getDefaultPermissions(type),
    capabilities: getCapabilities(type),
  }
}

// Example usage
const buildAgent = createAgent("build")
const planAgent = createAgent("plan")
const orchestrator = createAgent("orchestrator")
```

### Agent Registry Integration

```typescript
import { getSystemPrompt, AVAILABLE_PROMPTS } from "@/system-prompts"

class AgentRegistry {
  private agents: Map<string, Agent> = new Map()

  async initialize() {
    // Register built-in agents
    for (const promptName of AVAILABLE_PROMPTS) {
      const agent = await this.createAgent(promptName)
      this.agents.set(promptName, agent)
    }
  }

  private async createAgent(name: string): Promise<Agent> {
    const systemPrompt = getSystemPrompt(name as any)
    return new Agent({
      name,
      systemPrompt,
      // ... other agent configuration
    })
  }

  getAgent(name: string): Agent | undefined {
    return this.agents.get(name)
  }
}
```

## Orchestrator Integration

The orchestrator agent uses all other agents' prompts to understand their capabilities:

```typescript
import { getSystemPrompt, getAllSystemPrompts } from "@/system-prompts"

class OrchestratorAgent extends Agent {
  constructor() {
    super({
      name: "orchestrator",
      systemPrompt: getSystemPrompt("orchestrator"),
      capabilities: ["route", "chain", "aggregate"],
    })
  }

  async routeTask(task: Task): Promise<string> {
    // Analyze task and determine appropriate agent
    const agentType = this.analyzeTask(task)

    // Get agent instance
    const agent = this.getAgent(agentType)
    if (!agent) {
      throw new Error(`Agent ${agentType} not found`)
    }

    // Delegate task to agent
    return await agent.execute(task)
  }

  private analyzeTask(task: Task): string {
    // Use orchestrator's system prompt context
    // to determine which agent should handle the task
    // This analysis leverages the orchestrator's understanding
    // of each agent's capabilities (defined in orchestrator.md)

    // ... implementation
    return "build" // or 'plan', 'general', etc.
  }
}
```

## CLI Command Integration

Different CLI commands can use different agents:

```typescript
#!/usr/bin/env bun
import { getSystemPrompt } from "@/system-prompts"

async function handleBuildCommand(args: string[]) {
  const agent = new Agent({
    name: "build",
    systemPrompt: getSystemPrompt("build"),
    // ... other config
  })

  await agent.execute(args.join(" "))
}

async function handlePlanCommand(args: string[]) {
  const agent = new Agent({
    name: "plan",
    systemPrompt: getSystemPrompt("plan"),
    // ... other config
  })

  await agent.execute(args.join(" "))
}

async function handleOrchestrateCommand(args: string[]) {
  const orchestrator = new OrchestratorAgent()
  await orchestrator.routeTask({
    type: "custom",
    description: args.join(" "),
  })
}
```

## Custom Agent Creation

Users can create custom agents by extending or modifying system prompts:

```typescript
import { getSystemPrompt } from "@/system-prompts"

function createCustomAgent(basePrompt: string, customizations: string): string {
  const base = getSystemPrompt(basePrompt as any)
  return `${base}\n\n# Custom Instructions\n\n${customizations}`
}

// Example: Create a security-focused build agent
const securityBuildPrompt = createCustomAgent(
  "build",
  `
# Security Guidelines

- Always validate user inputs
- Never execute commands without sanitization
- Check for SQL injection vulnerabilities
- Implement proper authentication and authorization
`,
)
```

## Prompt Validation

Before using prompts in agents, validate them:

```typescript
import { getSystemPrompt, isSystemPromptAvailable } from "@/system-prompts"

function validatePrompt(name: string): boolean {
  if (!isSystemPromptAvailable(name)) {
    console.error(`Unknown prompt type: ${name}`)
    return false
  }

  try {
    const prompt = getSystemPrompt(name as any)

    // Basic validation checks
    if (prompt.length < 100) {
      console.error(`Prompt too short: ${name}`)
      return false
    }

    if (!prompt.includes("You are")) {
      console.error(`Prompt missing role definition: ${name}`)
      return false
    }

    return true
  } catch (error) {
    console.error(`Failed to load prompt ${name}:`, error)
    return false
  }
}
```

## Dynamic Prompt Selection

Agents can dynamically select prompts based on task context:

```typescript
import { getSystemPrompt } from "@/system-prompts"

class AdaptiveAgent {
  async execute(task: Task) {
    const promptType = this.selectPrompt(task)
    const systemPrompt = getSystemPrompt(promptType)

    const agent = new Agent({
      name: promptType,
      systemPrompt,
      // ... other config
    })

    return await agent.process(task)
  }

  private selectPrompt(task: Task): "build" | "plan" | "general" | "orchestrator" {
    if (task.requiresPlanning) return "plan"
    if (task.requiresImplementation) return "build"
    if (task.isMultiAgent) return "orchestrator"
    return "general"
  }
}
```

## Testing Integration

Test prompts are included for validation:

```typescript
import { testSystemPrompts } from "@/test-prompts"

// Run during development/testing
testSystemPrompts()
```

## Agent Configuration File

Agents can be configured via a JSON file:

```json
{
  "agents": {
    "build": {
      "type": "build",
      "permissions": ["read", "write", "execute"],
      "temperature": 0.7
    },
    "plan": {
      "type": "plan",
      "permissions": ["read"],
      "temperature": 0.5
    },
    "custom": {
      "type": "build",
      "systemPrompt": "Custom prompt text...",
      "permissions": ["read", "write"]
    }
  }
}
```

## Performance Considerations

- Prompts are loaded from files on first access
- Consider caching prompts if used frequently
- For custom agents, modify prompts in memory rather than creating multiple files
- System prompts are relatively large (20-30KB), so consider memory usage when creating many agent instances

## Future Enhancements

Potential improvements to the system prompt integration:

1. **Prompt Templates**: Support for variable substitution in prompts
2. **Prompt Composition**: Combine multiple prompts into one
3. **Dynamic Prompts**: Prompts that adapt based on context
4. **Prompt Versioning**: Track and version prompt changes
5. **A/B Testing**: Test different prompt variations
6. **Prompt Analytics**: Track prompt usage and effectiveness
