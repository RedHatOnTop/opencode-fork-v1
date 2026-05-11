import { describe, it, expect } from "bun:test"
import { Effect } from "effect"
import fc from "fast-check"
import {
  ApprovalMode,
  MODE_POLICIES,
  type ModePolicy,
} from "@/permission/approval-mode"
import { evaluateWithMode } from "@/permission/evaluate"

describe("Property 1: Approval Mode 권한 결정 일관성", () => {
  const toolCategories = ["read", "edit", "create", "delete", "bash", "glob", "grep"] as const
  const commands = [
    // Safe commands
    "ls -la",
    "cat file.txt",
    "grep pattern file.txt",
    "bun test",
    "npm run lint",
    // Destructive commands
    "rm -rf /",
    "mkfs.ext4 /dev/sda1",
    "dd if=/dev/zero of=/dev/sda",
    "diskpart /clean",
    // Network commands
    "curl https://example.com",
    "wget https://example.com/file.zip",
    "git push origin main",
    "npm publish",
  ]

  it("동일 (mode, tool_category, command) 입력에 대해 항상 동일한 결정 반환", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ApprovalMode.literals),
        fc.constantFrom(...toolCategories),
        fc.constantFrom(...commands),
        async (mode, category, command) => {
          const result1 = evaluateWithMode(category, command, mode)
          const result2 = evaluateWithMode(category, command, mode)

          expect(result1.action).toBe(result2.action)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("Strict 모드에서 모든 도구 호출이 'ask' 반환", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...toolCategories),
        fc.string(),
        async (category, command) => {
          const result = evaluateWithMode(category, command, "strict")
          expect(result.action).toBe("ask")
        }
      ),
      { numRuns: 100 }
    )
  })

  it("YOLO 모드에서 DESTRUCTIVE_PATTERNS만 'deny' 반환", async () => {
    const destructivePatterns = [
      "rm -rf /",
      "mkfs /dev/sda",
      "dd if=/dev/zero of=/dev/sda",
      "diskpart /clean",
      "fdisk /dev/sda",
      "format C:",
    ]

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...destructivePatterns),
        async (command) => {
          const result = await Effect.runPromise(Effect.sync(() => evaluateWithMode("bash", command, "yolo")))
          expect(result.action).toBe("deny")
        }
      ),
      { numRuns: 100 }
    )

    // Safe commands should be allowed in YOLO
    const safeCommands = ["ls", "cat file.txt", "echo hello", "bun test"]
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...safeCommands),
        async (command) => {
          const result = await Effect.runPromise(Effect.sync(() => evaluateWithMode("bash", command, "yolo")))
          expect(result.action).toBe("allow")
        }
      ),
      { numRuns: 100 }
    )
  })

  it("MODE_POLICIES가 모든 ApprovalMode에 대해 정의되어 있음", () => {
    for (const mode of ApprovalMode.literals) {
      expect(MODE_POLICIES[mode]).toBeDefined()
      const policy = MODE_POLICIES[mode]
      for (const category of toolCategories) {
        expect(policy[category]).toBeDefined()
        expect(["allow", "ask"]).toContain(policy[category])
      }
    }
  })
})
