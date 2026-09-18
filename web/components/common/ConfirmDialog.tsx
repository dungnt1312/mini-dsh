import type { ReactNode } from 'react'
import { Button, type ButtonVariant } from '../ui/Button.tsx'
import { Modal } from '../ui/Modal.tsx'

interface Props {
  readonly open: boolean
  readonly title: string
  readonly confirmLabel: string
  readonly onConfirm: () => void
  readonly onDismiss: () => void
  /** Optional body under the title (scope text, live error notices). */
  readonly body?: ReactNode
  /** danger (default) renders a destructive confirm; success a neutral primary one. */
  readonly tone?: 'danger' | 'success'
  readonly busy?: boolean
}

/** Modal confirmation; Escape and the backdrop dismiss. */
export default function ConfirmDialog({ open, title, confirmLabel, onConfirm, onDismiss, body, tone = 'danger', busy = false }: Props) {
  const variant: ButtonVariant = tone === 'success' ? 'primary' : 'danger'
  return (
    <Modal open={open} onDismiss={onDismiss} label={title} width="sm">
      <h2 className="m-0 text-base font-semibold">{title}</h2>
      {body !== undefined ? <div className="mt-2 flex flex-col gap-2 text-sm text-fg-muted">{body}</div> : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onDismiss}>Cancel</Button>
        <Button variant={variant} autoFocus disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</Button>
      </div>
    </Modal>
  )
}
