import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { useRestoreFocus } from '../../hooks/useRestoreFocus.ts'

/** Edge-attached modal panel (mobile navigation drawer, Context sheet). */
export function Sheet({ open, onOpenChange, side, label, className, children }: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly side: 'left' | 'right'
  readonly label: string
  readonly className?: string
  readonly children: ReactNode
}) {
  const restoreFocus = useRestoreFocus(open)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Content
          aria-label={label}
          aria-describedby={undefined}
          onCloseAutoFocus={restoreFocus}
          className={cn(
            'fixed inset-y-0 z-40 flex h-dvh flex-col overflow-hidden text-fg shadow-pop outline-none',
            side === 'left' ? 'left-0 w-[min(300px,calc(100vw-48px))] bg-sidebar' : 'right-0 w-[min(440px,100vw)] border-l border-line bg-bg',
            className,
          )}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
