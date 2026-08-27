import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Dialog shell: backdrop click and Escape dismiss, focus moves inside on open
 * and returns to the opener on close, and Tab cycles within the dialog so the
 * page behind never steals focus. Callers own the body; `header` renders in the
 * sticky title row.
 */
export function Modal({
  open,
  onDismiss,
  label,
  width = 'lg',
  className = '',
  header,
  children,
}: {
  readonly open: boolean
  readonly onDismiss: () => void
  readonly label: string
  readonly width?: 'sm' | 'md' | 'lg'
  readonly className?: string
  readonly header?: ReactNode
  readonly children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const openerRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement
    const focusables = (): HTMLElement[] =>
      [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [])]

    focusables()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onDismiss()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      const first = items[0]
      const last = items[items.length - 1]
      if (first === undefined || last === undefined) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      ;(openerRef.current as HTMLElement | null)?.focus?.()
    }
  }, [open, onDismiss])

  if (!open) return null

  return (
    <div className="ui-modal-backdrop" role="presentation" onMouseDown={onDismiss}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`ui-modal ui-modal-${width} ${className}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {header !== undefined ? <header className="ui-modal-head">{header}</header> : null}
        <div className="ui-modal-body">{children}</div>
      </div>
    </div>
  )
}
