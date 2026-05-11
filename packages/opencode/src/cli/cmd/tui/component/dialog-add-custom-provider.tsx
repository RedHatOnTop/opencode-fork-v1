
import { createSignal } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { AppRuntime } from "@/effect/app-runtime"
import { Effect } from "effect"
import { Config } from "@/config/config"
import { Auth } from "@/auth"

export function DialogAddCustomProvider() {
  const dialog = useDialog()
  return <DialogPrompt title="Enter provider endpoint URL" placeholder="e.g. http://localhost:11434/v1" onConfirm={(url) => {
    if (!url || url.trim() === "") return
    dialog.replace(() => <DialogCustomApiKey url={url.trim()} />)
  }} />
}

function DialogCustomApiKey(props: { url: string }) {
  const dialog = useDialog()
  return <DialogPrompt title="Enter the API key" placeholder="API key..." onConfirm={(key) => {
    if (!key || key.trim() === "") return
    dialog.replace(() => <DialogCustomName url={props.url} apiKey={key.trim()} />)
  }} />
}

function DialogCustomName(props: { url: string, apiKey: string }) {
  const dialog = useDialog()
  return <DialogPrompt title="Enter a name for this provider" placeholder="e.g. custom-local" onConfirm={(nameRaw) => {
    if (!nameRaw || nameRaw.trim() === "") return
    const name = nameRaw.trim().toLowerCase()
    dialog.replace(() => <DialogCustomScanner url={props.url} apiKey={props.apiKey} providerName={name} />)
  }} />
}

function DialogCustomScanner(props: { url: string, apiKey: string, providerName: string }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  
  createSignal(false) 

  const fetchModels = async () => {
    const endpoint = props.url.endsWith("/") ? props.url.slice(0, -1) : props.url
    let modelsData: any
    try {
      const res = await fetch(`${endpoint}/models`, {
        headers: { Authorization: `Bearer ${props.apiKey}` }
      })
      if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`)
      modelsData = await res.json()
    } catch(e: any) {
      dialog.replace(() => <DialogPrompt title="Failed to fetch models" placeholder={e.message} onConfirm={() => dialog.clear()} />)
      return
    }

    const availableModels: string[] = []
    if (modelsData?.data && Array.isArray(modelsData.data)) {
      availableModels.push(...modelsData.data.map((m: any) => m.id))
    } else if (Array.isArray(modelsData)) {
      availableModels.push(...modelsData.map((m: any) => m.id ?? m.name ?? String(m)))
    } else if (modelsData?.object === "list" && Array.isArray(modelsData.data)) {
      availableModels.push(...modelsData.data.map((m: any) => m.id))
    }

    if (availableModels.length === 0) {
      dialog.replace(() => <DialogPrompt title="No models found" placeholder="Check endpoint" onConfirm={() => dialog.clear()} />)
      return
    }

    dialog.replace(() => <DialogCustomModelToggle url={props.url} apiKey={props.apiKey} providerName={props.providerName} availableModels={availableModels} />)
  }

  void fetchModels()

  return <DialogPrompt title="Scanning models from /models..." placeholder="Please wait..." onConfirm={() => {}} />
}

function DialogCustomModelToggle(props: { url: string, apiKey: string, providerName: string, availableModels: string[] }) {
  const dialog = useDialog()
  const [selected, setSelected] = createSignal<Set<string>>(new Set(props.availableModels))
  const { theme } = useTheme()
  const sync = useSync()

  const options: DialogSelectOption<string>[] = props.availableModels.map((m: string) => ({
    title: m,
    value: m,
    gutter: <text fg={selected().has(m) ? theme.success : theme.textMuted}>{selected().has(m) ? "[x]" : "[ ]"}</text>,
    onSelect: () => {
      setSelected(s => {
        const next = new Set(s)
        if (next.has(m)) next.delete(m)
        else next.add(m)
        return next
      })
    }
  }))

  options.push({
    title: "Finish & Save",
    value: "FINISH",
    gutter: <text fg={theme.primary}>→</text>,
    onSelect: async () => {
      const selectedModels = Array.from(selected())
      dialog.clear()
      
      const put = (key: string, info: Auth.Info) => AppRuntime.runPromise(Effect.gen(function* () {
        const auth = yield* Auth.Service
        yield* auth.set(key, info)
      }))

      await put(props.providerName, {
        type: "api",
        key: props.apiKey,
      })

      await AppRuntime.runPromise(
        Config.Service.use((cfg) =>
          Effect.gen(function* () {
            const currentConfig = yield* cfg.getGlobal()
            const modelsConfig: Record<string, any> = {}
            for (const m of selectedModels) {
              modelsConfig[m] = {
                id: m,
                name: m,
              }
            }
            const providerConfig = currentConfig.provider || {}
            providerConfig[props.providerName] = {
              ...providerConfig[props.providerName],
              api: "openai",
              name: props.providerName,
              options: {
                ...(providerConfig[props.providerName]?.options || {}),
                baseURL: props.url,
              },
              models: {
                ...(providerConfig[props.providerName]?.models || {}),
                ...modelsConfig,
              },
            }
            yield* cfg.updateGlobal({
              ...currentConfig,
              provider: providerConfig,
            })
          })
        )
      )

      await sync.bootstrap()
    }
  })

  return <DialogSelect title={`Select models to add for ${props.providerName} (Space/Enter to toggle, select Finish to save)`} options={options} skipFilter={true} keybind={[
    {
      keybind: { name: "space", ctrl: false, meta: false, shift: false, super: false, leader: false },
      title: "Toggle",
      onTrigger: (option) => {
        if (option.value === "FINISH") return
        setSelected(s => {
          const next = new Set(s)
          if (next.has(option.value as string)) next.delete(option.value as string)
          else next.add(option.value as string)
          return next
        })
      }
    }
  ]} />
}
