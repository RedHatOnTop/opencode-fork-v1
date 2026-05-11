import { createMemo } from "solid-js"
import { useSync } from "@tui/context/sync"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { useToast } from "../ui/toast"
import { isConsoleManagedProvider } from "@tui/util/provider-origin"
import { Config } from "@/config/config"
import { AppRuntime } from "@/effect/app-runtime"
import { Effect } from "effect"

export function DialogDisconnectProvider() {
  const sync = useSync()
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const { theme } = useTheme()

  const connectedProviders = createMemo(() =>
    sync.data.provider.filter(
      (p) =>
        p.id !== "opencode" &&
        !isConsoleManagedProvider(sync.data.console_state.consoleManagedProviders, p.id),
    ),
  )

  const options = createMemo(() =>
    connectedProviders().map((provider) => ({
      title: provider.name,
      value: provider.id,
      description: `${Object.keys(provider.models).length} model(s)`,
      category: "Connected providers",
      onSelect: async () => {
        await disconnectProvider(provider.id, provider.name)
      },
    })),
  )

  async function disconnectProvider(providerID: string, providerName: string) {
    const confirmed = await new Promise<boolean>((resolve) => {
      dialog.replace(
        () => (
          <DialogSelect
            title={`Disconnect ${providerName}?`}
            options={[
              {
                title: "Yes, disconnect",
                value: true,
                gutter: <text fg={theme.error}>✕</text>,
                onSelect: () => resolve(true),
              },
              {
                title: "Cancel",
                value: false,
                onSelect: () => resolve(false),
              },
            ]}
          />
        ),
        () => resolve(false),
      )
    })

    if (!confirmed) return

    try {
      await sdk.client.auth.remove({ providerID })

      await AppRuntime.runPromise(
        Config.Service.use((cfg) =>
          Effect.gen(function* () {
            const currentCfg = yield* cfg.getGlobal()
            if (currentCfg.provider?.[providerID]) {
              const { [providerID]: _, ...rest } = currentCfg.provider
              const newCfg = { ...currentCfg, provider: Object.keys(rest).length > 0 ? rest : undefined }
              yield* cfg.updateGlobal(newCfg)
            }
          }),
        ),
      )

      await sdk.client.instance.dispose()
      await sync.bootstrap()

      toast.show({ message: `Disconnected ${providerName}`, variant: "success" })
      dialog.clear()
    } catch (err) {
      toast.show({ message: `Failed to disconnect: ${String(err)}`, variant: "error" })
    }
  }

  return (
    <DialogSelect
      title="Disconnect a provider"
      options={options()}
    />
  )
}
