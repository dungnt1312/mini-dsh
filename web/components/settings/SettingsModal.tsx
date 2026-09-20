import * as RadixSelect from '@radix-ui/react-select'
import * as Tabs from '@radix-ui/react-tabs'
import { ProjectsPanel } from './ProjectsPanel.tsx'
import { ErrorNotice } from '../common/ErrorNotice.tsx'
import ConfirmDialog from '../common/ConfirmDialog.tsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import Icon, { type IconName } from '../common/Icon.tsx'
import { Badge } from '../ui/Badge.tsx'
import { Button } from '../ui/Button.tsx'
import { Field } from '../ui/Field.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Modal } from '../ui/Modal.tsx'
import { Select } from '../ui/Select.tsx'
import { Switch } from '../ui/Switch.tsx'
import { TextInput } from '../ui/TextInput.tsx'
import {
  createProvider,
  deleteProvider,
  syncProvider,
  testProvider,
  updateProvider,
} from '../../lib/api.ts'
import {
  THINKING_LABELS,
  capabilityBadges,
  getModelInfo,
  getReasoningCapability,
  modelContext,
} from '../../lib/model-info.ts'
import { AgentsPanel, HooksPanel, McpPanel, MemoryPanel, SecretsPanel, SkillsPanel } from './ManagementPanels.tsx'
import type { ModelSettings, ProjectRow, ProviderSummary } from '../../lib/types.ts'

/** Settings are grouped per concern; providers keep their own full editor. */
type SettingsTab = 'providers' | 'projects' | 'skills' | 'memory' | 'agents' | 'mcp' | 'hooks' | 'secrets'

const TABS: readonly { readonly id: SettingsTab; readonly label: string; readonly hint: string; readonly icon: IconName }[] = [
  { id: 'providers', label: 'Providers', hint: 'Model endpoints, keys, and the default model for new conversations', icon: 'globe' },
  { id: 'projects', label: 'Projects', hint: 'Folders conversations in this workspace can work in', icon: 'folder' },
  { id: 'skills', label: 'Skills', hint: 'SKILL.md instruction packages', icon: 'zap' },
  { id: 'memory', label: 'Memory', hint: 'Notes the model recalls in this workspace', icon: 'lightbulb' },
  { id: 'agents', label: 'Agents', hint: 'Roles a conversation can delegate to; spawn them from the workbench', icon: 'gitBranch' },
  { id: 'mcp', label: 'MCP', hint: 'Tool servers over stdio or HTTP', icon: 'terminal' },
  { id: 'hooks', label: 'Hooks', hint: 'Commands that run around tool calls and sessions', icon: 'wrench' },
  { id: 'secrets', label: 'Secrets', hint: 'Encrypted credentials for MCP servers', icon: 'key' },
]

/** Nav groups: global settings first, then the active workspace's. */
const TAB_GROUPS: readonly { readonly label: string; readonly ids: readonly SettingsTab[] }[] = [
  { label: 'Global', ids: ['providers'] },
  { label: 'Workspace', ids: ['projects', 'skills', 'memory', 'agents', 'mcp', 'hooks', 'secrets'] },
]

interface Draft {
  readonly name: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly enabled: boolean
  readonly models: readonly string[]
  readonly defaultModel: string
  /** Working copy of the per-model overrides (context window, vision, thinking). */
  readonly modelSettings: Record<string, ModelSettings>
}

type Busy = 'save' | 'sync' | 'test' | 'delete' | 'activate' | null

const BLANK: Draft = { name: '', baseUrl: '', apiKey: '', enabled: true, models: [], defaultModel: '', modelSettings: {} }

function draftOf(provider: ProviderSummary): Draft {
  return {
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: '',
    enabled: provider.enabled,
    models: provider.models,
    defaultModel: provider.defaultModel ?? provider.models[0] ?? '',
    modelSettings: Object.fromEntries(Object.entries(provider.modelSettings ?? {}).map(([model, settings]) => [model, { ...settings }])),
  }
}

