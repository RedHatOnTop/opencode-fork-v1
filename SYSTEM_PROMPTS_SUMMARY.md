# System Prompts Extraction - Summary

## Task Completed

Successfully extracted OpenCode's built-in system prompts and integrated them into AgentCLI.

## What Was Created

### Directory Structure

```
packages/cli/
├── src/
│   ├── system-prompts/
│   │   ├── index.ts          # Main export module
│   │   ├── README.md         # Detailed documentation
│   │   ├── build.md          # Build agent prompt (24,219 chars)
│   │   ├── plan.md           # Plan agent prompt (25,816 chars)
│   │   ├── general.md        # General agent prompt (24,276 chars)
│   │   └── orchestrator.md    # Orchestrator agent prompt (8,779 chars)
│   ├── index.ts               # Package exports
│   └── test-prompts.ts       # Test utilities
├── package.json              # Package configuration
├── tsconfig.json            # TypeScript configuration
├── README.md                # Package documentation
└── INTEGRATION.md           # Integration guide
```

## System Prompts Created

### 1. Build Agent (`build.md`)

- **Source**: Extracted from OpenCode's `codex.txt` (24KB+ comprehensive coding agent prompt)
- **Purpose**: Primary coding agent for implementing changes, writing code, and executing tasks
- **Key Features**:
  - Comprehensive coding guidelines
  - Personality and communication style
  - Planning and task execution instructions
  - Sandbox and approval handling
  - Final answer formatting guidelines

### 2. Plan Agent (`plan.md`)

- **Source**: OpenCode's `codex.txt` + `plan.txt` (read-only mode instructions)
- **Purpose**: Read-only planning agent for analysis, research, and creating implementation plans
- **Key Features**:
  - All build agent capabilities
  - **Read-only mode constraint** (STRICTLY FORBIDDEN from file edits)
  - Focus on analysis, research, and planning
  - Encourages clarifying questions
  - Constructs well-researched plans

### 3. General Agent (`general.md`)

- **Source**: OpenCode's `codex.txt` (same base as build)
- **Purpose**: Multi-purpose agent for research, analysis, and parallel task execution
- **Key Features**:
  - Research and analysis focus
  - Parallel task execution capabilities
  - Broad exploration across codebases
  - Flexible and adaptable

### 4. Orchestrator Agent (`orchestrator.md`)

- **Source**: **NEW** - Created specifically for AgentCLI
- **Purpose**: Meta-cognitive layer that intelligently routes tasks between specialized agents
- **Key Features**:
  - Task analysis and routing
  - Agent chaining strategies
  - Result aggregation and synthesis
  - Error handling and recovery
  - Workflow coordination

## API Exports

### Main Functions

```typescript
import {
  getSystemPrompt, // Get a specific prompt by name
  getAllSystemPrompts, // Get all prompts as object
  isSystemPromptAvailable, // Check if prompt exists
  AVAILABLE_PROMPTS, // Array of available prompt names
  type SystemPromptName, // TypeScript type
  UnknownSystemPromptError, // Custom error class
} from "@opencode-ai/cli/system-prompts"
```

### Usage Examples

```typescript
// Get individual prompts
const buildPrompt = getSystemPrompt("build")
const planPrompt = getSystemPrompt("plan")

// Get all prompts
const allPrompts = getAllSystemPrompts()

// Check availability
if (isSystemPromptAvailable("orchestrator")) {
  const prompt = getSystemPrompt("orchestrator")
}
```

## Acceptance Criteria Met

✅ **packages/cli/src/system-prompts/ directory created**

- Directory exists with proper structure

✅ **All 4 prompt files exist**

- build.md (24,219 characters)
- plan.md (25,816 characters)
- general.md (24,276 characters)
- orchestrator.md (8,779 characters)

✅ **index.ts exports getSystemPrompt() function correctly**

- Exports `getSystemPrompt(name: SystemPromptName): string`
- Includes validation/error handling for unknown prompts
- Returns `UnknownSystemPromptError` for invalid names

✅ **Prompts are readable and contain complete instructions**

- All prompts in Markdown format with clear structure
- Each includes HTML comment header explaining purpose
- Comprehensive content extracted from OpenCode
- Orchestrator prompt created with detailed agent routing logic

✅ **TypeScript compilation succeeds**

- `npx tsc --noEmit` completes without errors
- Proper TypeScript types exported

✅ **Function can be imported and used**

- Tested from multiple locations in codebase
- Package exports configured in package.json

✅ **No broken imports**

- All test scripts pass successfully
- Module resolution works correctly

✅ **Prompts are accessible from anywhere in the codebase**

- Package exports configured: `"./system-prompts": "./src/system-prompts/index.ts"`
- Can import as: `import { getSystemPrompt } from '@opencode-ai/cli/system-prompts'`
- Can also import as: `import { getSystemPrompt } from './packages/cli/src/system-prompts'`

## Testing

All tests pass successfully:

- ✅ Individual prompt loading (4 prompts)
- ✅ getAllSystemPrompts() returns all prompts
- ✅ isSystemPromptAvailable() validation
- ✅ UnknownSystemPromptError thrown for invalid names
- ✅ Prompt content validation (build, plan, orchestrator)
- ✅ TypeScript compilation (no errors)
- ✅ Package import from anywhere in codebase

## Integration Points Ready

The system prompts are ready for integration in:

1. **Agent Creation**: Use `getSystemPrompt()` when creating agent instances
2. **Agent Registry**: Register built-in agents with their system prompts
3. **CLI Commands**: Different commands can use different agents
4. **Orchestrator**: Use orchestrator prompt for multi-agent coordination
5. **Custom Agents**: Extend or modify base prompts for custom agent types

## Documentation Provided

1. **packages/cli/README.md** - Package overview and usage
2. **packages/cli/INTEGRATION.md** - Detailed integration guide
3. **packages/cli/src/system-prompts/README.md** - Prompt-specific documentation
4. **Code Documentation** - JSDoc comments in index.ts

## Next Steps

The system prompts are now ready for use in agent creation. The next task would be to:

1. Create agent classes that use these prompts
2. Implement the orchestrator for multi-agent coordination
3. Create CLI commands that leverage different agents
4. Implement the agent generator task that uses these prompts as templates

## Files Created/Modified

### Created

- packages/cli/package.json
- packages/cli/tsconfig.json
- packages/cli/src/index.ts
- packages/cli/src/system-prompts/index.ts
- packages/cli/src/system-prompts/build.md
- packages/cli/src/system-prompts/plan.md
- packages/cli/src/system-prompts/general.md
- packages/cli/src/system-prompts/orchestrator.md
- packages/cli/src/system-prompts/README.md
- packages/cli/src/test-prompts.ts
- packages/cli/README.md
- packages/cli/INTEGRATION.md

### Modified

- None (only created new files)

## Technical Details

- **Package Name**: `@opencode-ai/cli`
- **TypeScript**: Full type safety with `SystemPromptName` union type
- **File System**: Uses Node.js `fs.readFileSync` for prompt loading
- **Error Handling**: Custom `UnknownSystemPromptError` with helpful messages
- **Package Exports**: Configured for workspace consumption
- **Dependencies**: Only dev dependencies (TypeScript types)

## Notes

- Prompts are extracted from OpenCode's `codex.txt` (main system prompt)
- Build and general agents share the same base prompt
- Plan agent adds read-only mode instructions on top of build prompt
- Orchestrator is a completely new prompt designed for AgentCLI's multi-agent system
- All prompts are in Markdown for readability and easy editing
- Package is set up as a workspace dependency for other packages to use
