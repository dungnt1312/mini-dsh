import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../common/Icon.tsx'
import { Badge } from '../ui/Badge.tsx'
import { Button } from '../ui/Button.tsx'
import { Field } from '../ui/Field.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Modal } from '../ui/Modal.tsx'
import { Switch } from '../ui/Switch.tsx'
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
  readonly name: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly enabled: boolean
  readonly models: readonly string[]
  readonly defaultModel: string
}

type Busy = 'save' | 'sync' | 'test' | 'delete' | 'activate' | null

const BLANK: Draft = { name: '', baseUrl: '', apiKey: '', enabled: true, models: [], defaultModel: '' }

function draftOf(provider: ProviderSummary): Draft {
  return {
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: '',
    enabled: provider.enabled,
    models: provider.models,
    defaultModel: provider.defaultModel ?? provider.models[0] ?? '',
  }
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
}: {
  readonly open: boolean
  readonly providers: readonly ProviderSummary[]
  readonly activeProvider: string
  readonly activeModel?: string
  readonly onDismiss: () => void
  readonly onRefresh: () => Promise<void>
  readonly onSelectActive: (provider: string, model: string) => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(BLANK)
  const [busy, setBusy] = useState<Busy>(null)
  const [notice, setNotice] = useState<{ readonly kind: 'ok' | 'bad'; readonly text: string } | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [modelDraft, setModelDraft] = useState('')
  const nameRef = useRef<HTMLInputElement | null>(null)

  const selected = useMemo(
    () => providers.find((provider) => provider.id === selectedId),
    [providers, selectedId],
  )
  const isNew = selectedId === null

  useEffect(() => {
    if (!open) return
    const first = providers.find((provider) => provider.id === activeProvider) ?? providers[0]
    setSelectedId(first?.id ?? null)
    setDraft(first === undefined ? BLANK : draftOf(first))
    setNotice(null)
    setShowKey(false)
    setConfirmDelete(false)
    setModelDraft('')
  }, [open]) // Seed once per open so a background refresh never discards edits.

  const dirty = useMemo(() => {
    if (selected === undefined) return draft.name !== '' || draft.baseUrl !== '' || draft.apiKey !== ''
    const base = draftOf(selected)
    return (
      draft.name !== base.name ||
      draft.baseUrl !== base.baseUrl ||
      draft.apiKey !== '' ||
      draft.enabled !== base.enabled ||
      draft.defaultModel !== base.defaultModel ||
      !sameList(draft.models, base.models)
    )
  }, [draft, selected])

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
  }

  const beginNew = (): void => {
    setSelectedId(null)
    setDraft(BLANK)
    setNotice(null)
    setShowKey(false)
    setConfirmDelete(false)
    setModelDraft('')
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
        setNotice({ kind: 'bad', text: 'Name và Base URL là bắt buộc.' })
        return
      }
      if (urlLooksWrong) {
        setNotice({ kind: 'bad', text: 'Base URL phải bắt đầu bằng http:// hoặc https://' })
        return
      }
      if (isNew && draft.apiKey.trim() === '') {
        setNotice({ kind: 'bad', text: 'API key là bắt buộc khi thêm provider mới.' })
        return
      }
      const shared = {
        name,
        baseUrl,
        enabled: draft.enabled,
        models: draft.models,
        ...(draft.defaultModel !== '' ? { defaultModel: draft.defaultModel } : {}),
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
      setNotice({ kind: 'ok', text: `Đã lưu “${saved.name}”.` })
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
          ? `Đã sync ${result.models.length} model từ /models.`
          : 'Endpoint không trả về model nào — nhập tay bên dưới.',
      })
    })

  const test = (): Promise<void> =>
    run('test', async () => {
      if (selectedId === null) return
      const result = await testProvider(selectedId)
      setNotice(result.ok
        ? { kind: 'ok', text: 'Kết nối OK — endpoint trả completion.' }
        : { kind: 'bad', text: result.error ?? 'Kết nối thất bại.' })
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
      setNotice({ kind: 'ok', text: 'Đã xóa provider.' })
    })

  const useForChat = (model: string): Promise<void> =>
    run('activate', async () => {
      if (selected === undefined) return
      await onSelectActive(selected.id, model)
      setNotice({ kind: 'ok', text: `Chat đang dùng ${selected.name} / ${model}.` })
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
    patch({ models, defaultModel: draft.defaultModel === name ? (models[0] ?? '') : draft.defaultModel })
  }

  const header = (
    <>
      <span className="settings-title">
        <span className="settings-kicker">MODEL SETTINGS</span>
        <strong>Providers &amp; Models</strong>
        <small>Bất kỳ endpoint OpenAI-completions nào: base URL + API key.</small>
      </span>
      <IconButton label="Đóng settings" size="md" onClick={onDismiss}>
        <Icon name="close" size={15} />
      </IconButton>
    </>
  )

  return (
    <Modal open={open} onDismiss={onDismiss} label="Provider và model settings" className="settings-modal" header={header}>
      <div className="settings-body">
        <aside className="provider-rail">
          <div className="provider-rail-head">
            <span>PROVIDERS<Badge tone="gray">{providers.length}</Badge></span>
            <IconButton label="Thêm provider" onClick={beginNew}><Icon name="plus" size={13} /></IconButton>
          </div>

          <div className="provider-rail-list">
            {providers.map((provider) => {
              const isActive = provider.id === activeProvider
              return (
                <button
                  key={provider.id}
                  type="button"
                  className={`provider-row ${provider.id === selectedId ? 'is-selected' : ''}`}
                  onClick={() => select(provider)}
                >
                  <span className={`provider-status ${provider.enabled ? 'is-on' : ''}`} aria-hidden="true" />
                  <span className="provider-row-text">
                    <span className="provider-row-name">{provider.name}</span>
                    <span className="provider-row-sub">
                      {provider.models.length > 0 ? `${provider.models.length} models` : 'chưa có model'}
                    </span>
                  </span>
                  {isActive ? <Badge tone="green">chat</Badge> : null}
                </button>
              )
            })}

            <button
              type="button"
              className={`provider-row provider-row-new ${isNew ? 'is-selected' : ''}`}
              onClick={beginNew}
            >
              <Icon name="plus" size={13} />
              <span className="provider-row-text"><span className="provider-row-name">Add provider</span></span>
            </button>
          </div>
        </aside>

        <div className="provider-editor">
          <div className="editor-head">
            <h2>{isNew ? 'Add provider' : selected?.name}</h2>
            {dirty ? <Badge tone="amber">chưa lưu</Badge> : null}
            {!isNew && selected?.enabled === false ? <Badge tone="gray">disabled</Badge> : null}
            {selected?.id === activeProvider ? <Badge tone="green">đang dùng cho chat</Badge> : null}
          </div>

          <div className="editor-grid">
            <Field label="Name" hint="Hiển thị trong picker; id sinh từ tên này.">
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
              hint={urlLooksWrong ? 'Phải là http(s) URL.' : 'Gốc chứa /chat/completions và /models.'}
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
                ? 'Không bắt buộc — gateway local thường không cần key. Lưu trên server, không gửi lại về browser.'
                : selected?.keyMasked === ''
                  ? 'Provider này đang chạy không key.'
                  : `Đang lưu ${selected?.keyMasked ?? ''} — để trống nếu không đổi.`}
            >
              <TextInput
                mono
                type={showKey ? 'text' : 'password'}
                value={draft.apiKey}
                autoComplete="off"
                placeholder={isNew ? 'sk-…' : 'Giữ key hiện tại'}
                leading={<Icon name="key" size={13} />}
                trailing={
                  <IconButton
                    label={showKey ? 'Ẩn key' : 'Hiện key'}
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
              hint="Tắt thì provider không xuất hiện trong picker của chat."
              onChange={(next) => patch({ enabled: next })}
            />
          </div>

          <section className="model-section">
            <div className="model-head">
              <span className="model-head-title">MODELS<Badge tone="gray">{draft.models.length}</Badge></span>
              <Button variant="outline" size="sm" disabled={isNew || busy !== null} onClick={() => void sync()}>
                <Icon name="refresh" size={12} /> {busy === 'sync' ? 'Đang sync…' : 'Sync từ /models'}
              </Button>
            </div>

            {draft.models.length === 0 ? (
              <p className="model-empty">
                <Icon name="info" size={13} /> Chưa có model. Sync từ endpoint, hoặc nhập tay bên dưới.
              </p>
            ) : (
              <ul className="model-list">
                {draft.models.map((model) => {
                  const isDefault = model === draft.defaultModel
                  const isLive = selected?.id === activeProvider && model === activeModel
                  return (
                    <li key={model} className={`model-row ${isDefault ? 'is-default' : ''}`}>
                      <button
                        type="button"
                        className="model-pick"
                        aria-pressed={isDefault}
                        title={isDefault ? 'Đang là default' : 'Đặt làm default'}
                        onClick={() => patch({ defaultModel: model })}
                      >
                        <Icon name={isDefault ? 'circleDot' : 'circle'} size={13} />
                      </button>
                      <code className="model-name">{model}</code>
                      {isDefault ? <Badge tone="blue">default</Badge> : null}
                      {isLive ? <Badge tone="green">live</Badge> : null}
                      <span className="model-row-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isNew || busy !== null}
                          onClick={() => void useForChat(model)}
                        >
                          Dùng cho chat
                        </Button>
                        <IconButton label={`Bỏ model ${model}`} onClick={() => dropModel(model)}>
                          <Icon name="trash" size={13} />
                        </IconButton>
                      </span>
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
                <Icon name="plus" size={12} /> Thêm
              </Button>
            </div>
          </section>

          {notice !== null ? (
            <p className={`settings-notice tone-${notice.kind}`} role="status">
              <Icon name={notice.kind === 'ok' ? 'check' : 'alertTriangle'} size={13} />
              <span>{notice.text}</span>
            </p>
          ) : null}
        </div>
      </div>

      <footer className="settings-foot">
        <span className="settings-foot-left">
          {isNew ? null : confirmDelete ? (
            <>
              <span className="settings-confirm">Xóa “{selected?.name}”?</span>
              <Button variant="outline-danger" size="sm" disabled={busy !== null} onClick={() => void remove()}>
                {busy === 'delete' ? 'Đang xóa…' : 'Xóa hẳn'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Hủy</Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={12} /> Xóa provider
            </Button>
          )}
        </span>

        <span className="settings-foot-right">
          <Button variant="outline" size="sm" disabled={isNew || busy !== null} onClick={() => void test()}>
            {busy === 'test' ? 'Đang test…' : 'Test connection'}
          </Button>
          <Button variant="primary" size="sm" disabled={busy !== null || !dirty} onClick={() => void save()}>
            {busy === 'save' ? 'Đang lưu…' : isNew ? 'Thêm provider' : 'Lưu thay đổi'}
          </Button>
        </span>
      </footer>
    </Modal>
  )
}
