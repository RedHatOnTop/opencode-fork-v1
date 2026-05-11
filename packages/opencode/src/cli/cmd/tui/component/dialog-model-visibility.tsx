import { createSignal, createResource, onMount } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { AppRuntime } from "@/effect/app-runtime"
import { Config } from "@/config/config"
import { useSync } from "../context/sync"
import { Effect } from "effect"
import { map, pipe, sortBy, flatMap, entries } from "remeda"

type ModelItem = { providerID: string; modelID: string; name: string; disabled: boolean }

export function DialogModelVisibility() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const sync = useSync()
  const [selected, setSelected] = createSignal<Set<string>>(new Set())

  const [configResource] = createResource(async () => {
    return AppRuntime.runPromise(
      Config.Service.use((cfg) => Effect.gen(function* () {
        return yield* cfg.getGlobal()
      }))
    )
  })

  // Populate models when config is loaded
  onMount(async () => {
    // All currently visible models
    const vs = new Set<string>()
    for (const p of sync.data.provider) {
      for (const m of Object.keys(p.models)) {
        const key = `${p.id}:${m}`
        vs.add(key)
      }
    }
    
    setSelected(vs)
  })

  const modelsList = () => {
    const cfg = configResource()
    if (!cfg) return []

    const list: ModelItem[] = []

    // 1. Add all visible models from sync (they are inherently enabled)
    for (const p of sync.data.provider) {
      for (const [m, info] of Object.entries(p.models)) {
        list.push({
          providerID: p.id,
          modelID: m,
          name: typeof info === "object" && info !== null && "name" in info && typeof info.name === "string" ? info.name : m,
          disabled: false,
        })
      }
    }

    // 2. Add hidden models that are in blacklist
    if (cfg.provider) {
      for (const [pID, pConfig] of Object.entries(cfg.provider)) {
        if (pConfig && typeof pConfig === "object" && "blacklist" in pConfig && Array.isArray(pConfig.blacklist)) {
          for (const m of pConfig.blacklist) {
            // Only add if not already in list
            if (!list.some(x => x.providerID === pID && x.modelID === m)) {
              list.push({
                providerID: pID,
                modelID: m,
                name: (pConfig.models && (pConfig.models as any)[m] && (pConfig.models as any)[m].name) || m,
                disabled: true,
              })
            }
          }
        }
      }
    }

    return pipe(
      list,
      sortBy(x => x.providerID, x => x.name.toLowerCase())
    )
  }

  const options = (): DialogSelectOption<{ providerID: string; modelID: string } | "FINISH">[] => {
    if (configResource.loading) {
      return [{ title: "Loading...", value: "FINISH" }]
    }

    const result: DialogSelectOption<{ providerID: string; modelID: string } | "FINISH">[] = modelsList().map(item => {
      const key = `${item.providerID}:${item.modelID}`
      const isSelected = selected().has(key)
      return {
        title: item.name,
        value: { providerID: item.providerID, modelID: item.modelID },
        description: `${isSelected ? "[Visible]" : "[Hidden]"}`,
        category: item.providerID,
        gutter: <text fg={isSelected ? theme.success : theme.textMuted}>{isSelected ? "[x]" : "[ ]"}</text>,
        onSelect: () => {
          setSelected(s => {
            const next = new Set(s)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
          })
        }
      }
    })

    result.push({
      title: "Finish & Save Visibility",
      value: "FINISH",
      category: "Actions",
      gutter: <text fg={theme.primary}>→</text>,
      onSelect: async () => {
        const currentCfg = await AppRuntime.runPromise(
          Config.Service.use((c) => Effect.gen(function* () {
            return yield* c.getGlobal()
          }))
        )

        const allProviders = new Set<string>()
        const toDisableByProvider: Record<string, string[]> = {}
        for (const item of modelsList()) {
          allProviders.add(item.providerID)
          const key = `${item.providerID}:${item.modelID}`
          if (!selected().has(key)) {
            if (!toDisableByProvider[item.providerID]) toDisableByProvider[item.providerID] = []
            toDisableByProvider[item.providerID].push(item.modelID)
          }
        }

        await AppRuntime.runPromise(
          Config.Service.use((cfg) => Effect.gen(function* () {
            const newCfg = { ...currentCfg }
            if (!newCfg.provider) newCfg.provider = {}

            for (const pID of allProviders) {
              const disabled = toDisableByProvider[pID] ?? []
              if (disabled.length > 0) {
                newCfg.provider[pID] = {
                  ...(newCfg.provider[pID] || {}),
                  blacklist: disabled,
                }
              } else if (newCfg.provider[pID]?.blacklist) {
                const { blacklist: _, ...rest } = newCfg.provider[pID] as any
                if (Object.keys(rest).length > 0) {
                  newCfg.provider[pID] = rest
                } else {
                  delete newCfg.provider[pID]
                }
              }
            }

            yield* cfg.updateGlobal(newCfg)
          }))
        )

        dialog.clear()
      }
    })

    return result
  }

  return (
    <DialogSelect
      options={options()}
      flat={false}
      skipFilter={false}
      title="Toggle Model Visibility (Space/Enter to toggle)"
      keybind={[
        {
          keybind: { name: "space", ctrl: false, meta: false, shift: false, super: false, leader: false },
          title: "Toggle",
          onTrigger: (option) => {
            if (option.value === "FINISH") return
            const item = option.value as { providerID: string; modelID: string }
            const key = `${item.providerID}:${item.modelID}`
            setSelected(s => {
              const next = new Set(s)
              if (next.has(key)) next.delete(key)
              else next.add(key)
              return next
            })
          }
        }
      ]}
    />
  )
}





















































































































































































