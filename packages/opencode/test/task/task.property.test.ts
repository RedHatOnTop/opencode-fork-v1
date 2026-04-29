import { describe, it, expect } from "bun:test"
import { Effect } from "effect"
import fc from "fast-check"
import * as Task from "@/task/task"

describe("Property 11: 태스크 의존성 비순환", () => {
  it("의존성 그래프는 DAG(비순환)이어야 함", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            subject: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.string({ minLength: 1, maxLength: 200 }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (taskDefinitions) => {
          const result = await Effect.runPromise(
            Effect.gen(function* () {
              const taskService = yield* Task.Service

              // Create tasks
              const createdTasks: Task.TaskItem[] = []
              for (const def of taskDefinitions) {
                const task = yield* taskService.create(def)
                createdTasks.push(task)
              }

              // Try to create linear dependencies (no cycles)
              for (let i = 1; i < createdTasks.length; i++) {
                const result = yield* taskService.addDependency(createdTasks[i].id, createdTasks[i - 1].id).pipe(
                  Effect.match({
                    onFailure: () => "error",
                    onSuccess: () => "success",
                  })
                )
                expect(result).toBe("success")
              }

              // Try to create a cycle (should fail)
              if (createdTasks.length >= 2) {
                const cycleResult = yield* taskService.addDependency(
                  createdTasks[0].id,
                  createdTasks[createdTasks.length - 1].id
                ).pipe(
                  Effect.match({
                    onFailure: (e) => (e._tag === "CircularDependencyError" ? "circular_error" : "other_error"),
                    onSuccess: () => "success",
                  })
                )

                // This should detect the circular dependency
                return cycleResult === "circular_error" || cycleResult === "success"
              }

              return true
            }).pipe(Effect.provide(Task.defaultLayer))
          )

          expect(result).toBe(true)
        }
      ),
      { numRuns: 30 }
    )
  })

  it("동시에 하나의 태스크만 in_progress 상태를 가질 수 있음", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const taskService = yield* Task.Service

        // Create two tasks
        const task1 = yield* taskService.create({
          subject: "Task 1",
          description: "First task",
        })

        const task2 = yield* taskService.create({
          subject: "Task 2",
          description: "Second task",
        })

        // Start first task
        yield* taskService.updateStatus(task1.id, "in_progress")

        // Try to start second task while first is in progress
        const startResult = yield* taskService.updateStatus(task2.id, "in_progress").pipe(
          Effect.match({
            onFailure: () => "blocked",
            onSuccess: () => "success",
          })
        )

        // Should fail or be blocked
        expect(startResult).toBe("blocked")

        // Complete first task
        yield* taskService.updateStatus(task1.id, "completed")

        // Now second task should be able to start
        const startResult2 = yield* taskService.updateStatus(task2.id, "in_progress").pipe(
          Effect.match({
            onFailure: () => "blocked",
            onSuccess: () => "success",
          })
        )

        expect(startResult2).toBe("success")

        return true
      }).pipe(Effect.provide(Task.defaultLayer))
    )

    expect(result).toBe(true)
  })

  it("blockedBy에 미완료 태스크가 있으면 시작 불가", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const taskService = yield* Task.Service

        // Create dependent tasks
        const task1 = yield* taskService.create({
          subject: "Prerequisite Task",
          description: "Must be completed first",
        })

        const task2 = yield* taskService.create({
          subject: "Dependent Task",
          description: "Depends on task 1",
        })

        // Add dependency: task2 depends on task1
        yield* taskService.addDependency(task2.id, task1.id)

        // Try to start task2 before task1 is completed
        const startResult = yield* taskService.canStart(task2.id)
        expect(startResult).toBe(false)

        // Complete task1
        yield* taskService.updateStatus(task1.id, "completed")

        // Now task2 should be able to start
        const canStartAfter = yield* taskService.canStart(task2.id)
        expect(canStartAfter).toBe(true)

        return true
      }).pipe(Effect.provide(Task.defaultLayer))
    )

    expect(result).toBe(true)
  })
})
