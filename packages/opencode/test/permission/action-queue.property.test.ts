import { describe, it, expect } from "bun:test"
import { Effect } from "effect"
import fc from "fast-check"
import * as ActionQueue from "@/permission/action-queue"

describe("Property 3: Action Queue FIFO 및 상태 전이", () => {
  const createQueueItem = (index: number): Omit<ActionQueue.QueueItem, "id" | "status"> => ({
    requestedAt: Date.now() + index * 1000,
    reason: `Test reason ${index}`,
    command: `test-command-${index}`,
    context: `test-context-${index}`,
  })

  it("항목은 추가된 순서대로 표시되어야 함 (FIFO)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 20 }),
        async (indices) => {
          const items = indices.map((i, idx) => createQueueItem(idx))

          const result = await Effect.runPromise(
            Effect.gen(function* () {
              const queue = yield* ActionQueue.Service
              const addedItems: ActionQueue.QueueItem[] = []

              // Add all items
              for (const item of items) {
                const added = yield* queue.add(item)
                addedItems.push(added)
              }

              // List should return items in order
              const listed = yield* queue.list()
              return { added: addedItems, listed }
            }).pipe(Effect.provide(ActionQueue.defaultLayer))
          )

          // Verify FIFO order
          for (let i = 0; i < result.added.length; i++) {
            expect(result.listed[i].id).toBe(result.added[i].id)
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it("상태 전이는 pending→approved 또는 pending→rejected만 허용", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("approved" as const, "rejected" as const),
        async (targetStatus) => {
          const result = await Effect.runPromise(
            Effect.gen(function* () {
              const queue = yield* ActionQueue.Service
              const item = yield* queue.add({
                requestedAt: Date.now(),
                reason: "Test",
                command: "test",
                context: "test",
              })

              // Approve or reject
              if (targetStatus === "approved") {
                yield* queue.approve(item.id)
              } else {
                yield* queue.reject(item.id)
              }

              const listed = yield* queue.list()
              const updated = listed.find((i) => i.id === item.id)
              return updated?.status
            }).pipe(Effect.provide(ActionQueue.defaultLayer))
          )

          expect(result).toBe(targetStatus)
        }
      ),
      { numRuns: 50 }
    )
  })

  it("approved/rejected 상태에서 다른 상태로의 전이는 불가능", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const queue = yield* ActionQueue.Service
        const item = yield* queue.add({
          requestedAt: Date.now(),
          reason: "Test",
          command: "test",
          context: "test",
        })

        // Approve the item
        yield* queue.approve(item.id)

        // Try to reject already approved item (should fail or be no-op)
        const rejectResult = yield* queue.reject(item.id).pipe(
          Effect.match({
            onFailure: () => "error",
            onSuccess: () => "success",
          })
        )

        return rejectResult
      }).pipe(Effect.provide(ActionQueue.defaultLayer))
    )

    // Should either error or remain approved
    expect(result).toBe("error")
  })
})
