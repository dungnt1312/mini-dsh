import { useRef, useState } from 'react'
import Icon from '../common/Icon.tsx'
import { ErrorNotice } from '../common/ErrorNotice.tsx'
import ConfirmDialog from '../common/ConfirmDialog.tsx'
import { Button } from '../ui/Button.tsx'
import { toolTarget } from '../../lib/format.ts'
import type { PendingApproval } from '../../lib/types.ts'

const ARGS_DISPLAY_LIMIT = 4000

/**
 * Pending tool approvals, oldest first, above the composer. Allow once / Deny
 * answer only that request (locked while submitting); Always allow is a
 * separately confirmed workspace-policy write followed by one answer.
 */
export function ApprovalBar({
  approvals, onAnswer, scope = 'No project attached',
  workspaceName, onAlwaysAllow,
}: {
  readonly approvals: readonly PendingApproval[]
  readonly onAnswer: (approvalId: string, allow: boolean) => void | Promise<void>
  readonly scope?: string
  readonly workspaceName?: string | undefined
  /** Persists `{tool: allow}` on the workspace policy. Absent → the action is hidden. */
  readonly onAlwaysAllow?: (tool: string) => Promise<void>
}) {
  const locks = useRef(new Set<string>())
  const [submitting, setSubmitting] = useState<readonly string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const confirmLock = useRef(false)

  const answer = async (id: string, allow: boolean): Promise<void> => {
    if (locks.current.has(id)) return
    locks.current.add(id)
    setSubmitting([...locks.current])
    setErrors((all) => ({ ...all, [id]: '' }))
    try { await Promise.resolve(onAnswer(id, allow)) }
    catch (cause) { setErrors((all) => ({ ...all, [id]: String(cause) })) }
    finally { locks.current.delete(id); setSubmitting([...locks.current]) }
  }
  const confirmingRow = approvals.find((row) => row.approvalId === confirming) ?? null
  const confirmAlways = async (): Promise<void> => {
    if (confirmingRow === null || onAlwaysAllow === undefined || confirmLock.current) return
    confirmLock.current = true
    setConfirmBusy(true)
    setConfirmError(null)
    try {
      await onAlwaysAllow(confirmingRow.call.name)
      await Promise.resolve(onAnswer(confirmingRow.approvalId, true))
      setConfirming(null)
    } catch (cause) {
      setConfirmError(String(cause))
    } finally {
      confirmLock.current = false
      setConfirmBusy(false)
    }
  }

  if (approvals.length === 0) return null
  return (
    <section aria-label="Pending approvals" aria-live="polite" className="flex max-h-[45dvh] flex-col gap-2 overflow-y-auto">
      <div className="px-1 text-xs font-medium text-fg-muted">{approvals.length === 1 ? '1 request' : `${approvals.length} requests`} awaiting a decision</div>
      {approvals.map(({ approvalId, call }) => {
        const raw = JSON.stringify(call.args, null, 2)
        const truncated = raw.length > ARGS_DISPLAY_LIMIT
        const busy = submitting.includes(approvalId)
        const target = toolTarget(call.args)
        return (
          <article key={approvalId} aria-busy={busy} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-composer">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn"><Icon name="shield" size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm">Allow <strong className="font-semibold">{call.name}</strong>?</p>
                <p className="m-0 truncate font-mono text-xs text-fg-muted" title={target}>Target: {target || 'See exact arguments below'}</p>
                <p className="m-0 truncate text-xs text-fg-faint" title={scope}>Conversation project: <code>{scope}</code></p>
              </div>
            </div>
            <details className="text-xs text-fg-muted">
              <summary>Exact arguments · {call.id}</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-2.5 text-fg">{truncated ? `${raw.slice(0, ARGS_DISPLAY_LIMIT)}\n…` : raw}</pre>
              {truncated ? <p className="m-0 mt-1">Arguments truncated for display. Expand the source request if you need the full payload.</p> : null}
            </details>
            <p className="m-0 text-xs text-fg-faint">This decision applies to this request only, not the project or future requests. Arguments may target systems outside the project; server policy still applies.</p>
            {errors[approvalId] ? <ErrorNotice raw={errors[approvalId]!} /> : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {onAlwaysAllow !== undefined ? (
                <Button variant="ghost" size="sm" className="mr-auto" disabled={busy} onClick={() => { setConfirmError(null); setConfirming(approvalId) }}>
                  Always allow {call.name}…
                </Button>
              ) : null}
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void answer(approvalId, false)}>Deny</Button>
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void answer(approvalId, true)}>{busy ? 'Submitting decision…' : 'Allow once'}</Button>
            </div>
          </article>
        )
      })}
      {confirmingRow !== null && onAlwaysAllow !== undefined ? (
        <ConfirmDialog
          open
          title={`Always allow "${confirmingRow.call.name}" in ${workspaceName ?? 'this workspace'}?`}
          confirmLabel="Allow always"
          tone="success"
          busy={confirmBusy}
          onConfirm={() => void confirmAlways()}
          onDismiss={() => { if (!confirmBusy) setConfirming(null) }}
          body={(
            <>
              <p className="m-0">Future {confirmingRow.call.name} calls in workspace &quot;{workspaceName ?? 'current'}&quot; will run without asking. The change applies from the next tool gate and can be reverted any time in the permissions menu of the composer.</p>
              {confirmError !== null ? <ErrorNotice raw={confirmError} /> : null}
            </>
          )}
        />
      ) : null}
    </section>
  )
}
