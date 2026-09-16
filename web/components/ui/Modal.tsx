import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

type ModalProps = { readonly open: boolean; readonly onDismiss: () => void; readonly label: string; readonly width?: 'sm' | 'md' | 'lg'; readonly className?: string; readonly header?: ReactNode; readonly children: ReactNode }
/** Caller-compatible controlled Radix dialog with portal, focus restoration, and Escape dismissal. */
export function Modal({ open, onDismiss, label, width = 'lg', className, header, children }: ModalProps) {
  const openerRef = useRef<HTMLElement | null>(null)
  useEffect(() => { if (!open) return; openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; return () => openerRef.current?.focus() }, [open])
  if (!open) return null
  const content = <><>{header !== undefined ? <header className="ui-modal-head">{header}</header> : null}</><div className="ui-modal-body">{children}</div></>
  if (typeof document === 'undefined') return <div className="ui-modal-backdrop" role="presentation"><div role="dialog" aria-modal="true" aria-label={label} className={cn('ui-modal', `ui-modal-${width}`, className)}>{content}</div></div>
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onDismiss() }}><Dialog.Portal><Dialog.Overlay className="ui-modal-backdrop" /><Dialog.Content aria-label={label} className={cn('ui-modal ui-modal-content', `ui-modal-${width}`, className)}>{content}</Dialog.Content></Dialog.Portal></Dialog.Root>
}
