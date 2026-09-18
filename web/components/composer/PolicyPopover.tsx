import { useEffect, useState } from 'react'
import { setPolicy } from '../../lib/api.ts'
import type { PolicyMode } from '../../lib/types.ts'
import Icon from '../common/Icon.tsx'
import { ErrorNotice } from '../common/ErrorNotice.tsx'
import { useToast } from '../common/Toast.tsx'
import { Button } from '../ui/Button.tsx'
import { Menu } from '../ui/Menu.tsx'
import { Segmented } from '../ui/Segmented.tsx'
import { composerChipClass } from './composer-chip.ts'

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
 * The only permission-policy editor: Allow/Ask/Deny per tool override plus a
 * `*` wildcard row, staged in a local draft. Save PUTs the whole workspace
 * policy (a live control: next tool gate).
 */
export function PolicyPopover({ policy, workspaceId, onSaved }: {
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
    if (tool === '') return
    if (draft[tool] !== undefined) {
      setError(`"${tool}" already has an override.`)
      return
    }
    setError(null)
    setDraft((current) => ({ ...current, [tool]: 'ask' }))
    setAdding('')
  }

  const remove = (tool: string): void => setDraft((current) => {
    const next = { ...current }
    delete next[tool]
    return next
  })

  const title = workspaceId === null
    ? 'Permission policy (no workspace context)'
    : dirty ? 'Permission policy — unsaved changes' : 'Workspace controls and permissions'

  return (
    <Menu
      label={title}
      side="top"
      panelRole="dialog"
      panelClassName="w-[min(360px,calc(100vw-24px))] p-3"
      triggerClassName={composerChipClass}
      trigger={() => (
        <>
          <Icon name="shield" size={15} />
          <span className="max-sm:sr-only">Permissions</span>
          {dirty ? <span className="size-1.5 rounded-full bg-warn" aria-hidden="true" /> : null}
          {dirty ? <span className="sr-only">Unsaved changes</span> : null}
        </>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-3">
          <div>
            <strong className="text-sm font-semibold">Permission policy</strong>
            <p className="m-0 text-xs text-fg-muted">Applies at the next tool gate. Overrides win over the mode&apos;s defaults.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-[13px]"><code>*</code> <span className="text-fg-faint">{hasWildcard ? 'everything else' : 'everything else — mode default'}</span></span>
              <Segmented label="Default permission for every tool" value={hasWildcard ? (draft['*'] as PolicyMode) : null} options={SEGMENTS} onChange={(mode) => setDraft((current) => ({ ...current, '*': mode }))} />
            </div>
            {overrides.map((tool) => (
              <div className="flex items-center justify-between gap-2" key={tool}>
                <code className="min-w-0 truncate text-[13px]" title={tool}>{tool}</code>
                <span className="flex items-center gap-1">
                  <Segmented label={`Permission for ${tool}`} value={(draft[tool] as PolicyMode) ?? null} options={SEGMENTS} onChange={(mode) => setDraft((current) => ({ ...current, [tool]: mode }))} />
                  <button type="button" className="flex size-7 items-center justify-center rounded-md text-fg-faint hover:bg-hover hover:text-fg" aria-label={`Remove the ${tool} override (back to mode default)`} title="Back to mode default" onClick={() => remove(tool)}>
                    <Icon name="close" size={13} />
                  </button>
                </span>
              </div>
            ))}
            {hasWildcard ? (
              <button type="button" className="self-start text-xs text-fg-muted underline-offset-2 hover:underline" onClick={() => remove('*')}>
                Remove the wildcard override — everything back to the mode default
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <input
              className="filter-input h-8"
              value={adding}
              placeholder="Add a tool override…"
              aria-label="Tool name for a new override"
              onChange={(event) => setAdding(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTool() } }}
            />
            <Button size="sm" onClick={addTool} disabled={adding.trim() === ''}>Add</Button>
          </div>
          {error !== null ? <ErrorNotice raw={error} /> : null}
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button size="sm" variant="ghost" onClick={() => { setDraft(saved); setError(null) }} disabled={!dirty || saving}>Reset</Button>
            <Button size="sm" variant="primary" onClick={() => void save(close)} disabled={workspaceId === null || !dirty || saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      )}
    </Menu>
  )
}
