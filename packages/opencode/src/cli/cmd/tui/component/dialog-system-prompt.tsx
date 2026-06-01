import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useSDK } from "@tui/context/sdk"
import { useRoute } from "@tui/context/route"
import { createSignal, onMount, Show, For } from "solid-js"

type SystemPromptEntry = {
  parts: { label: string; content: string }[]
  model: { id: string; providerID: string }
  agent: string
  timestamp: number
}

export function DialogSystemPrompt() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const sdk = useSDK()
  const route = useRoute()
  const [entry, setEntry] = createSignal<SystemPromptEntry | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  onMount(async () => {
    const sessionID = route.data.type === "session" ? route.data.sessionID : undefined
    if (!sessionID) {
      setError("No active session")
      return
    }
    try {
      const result = await (sdk.client.session as any).systemPrompt({ sessionID })
      if (result.error) {
        setError("No system prompt recorded yet for this session")
        return
      }
      setEntry(result.data as SystemPromptEntry)
    } catch (e) {
      setError(`Failed to fetch: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          System Prompt
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show
        when={entry()}
        fallback={
          <Show when={error()} fallback={<text fg={theme.textMuted}>Loading...</text>}>
            {(msg) => <text fg={theme.textMuted}>{msg()}</text>}
          </Show>
        }
      >
        {(data) => (
          <box flexDirection="column" gap={1}>
            <box flexDirection="row" gap={1}>
              <text fg={theme.textMuted}>Model:</text>
              <text fg={theme.text}>{data().model.id}</text>
              <text fg={theme.textMuted}>|</text>
              <text fg={theme.textMuted}>Agent:</text>
              <text fg={theme.text}>{data().agent}</text>
            </box>
            <For each={data().parts}>
              {(part, i) => (
                <box flexDirection="column" gap={0}>
                  <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                    {"--- " + part.label + " ---"}
                  </text>
                  <scrollbox height={Math.min(part.content.split("\n").length + 2, 30)} maxHeight={30}>
                    <text fg={theme.text} wrapMode="word">
                      {part.content}
                    </text>
                  </scrollbox>
                  <Show when={i() < data().parts.length - 1}>
                    <text fg={theme.textMuted}>{""}</text>
                  </Show>
                </box>
              )}
            </For>
          </box>
        )}
      </Show>
    </box>
  )
}
