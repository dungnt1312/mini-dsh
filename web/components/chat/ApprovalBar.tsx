import { ErrorNotice } from '../common/ErrorNotice.tsx'
import ConfirmDialog from '../common/ConfirmDialog.tsx'
import { useRef, useState } from 'react'
import { Button } from '../ui/Button.tsx'
import { toolTarget } from '../../lib/format.ts'
import type { PendingApproval } from '../../lib/types.ts'

export function ApprovalBar({
  approvals, onAnswer, scope = 'No project attached',
  workspaceName, onAlwaysAllow,
}: {
  readonly approvals: readonly PendingApproval[]
  readonly onAnswer: (approvalId: string, allow: boolean) => void | Promise<void>
  readonly scope?: string
  /** Workspace display name for the always-allow confirm scope. */
  readonly workspaceName?: string | undefined
  /**
   * Persists `{tool: allow}` on the workspace policy (PUT). Absent → the
   * always-allow action is hidden (no workspace context). Failure keeps the
   * confirm open with the error body.
   */
  readonly onAlwaysAllow?: (tool: string) => Promise<void>
}) {
  const locks = useRef(new Set<string>())
  const [submitting, setSubmitting] = useState<readonly string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const confirmLock = useRef(false)
  const answer = async (id: string, allow: boolean) => {
    if (locks.current.has(id)) return
    locks.current.add(id)
    setSubmitting([...locks.current])
    setErrors((all) => ({ ...all, [id]: '' }))
    try { await Promise.resolve(onAnswer(id, allow)) }
    catch (cause) { setErrors((all) => ({ ...all, [id]: String(cause) })) }
    finally { locks.current.delete(id); setSubmitting([...locks.current]) }
  }
  const confirmingRow = approvals.find((row) => row.approvalId === confirming) ?? null
  const confirmAlways = async () => {
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
  return <section className="approvals" aria-label="Pending approvals">
    <div className="approvals-head">{approvals.length} requests awaiting a decision</div>
    {approvals.map(({ approvalId, call }) => <article key={approvalId} className="approval approval-review" aria-busy={submitting.includes(approvalId)}>
      <div><strong>{call.name}</strong><p className="approval-target">Target: {toolTarget(call.args) || 'See exact arguments below'}</p><p>Conversation project: <code>{scope}</code></p></div>
      <details><summary>Exact arguments · {call.id}</summary><pre>{JSON.stringify(call.args, null, 2)}</pre></details>
      <p>This decision applies to this request only, not the project or future requests. Arguments may target systems outside the project; server policy still applies.</p>
      {errors[approvalId] ? <ErrorNotice raw={errors[approvalId]!} /> : null}
      <div className="approval-actions">
        <Button variant="outline-danger" size="sm" disabled={submitting.includes(approvalId)} onClick={() => void answer(approvalId, false)}>Deny</Button>
        {onAlwaysAllow !== undefined ? (
          <Button
            variant="outline"
            size="sm"
            disabled={submitting.includes(approvalId)}
            onClick={() => { setConfirmError(null); setConfirming(approvalId) }}
          >
            Always allow {call.name}…
          </Button>
        ) : null}
        <Button variant="success" size="sm" disabled={submitting.includes(approvalId)} onClick={() => void answer(approvalId, true)}>{submitting.includes(approvalId) ? 'Submitting decision…' : 'Allow once'}</Button>
      </div>
    </article>)}
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
            <p>Future {confirmingRow.call.name} calls in workspace &quot;{workspaceName ?? 'current'}&quot; will run without asking. The change applies from the next tool gate and can be reverted any time in the permission popover (ⓘ in the composer).</p>
            {confirmError !== null ? <ErrorNotice raw={confirmError} /> : null}
          </>
        )}
      />
    ) : null}
  </section>
}
