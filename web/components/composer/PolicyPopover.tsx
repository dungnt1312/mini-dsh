import { useEffect, useState } from 'react'
import { setPolicy } from '../../lib/api.ts'
import type { PolicyMode } from '../../lib/types.ts'
import Icon from '../common/Icon.tsx'
import { ErrorNotice } from '../common/ErrorNotice.tsx'
import { useToast } from '../common/Toast.tsx'
import { Button } from '../ui/Button.tsx'
import { Menu } from '../ui/Menu.tsx'
import { Segmented } from '../ui/Segmented.tsx'

const MODES: readonly PolicyMode[] = ['allow', 'ask', 'deny']
const SEGMENTS = MODES.map((mode) => ({ value: mode, label: mode[0]?.toUpperCase() + mode.slice(1) }))

/** Drop empty keys so "no override" and "unset" compare equal. */
function clean(policy: Record<string, string> | undefined): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(policy ?? {})) {
    if (key !== '' && value !== '') next[key] = value
  }
  return next
}

function samePolicy(a: Record<string, string>, b: Record<string, string>): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  return keysA.length === keysB.length && keysA.every((key) => a[key] === b[key])
}

/**
 * The ONLY permission-policy editor (spec: Composer v2): segmented
 * Allow/Ask/Deny per override plus a `*` wildcard row, staged in a local
 * draft — an 8px amber dot marks unsaved changes on the ⓘ trigger. Save
 * PUTs the whole workspace policy (a live control: next tool gate).
 */
export function PolicyPopover({
  policy,
  workspaceId,
  onSaved,
}: {
  readonly policy?: Record<string, string> | undefined
  readonly workspaceId: string | null
  readonly onSaved?: () => void
}) {
  const toast = useToast()
  const saved = clean(policy)
  const [draft, setDraft] = useState<Record<string, string>>(() => saved)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState('')

  useEffect(() => {
    setDraft(clean(policy))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy])

  const dirty = !samePolicy(draft, saved)
  const overrides = Object.keys(draft).filter((key) => key !== '*').sort((a, b) => a.localeCompare(b))
  const hasWildcard = draft['*'] !== undefined

  const save = async (close: () => void): Promise<void> => {
    if (workspaceId === null || saving) return
    setSaving(true)
    setError(null)
    try {
      await setPolicy(workspaceId, draft)
      setDraft((current) => ({ ...current }))
      onSaved?.()
      toast.notify('Policy updated — applies at the next tool gate.', 'ok')
      close()
    } catch (cause) {
      setError(String(cause))
    } finally {
      setSaving(false)
    }
  }

  const addTool = (): void => {
    const tool = adding.trim()
    if (tool === '' || draft[tool] !== undefined) {
      setAdding('')
      return
    }
    setDraft((current) => ({ ...current, [tool]: 'ask' }))
    setAdding('')
  }

  const title = workspaceId === null
    ? 'Permission policy (no workspace context)'
    : dirty
      ? 'Permission policy — unsaved changes'
      : 'Workspace controls and permissions'

  return (
    <Menu
      label={title}
      panelRole="dialog"
      panelClassName="policy-pop"
      panelWidth={340}
      triggerClassName={`composer-policy-trigger ui-icon-btn ui-icon-btn-sm ui-icon-btn-ghost${dirty ? ' policy-dirty' : ''}`}
      trigger={() => (
        <>
          <Icon name="info" size={13} />
          {dirty ? <span className="policy-dot" aria-hidden="true" /> : null}
        </>
      )}
    >
      {(close) => (
        <>
          <div className="policy-pop-head">
            <strong>Permission policy</strong>
            <span className="policy-live">⚡ live</span>
          </div>
          <p className="policy-pop-sub">Applies at the next tool gate. Overrides win over the mode&apos;s defaults.</p>
          <div className="policy-row">
            <span className="policy-tool">
              <code>*</code>
              <span className="policy-tool-hint">{hasWildcard ? 'everything else' : 'everything else — mode default'}</span>
            </span>
            <Segmented
              label="Default permission for every tool"
              value={hasWildcard ? (draft['*'] as PolicyMode) : null}
              options={SEGMENTS}
              onChange={(mode) => setDraft((current) => ({ ...current, '*': mode }))}
            />
          </div>
          {overrides.map((tool) => (
            <div className="policy-row" key={tool}>
              <span className="policy-tool">
                <code>{tool}</code>
              </span>
              <span className="policy-row-controls">
                <Segmented
                  label={`Permission for ${tool}`}
                  value={(draft[tool] as PolicyMode) ?? null}
                  options={SEGMENTS}
                  onChange={(mode) => setDraft((current) => ({ ...current, [tool]: mode }))}
                />
                <button
                  type="button"
                  className="policy-remove"
                  aria-label={`Remove the ${tool} override (back to mode default)`}
                  title="Back to mode default"
                  onClick={() => setDraft((current) => {
                    const next = { ...current }
                    delete next[tool]
                    return next
                  })}
                >
                  <Icon name="close" size={11} />
                </button>
              </span>
            </div>
          ))}
          {hasWildcard ? (
            <button
              type="button"
              className="policy-remove policy-wildcard-remove"
              onClick={() => setDraft((current) => {
                const next = { ...current }
                delete next['*']
                return next
              })}
            >
              Remove the wildcard override — everything back to the mode default
            </button>
          ) : null}
          <div className="policy-add">
            <input
              className="filter-input"
              value={adding}
              placeholder="Add a tool override…"
              aria-label="Tool name for a new override"
              onChange={(event) => setAdding(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addTool()
                }
              }}
            />
            <Button size="sm" onClick={addTool} disabled={adding.trim() === ''}>Add</Button>
          </div>
          {error !== null ? <ErrorNotice raw={error} /> : null}
          <hr className="policy-divider" />
          <div className="policy-foot">
            <Button size="sm" variant="ghost" onClick={() => { setDraft(saved); setError(null) }} disabled={!dirty || saving}>Reset</Button>
            <Button size="sm" variant="primary" onClick={() => void save(close)} disabled={workspaceId === null || !dirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </>
      )}
    </Menu>
  )
}
