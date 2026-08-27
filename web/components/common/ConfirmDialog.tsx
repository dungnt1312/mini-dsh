import Icon from './Icon.tsx'
import { Button } from '../ui/Button.tsx'

interface Props {
  readonly open: boolean
  readonly title: string
  readonly confirmLabel: string
  readonly onConfirm: () => void
  readonly onDismiss: () => void
}

/** Modal confirm (used for session delete); Esc and backdrop dismiss. */
export default function ConfirmDialog({ open, title, confirmLabel, onConfirm, onDismiss }: Props) {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onClick={onDismiss}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <p className="modal-title">{title}</p>
        <div className="modal-actions">
          <Button variant="ghost" onClick={onDismiss}>Hủy</Button>
          <Button variant="danger" autoFocus onClick={onConfirm}>
            <Icon name="trash" size={12} />
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
