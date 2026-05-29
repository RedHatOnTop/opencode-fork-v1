import { TextAttributes } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import * as Clipboard from "@tui/util/clipboard"
import { createSignal } from "solid-js"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { getScrollAcceleration } from "../util/scroll"

export function ErrorComponent(props: {
  error: Error
  reset: () => void
  exit: () => Promise<void>
  mode?: "dark" | "light"
}) {
  const term = useTerminalDimensions()

  useKeyboard((evt) => {
    if (evt.ctrl && evt.name === "c") {
      void props.exit()
    }
  })
  const [copied, setCopied] = createSignal(false)

  const isLight = props.mode === "light"
  const colors = {
    bg: isLight ? "#ffffff" : "#0a0a0a",
    text: isLight ? "#1a1a1a" : "#eeeeee",
    muted: isLight ? "#8a8a8a" : "#808080",
    primary: isLight ? "#3b7dd8" : "#fab283",
  }

  const fullError = [
    `Error: ${props.error.message}`,
    "",
    props.error.stack ?? "",
    "",
    `opencode-version: ${InstallationVersion}`,
  ].join("\n")

  const copyErrorText = () => {
    void Clipboard.copy(fullError).then(() => {
      setCopied(true)
    })
  }

  return (
    <box flexDirection="column" gap={1} backgroundColor={colors.bg}>
      <box flexDirection="row" gap={1} alignItems="center">
        <text attributes={TextAttributes.BOLD} fg={colors.text}>
          A fatal error occurred!
        </text>
        <box onMouseUp={copyErrorText} backgroundColor={colors.primary} padding={1}>
          <text attributes={TextAttributes.BOLD} fg={colors.bg}>
            Copy error details
          </text>
        </box>
        {copied() && <text fg={colors.muted}>Copied</text>}
      </box>
      <box flexDirection="row" gap={2} alignItems="center">
        <box onMouseUp={props.reset} backgroundColor={colors.primary} padding={1}>
          <text fg={colors.bg}>Reset TUI</text>
        </box>
        <box onMouseUp={() => void props.exit()} backgroundColor={colors.primary} padding={1}>
          <text fg={colors.bg}>Exit</text>
        </box>
      </box>
      <scrollbox height={Math.floor(term().height * 0.7)} scrollAcceleration={getScrollAcceleration()}>
        <text fg={colors.muted}>{props.error.stack}</text>
      </scrollbox>
      <text fg={colors.text}>{props.error.message}</text>
    </box>
  )
}
