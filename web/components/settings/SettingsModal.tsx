import { useEffect, useMemo, useState } from 'react'
import Icon from '../common/Icon.tsx'
import { Badge } from '../ui/Badge.tsx'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Panel } from '../ui/Panel.tsx'
import { TextInput } from '../ui/TextInput.tsx'
import {
  createProvider,
  deleteProvider,
  syncProvider,
  testProvider,
  updateProvider,
} from '../../lib/api.ts'
import type { ProviderSummary } from '../../lib/types.ts'

interface Draft {
  name: string
  baseUrl: string
  apiKey: string
  enabled: boolean
  models: string
  defaultModel: string
}

function blankDraft(): Draft {
  return { name: '', baseUrl: '', apiKey: '', enabled: true, models: '', defaultModel: '' }
}

function draftOf(provider: ProviderSummary): Draft {
  return {
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: '',
    enabled: provider.enabled,
    models: provider.models.join('\n'),
    defaultModel: provider.defaultModel ?? '',
  }
}

function modelsOf(raw: string): string[] {
  return [...new Set(raw.split(/[\n,]/).map((name) => name.trim()).filter((name) => name !== ''))]
}

/**
 * Provider settings modeled on the reference screen: left list for selection,
 * right editor for endpoint/key/models, connection validation and model sync.
 * It receives already-safe summaries only; the key field is blank on edit so
 * leaving it empty retains the stored secret.
 */
