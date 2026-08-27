import Icon from './Icon.tsx'
import { Button } from '../ui/Button.tsx'
import { Modal } from '../ui/Modal.tsx'

interface Props {
  readonly open: boolean
  readonly title: string
  readonly confirmLabel: string
  readonly onConfirm: () => void
  readonly onDismiss: () => void
}

/** Modal confirm (used for session delete); Esc and backdrop dismiss. */
export default function ConfirmDialog({ open, title, confirmLabel, onConfirm, onDismiss }: Props) {
  return (
    <Modal open={open} onDismiss={onDismiss} label={title} width="sm" className="confirm-modal">
      <p className="confirm-title">{title}</p>
      <div className="confirm-actions">
        <Button variant="ghost" onClick={onDismiss}>Hủy</Button>
        <Button variant="danger" autoFocus onClick={onConfirm}>
          <Icon name="trash" size={12} />
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
