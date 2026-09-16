import * as Popover from '@radix-ui/react-popover'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

/** Caller-compatible Radix overlay; callers retain trigger and item markup. */
export function Menu({ label, trigger, triggerClassName = '', panelClassName = '', panelRole = 'menu', panelWidth, disabled = false, children }: { readonly label: string; readonly trigger: (open: boolean) => ReactNode; readonly triggerClassName?: string; readonly panelClassName?: string; readonly panelRole?: 'menu' | 'dialog'; readonly panelWidth?: number; readonly disabled?: boolean; readonly children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const drawerPanelRef = useRef<HTMLDivElement | null>(null)
  const drawerOpen = typeof document !== 'undefined' && document.querySelector('[data-workbench-scrim]') !== null
  useEffect(() => {
    if (!open || !drawerOpen) return
    drawerPanelRef.current?.focus()
    document.documentElement.dataset.composerMenuOpen = 'true'
    document.dispatchEvent(new CustomEvent('mini-dsh:composer-menu-open'))
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      document.dispatchEvent(new CustomEvent('mini-dsh:composer-menu-escape'))
      setOpen(false)
    }
    const onClose = (): void => setOpen(false)
    document.addEventListener('keydown', onEscape, true)
    document.addEventListener('mini-dsh:close-composer-menu', onClose)
    return () => {
      document.removeEventListener('keydown', onEscape, true)
      document.removeEventListener('mini-dsh:close-composer-menu', onClose)
      window.setTimeout(() => { delete document.documentElement.dataset.composerMenuOpen }, 0)
    }
  }, [drawerOpen, open])
  return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button type="button" disabled={disabled} className={triggerClassName} aria-label={label} aria-haspopup={panelRole} onClick={() => { if (drawerOpen) setOpen(true) }}>{trigger(open)}</button></Popover.Trigger>{open && drawerOpen ? <div ref={drawerPanelRef} role={panelRole} aria-label={label} tabIndex={-1} className={cn('ui-menu', panelClassName, 'ui-menu-drawer-exception')} style={panelWidth === undefined ? undefined : { width: panelWidth }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false) } }}>{children(() => setOpen(false))}</div> : <Popover.Portal><Popover.Content role={panelRole} aria-label={label} className={cn('ui-menu', panelClassName)} style={panelWidth === undefined ? undefined : { width: panelWidth }} sideOffset={6} collisionPadding={8}>{children(() => setOpen(false))}</Popover.Content></Popover.Portal>}</Popover.Root>
}
