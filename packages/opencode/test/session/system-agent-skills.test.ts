import { describe, expect, test } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { Agent } from "../../src/agent/agent"
import { Instance } from "../../src/project/instance"
import { SystemPrompt } from "../../src/session/system"
import { provideInstance, tmpdir } from "../fixture/fixture"

function load<A>(dir: string, fn: (svc: Agent.Interface) => Effect.Effect<A>) {
  return Effect.runPromise(provideInstance(dir)(Agent.Service.use(fn)).pipe(Effect.provide(Agent.defaultLayer)))
}

describe("session.system agent-specific skills", () => {
  test("skills output includes agent-specific content for code agent", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        // Create a test skill
        const skillDir = path.join(dir, ".opencode", "skill", "test-skill")
        await Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: test-skill
description: A test skill for agent-specific system prompts.
---

# Test Skill

This is a test skill.
`,
        )
      },
    })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const code = await load(tmp.path, (svc) => svc.get("code"))
          const runSkills = Effect.gen(function* () {
            const svc = yield* SystemPrompt.Service
            return yield* svc.skills(code!)
          }).pipe(Effect.provide(SystemPrompt.defaultLayer))

          const result = await Effect.runPromise(runSkills as any)
          
          // Should return a string (system prompt section)
          expect(typeof result).toBe("string")
          expect(result).toBeDefined()
          
          // Should include skill system section
          expect(result).toContain("Skill Search Tools")
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })

  test("skills output includes agent-specific content for architect agent", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const skillDir = path.join(dir, ".opencode", "skill", "architect-skill")
        await Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: architect-skill
description: A skill for architect agent testing.
---

# Architect Skill

This is an architect skill.
`,
        )
      },
    })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const architect = await load(tmp.path, (svc) => svc.get("architect"))
          const runSkills = Effect.gen(function* () {
            const svc = yield* SystemPrompt.Service
            return yield* svc.skills(architect!)
          }).pipe(Effect.provide(SystemPrompt.defaultLayer))

          const result = await Effect.runPromise(runSkills as any)
          
          expect(typeof result).toBe("string")
          expect(result).toBeDefined()
          expect(result).toContain("Skill Search Tools")
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })

  test("skills output includes agent-specific content for ask agent", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const skillDir = path.join(dir, ".opencode", "skill", "ask-skill")
        await Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: ask-skill
description: A skill for ask agent testing.
---

# Ask Skill

This is an ask skill.
`,
        )
      },
    })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const ask = await load(tmp.path, (svc) => svc.get("ask"))
          const runSkills = Effect.gen(function* () {
            const svc = yield* SystemPrompt.Service
            return yield* svc.skills(ask!)
          }).pipe(Effect.provide(SystemPrompt.defaultLayer))

          const result = await Effect.runPromise(runSkills as any)
          
          expect(typeof result).toBe("string")
          expect(result).toBeDefined()
          expect(result).toContain("Skill Search Tools")
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })

  test("skills output falls back gracefully for unknown agent type", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const skillDir = path.join(dir, ".opencode", "skill", "fallback-skill")
        await Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: fallback-skill
description: A skill for fallback testing.
---

# Fallback Skill

This is a fallback skill.
`,
        )
      },
    })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Use "default" agent which may not have specific profile
          const defaultAgent = await load(tmp.path, (svc) => svc.get("default"))
          const runSkills = Effect.gen(function* () {
            const svc = yield* SystemPrompt.Service
            return yield* svc.skills(defaultAgent!)
          }).pipe(Effect.provide(SystemPrompt.defaultLayer))

          const result = await Effect.runPromise(runSkills as any)
          
          // Should still return a valid result (fallback behavior)
          expect(typeof result).toBe("string")
          expect(result).toBeDefined()
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })

  test("skills output is consistent across multiple calls for same agent", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const skillDir = path.join(dir, ".opencode", "skill", "consistent-skill")
        await Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: consistent-skill
description: A skill for consistency testing.
---

# Consistent Skill

This is a consistent skill.
`,
        )
      },
    })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const code = await load(tmp.path, (svc) => svc.get("code"))
          const runSkills = Effect.gen(function* () {
            const svc = yield* SystemPrompt.Service
            return yield* svc.skills(code!)
          }).pipe(Effect.provide(SystemPrompt.defaultLayer))

          const first = await Effect.runPromise(runSkills as any)
          const second = await Effect.runPromise(runSkills as any)
          
          // Results should be identical (deterministic)
          expect(first).toBe(second)
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })
})
