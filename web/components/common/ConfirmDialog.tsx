import type { ReactNode } from 'react'
import Icon from './Icon.tsx'
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
  /** danger (default) renders the trash confirm; success drops the icon. */
  readonly tone?: 'danger' | 'success'
  readonly busy?: boolean
}

/** Modal confirm (session delete, always-allow); Esc and backdrop dismiss. */
export default function ConfirmDialog({ open, title, confirmLabel, onConfirm, onDismiss, body, tone = 'danger', busy = false }: Props) {
  const variant: ButtonVariant = tone === 'success' ? 'success' : 'danger'
  return (
    <Modal open={open} onDismiss={onDismiss} label={title} width="sm" className="confirm-modal">
      <p className="confirm-title">{title}</p>
      {body !== undefined ? <div className="confirm-body">{body}</div> : null}
      <div className="confirm-actions">
        <Button variant="ghost" onClick={onDismiss}>Cancel</Button>
        <Button variant={variant} autoFocus disabled={busy} onClick={onConfirm}>
          {tone === 'danger' ? <Icon name="trash" size={12} /> : null}
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
