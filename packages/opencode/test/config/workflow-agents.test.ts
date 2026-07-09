import { test, expect, describe } from "bun:test"
import path from "path"
import { ConfigAgent } from "@/config/agent"
import { ConfigCommand } from "@/config/command"

// Guards the repo's own `.opencode` config surface against silent breakage.
// Uses the exact loaders the CLI runtime uses (ConfigAgent.load /
// ConfigCommand.load), which throw InvalidError on any schema-invalid
// frontmatter, so a typo in a model, permission action, color, or mode fails
// this test instead of shipping a dead agent.
const REPO_ROOT = path.join(import.meta.dir, "..", "..", "..", "..")
const DOT_OPENCODE = path.join(REPO_ROOT, ".opencode")

const WORKFLOW_AGENTS = [
  "conductor",
  "scout",
  "analyzer",
  "planner",
  "implementer",
  "reviewer",
  "skeptic",
  "tester",
  "researcher",
  "historian",
] as const

const PIPELINE_COMMANDS = ["ship", "fix", "deep-review", "investigate"] as const

describe(".opencode config surface", () => {
  test("every agent file decodes against ConfigAgentV1 (whole directory)", async () => {
    // Throws InvalidError if any agent/*.md has invalid frontmatter.
    const agents = await ConfigAgent.load(DOT_OPENCODE)
    // Includes pre-existing agents (triage, duplicate-pr) plus the workflow suite.
    expect(Object.keys(agents).length).toBeGreaterThanOrEqual(WORKFLOW_AGENTS.length)
  })

  test("workflow suite is present with the expected roster", async () => {
    const agents = await ConfigAgent.load(DOT_OPENCODE)
    for (const name of WORKFLOW_AGENTS) {
      expect(agents[name], `missing agent: ${name}`).toBeDefined()
    }
  })

  test("conductor is the only workflow primary; the rest are subagents", async () => {
    const agents = await ConfigAgent.load(DOT_OPENCODE)
    expect(agents["conductor"].mode).toBe("primary")
    for (const name of WORKFLOW_AGENTS) {
      if (name === "conductor") continue
      expect(agents[name].mode, `${name} should be subagent`).toBe("subagent")
    }
  })

  test("every workflow agent pins an OpenCode Zen model", async () => {
    const agents = await ConfigAgent.load(DOT_OPENCODE)
    for (const name of WORKFLOW_AGENTS) {
      const model = agents[name].model
      expect(model, `${name} must set a model`).toBeDefined()
      expect(model!.startsWith("opencode/"), `${name} model must be opencode/*, got ${model}`).toBe(true)
    }
  })

  test("planner is granted task delegation; other subagents are not", async () => {
    const agents = await ConfigAgent.load(DOT_OPENCODE)
    // planner is the two-level-delegation exception: it must carry a `task`
    // rule so deriveSubagentSessionPermission does not blanket-deny task.
    expect(agents["planner"].permission?.task).toBeDefined()
    // scout is a leaf recon agent and must not be able to spawn subagents.
    expect(agents["scout"].permission?.task).toBeUndefined()
  })

  test("every command file decodes and pipeline commands target the conductor", async () => {
    const commands = await ConfigCommand.load(DOT_OPENCODE)
    for (const name of PIPELINE_COMMANDS) {
      expect(commands[name], `missing command: ${name}`).toBeDefined()
      expect(commands[name].agent, `${name} should run as conductor`).toBe("conductor")
      expect(commands[name].template.length, `${name} template should be non-empty`).toBeGreaterThan(0)
    }
  })
})
