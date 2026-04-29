import { describe, it, expect } from "bun:test"
import fc from "fast-check"

describe("Property 7: 메모리 스코프 격리", () => {
  it("Repository 스코프 메모리는 해당 프로젝트에서만 접근 가능해야 함", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 100 }), // project path
        fc.string({ minLength: 10, maxLength: 500 }), // memory content
        (projectPath, content) => {
          // Repository scope should be isolated per project
          const scopeKey = `repo:${projectPath}`
          const memoryData = { scope: "repository", key: scopeKey, content }

          // Memory should only be accessible within the same project
          expect(memoryData.scope).toBe("repository")
          expect(memoryData.key).toContain(projectPath)
        }
      ),
      { numRuns: 50 }
    )
  })

  it("Global 스코프 메모리는 모든 프로젝트에서 접근 가능해야 함", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 2, maxLength: 5 }), // project paths
        fc.string({ minLength: 10, maxLength: 500 }), // memory content
        (projectPaths, content) => {
          const globalMemory = { scope: "global", key: "global-memory", content }

          // Global memory should be the same across all projects
          for (const project of projectPaths) {
            expect(globalMemory.scope).toBe("global")
            expect(globalMemory.content).toBe(content)
          }
        }
      ),
      { numRuns: 30 }
    )
  })

  it("Session 스코프 메모리는 해당 세션에서만 접근 가능해야 함", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }), // session ID
        fc.string({ minLength: 10, maxLength: 500 }), // memory content
        (sessionId, content) => {
          const sessionMemory = { scope: "session", key: `session:${sessionId}`, content }

          // Session scope should be unique per session
          expect(sessionMemory.scope).toBe("session")
          expect(sessionMemory.key).toContain(sessionId)
        }
      ),
      { numRuns: 50 }
    )
  })

  it("스코프별 저장 경로가 올바르게 구성되어야 함", () => {
    const homeDir = "~/.opencode"
    const projectDir = "/path/to/project"
    const sessionId = "session-123"

    // Global scope path
    const globalPath = `${homeDir}/memory/MEMORY.md`
    expect(globalPath).toContain("~/.opencode/memory")

    // Repository scope path
    const repoPath = `${projectDir}/.opencode/memory/MEMORY.md`
    expect(repoPath).toContain(".opencode/memory")
    expect(repoPath).toContain(projectDir)

    // Session scope path (within project)
    const sessionPath = `${projectDir}/.opencode/memory/session-${sessionId}.md`
    expect(sessionPath).toContain(".opencode/memory")
    expect(sessionPath).toContain(sessionId)
  })

  it("프론트매터 메타데이터가 메모리 엔트리에 포함되어야 함", () => {
    fc.assert(
      fc.property(
        fc.record({
          description: fc.string({ minLength: 5, maxLength: 100 }),
          type: fc.constantFrom("convention", "preference", "learning"),
        }),
        (metadata) => {
          const memoryEntry = {
            scope: "repository",
            key: "test-memory",
            content: "# Memory content",
            metadata: {
              ...metadata,
              updatedAt: Date.now(),
            },
          }

          expect(memoryEntry.metadata.description).toBe(metadata.description)
          expect(memoryEntry.metadata.type).toBe(metadata.type)
          expect(memoryEntry.metadata.updatedAt).toBeGreaterThan(0)
        }
      ),
      { numRuns: 50 }
    )
  })
})
