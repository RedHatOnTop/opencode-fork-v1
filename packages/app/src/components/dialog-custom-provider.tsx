import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { useMutation } from "@tanstack/solid-query"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { Icon } from "@opencode-ai/ui/icon"
import { batch, For, createSignal, createMemo, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Link } from "@/components/link"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { type FormState, headerRow, modelRow, validateCustomProvider } from "./dialog-custom-provider-form"
import { DialogSelectProvider } from "./dialog-select-provider"

type Props = {
  back?: "providers" | "close"
}

type FetchedModel = {
  id: string
  name?: string
}

export function DialogCustomProvider(props: Props) {
  const dialog = useDialog()
  const globalSync = useGlobalSync()
  const globalSDK = useGlobalSDK()
  const language = useLanguage()

  const [form, setForm] = createStore<FormState>({
    providerID: "",
    name: "",
    baseURL: "",
    apiKey: "",
    models: [modelRow()],
    headers: [headerRow()],
    err: {},
  })

  const [fetchedModels, setFetchedModels] = createSignal<FetchedModel[]>([])
  const [selectedModelIds, setSelectedModelIds] = createSignal<Set<string>>(new Set())
  const [modelSearch, setModelSearch] = createSignal("")
  const [fetchError, setFetchError] = createSignal<string | null>(null)

  const filteredFetchedModels = createMemo(() => {
    const search = modelSearch().toLowerCase().trim()
    const models = fetchedModels()
    if (!search) return models
    return models.filter((m) => m.id.toLowerCase().includes(search) || (m.name && m.name.toLowerCase().includes(search)))
  })

  const allSelected = createMemo(() => {
    const filtered = filteredFetchedModels()
    if (filtered.length === 0) return false
    const selected = selectedModelIds()
    return filtered.every((m) => selected.has(m.id))
  })

  const someSelected = createMemo(() => {
    const filtered = filteredFetchedModels()
    if (filtered.length === 0) return false
    const selected = selectedModelIds()
    return filtered.some((m) => selected.has(m.id)) && !allSelected()
  })

  const goBack = () => {
    if (props.back === "close") {
      dialog.close()
      return
    }
    dialog.show(() => <DialogSelectProvider />)
  }

  const addModel = () => {
    setForm(
      "models",
      produce((rows) => {
        rows.push(modelRow())
      }),
    )
  }

  const removeModel = (index: number) => {
    if (form.models.length <= 1) return
    setForm(
      "models",
      produce((rows) => {
        rows.splice(index, 1)
      }),
    )
  }

  const addHeader = () => {
    setForm(
      "headers",
      produce((rows) => {
        rows.push(headerRow())
      }),
    )
  }

  const removeHeader = (index: number) => {
    if (form.headers.length <= 1) return
    setForm(
      "headers",
      produce((rows) => {
        rows.splice(index, 1)
      }),
    )
  }

  const setField = (key: "providerID" | "name" | "baseURL" | "apiKey", value: string) => {
    setForm(key, value)
    if (key === "apiKey") return
    setForm("err", key, undefined)
  }

  const setModel = (index: number, key: "id" | "name", value: string) => {
    batch(() => {
      setForm("models", index, key, value)
      setForm("models", index, "err", key, undefined)
    })
  }

  const setHeader = (index: number, key: "key" | "value", value: string) => {
    batch(() => {
      setForm("headers", index, key, value)
      setForm("headers", index, "err", key, undefined)
    })
  }

  const fetchModelsMutation = useMutation(() => ({
    mutationFn: async () => {
      const url = form.baseURL.trim()
      if (!url) throw new Error("Base URL is required")

      const endpoint = url.endsWith("/") ? url.slice(0, -1) : url
      const headers: Record<string, string> = {}
      const apiKey = form.apiKey.trim()
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`
      }
      for (const h of form.headers) {
        const key = h.key.trim()
        const value = h.value.trim()
        if (key && value) {
          headers[key] = value
        }
      }

      const res = await fetch(`${endpoint}/models`, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

      const data = await res.json()
      const models: FetchedModel[] = []

      if (data?.data && Array.isArray(data.data)) {
        for (const m of data.data) {
          if (m?.id) models.push({ id: m.id, name: m.name ?? m.id })
        }
      } else if (Array.isArray(data)) {
        for (const m of data) {
          const id = m?.id ?? m?.name ?? String(m)
          if (id) models.push({ id, name: m?.name ?? id })
        }
      }

      if (models.length === 0) throw new Error("No models found at this endpoint")
      return models
    },
    onSuccess: (models) => {
      setFetchError(null)
      setFetchedModels(models)
      const newSelected = new Set<string>()
      for (const m of models) {
        newSelected.add(m.id)
      }
      setSelectedModelIds(newSelected)
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      setFetchError(message)
      showToast({ title: language.t("provider.custom.error.fetch"), description: message })
    },
  }))

  const toggleModel = (modelId: string) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev)
      if (next.has(modelId)) next.delete(modelId)
      else next.add(modelId)
      return next
    })
  }

  const toggleAll = () => {
    const filtered = filteredFetchedModels()
    if (allSelected()) {
      setSelectedModelIds((prev) => {
        const next = new Set(prev)
        for (const m of filtered) next.delete(m.id)
        return next
      })
    } else {
      setSelectedModelIds((prev) => {
        const next = new Set(prev)
        for (const m of filtered) next.add(m.id)
        return next
      })
    }
  }

  const validate = () => {
    const selected = selectedModelIds()
    const fetched = fetchedModels()

    let modelsToValidate = form.models

    if (fetched.length > 0) {
      const selectedModels = fetched.filter((m) => selected.has(m.id))
      if (selectedModels.length === 0) return null

      modelsToValidate = selectedModels.map((m) => ({
        row: modelRow().row,
        id: m.id,
        name: m.name ?? m.id,
        err: {},
      }))
    }

    const formWithModels = { ...form, models: modelsToValidate.length > 0 ? modelsToValidate : form.models }

    const output = validateCustomProvider({
      form: formWithModels,
      t: language.t,
      disabledProviders: globalSync.data.config.disabled_providers ?? [],
      existingProviderIDs: new Set(globalSync.data.provider.all.map((p) => p.id)),
    })
    batch(() => {
      setForm("err", output.err)
      if (fetched.length === 0) {
        output.models.forEach((err, index) => setForm("models", index, "err", err))
      }
      output.headers.forEach((err, index) => setForm("headers", index, "err", err))
    })

    if (!output.result) return null

    if (fetched.length > 0) {
      const selectedModels = fetched.filter((m) => selected.has(m.id))
      const modelConfig = Object.fromEntries(selectedModels.map((m) => [m.id, { name: m.name ?? m.id }]))

      return {
        ...output.result,
        config: {
          ...output.result.config,
          models: modelConfig,
        },
      }
    }

    return output.result
  }

  const saveMutation = useMutation(() => ({
    mutationFn: async (result: NonNullable<ReturnType<typeof validate>>) => {
      const disabledProviders = globalSync.data.config.disabled_providers ?? []
      const nextDisabled = disabledProviders.filter((id) => id !== result.providerID)

      if (result.key) {
        await globalSDK.client.auth.set({
          providerID: result.providerID,
          auth: {
            type: "api",
            key: result.key,
          },
        })
      }

      await globalSync.updateConfig({
        provider: { [result.providerID]: result.config },
        disabled_providers: nextDisabled,
      })
      return result
    },
    onSuccess: (result) => {
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.connect.toast.connected.title", { provider: result.name }),
        description: language.t("provider.connect.toast.connected.description", { provider: result.name }),
      })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    },
  }))

  const save = (e: SubmitEvent) => {
    e.preventDefault()
    if (saveMutation.isPending) return

    const result = validate()
    if (!result) return
    saveMutation.mutate(result)
  }

  return (
    <Dialog
      title={
        <IconButton
          tabIndex={-1}
          icon="arrow-left"
          variant="ghost"
          onClick={goBack}
          aria-label={language.t("common.goBack")}
        />
      }
      transition
    >
      <div class="flex flex-col gap-6 px-2.5 pb-3 overflow-y-auto max-h-[60vh]">
        <div class="px-2.5 flex gap-4 items-center">
          <ProviderIcon id="synthetic" class="size-5 shrink-0 icon-strong-base" />
          <div class="text-16-medium text-text-strong">{language.t("provider.custom.title")}</div>
        </div>

        <form onSubmit={save} class="px-2.5 pb-6 flex flex-col gap-6">
          <p class="text-14-regular text-text-base">
            {language.t("provider.custom.description.prefix")}
            <Link href="https://opencode.ai/docs/providers/#custom-provider" tabIndex={-1}>
              {language.t("provider.custom.description.link")}
            </Link>
            {language.t("provider.custom.description.suffix")}
          </p>

          <div class="flex flex-col gap-4">
            <TextField
              autofocus
              label={language.t("provider.custom.field.providerID.label")}
              placeholder={language.t("provider.custom.field.providerID.placeholder")}
              description={language.t("provider.custom.field.providerID.description")}
              value={form.providerID}
              onChange={(v) => setField("providerID", v)}
              validationState={form.err.providerID ? "invalid" : undefined}
              error={form.err.providerID}
            />
            <TextField
              label={language.t("provider.custom.field.name.label")}
              placeholder={language.t("provider.custom.field.name.placeholder")}
              value={form.name}
              onChange={(v) => setField("name", v)}
              validationState={form.err.name ? "invalid" : undefined}
              error={form.err.name}
            />
            <TextField
              label={language.t("provider.custom.field.baseURL.label")}
              placeholder={language.t("provider.custom.field.baseURL.placeholder")}
              value={form.baseURL}
              onChange={(v) => setField("baseURL", v)}
              validationState={form.err.baseURL ? "invalid" : undefined}
              error={form.err.baseURL}
            />
            <TextField
              label={language.t("provider.custom.field.apiKey.label")}
              placeholder={language.t("provider.custom.field.apiKey.placeholder")}
              description={language.t("provider.custom.field.apiKey.description")}
              value={form.apiKey}
              onChange={(v) => setField("apiKey", v)}
            />
          </div>

          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <label class="text-12-medium text-text-weak">{language.t("provider.custom.models.label")}</label>
              <Button
                type="button"
                size="small"
                variant="ghost"
                icon="magnifying-glass"
                onClick={() => fetchModelsMutation.mutate()}
                disabled={fetchModelsMutation.isPending || !form.baseURL.trim()}
              >
                {fetchModelsMutation.isPending
                  ? language.t("provider.custom.models.fetching")
                  : language.t("provider.custom.models.fetch")}
              </Button>
            </div>

            <Show when={fetchedModels().length > 0}>
              <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2 px-3 h-9 rounded-lg bg-surface-base">
                  <Checkbox
                    checked={allSelected()}
                    indeterminate={someSelected()}
                    onChange={toggleAll}
                    hideLabel
                  >
                    {language.t("provider.custom.models.toggleAll")}
                  </Checkbox>
                  <Icon name="magnifying-glass" class="text-icon-weak-base flex-shrink-0" />
                  <TextField
                    variant="ghost"
                    type="text"
                    value={modelSearch()}
                    onChange={setModelSearch}
                    placeholder={language.t("provider.custom.models.search")}
                    spellcheck={false}
                    autocorrect="off"
                    autocomplete="off"
                    autocapitalize="off"
                    class="flex-1"
                  />
                  <Show when={modelSearch()}>
                    <IconButton icon="circle-x" variant="ghost" onClick={() => setModelSearch("")} />
                  </Show>
                </div>
                <div class="flex flex-col gap-1 max-h-60 overflow-y-auto">
                  <For each={filteredFetchedModels()}>
                    {(m) => {
                      const isSelected = createMemo(() => selectedModelIds().has(m.id))
                      return (
                        <label class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-base cursor-pointer">
                          <Checkbox checked={isSelected()} onChange={() => toggleModel(m.id)} hideLabel>
                            {m.id}
                          </Checkbox>
                          <span class="text-13-regular text-text-base truncate">{m.id}</span>
                          <Show when={m.name && m.name !== m.id}>
                            <span class="text-12-regular text-text-weak truncate">{m.name}</span>
                          </Show>
                        </label>
                      )
                    }}
                  </For>
                </div>
                <div class="text-12-regular text-text-weak">
                  {language.t("provider.custom.models.selected", {
                    count: selectedModelIds().size,
                    total: fetchedModels().length,
                  })}
                </div>
              </div>
            </Show>

            <Show when={fetchedModels().length === 0}>
              <div class="flex flex-col gap-1">
                <Show when={fetchError()}>
                  <div class="text-13-regular text-text-base px-2">{fetchError()}</div>
                </Show>
                <For each={form.models}>
                  {(m, i) => (
                    <div class="flex gap-2 items-start" data-row={m.row}>
                      <div class="flex-1">
                        <TextField
                          label={language.t("provider.custom.models.id.label")}
                          hideLabel
                          placeholder={language.t("provider.custom.models.id.placeholder")}
                          value={m.id}
                          onChange={(v) => setModel(i(), "id", v)}
                          validationState={m.err.id ? "invalid" : undefined}
                          error={m.err.id}
                        />
                      </div>
                      <div class="flex-1">
                        <TextField
                          label={language.t("provider.custom.models.name.label")}
                          hideLabel
                          placeholder={language.t("provider.custom.models.name.placeholder")}
                          value={m.name}
                          onChange={(v) => setModel(i(), "name", v)}
                          validationState={m.err.name ? "invalid" : undefined}
                          error={m.err.name}
                        />
                      </div>
                      <IconButton
                        type="button"
                        icon="trash"
                        variant="ghost"
                        class="mt-1.5"
                        onClick={() => removeModel(i())}
                        disabled={form.models.length <= 1}
                        aria-label={language.t("provider.custom.models.remove")}
                      />
                    </div>
                  )}
                </For>
                <Button type="button" size="small" variant="ghost" icon="plus-small" onClick={addModel} class="self-start">
                  {language.t("provider.custom.models.add")}
                </Button>
              </div>
            </Show>
          </div>

          <div class="flex flex-col gap-3">
            <label class="text-12-medium text-text-weak">{language.t("provider.custom.headers.label")}</label>
            <For each={form.headers}>
              {(h, i) => (
                <div class="flex gap-2 items-start" data-row={h.row}>
                  <div class="flex-1">
                    <TextField
                      label={language.t("provider.custom.headers.key.label")}
                      hideLabel
                      placeholder={language.t("provider.custom.headers.key.placeholder")}
                      value={h.key}
                      onChange={(v) => setHeader(i(), "key", v)}
                      validationState={h.err.key ? "invalid" : undefined}
                      error={h.err.key}
                    />
                  </div>
                  <div class="flex-1">
                    <TextField
                      label={language.t("provider.custom.headers.value.label")}
                      hideLabel
                      placeholder={language.t("provider.custom.headers.value.placeholder")}
                      value={h.value}
                      onChange={(v) => setHeader(i(), "value", v)}
                      validationState={h.err.value ? "invalid" : undefined}
                      error={h.err.value}
                    />
                  </div>
                  <IconButton
                    type="button"
                    icon="trash"
                    variant="ghost"
                    class="mt-1.5"
                    onClick={() => removeHeader(i())}
                    disabled={form.headers.length <= 1}
                    aria-label={language.t("provider.custom.headers.remove")}
                  />
                </div>
              )}
            </For>
            <Button type="button" size="small" variant="ghost" icon="plus-small" onClick={addHeader} class="self-start">
              {language.t("provider.custom.headers.add")}
            </Button>
          </div>

          <Button
            class="w-auto self-start"
            type="submit"
            size="large"
            variant="primary"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? language.t("common.saving") : language.t("common.submit")}
          </Button>
        </form>
      </div>
    </Dialog>
  )
}
