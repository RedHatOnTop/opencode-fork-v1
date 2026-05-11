import { createMemo } from "solid-js"
import { useLocal } from "@tui/context/local"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"

export function DialogThinkingEffort() {
  const local = useLocal()
  const dialog = useDialog()

  const options = createMemo(() => {
    const levels = local.model.thinkingEffort.list()
    return [
      {
        value: "default",
        title: "Default (model default)",
        onSelect: () => {
          dialog.clear()
          local.model.thinkingEffort.set(undefined)
        },
      },
      ...levels.map((level) => ({
        value: level,
        title: level,
        onSelect: () => {
          dialog.clear()
          local.model.thinkingEffort.set(level)
        },
      })),
    ]
  })

  return (
    <DialogSelect<string>
      options={options()}
      title={"Select thinking effort"}
      current={local.model.thinkingEffort.selected()}
      flat={true}
    />
  )
}
