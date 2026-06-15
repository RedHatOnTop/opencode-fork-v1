export * as LoopDetect from "./loop-detect"

import * as Log from "@opencode-ai/core/util/log"
import type { MessageV2 } from "./message-v2"

const log = Log.create({ service: "session.loop-detect" })

export interface Snapshot {
  readonly toolSignatures: ReadonlyArray<string>
  readonly fileSignatures: ReadonlyArray<string>
  readonly step: number
}

const WINDOW_SIZE = 6
const REPETITION_THRESHOLD = 4
const FILE_EDIT_TOOLS = new Set(["edit", "write", "patch", "multiEdit"])
const FILE_READ_TOOLS = new Set(["read", "glob", "grep", "search", "list"])

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

export interface Detector {
  readonly record: (parts: ReadonlyArray<MessageV2.Part>) => void
  readonly check: (step: number) => LoopResult
  readonly snapshot: () => Snapshot
  readonly reset: () => void
}

export function make(): Detector {
  let toolSigs: string[] = []
  let allFiles: string[] = []

  const record = (parts: ReadonlyArray<MessageV2.Part>) => {
    for (const part of parts) {
      if (part.type !== "tool") continue
      const state = part.state
      if (state.status !== "completed" && state.status !== "running") continue
      const args = (state as { input?: Record<string, unknown> }).input
      if (!args || typeof args !== "object") continue

      const sig = toolSignature(part.tool, args)
      toolSigs.push(sig)

      const file = extractFileFromArgs(part.tool, args)
      if (file) allFiles.push(file)
    }

    if (toolSigs.length > WINDOW_SIZE * 3) {
      toolSigs = toolSigs.slice(-WINDOW_SIZE * 2)
    }
    if (allFiles.length > 500) {
      allFiles = allFiles.slice(-300)
    }
  }

  const check = (step: number): LoopResult => {
    const window = toolSigs.slice(-WINDOW_SIZE)
    if (window.length < REPETITION_THRESHOLD) {
      return { isLoop: false, reason: "none", step }
    }

    const repetition = countRepetition(window)
    if (repetition >= REPETITION_THRESHOLD) {
      log.info("repetition detected", { step, repetition, signature: window[window.length - 1] })
      return { isLoop: true, reason: "repetition", step }
    }

    if (window.length >= WINDOW_SIZE) {
      const recentFiles = allFiles.slice(-WINDOW_SIZE * 2)
      const historicalFiles = allFiles.slice(0, -WINDOW_SIZE * 2)
      const noNewFiles = !hasNovelFiles(recentFiles, historicalFiles)
      const noDiversity = !hasDiverseTools(window)

      if (noNewFiles && noDiversity) {
        log.info("stagnation detected", { step, recentToolCount: window.length })
        return { isLoop: true, reason: "stagnation", step }
      }
    }

    return { isLoop: false, reason: "none", step }
  }

  const snapshot = (): Snapshot => ({
    toolSignatures: toolSigs.slice(-WINDOW_SIZE),
    fileSignatures: [...new Set(allFiles)].slice(-50),
    step: toolSigs.length,
  })

  const reset = () => {
    toolSigs = []
    allFiles = []
  }

  return { record, check, snapshot, reset }
}
