
import { createSignal, createMemo } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { AppRuntime } from "@/effect/app-runtime"
import { Config } from "@/config/config"
import { Effect } from "effect"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"

export function DialogAddCustomProvider() {
  const dialog = useDialog()
  return <DialogPrompt title="Enter provider endpoint URL" placeholder="e.g. http://localhost:11434/v1" onConfirm={(url) => {
    if (!url || url.trim() === "") return
    dialog.replace(() => <DialogCustomApiKey url={url.trim()} />)
  }} />
}

export function DialogEditCustomProviderSelect() {
  const dialog = useDialog()
  const sync = useSync()

  const customProviders = createMemo(() => {
    const providers = sync.data.config.provider || {}
    const standard = ["opencode", "openai", "anthropic", "google", "github-copilot", "google-vertex", "amazon-bedrock", "azure", "openrouter", "mistral", "gitlab"]
    return Object.keys(providers)
      .filter((id) => !standard.includes(id))
      .map((id) => ({
        id,
        ...providers[id]
      }))
  })

  const options = createMemo(() => {
    const list = customProviders()
    if (list.length === 0) {
      return [{
        title: "No custom providers found",
        value: "NONE",
        disabled: true,
      }]
    }
    return list.map((p) => ({
      title: p.name || p.id,
      value: p.id,
      description: `${p.options?.baseURL || ""}`,
      onSelect: () => {
        dialog.replace(() => <DialogCustomApiKey url={p.options?.baseURL || ""} providerName={p.id} isEdit={true} />)
      }
    }))
  })

  return (
    <DialogSelect
      title="Select custom provider to edit models"
      options={options()}
    />
  )
}

function DialogCustomApiKey(props: { url: string, providerName?: string, isEdit?: boolean }) {
  const dialog = useDialog()
  return <DialogPrompt title="Enter the API key" placeholder="API key..." onConfirm={(key) => {
    if (!key || key.trim() === "") return
    if (props.isEdit && props.providerName) {
      dialog.replace(() => <DialogCustomScanner url={props.url} apiKey={key.trim()} providerName={props.providerName!} isEdit={true} />)
    } else {
      dialog.replace(() => <DialogCustomName url={props.url} apiKey={key.trim()} />)
    }
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

function DialogCustomScanner(props: { url: string, apiKey: string, providerName: string, isEdit?: boolean }) {
  const dialog = useDialog()
  
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

    dialog.replace(() => <DialogCustomModelToggle url={props.url} apiKey={props.apiKey} providerName={props.providerName} availableModels={availableModels} isEdit={props.isEdit} />)
  }

  void fetchModels()

  return <DialogPrompt title="Scanning models from /models..." placeholder="Please wait..." onConfirm={() => {}} />
}

function DialogCustomModelToggle(props: { url: string, apiKey: string, providerName: string, availableModels: string[], isEdit?: boolean }) {
  const dialog = useDialog()
  const sync = useSync()
  const sdk = useSDK()
  const { theme } = useTheme()

  const getInitialSelected = () => {
    if (props.isEdit) {
      const existingModels = sync.data.config.provider?.[props.providerName]?.models || {}
      const existingKeys = Object.keys(existingModels)
      const initial = new Set<string>()
      for (const m of props.availableModels) {
        if (existingKeys.includes(m)) {
          initial.add(m)
        }
      }
      return initial
    }
    return new Set(props.availableModels)
  }

  const [selected, setSelected] = createSignal<Set<string>>(getInitialSelected())

  const toggleAll = () => {
    setSelected(s => {
      if (s.size < props.availableModels.length) {
        return new Set<string>(props.availableModels)
      } else {
        return new Set<string>()
      }
    })
  }

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
    title: "Toggle All",
    value: "TOGGLE_ALL",
    gutter: <text fg={theme.primary}>⇄</text>,
    onSelect: () => {
      toggleAll()
    }
  })

  options.push({
    title: "Finish & Save",
    value: "FINISH",
    gutter: <text fg={theme.primary}>→</text>,
    onSelect: () => finishAndSave()
  })

  async function finishAndSave() {
    const selectedModels = Array.from(selected())
    await sdk.client.auth.set({
      providerID: props.providerName,
      auth: {
        type: "api",
        key: props.apiKey,
      }
    })

    await AppRuntime.runPromise(
      Config.Service.use((cfg) => Effect.gen(function* () {
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
          models: modelsConfig,
        }

        yield* cfg.updateGlobal({
          ...currentConfig,
          provider: providerConfig,
        })
      }))
    )

    await sdk.client.instance.dispose()
    await sync.bootstrap()
    dialog.clear()
  }

  return <DialogSelect title={`Select models to add for ${props.providerName} (Space/Enter to toggle, select Finish to save)`} options={options} {...({ keybind: [
    {
      keybind: { name: "space", ctrl: false, meta: false, shift: false, super: false, leader: false },
      title: "Toggle",
      onTrigger: (option: any) => {
        if (option.value === "FINISH" || option.value === "TOGGLE_ALL") return
        setSelected(s => {
          const next = new Set(s)
          if (next.has(option.value as string)) next.delete(option.value as string)
          else next.add(option.value as string)
          return next
        })
      }
    },
    {
      keybind: { name: "a", ctrl: false, meta: false, shift: false, super: false, leader: false },
      title: "Toggle All",
      onTrigger: () => {
        toggleAll()
      }
    },
    {
      keybind: { name: "s", ctrl: true, meta: false, shift: false, super: false, leader: false },
      title: "Save",
      side: "right",
      onTrigger: () => {
        finishAndSave()
      }
    }
  ]} as any)} />
}
