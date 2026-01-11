# System Prompts

This directory contains system prompt templates for different agent types in AgentCLI.

## Available Prompts

### `build.md`

**Purpose**: Primary coding agent for implementing changes, writing code, and executing tasks.

**Use Cases**:

- Implementing new features
- Fixing bugs
- Making file modifications
- Running commands and tests
- Direct coding tasks with clear requirements

**Characteristics**:

- Can make file changes
- Can run shell commands
- Concise, direct, and action-oriented
- Focuses on getting things done

### `plan.md`

**Purpose**: Read-only planning agent for analysis, research, and creating implementation plans.

**Use Cases**:

- Analyzing codebase structure
- Researching implementation approaches
- Creating comprehensive plans before coding
- Exploring solutions without making changes
- Understanding complex systems

**Characteristics**:

- Read-only mode (cannot modify files)
- Focuses on analysis and planning
- Asks clarifying questions
- Constructs well-researched plans

### `general.md`

**Purpose**: Multi-purpose agent for research, analysis, and parallel task execution.

**Use Cases**:

- Researching complex questions
- Executing multiple parallel tasks
- Broad exploration across codebases
- Analysis that doesn't require planning or coding
- General-purpose assistance

**Characteristics**:

- Can handle diverse task types
- Executes multiple work units in parallel
- Research-oriented
- Flexible and adaptable

### `orchestrator.md`

**Purpose**: Meta-cognitive layer that intelligently routes tasks between specialized agents.

**Use Cases**:

- Determining the optimal agent for a task
- Chaining multiple agents together
- Coordinating multi-agent workflows
- Aggregating results from different agents
- Complex tasks requiring multiple agent types

**Characteristics**:

- Does not execute tasks directly
- Routes and coordinates between agents
- Synthesizes agent outputs
- Optimizes for task completion quality and efficiency

## Usage

```typescript
import { getSystemPrompt, getAllSystemPrompts, isSystemPromptAvailable } from "@/system-prompts"

// Get a specific prompt
const buildPrompt = getSystemPrompt("build")
const planPrompt = getSystemPrompt("plan")
const orchestratorPrompt = getSystemPrompt("orchestrator")

// Check if a prompt is available
if (isSystemPromptAvailable("build")) {
  const prompt = getSystemPrompt("build")
}

// Get all prompts
const allPrompts = getAllSystemPrompts()
console.log(allPrompts.build)
console.log(allPrompts.plan)
```

## Integration Points

These prompts are designed to be used in agent creation and configuration:

1. **Agent Initialization**: When creating agent instances, load the appropriate system prompt
2. **Agent Router**: The orchestrator uses these prompts to understand agent capabilities
3. **CLI Commands**: Different CLI commands may use different agent prompts
4. **Custom Agents**: New agent types can reference these prompts as templates

## Prompt Format

Each prompt file:

- Is in Markdown format for readability
- Starts with an HTML comment block explaining its purpose
- Contains the complete system prompt text
- Can include formatting, headers, and structure

## Adding New Prompts

To add a new system prompt:

1. Create a new `.md` file in this directory
2. Add the prompt name to the `SystemPromptName` type in `index.ts`
3. Add the name to the `AVAILABLE_PROMPTS` array in `index.ts`
4. Write comprehensive prompt documentation following the existing format

## Notes

- Prompts are extracted from the original OpenCode codebase
- Build and General prompts share the same base (Codex prompt)
- Plan prompt includes read-only mode constraints
- Orchestrator is a new prompt designed for AgentCLI's multi-agent system
