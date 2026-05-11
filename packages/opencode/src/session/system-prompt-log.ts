export * as SystemPromptLog from "./system-prompt-log"

export type Entry = {
  parts: { label: string; content: string }[]
  model: { id: string; providerID: string }
  agent: string
  timestamp: number
}

const MAX_STORE_SIZE = 100
const store = new Map<string, Entry>()

export function set(sessionID: string, entry: Entry) {
  if (store.size >= MAX_STORE_SIZE) {
    const oldest = store.keys().next().value
    if (oldest) store.delete(oldest)
  }
  store.set(sessionID, entry)
}

export function get(sessionID: string): Entry | undefined {
  return store.get(sessionID)
}

export function remove(sessionID: string) {
  store.delete(sessionID)
}