export function SettingsModal({
  open,
  providers,
  activeProvider,
  onDismiss,
  onRefresh,
  onSelectActive,
}: {
  readonly open: boolean
  readonly providers: readonly ProviderSummary[]
  readonly activeProvider: string
  readonly onDismiss: () => void
  readonly onRefresh: () => Promise<void>
  readonly onSelectActive: (provider: string, model: string) => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [busy, setBusy] = useState<'save' | 'sync' | 'test' | 'delete' | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)
  const selected = useMemo(() => providers.find((provider) => provider.id === selectedId), [providers, selectedId])

  useEffect(() => {
    if (!open) return
    const first = providers.find((provider) => provider.id === activeProvider) ?? providers[0]
    setSelectedId(first?.id ?? null)
    setDraft(first === undefined ? blankDraft() : draftOf(first))
    setNotice(null)
  }, [open]) // Deliberately seed once per open; preserve edits after refresh.

  useEffect(() => {
    if (selected === undefined) return
    if (selected.id !== selectedId) return
  }, [selected, selectedId])

  if (!open) return null

  const select = (provider: ProviderSummary): void => {
    setSelectedId(provider.id)
    setDraft(draftOf(provider))
    setNotice(null)
  }

  const beginNew = (): void => {
    setSelectedId(null)
    setDraft(blankDraft())
    setNotice(null)
  }

  const save = async (): Promise<void> => {
    if (draft.name.trim() === '' || draft.baseUrl.trim() === '') {
      setNotice({ kind: 'bad', text: 'Provider name và Base URL là bắt buộc.' })
      return
    }
    setBusy('save')
    setNotice(null)
    try {
      const input = {
        name: draft.name.trim(),
        baseUrl: draft.baseUrl.trim(),
        ...(draft.apiKey !== '' ? { apiKey: draft.apiKey } : {}),
        enabled: draft.enabled,
        models: modelsOf(draft.models),
        ...(draft.defaultModel.trim() !== '' ? { defaultModel: draft.defaultModel.trim() } : {}),
      }
      const saved = selectedId === null
        ? await createProvider({ ...input, apiKey: draft.apiKey })
        : await updateProvider(selectedId, input)
      await onRefresh()
      setSelectedId(saved.id)
      setDraft(draftOf(saved))
      setNotice({ kind: 'ok', text: 'Đã lưu provider.' })
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    } finally {
      setBusy(null)
    }
  }

  const sync = async (): Promise<void> => {
    if (selectedId === null) return
    setBusy('sync')
    setNotice(null)
    try {
      const result = await syncProvider(selectedId)
      setDraft((current) => ({ ...current, models: result.models.join('\n'), defaultModel: current.defaultModel || result.models[0] || '' }))
      await onRefresh()
      setNotice({ kind: 'ok', text: `Đã sync ${result.models.length} models.` })
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    } finally {
      setBusy(null)
    }
  }

  const test = async (): Promise<void> => {
    if (selectedId === null) return
    setBusy('test')
    setNotice(null)
    try {
      const result = await testProvider(selectedId)
      setNotice(result.ok ? { kind: 'ok', text: 'Kết nối thành công.' } : { kind: 'bad', text: result.error ?? 'Kết nối thất bại.' })
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    } finally {
      setBusy(null)
    }
  }

  const remove = async (): Promise<void> => {
    if (selectedId === null || selected === undefined) return
    if (!window.confirm(`Xóa provider "${selected.name}"?`)) return
    setBusy('delete')
    setNotice(null)
    try {
      await deleteProvider(selectedId)
      await onRefresh()
      beginNew()
      setNotice({ kind: 'ok', text: 'Đã xóa provider.' })
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    } finally {
      setBusy(null)
    }
  }

  const chooseAsActive = async (): Promise<void> => {
    if (selected === undefined) return
    const model = draft.defaultModel || selected.models[0]
    if (model === undefined) {
      setNotice({ kind: 'bad', text: 'Sync hoặc nhập ít nhất một model trước.' })
      return
    }
    setBusy('save')
    try {
      await onSelectActive(selected.id, model)
      setNotice({ kind: 'ok', text: 'Đã chọn provider cho chat.' })
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    } finally {
      setBusy(null)
    }
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="settings-backdrop" role="presentation" onClick={onDismiss}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Model settings" onClick={(event) => event.stopPropagation()}>
        <header className="settings-head">
          <span>
            <span className="settings-kicker">MODEL SETTINGS</span>
            <strong>Providers & Models</strong>
            <small>Manage custom OpenAI-completions providers.</small>
          </span>
          <IconButton label="Đóng settings" onClick={onDismiss}><Icon name="close" size={15} /></IconButton>
        </header>

        <div className="settings-tabs">
          <span className="settings-tab-active"><Icon name="panelLeft" size={13} /> Providers & Models <Badge tone="blue">{providers.length}</Badge></span>
        </div>

        <div className="settings-body">
          <aside className="provider-list">
            <div className="provider-list-head">PROVIDERS <IconButton label="Thêm provider" onClick={beginNew}><Icon name="plus" size={13} /></IconButton></div>
            {providers.length === 0 ? <p className="provider-empty">Chưa có provider. Thêm endpoint OpenAI-compatible đầu tiên.</p> : null}
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={`provider-row ${provider.id === selectedId ? 'provider-row-active' : ''}`}
                onClick={() => select(provider)}
              >
                <Icon name="zap" size={13} />
                <span>{provider.name}</span>
                {provider.id === activeProvider ? <Badge tone="green">Active</Badge> : null}
                <span className={`provider-dot ${provider.enabled ? 'enabled' : ''}`} aria-label={provider.enabled ? 'enabled' : 'disabled'} />
              </button>
            ))}
          </aside>

          <div className="provider-editor">
            <div className="provider-title-row">
              <h2>{selected?.name || 'Add provider'}</h2>
              {selected !== undefined ? <Badge tone={selected.enabled ? 'green' : 'gray'}>{selected.enabled ? 'Enabled' : 'Disabled'}</Badge> : null}
              {selected !== undefined ? <IconButton label="Xóa provider" variant="outline" onClick={() => void remove()} disabled={busy !== null}><Icon name="trash" size={14} /></IconButton> : null}
            </div>

            <label className="settings-field">
              <span>Name</span>
              <TextInput value={draft.name} placeholder="cliproxy1" onChange={(event) => set('name', event.target.value)} />
            </label>
            <label className="settings-field">
              <span>Base URL</span>
              <TextInput value={draft.baseUrl} placeholder="https://api.openai.com/v1" onChange={(event) => set('baseUrl', event.target.value)} />
            </label>
            <label className="settings-field">
              <span>API key {selected !== undefined ? <em>({selected.keyMasked}; để trống để giữ nguyên)</em> : null}</span>
              <TextInput type="password" value={draft.apiKey} placeholder={selected === undefined ? 'sk-…' : 'Giữ API key hiện tại'} onChange={(event) => set('apiKey', event.target.value)} />
            </label>
            <label className="settings-toggle">
              <input type="checkbox" checked={draft.enabled} onChange={(event) => set('enabled', event.target.checked)} />
              <span>Enabled</span>
            </label>

            <div className="settings-model-head">
              <span>MODEL LIST <Badge tone="gray">{modelsOf(draft.models).length}</Badge></span>
              <Button variant="ghost" size="sm" disabled={selectedId === null || busy !== null} onClick={() => void sync()}>
                <Icon name="clock" size={12} /> {busy === 'sync' ? 'Syncing…' : 'Sync models'}
              </Button>
            </div>
            <label className="settings-field">
              <span>Models (one per line)</span>
              <textarea className="settings-textarea" value={draft.models} placeholder="gpt-5.6-sol\ngpt-5.6-terra" onChange={(event) => set('models', event.target.value)} />
            </label>
            <label className="settings-field">
              <span>Default model</span>
              <TextInput value={draft.defaultModel} placeholder="gpt-5.6-sol" onChange={(event) => set('defaultModel', event.target.value)} />
            </label>

            {notice !== null ? <p className={`settings-notice ${notice.kind}`}>{notice.text}</p> : null}
            <footer className="settings-actions">
              {selected !== undefined ? (
                <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void chooseAsActive()}>
                  Dùng cho chat
                </Button>
              ) : <span />}
              <span>
                <Button variant="ghost" size="sm" disabled={selectedId === null || busy !== null} onClick={() => void test()}>
                  {busy === 'test' ? 'Testing…' : 'Test connection'}
                </Button>
                <Button variant="primary" size="sm" disabled={busy !== null} onClick={() => void save()}>
                  {busy === 'save' ? 'Saving…' : 'Save changes'}
                </Button>
              </span>
            </footer>
          </div>
        </div>
      </section>
    </div>
  )
}
