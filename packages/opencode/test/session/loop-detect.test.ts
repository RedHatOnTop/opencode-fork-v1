import { test, expect, describe } from "bun:test"
import { LoopDetect } from "@/session/loop-detect"

// Build minimal tool-part shapes the detector reads (type/tool/state.input).
function editPart(filePath: string, oldString: string, newString: string) {
  return { type: "tool", tool: "edit", state: { status: "completed", input: { filePath, oldString, newString } } }
}
function readPart(filePath: string) {
  return { type: "tool", tool: "read", state: { status: "completed", input: { filePath } } }
}
function msg(...parts: unknown[]) {
  return { parts: parts as ReadonlyArray<{ type: string }> }
}

describe("LoopDetect.check", () => {
  test("four different edits to the same file is not a loop (content-aware signature)", () => {
    // Regression guard for F-1: before content-aware signatures this tripped a
    // false 'repetition' loop and cut the session off mid-refactor.
    const messages = [
      msg(
        editPart("a.ts", "1", "one"),
        editPart("a.ts", "2", "two"),
        editPart("a.ts", "3", "three"),
        editPart("a.ts", "4", "four"),
      ),
    ]
    expect(LoopDetect.check(messages, 4).isLoop).toBe(false)
  })

  test("four identical edits to the same file is a repetition loop", () => {
    const messages = [
      msg(
        editPart("a.ts", "x", "y"),
        editPart("a.ts", "x", "y"),
        editPart("a.ts", "x", "y"),
        editPart("a.ts", "x", "y"),
      ),
    ]
    const result = LoopDetect.check(messages, 4)
    expect(result.isLoop).toBe(true)
    expect(result.reason).toBe("repetition")
  })

  test("four identical reads of the same file is still a repetition loop", () => {
    const messages = [msg(readPart("a.ts"), readPart("a.ts"), readPart("a.ts"), readPart("a.ts"))]
    expect(LoopDetect.check(messages, 4).isLoop).toBe(true)
  })
})