/** Entries only for models still on the list, and only fields actually set. */
function pruneSettings(models: readonly string[], settings: Record<string, ModelSettings>): Record<string, ModelSettings> {
  const pruned: Record<string, ModelSettings> = {}
  for (const model of models) {
    const entry = settings[model]
    if (entry === undefined) continue
    const clean: ModelSettings = {
      ...(entry.contextTokens !== undefined && entry.contextTokens > 0 ? { contextTokens: entry.contextTokens } : {}),
      ...(entry.vision !== undefined ? { vision: entry.vision } : {}),
      ...(entry.thinkingLevel !== undefined && entry.thinkingLevel in THINKING_LABELS ? { thinkingLevel: entry.thinkingLevel } : {}),
    }
    if (Object.keys(clean).length > 0) pruned[model] = clean
  }
  return pruned
}

/** Accept a pasted list too: one per line, comma, or whitespace separated. */
function parseModels(raw: string): readonly string[] {
  return [...new Set(raw.split(/[\n,\s]+/).map((name) => name.trim()).filter((name) => name !== ''))]
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * Provider settings: left rail selects, right pane edits one OpenAI-completions
 * endpoint. The key field starts blank on an existing provider so submitting it
 * untouched retains the stored secret — only `keyMasked` ever reaches this
 * component, never the raw key.
 */
export function SettingsModal({
  open,
  providers,
  activeProvider,
  activeModel,
  onDismiss,
  onRefresh,
  onSelectActive,
  workspaceId,
  initialTab = 'providers', workspaceName, projects = [], onProjectsChanged = async () => {}, sessionCounts = {},
}: {
  readonly initialTab?: SettingsTab
  readonly workspaceName?: string | undefined
  readonly projects?: readonly ProjectRow[]
  readonly onProjectsChanged?: () => Promise<void>
  readonly sessionCounts?: Readonly<Record<string, number>>
  readonly open: boolean
  readonly workspaceId: string | null
  readonly providers: readonly ProviderSummary[]
  readonly activeProvider: string
  readonly activeModel?: string
  readonly onDismiss: () => void
  readonly onRefresh: () => Promise<void>
  readonly onSelectActive: (provider: string, model: string) => Promise<void>
}) {
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null)
  const [tab, setTab] = useState<SettingsTab>('providers')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(BLANK)
  const [busy, setBusy] = useState<Busy>(null)
  const [notice, setNotice] = useState<{ readonly kind: 'ok' | 'bad'; readonly text: string } | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [modelDraft, setModelDraft] = useState('')
  /** The model whose inline capabilities editor is open. */
  const [tunedModel, setTunedModel] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)

  const selected = useMemo(
    () => providers.find((provider) => provider.id === selectedId),
    [providers, selectedId],
  )
  const isNew = selectedId === null

  /** Whether this open has picked a provider to show; false while the list is still empty. */
  const seeded = useRef(false)
  useEffect(() => {
    if (!open) return
    const first = providers.find((provider) => provider.id === activeProvider) ?? providers[0]
    seeded.current = first !== undefined
    setTab(initialTab)
    setSelectedId(first?.id ?? null)
    setDraft(first === undefined ? BLANK : draftOf(first))
    setNotice(null)
    setShowKey(false)
    setConfirmDelete(false)
    setModelDraft('')
    setTunedModel(null)
  }, [open]) // Seed once per open so a background refresh never discards edits.

  // Settings opened before providers loaded: show the real provider once the
  // list arrives, unless the user already started typing a new one.
  useEffect(() => {
    if (!open || seeded.current || providers.length === 0) return
    seeded.current = true
    if (selectedId !== null || JSON.stringify(draft) !== JSON.stringify(BLANK) || modelDraft !== '') return
    const first = providers.find((provider) => provider.id === activeProvider) ?? providers[0]
    if (first === undefined) return
    setSelectedId(first.id)
    setDraft(draftOf(first))
  }, [providers])

  // Opening Settings at another tab while it is already open still switches.
  useEffect(() => { if (open) setTab(initialTab) }, [initialTab])

  const dirty = useMemo(() => {
    if (selected === undefined) return JSON.stringify(draft) !== JSON.stringify(BLANK)
    const base = draftOf(selected)
    return (
      draft.name !== base.name ||
      draft.baseUrl !== base.baseUrl ||
      draft.apiKey !== '' ||
      draft.enabled !== base.enabled ||
      draft.defaultModel !== base.defaultModel ||
      !sameList(draft.models, base.models) ||
      JSON.stringify(pruneSettings(draft.models, draft.modelSettings)) !== JSON.stringify(pruneSettings(base.models, base.modelSettings))
    )
  }, [draft, selected])

  const leave = (action: () => void) => {
    if (busy !== null) return
    if (dirty || modelDraft.trim() !== '') setPendingLeave(() => action)
    else action()
  }
  const dismiss = () => leave(onDismiss)
  const discardDraft = (): void => {
    setDraft(selected === undefined ? BLANK : draftOf(selected))
    setModelDraft('')
    setNotice(null)
  }
  if (!open) return null

  const patch = (next: Partial<Draft>): void => {
    setDraft((current) => ({ ...current, ...next }))
    setNotice(null)
  }

  const select = (provider: ProviderSummary): void => {
    setSelectedId(provider.id)
    setDraft(draftOf(provider))
    setNotice(null)
    setShowKey(false)
    setConfirmDelete(false)
    setModelDraft('')
    setTunedModel(null)
  }

  const beginNew = (): void => {
    setSelectedId(null)
    setDraft(BLANK)
    setNotice(null)
    setShowKey(false)
    setConfirmDelete(false)
    setModelDraft('')
    setTunedModel(null)
    nameRef.current?.focus()
  }

  const urlLooksWrong = draft.baseUrl !== '' && !/^https?:\/\//.test(draft.baseUrl.trim())

  const run = async (kind: Busy, action: () => Promise<void>): Promise<void> => {
    setBusy(kind)
    try {
      await action()
    } catch (cause) {
      setNotice({ kind: 'bad', text: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setBusy(null)
    }
  }

  const save = (): Promise<void> =>
    run('save', async () => {
      const name = draft.name.trim()
      const baseUrl = draft.baseUrl.trim()
      if (name === '' || baseUrl === '') {
        setNotice({ kind: 'bad', text: 'Name and Base URL are required.' })
        return
      }
      if (urlLooksWrong) {
        setNotice({ kind: 'bad', text: 'Base URL must start with http:// or https://' })
        return
      }
      const shared = {
        name,
        baseUrl,
        enabled: draft.enabled,
        models: draft.models,
        ...(draft.defaultModel !== '' ? { defaultModel: draft.defaultModel } : {}),
        // Always sent (even empty): the patch REPLACES the whole map, so an
        // empty object is how cleared overrides reach the server.
        modelSettings: pruneSettings(draft.models, draft.modelSettings),
      }
      const saved = isNew
        ? await createProvider({ ...shared, apiKey: draft.apiKey.trim() })
        : await updateProvider(selectedId, {
            ...shared,
            ...(draft.apiKey.trim() !== '' ? { apiKey: draft.apiKey.trim() } : {}),
          })
      await onRefresh()
      setSelectedId(saved.id)
      setDraft(draftOf(saved))
      setShowKey(false)
      setNotice({ kind: 'ok', text: `Saved “${saved.name}”.` })
    })

  const sync = (): Promise<void> =>
    run('sync', async () => {
      if (selectedId === null) return
      const result = await syncProvider(selectedId)
      await onRefresh()
      setDraft((current) => ({
        ...current,
        models: result.models,
        defaultModel: result.models.includes(current.defaultModel)
          ? current.defaultModel
          : (result.models[0] ?? ''),
      }))
      setNotice({
        kind: result.models.length > 0 ? 'ok' : 'bad',
        text: result.models.length > 0
          ? `Synced ${result.models.length} models from /models.`
          : 'The endpoint returned no models. Add model IDs below.',
      })
    })

  const test = (): Promise<void> =>
    run('test', async () => {
      if (selectedId === null) return
      const result = await testProvider(selectedId)
      setNotice(result.ok
        ? { kind: 'ok', text: 'Connection verified. The endpoint returned a completion.' }
        : { kind: 'bad', text: result.error ?? 'Connection failed.' })
    })

  const remove = (): Promise<void> =>
    run('delete', async () => {
      if (selectedId === null) return
      await deleteProvider(selectedId)
      await onRefresh()
      setConfirmDelete(false)
      const remaining = providers.filter((provider) => provider.id !== selectedId)
      const next = remaining[0]
      if (next === undefined) beginNew()
      else select(next)
      setNotice({ kind: 'ok', text: 'Provider deleted.' })
    })

  /**
   * Why a model cannot become the global default yet, or null when it can.
   * The server only accepts saved models of enabled providers.
   */
  const globalDefaultBlocker = (model: string): string | null =>
    selected === undefined ? 'Add the provider first.'
      : !selected.enabled ? 'Enable and save this provider first.'
        : !selected.models.includes(model) ? 'Save this model to the provider first.'
          : dirty ? 'Save or discard your changes first.'
            : null

  const useForChat = (model: string): Promise<void> =>
    run('activate', async () => {
      if (selected === undefined || globalDefaultBlocker(model) !== null) return
      await onSelectActive(selected.id, model)
      setNotice({ kind: 'ok', text: `Global default is now ${selected.name} / ${model}.` })
    })

  const addModels = (): void => {
    const parsed = parseModels(modelDraft)
    if (parsed.length === 0) return
    const merged = [...new Set([...draft.models, ...parsed])]
    patch({ models: merged, defaultModel: draft.defaultModel === '' ? (parsed[0] ?? '') : draft.defaultModel })
    setModelDraft('')
  }

  const dropModel = (name: string): void => {
    const models = draft.models.filter((model) => model !== name)
    const { [name]: _dropped, ...modelSettings } = draft.modelSettings
    void _dropped
    if (tunedModel === name) setTunedModel(null)
    patch({ models, modelSettings, defaultModel: draft.defaultModel === name ? (models[0] ?? '') : draft.defaultModel })
  }

  /** Merge one override field into one model's settings. */
  const setModelSetting = (model: string, next: { readonly contextTokens: number } | { readonly vision: boolean } | { readonly thinkingLevel: string }): void => {
    const modelSettings = { ...draft.modelSettings, [model]: { ...draft.modelSettings[model], ...next } }
    setDraft((current) => ({ ...current, modelSettings }))
    setNotice(null)
  }

  /** Remove one override field; the model falls back to its catalog value. */
  const clearModelSetting = (model: string, field: 'contextTokens' | 'vision' | 'thinkingLevel'): void => {
    const current = draft.modelSettings[model]
    if (current === undefined || !(field in current)) return
    const { [field]: _dropped, ...rest } = current
    void _dropped
    const modelSettings = { ...draft.modelSettings }
    if (Object.keys(rest).length > 0) modelSettings[model] = rest
    else delete modelSettings[model]
    setDraft((state) => ({ ...state, modelSettings }))
    setNotice(null)
  }

  const activeTab = TABS.find((entry) => entry.id === tab)
  const tabTrigger = 'flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-link disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-hover data-[state=active]:font-medium data-[state=active]:text-fg'
  const testBlocker = isNew ? 'Add the provider first.' : dirty ? 'Save your changes first — the test uses the saved configuration.' : null

  return (
    <><Modal open={open} onDismiss={dismiss} label="Settings" width="xl" bodyClassName="flex p-0 overflow-hidden">
      <Tabs.Root className="flex min-h-0 min-w-0 flex-1 flex-col sm:flex-row" value={tab} orientation="vertical" onValueChange={(value) => leave(() => setTab(value as SettingsTab))}>
        <aside className="flex shrink-0 flex-col border-line bg-sidebar max-sm:border-b sm:w-56 sm:border-r">
          <div className="hidden h-14 items-center px-5 sm:flex"><span className="text-[15px] font-semibold">Settings</span></div>
          <div className="px-4 py-3 sm:hidden">
            <span className="sr-only">Settings section</span>
            <RadixSelect.Root value={tab} onValueChange={(value) => leave(() => setTab(value as SettingsTab))}>
              <RadixSelect.Trigger className="flex h-10 w-full items-center justify-between rounded-lg border border-line bg-bg px-3 text-sm" aria-label="Settings section">
                <RadixSelect.Value />
                <RadixSelect.Icon aria-hidden="true"><Icon name="chevron" size={15} /></RadixSelect.Icon>
              </RadixSelect.Trigger>
              <RadixSelect.Portal>
                <RadixSelect.Content className="z-50 max-h-[min(70vh,30rem)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-line bg-surface p-1.5 text-fg shadow-pop" position="popper" sideOffset={6} collisionPadding={8}>
                  <RadixSelect.Viewport>
                    {TAB_GROUPS.map((group) => (
                      <RadixSelect.Group key={group.label}>
                        <RadixSelect.Label className="px-2.5 pb-1 pt-2 text-xs font-medium text-fg-faint">{group.label}</RadixSelect.Label>
                        {group.ids.map((id) => {
                          const entry = TABS.find((item) => item.id === id)
                          return entry === undefined ? null : (
                            <RadixSelect.Item key={entry.id} value={entry.id} className="relative flex min-h-10 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none data-[highlighted]:bg-hover">
                              <Icon name={entry.icon} size={16} className="shrink-0 text-fg-muted" aria-hidden="true" />
                              <span className="flex-1"><RadixSelect.ItemText>{entry.label}</RadixSelect.ItemText></span>
                              <RadixSelect.ItemIndicator><Icon name="check" size={14} /></RadixSelect.ItemIndicator>
                            </RadixSelect.Item>
                          )
                        })}
                      </RadixSelect.Group>
                    ))}
                  </RadixSelect.Viewport>
                </RadixSelect.Content>
              </RadixSelect.Portal>
            </RadixSelect.Root>
          </div>
          <Tabs.List className="hidden min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-4 sm:flex" aria-label="Settings sections">
            {TAB_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-col gap-0.5">
                <div className="px-3 pb-1 text-xs font-medium text-fg-faint">{group.label}</div>
                {group.ids.map((id) => {
                  const entry = TABS.find((item) => item.id === id)
                  return entry === undefined ? null : (
                    <Tabs.Trigger key={entry.id} value={entry.id} className={tabTrigger} disabled={busy !== null && entry.id !== tab}>
                      <Icon name={entry.icon} size={16} className="shrink-0" aria-hidden="true" />
                      <span className="truncate">{entry.label}</span>
                    </Tabs.Trigger>
                  )
                })}
              </div>
            ))}
          </Tabs.List>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-2">
            <div className="flex min-w-0 flex-col">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="m-0 text-base font-semibold">{activeTab?.label ?? 'Settings'}</h2>
                {tab === 'providers'
                  ? <Badge>All workspaces</Badge>
                  : <Badge tone="blue" title="These settings apply only to this workspace.">Workspace: {workspaceName ?? workspaceId ?? 'none'}</Badge>}
              </div>
              <span className="truncate text-[13px] text-fg-faint">{activeTab?.hint ?? ''}</span>
            </div>
            <IconButton label="Close settings" size="md" disabled={busy !== null} onClick={dismiss}><Icon name="close" size={18} /></IconButton>
          </header>

          <Tabs.Content key={tab} value={tab} tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-5 outline-none">

            {tab !== 'providers' ? (
              <>
                {tab === 'projects' ? <ProjectsPanel workspaceId={workspaceId} projects={projects} onChanged={onProjectsChanged} sessionCounts={sessionCounts} /> : null}
                {tab === 'skills' ? <SkillsPanel workspaceId={workspaceId} /> : null}
                {tab === 'memory' ? <MemoryPanel workspaceId={workspaceId} /> : null}
                {tab === 'agents' ? <AgentsPanel workspaceId={workspaceId} /> : null}
                {tab === 'mcp' ? <McpPanel workspaceId={workspaceId} /> : null}
                {tab === 'hooks' ? <HooksPanel workspaceId={workspaceId} /> : null}
                {tab === 'secrets' ? <SecretsPanel workspaceId={workspaceId} /> : null}
              </>
            ) : (
              <div className="grid min-w-0 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
                <aside className="flex min-w-0 flex-col gap-1">
                  <span className="flex h-8 items-center gap-2 px-1 text-xs font-medium text-fg-faint">Providers<Badge>{providers.length}</Badge></span>
                  <div className="flex flex-col gap-px" role="listbox" aria-label="Providers">
                    {providers.map((provider) => {
                      const isSelected = provider.id === selectedId
                      return (
                        <button
                          key={provider.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => { if (!isSelected) leave(() => select(provider)) }}
                          className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-hover ${isSelected ? 'bg-hover' : ''}`}
                        >
                          <span className={`size-2 shrink-0 rounded-full ${provider.enabled ? 'bg-ok' : 'bg-line-strong'}`} aria-hidden="true" />
                          <span className="sr-only">{provider.enabled ? 'Enabled' : 'Disabled'}</span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm">{provider.name}</span>
                            <span className="text-xs text-fg-faint">{provider.models.length > 0 ? `${provider.models.length} models` : 'No models'}</span>
                          </span>
                          {provider.id === activeProvider ? <Badge tone="green" title="Provides the default model for new conversations">default</Badge> : null}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      role="option"
                      aria-selected={isNew}
                      onClick={() => leave(beginNew)}
                      className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-fg-muted hover:bg-hover hover:text-fg ${isNew ? 'bg-hover text-fg' : ''}`}
                    >
                      <Icon name="plus" size={15} />Add provider
                    </button>
                  </div>
                </aside>

                <div className="flex min-w-0 flex-col gap-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="m-0 mr-1 text-lg font-semibold">{isNew ? 'Add provider' : selected?.name}</h3>
                    {dirty ? <Badge tone="amber">Unsaved</Badge> : null}
                    {!isNew && selected?.enabled === false ? <Badge>disabled</Badge> : null}
                    {selected?.id === activeProvider ? <Badge tone="green">Global default</Badge> : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Name" hint={isNew ? 'Shown in the model picker. The provider ID is derived from it.' : 'Shown in the model picker.'}>
                      <TextInput ref={nameRef} value={draft.name} placeholder="cliproxy1" onChange={(event) => patch({ name: event.target.value })} />
                    </Field>
                    <Field label="Base URL" tone={urlLooksWrong ? 'bad' : 'default'} hint={urlLooksWrong ? 'Enter an HTTP or HTTPS URL.' : 'Base endpoint for /chat/completions and /models.'}>
                      <TextInput mono invalid={urlLooksWrong} value={draft.baseUrl} placeholder="https://api.openai.com/v1" leading={<Icon name="globe" size={15} />} onChange={(event) => patch({ baseUrl: event.target.value })} />
                    </Field>
                    <Field
                      label="API key"
                      hint={isNew
                        ? 'Optional for keyless endpoints. Stored on the server and never returned to the browser.'
                        : selected?.keyMasked === ''
                          ? 'This provider has no stored key.'
                          : `Stored ${selected?.keyMasked ?? ''} · leave blank to keep the current key.`}
                    >
                      <TextInput
                        mono
                        type={showKey ? 'text' : 'password'}
                        value={draft.apiKey}
                        autoComplete="off"
                        placeholder={isNew ? 'sk-…' : 'Keep current key'}
                        leading={<Icon name="key" size={15} />}
                        trailing={<IconButton label={showKey ? 'Hide key' : 'Show key'} onClick={() => setShowKey((prev) => !prev)}><Icon name={showKey ? 'eyeOff' : 'eye'} size={15} /></IconButton>}
                        onChange={(event) => patch({ apiKey: event.target.value })}
                      />
                    </Field>
                    <div className="flex items-center rounded-xl border border-line px-3.5 py-2.5">
                      <div className="flex-1"><Switch checked={draft.enabled} label="Enabled" hint="Disabled providers do not appear in the workspace model picker." onChange={(next) => patch({ enabled: next })} /></div>
                    </div>
                  </div>

                  <section className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold">Models<Badge>{draft.models.length}</Badge></span>
                      <Button variant="outline" size="sm" disabled={isNew || busy !== null} onClick={() => void sync()}>
                        <Icon name="refresh" size={14} />{busy === 'sync' ? 'Syncing…' : 'Sync from /models'}
                      </Button>
                    </div>

                    {draft.models.length === 0 ? (
                      <p className="m-0 flex items-center gap-2 rounded-xl border border-dashed border-line px-3.5 py-3 text-[13px] text-fg-muted">
                        <Icon name="info" size={15} />No models yet. Sync from the endpoint or add model IDs below.
                      </p>
                    ) : (
                      <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-xl border border-line p-0">
                        {draft.models.map((model) => {
                          const isDefault = model === draft.defaultModel
                          const isLive = selected?.id === activeProvider && model === activeModel
                          const settings = draft.modelSettings[model]
                          const context = modelContext(model, settings)
                          const badges = capabilityBadges(model, settings)
                          const capability = getReasoningCapability(model)
                          const tuning = tunedModel === model
                          const visionValue = settings?.vision === undefined ? 'auto' : settings.vision ? 'yes' : 'no'
                          return (
                            <li key={model} className="flex flex-col">
                              <div className="group flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
                                <button
                                  type="button"
                                  aria-pressed={isDefault}
                                  aria-label={isDefault ? `${model} is this provider's default model` : `Make ${model} this provider's default model`}
                                  title={isDefault ? "This provider's default model" : "Make this the provider's default model"}
                                  onClick={() => patch({ defaultModel: model })}
                                  className={`flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-hover ${isDefault ? 'text-fg' : 'text-fg-faint'}`}
                                >
                                  <Icon name={isDefault ? 'circleDot' : 'circle'} size={15} />
                                </button>
                                <code className="min-w-0 break-all text-[13px]">{model}</code>
                                {badges.map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}
                                <span
                                  className={`text-xs ${context.overridden ? 'text-fg' : 'text-fg-faint'}`}
                                  title={context.overridden
                                    ? `Custom context window: ${context.tokens.toLocaleString()} tokens`
                                    : `Catalog context window: ${context.tokens.toLocaleString()} tokens (leave the override empty to use it)`}
                                >
                                  {context.label}{context.overridden ? ' · custom' : ''}
                                </span>
                                {isDefault ? <Badge tone="blue">provider default</Badge> : null}
                                {isLive ? <Badge tone="green" title="Used for new conversations">global default</Badge> : null}
                                <span className="ml-auto flex items-center gap-0.5">
                                  {!isLive ? (
                                    // Revealed on row hover/focus where hover exists; always shown on touch.
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
                                      disabled={busy !== null || globalDefaultBlocker(model) !== null}
                                      title={globalDefaultBlocker(model) ?? 'Use this model for new conversations'}
                                      onClick={() => void useForChat(model)}
                                    >
                                      {busy === 'activate' ? 'Setting…' : 'Set as global default'}
                                    </Button>
                                  ) : null}
                                  <IconButton
                                    label={tuning ? `Hide ${model} settings` : `Configure ${model} (context, vision, thinking)`}
                                    aria-expanded={tuning}
                                    className={tuning ? 'bg-hover text-fg' : ''}
                                    onClick={() => setTunedModel(tuning ? null : model)}
                                  >
                                    <Icon name="sliders" size={15} />
                                  </IconButton>
                                  <IconButton label={`Remove model ${model}`} onClick={() => dropModel(model)}><Icon name="trash" size={15} /></IconButton>
                                </span>
                              </div>
                              {tuning ? (
                                <div className="grid gap-3 border-t border-line bg-muted/60 p-3 md:grid-cols-3">
                                  <Field label="Context window (tokens)" hint={`Leave empty for the catalog default (${context.tokens.toLocaleString()}). An explicit value is treated as operator-verified.`}>
                                    <TextInput
                                      mono
                                      inputMode="numeric"
                                      value={settings?.contextTokens === undefined ? '' : String(settings.contextTokens)}
                                      placeholder={context.tokens.toLocaleString()}
                                      onChange={(event) => {
                                        const raw = event.target.value.trim().replace(/[\s,_.]/g, '')
                                        if (raw === '') { clearModelSetting(model, 'contextTokens'); return }
                                        if (!/^\d+$/.test(raw)) return
                                        const parsed = Number.parseInt(raw, 10)
                                        if (Number.isFinite(parsed) && parsed > 0) setModelSetting(model, { contextTokens: parsed })
                                      }}
                                    />
                                  </Field>
                                  <Field label="Vision" hint="Override only when the catalog value is wrong or unknown for this endpoint.">
                                    <Select
                                      label={`Vision capability for ${model}`}
                                      value={visionValue}
                                      options={[
                                        { value: 'auto', label: `Auto (catalog: ${getModelInfo(model)?.vision === true ? 'yes' : getModelInfo(model)?.vision === false ? 'no' : 'unknown'})` },
                                        { value: 'yes', label: 'Yes — accepts images' },
                                        { value: 'no', label: 'No — text only' },
                                      ]}
                                      onChange={(value) => {
                                        if (value === 'auto') clearModelSetting(model, 'vision')
                                        else if (value === 'yes') setModelSetting(model, { vision: true })
                                        else setModelSetting(model, { vision: false })
                                      }}
                                    />
                                  </Field>
                                  {capability !== null ? (
                                    <Field label="Thinking default" hint="Used when the workspace has no live thinking override.">
                                      <Select
                                        label={`Default thinking level for ${model}`}
                                        value={settings?.thinkingLevel ?? ''}
                                        options={[
                                          { value: '', label: 'Model default' },
                                          ...(capability.canDisable ? [{ value: 'off', label: 'Off' }] : []),
                                          ...capability.levels.map((level) => ({ value: level as string, label: THINKING_LABELS[level] })),
                                        ]}
                                        onChange={(value) => {
                                          if (value === '') clearModelSetting(model, 'thinkingLevel')
                                          else setModelSetting(model, { thinkingLevel: value })
                                        }}
                                      />
                                    </Field>
                                  ) : null}
                                </div>
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                    )}

                    <div className="flex gap-2">
                      <TextInput
                        mono
                        className="flex-1"
                        aria-label="Model IDs to add"
                        value={modelDraft}
                        placeholder="gpt-5.6-sol, gpt-5.6-terra"
                        onChange={(event) => setModelDraft(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addModels() } }}
                      />
                      <Button variant="outline" disabled={modelDraft.trim() === ''} onClick={addModels}><Icon name="plus" size={15} />Add</Button>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </Tabs.Content>

          {tab === 'providers' && notice !== null ? (
            // Outside the scrolling pane, so a save or test result is always in view.
            <div className="shrink-0 border-t border-line px-5 pt-3">
              {notice.kind === 'bad'
                ? <ErrorNotice raw={notice.text} />
                : <p className="m-0 flex items-center gap-2 rounded-lg bg-ok-soft px-3 py-2 text-[13px] text-ok" role="status"><Icon name="check" size={15} />{notice.text}</p>}
            </div>
          ) : null}
          {tab === 'providers' ? (
            <footer className={`flex shrink-0 flex-wrap items-center justify-between gap-2 px-5 py-3 ${notice === null ? 'border-t border-line' : ''}`}>
              <span className="flex flex-wrap items-center gap-2">
                {isNew ? null : confirmDelete ? (
                  <>
                    <span className="text-[13px]">Delete “{selected?.name}”?</span>
                    <Button variant="outline-danger" size="sm" disabled={busy !== null} onClick={() => void remove()}>{busy === 'delete' ? 'Deleting…' : 'Delete permanently'}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" className="text-bad" disabled={busy !== null} onClick={() => setConfirmDelete(true)}><Icon name="trash" size={14} />Delete provider</Button>
                )}
              </span>
              <span className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={testBlocker !== null || busy !== null} title={testBlocker ?? 'Send a short completion with the saved configuration'} onClick={() => void test()}>{busy === 'test' ? 'Testing…' : 'Test connection'}</Button>
                <Button variant="primary" size="sm" disabled={busy !== null || !dirty} onClick={() => void save()}>{busy === 'save' ? 'Saving…' : isNew ? 'Add provider' : 'Save changes'}</Button>
              </span>
            </footer>
          ) : null}
        </div>
      </Tabs.Root>
    </Modal>
    <ConfirmDialog
      open={pendingLeave !== null}
      title="Discard unsaved provider changes?"
      confirmLabel="Discard changes"
      onDismiss={() => setPendingLeave(null)}
      onConfirm={() => { const action = pendingLeave; setPendingLeave(null); discardDraft(); action?.() }}
    />
    </>
  )
}
