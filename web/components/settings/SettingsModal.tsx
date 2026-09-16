import * as RadixSelect from '@radix-ui/react-select'
import * as Tabs from '@radix-ui/react-tabs'
import { ProjectsPanel } from './ProjectsPanel.tsx'
import { ErrorNotice } from '../common/ErrorNotice.tsx'
import ConfirmDialog from '../common/ConfirmDialog.tsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../common/Icon.tsx'
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

const TABS: readonly { readonly id: SettingsTab; readonly label: string; readonly hint: string }[] = [
  { id: 'providers', label: 'Providers', hint: 'Endpoints and models' },
  { id: 'projects', label: 'Projects', hint: 'Registered workspace folders' },
  { id: 'skills', label: 'Skills', hint: 'Workspace SKILL.md packages' },
  { id: 'memory', label: 'Memory', hint: 'Scoped memory entries' },
  { id: 'agents', label: 'Agents', hint: 'Definitions and child agents' },
  { id: 'mcp', label: 'MCP', hint: 'Server stdio/HTTP' },
  { id: 'hooks', label: 'Hooks', hint: 'Pre/Post/UserPrompt' },
  { id: 'secrets', label: 'Secrets', hint: 'Encrypted credentials' },
]

/** Spec: nav groups Global / Workspace (11px caps heads). */
const TAB_GROUPS: readonly { readonly label: string; readonly ids: readonly SettingsTab[] }[] = [
  { label: 'GLOBAL', ids: ['providers'] },
  { label: 'WORKSPACE', ids: ['projects', 'skills', 'memory', 'agents', 'mcp', 'hooks', 'secrets'] },
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
  rootSessionId,
  initialTab = 'providers', workspaceName, projects = [], onProjectsChanged = async () => {}, onOpenChild, sessionCounts = {},
}: {
  readonly initialTab?: SettingsTab
  readonly workspaceName?: string | undefined
  readonly projects?: readonly ProjectRow[]
  readonly onProjectsChanged?: () => Promise<void>
  readonly onOpenChild?: (childSessionId: string) => void
  readonly sessionCounts?: Readonly<Record<string, number>>
  readonly open: boolean
  readonly workspaceId: string | null
  readonly rootSessionId?: string | null
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

  useEffect(() => {
    if (!open) return
    const first = providers.find((provider) => provider.id === activeProvider) ?? providers[0]
    setTab(initialTab)
    setSelectedId(first?.id ?? null)
    setDraft(first === undefined ? BLANK : draftOf(first))
    setNotice(null)
    setShowKey(false)
    setConfirmDelete(false)
    setModelDraft('')
    setTunedModel(null)
  }, [open]) // Seed once per open so a background refresh never discards edits.

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

  const useForChat = (model: string): Promise<void> =>
    run('activate', async () => {
      if (selected === undefined) return
      await onSelectActive(selected.id, model)
      setNotice({ kind: 'ok', text: `Workspace now uses ${selected.name} / ${model}.` })
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

  const header = (
    <>
      <span className="settings-title">
        <span className="settings-kicker">SETTINGS</span>
        <strong>{TABS.find((entry) => entry.id === tab)?.label ?? 'Settings'}</strong>
        <small>{TABS.find((entry) => entry.id === tab)?.hint ?? ''}</small>
      </span>
      <IconButton label="Close settings" size="md" onClick={dismiss}>
        <Icon name="close" size={15} />
      </IconButton>
    </>
  )

  return (
    <><Modal open={open} onDismiss={dismiss} label="Settings" className="settings-modal h-dvh w-screen max-w-none rounded-none border-0 bg-surface-raised text-ink" header={header}>
      <Tabs.Root className="settings-tabs-root min-h-0" value={tab} orientation="vertical" onValueChange={(value) => leave(() => setTab(value as SettingsTab))}>
        <div className="settings-mobile-navigation border-b border-border bg-surface px-4 py-3">
          <span className="settings-mobile-label">Settings section</span>
          <RadixSelect.Root value={tab} onValueChange={(value) => leave(() => setTab(value as SettingsTab))}>
            <RadixSelect.Trigger className="settings-mobile-trigger flex min-h-11 w-full items-center justify-between rounded-control border border-border-strong bg-surface-raised px-3 text-sm text-ink" aria-label="Settings section">
              <RadixSelect.Value />
              <RadixSelect.Icon aria-hidden="true"><Icon name="chevron" size={13} /></RadixSelect.Icon>
            </RadixSelect.Trigger>
            <RadixSelect.Portal>
              <RadixSelect.Content className="settings-mobile-content z-50 max-h-[min(70vh,30rem)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-control border border-border bg-surface-raised shadow-raised" position="popper" sideOffset={6} collisionPadding={8}>
                <RadixSelect.ScrollUpButton className="settings-select-scroll"><Icon name="chevron" size={12} /></RadixSelect.ScrollUpButton>
                <RadixSelect.Viewport className="settings-mobile-viewport">
                  {TAB_GROUPS.map(group => (
                    <RadixSelect.Group key={group.label}>
                      <RadixSelect.Label className="settings-select-label">{group.label}</RadixSelect.Label>
                      {group.ids.map(id => {
                        const entry = TABS.find(item => item.id === id)
                        return entry === undefined ? null : (
                          <RadixSelect.Item key={entry.id} value={entry.id} className="settings-select-item relative flex min-h-10 cursor-default select-none items-center rounded-md px-3 pr-9 text-sm outline-none data-[highlighted]:bg-surface-muted data-[state=checked]:text-accent">
                            <RadixSelect.ItemText>{entry.label}</RadixSelect.ItemText>
                            <RadixSelect.ItemIndicator><Icon name="check" size={12} /></RadixSelect.ItemIndicator>
                          </RadixSelect.Item>
                        )
                      })}
                    </RadixSelect.Group>
                  ))}
                </RadixSelect.Viewport>
                <RadixSelect.ScrollDownButton className="settings-select-scroll"><Icon name="chevron" size={12} /></RadixSelect.ScrollDownButton>
              </RadixSelect.Content>
            </RadixSelect.Portal>
          </RadixSelect.Root>
        </div>
        <Tabs.List className="settings-tabs border-r border-border bg-surface px-3 py-6" aria-label="Settings sections">
          {TAB_GROUPS.map(group => (
            <div key={group.label} className="settings-nav-group">
              <div className="settings-nav-group-head">{group.label}</div>
              {group.ids.map((id) => {
                const entry = TABS.find(item => item.id === id)
                return entry === undefined ? null : (
                  <Tabs.Trigger key={entry.id} value={entry.id} className="settings-tab rounded-control px-3 py-2.5 text-left text-sm text-ink-muted outline-none transition-colors hover:bg-surface-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-accent data-[state=active]:bg-accent-soft data-[state=active]:text-accent">
                    <span>{entry.label}</span>
                    <small>{entry.hint}</small>
                  </Tabs.Trigger>
                )
              })}
            </div>
          ))}
        </Tabs.List>

        <Tabs.Content key={tab} value={tab} className="settings-tab-panel min-h-0 min-w-0 overflow-y-auto px-6 py-6 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent" tabIndex={0}>
      <section className="settings-scope" aria-label="Settings scope">
        <h2>{TABS.find(entry => entry.id === tab)?.label}</h2>
        <p className="scope-caption">{tab === 'providers' ? 'Global provider configuration' : 'Workspace configuration and services'}<br /><span>Workspace: {workspaceName ?? workspaceId ?? 'Not selected'}</span></p>
        <details className="settings-scope-details"><summary>Scope and runtime details</summary>
          <p>{tab === 'providers' ? 'Endpoints, keys, and model lists are stored globally. Activation changes only this workspace. Saving does not verify connectivity. Test connection uses saved configuration, not the draft.' : 'Changes apply only to this workspace. Live service state is separate from saved configuration.'}</p>
          {tab === 'providers' ? <p>Active workspace model: <code>{activeProvider || 'Not selected'} / {activeModel || 'Not selected'}</code></p> : null}
          {tab === 'agents' ? <p>Agent definitions belong to the workspace. Child agents belong only to the current conversation.</p> : null}
        </details>
      </section>
      {tab !== 'providers' ? (
        <div className="settings-panel-body">
          {tab === 'projects' ? <ProjectsPanel workspaceId={workspaceId} projects={projects} onChanged={onProjectsChanged} sessionCounts={sessionCounts} /> : null}
          {tab === 'skills' ? <SkillsPanel workspaceId={workspaceId} /> : null}
          {tab === 'memory' ? <MemoryPanel workspaceId={workspaceId} /> : null}
          {tab === 'agents' ? <AgentsPanel workspaceId={workspaceId} rootSessionId={rootSessionId ?? null} {...(onOpenChild !== undefined ? { onOpenChild } : {})} /> : null}
          {tab === 'mcp' ? <McpPanel workspaceId={workspaceId} /> : null}
          {tab === 'hooks' ? <HooksPanel workspaceId={workspaceId} /> : null}
          {tab === 'secrets' ? <SecretsPanel workspaceId={workspaceId} /> : null}
        </div>
      ) : (
      <div className="settings-body">
        <aside className="provider-rail">
          <div className="provider-rail-head">
            <span>PROVIDERS<Badge tone="gray">{providers.length}</Badge></span>
            <IconButton label="Add provider" onClick={() => leave(beginNew)}><Icon name="plus" size={13} /></IconButton>
          </div>

          <div className="provider-rail-list">
            {providers.map((provider) => {
              const isActive = provider.id === activeProvider
              return (
                <button
                  key={provider.id}
                  type="button"
                  className={`provider-row ${provider.id === selectedId ? 'is-selected' : ''}`}
                  onClick={() => { if (provider.id !== selectedId) leave(() => select(provider)) }}
                >
                  <span className={`provider-status ${provider.enabled ? 'is-on' : ''}`} aria-hidden="true" />
                  <span className="provider-row-text">
                    <span className="provider-row-name">{provider.name}</span>
                    <span className="provider-row-sub">
                      {provider.models.length > 0 ? `${provider.models.length} models` : 'No models'}
                    </span>
                  </span>
                  {isActive ? <Badge tone="green">active</Badge> : null}
                </button>
              )
            })}

            <button
              type="button"
              className={`provider-row provider-row-new ${isNew ? 'is-selected' : ''}`}
              onClick={() => leave(beginNew)}
            >
              <Icon name="plus" size={13} />
              <span className="provider-row-text"><span className="provider-row-name">Add provider</span></span>
            </button>
          </div>
        </aside>

        <div className="provider-editor">
          <div className="editor-head">
            <h2>{isNew ? 'Add provider' : selected?.name}</h2>
            {dirty ? <Badge tone="amber">Unsaved</Badge> : null}
            {!isNew && selected?.enabled === false ? <Badge tone="gray">disabled</Badge> : null}
            {selected?.id === activeProvider ? <Badge tone="green">Active in workspace</Badge> : null}
          </div>

          <div className="editor-grid">
            <Field label="Name" hint="Shown in the picker. The ID is derived from this name.">
              <TextInput
                ref={nameRef}
                value={draft.name}
                placeholder="cliproxy1"
                onChange={(event) => patch({ name: event.target.value })}
              />
            </Field>

            <Field
              label="Base URL"
              tone={urlLooksWrong ? 'bad' : 'default'}
              hint={urlLooksWrong ? 'Enter an HTTP or HTTPS URL.' : 'Base endpoint for /chat/completions and /models.'}
            >
              <TextInput
                mono
                invalid={urlLooksWrong}
                value={draft.baseUrl}
                placeholder="https://api.openai.com/v1"
                leading={<Icon name="globe" size={13} />}
                onChange={(event) => patch({ baseUrl: event.target.value })}
              />
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
                leading={<Icon name="key" size={13} />}
                trailing={
                  <IconButton
                    label={showKey ? 'Hide key' : 'Show key'}
                    onClick={() => setShowKey((prev) => !prev)}
                  >
                    <Icon name={showKey ? 'eyeOff' : 'eye'} size={13} />
                  </IconButton>
                }
                onChange={(event) => patch({ apiKey: event.target.value })}
              />
            </Field>

            <Switch
              checked={draft.enabled}
              label="Enabled"
              hint="Disabled providers do not appear in the workspace model picker."
              onChange={(next) => patch({ enabled: next })}
            />
          </div>

          <section className="model-section">
            <div className="model-head">
              <span className="model-head-title">MODELS<Badge tone="gray">{draft.models.length}</Badge></span>
              <Button variant="outline" size="sm" disabled={isNew || busy !== null} onClick={() => void sync()}>
                <Icon name="refresh" size={12} /> {busy === 'sync' ? 'Syncing…' : 'Sync from /models'}
              </Button>
            </div>

            {draft.models.length === 0 ? (
              <p className="model-empty">
                <Icon name="info" size={13} /> No models yet. Sync from the endpoint or add model IDs below.
              </p>
            ) : (
              <ul className="model-list">
                {draft.models.map((model) => {
                  const isDefault = model === draft.defaultModel
                  const isLive = selected?.id === activeProvider && model === activeModel
                  const settings = draft.modelSettings[model]
                  const context = modelContext(model, settings)
                  const badges = capabilityBadges(model, settings)
                  const capability = getReasoningCapability(model)
                  const open = tunedModel === model
                  const visionValue = settings?.vision === undefined ? 'auto' : settings.vision ? 'yes' : 'no'
                  return (
                    <li key={model} className={`model-row ${isDefault ? 'is-default' : ''}`}>
                      <div className="model-row-main">
                        <button
                          type="button"
                          className="model-pick"
                          aria-pressed={isDefault}
                          title={isDefault ? 'Current default' : 'Set as default'}
                          onClick={() => patch({ defaultModel: model })}
                        >
                          <Icon name={isDefault ? 'circleDot' : 'circle'} size={13} />
                        </button>
                        <code className="model-name">{model}</code>
                        {badges.map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}
                        <span
                          className={`model-context ${context.overridden ? 'is-custom' : ''}`}
                          title={context.overridden
                            ? `Custom context window: ${context.tokens.toLocaleString()} tokens`
                            : `Catalog context window: ${context.tokens.toLocaleString()} tokens (leave the override empty to use it)`}
                        >
                          {context.label}{context.overridden ? ' · custom' : ''}
                        </span>
                        {isDefault ? <Badge tone="blue">default</Badge> : null}
                        {isLive ? <Badge tone="green">live</Badge> : null}
                        <span className="model-row-actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isNew || busy !== null}
                            onClick={() => void useForChat(model)}
                          >
                            Use in workspace
                          </Button>
                          <IconButton
                            label={open ? `Hide ${model} settings` : `Configure ${model} (context, vision, thinking)`}
                            aria-expanded={open}
                            className={open ? 'model-tune is-open' : 'model-tune'}
                            onClick={() => setTunedModel(open ? null : model)}
                          >
                            <Icon name="sliders" size={13} />
                          </IconButton>
                          <IconButton label={`Remove model ${model}`} onClick={() => dropModel(model)}>
                            <Icon name="trash" size={13} />
                          </IconButton>
                        </span>
                      </div>
                      {open ? (
                        <div className="model-settings-editor">
                          <Field
                            label="Context window (tokens)"
                            hint={`Leave empty for the catalog default (${context.tokens.toLocaleString()}). An explicit value is treated as operator-verified.`}
                          >
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
                              triggerClassName="model-setting-select"
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
                                triggerClassName="model-setting-select"
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

            <div className="model-add">
              <TextInput
                mono
                value={modelDraft}
                placeholder="gpt-5.6-sol, gpt-5.6-terra"
                onChange={(event) => setModelDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  addModels()
                }}
              />
              <Button variant="outline" size="sm" disabled={modelDraft.trim() === ''} onClick={addModels}>
                <Icon name="plus" size={12} /> Add
              </Button>
            </div>
          </section>

          {notice !== null ? (
            <div className={`settings-notice tone-${notice.kind}`} role="status">
              <Icon name={notice.kind === 'ok' ? 'check' : 'alertTriangle'} size={13} />
              {notice.kind === 'bad' ? <ErrorNotice raw={notice.text} /> : <span>{notice.text}</span>}
            </div>
          ) : null}
        </div>
      </div>
      )}

        </Tabs.Content>
      {tab === 'providers' ? (
      <footer className="settings-foot">
        <span className="settings-foot-left">
          {isNew ? null : confirmDelete ? (
            <>
              <span className="settings-confirm">Delete “{selected?.name}”?</span>
              <Button variant="outline-danger" size="sm" disabled={busy !== null} onClick={() => void remove()}>
                {busy === 'delete' ? 'Deleting…' : 'Delete permanently'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={12} /> Delete provider
            </Button>
          )}
        </span>

        <span className="settings-foot-right">
          <Button variant="outline" size="sm" disabled={isNew || busy !== null} onClick={() => void test()}>
            {busy === 'test' ? 'Testing…' : 'Test connection'}
          </Button>
          <Button variant="primary" size="sm" disabled={busy !== null || !dirty} onClick={() => void save()}>
            {busy === 'save' ? 'Saving…' : isNew ? 'Add provider' : 'Save changes'}
          </Button>
        </span>
      </footer>
      ) : null}
      </Tabs.Root>
    </Modal>
    <ConfirmDialog open={pendingLeave !== null} title="Discard unsaved provider changes?" confirmLabel="Discard changes"
      onDismiss={() => setPendingLeave(null)} onConfirm={() => { const action = pendingLeave; setPendingLeave(null); action?.() }} />
    </>
  )
}
