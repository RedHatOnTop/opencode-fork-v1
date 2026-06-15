export * as LoopDetect from "./loop-detect"

const WINDOW_SIZE = 6
const REPETITION_THRESHOLD = 4
const FILE_EDIT_TOOLS = new Set(["edit", "write", "patch", "multiEdit"])
const FILE_READ_TOOLS = new Set(["read", "glob", "grep", "search", "list"])

interface ToolPartLike {
  readonly type: string
  readonly tool: string
  readonly state: {
    readonly status: string
    readonly input?: Record<string, unknown>
  }
}

interface MessageLike {
  readonly parts: ReadonlyArray<{ type: string }>
}

function isToolPart(part: { type: string }): part is ToolPartLike {
  if (part.type !== "tool") return false
  const t = part as Record<string, unknown>
  return typeof t.tool === "string" && typeof t.state === "object" && t.state !== null
}

function hashString(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0
  }
  return h
}

function extractFileFromArgs(tool: string, args: Record<string, unknown>): string | undefined {
  if (FILE_EDIT_TOOLS.has(tool) || FILE_READ_TOOLS.has(tool)) {
    const filePath = args.filePath ?? args.path ?? args.file_path ?? args.pattern ?? args.cwd
    if (typeof filePath === "string") return filePath
  }
  return undefined
}

function toolSignature(tool: string, args: Record<string, unknown>): string {
  const file = extractFileFromArgs(tool, args)
  if (file !== undefined) return `${tool}:${file}`
  const keys = Object.keys(args).sort()
  const sig = keys.map((k) => {
    const v = args[k]
    if (typeof v === "string" && v.length > 200) return `${k}:${hashString(v)}`
    return `${k}:${String(v)}`
  }).join(",")
  return `${tool}(${sig})`
}

function countRepetition(signatures: ReadonlyArray<string>): number {
  if (signatures.length < 2) return 0
  const last = signatures[signatures.length - 1]
  let count = 1
  for (let i = signatures.length - 2; i >= 0; i--) {
    if (signatures[i] === last) count++
    else break
  }
  return count
}

function hasNovelFiles(
  currentFiles: ReadonlyArray<string>,
  historicalFiles: ReadonlyArray<string>,
): boolean {
  if (currentFiles.length === 0) return false
  const historical = new Set(historicalFiles)
  for (const f of currentFiles) {
    if (!historical.has(f)) return true
  }
  return false
}

function hasDiverseTools(signatures: ReadonlyArray<string>): boolean {
  if (signatures.length < 3) return true
  const recent = signatures.slice(-4)
  const unique = new Set(recent.map((s) => s.split(":")[0].split("(")[0]))
  return unique.size >= 2
}

export interface LoopResult {
  readonly isLoop: boolean
  readonly reason: "repetition" | "stagnation" | "none"
  readonly step: number
}

function extractToolCalls(messages: ReadonlyArray<MessageLike>): { sigs: string[]; files: string[] } {
  const sigs: string[] = []
  const files: string[] = []
  const maxCalls = WINDOW_SIZE * 3
  for (let mi = messages.length - 1; mi >= 0 && sigs.length < maxCalls; mi--) {
    const parts = messages[mi].parts
    for (let pi = parts.length - 1; pi >= 0; pi--) {
      const part = parts[pi]
      if (!isToolPart(part)) continue
      const state = part.state
      if (state.status !== "completed" && state.status !== "running") continue
      const args = state.input
      if (!args || typeof args !== "object") continue

      sigs.unshift(toolSignature(part.tool, args))
      const file = extractFileFromArgs(part.tool, args)
      if (file) files.unshift(file)
    }
  }
  return { sigs, files }
}

export function check(messages: ReadonlyArray<MessageLike>, step: number): LoopResult {
  const { sigs: toolSigs, files: allFiles } = extractToolCalls(messages)
  const window = toolSigs.slice(-WINDOW_SIZE)

  if (window.length < REPETITION_THRESHOLD) {
    return { isLoop: false, reason: "none", step }
  }

  const repetition = countRepetition(window)
  if (repetition >= REPETITION_THRESHOLD) {
    return { isLoop: true, reason: "repetition", step }
  }

  if (window.length >= WINDOW_SIZE) {
    const recentFiles = allFiles.slice(-WINDOW_SIZE * 2)
    const historicalFiles = allFiles.slice(0, -WINDOW_SIZE * 2)
    const noNewFiles = !hasNovelFiles(recentFiles, historicalFiles)
    const noDiversity = !hasDiverseTools(window)

    if (noNewFiles && noDiversity) {
      return { isLoop: true, reason: "stagnation", step }
    }
  }

  return { isLoop: false, reason: "none", step }
}
