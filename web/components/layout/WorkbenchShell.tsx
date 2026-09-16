import * as Dialog from '@radix-ui/react-dialog'
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { ResizableSeparator } from '../ui/ResizableSeparator.tsx'
import { useResizablePanel } from '../../hooks/useResizablePanel.ts'

export interface WorkbenchShellProps {
  readonly topBar: ReactNode
  readonly navigation: ReactNode
  readonly conversation: ReactNode
  readonly inspector: ReactNode
  readonly leftOpen: boolean
  readonly rightOpen: boolean
  readonly leftWidth: number
  readonly rightWidth: number
  readonly onLeftOpenChange: (open: boolean) => void
  readonly onRightOpenChange: (open: boolean) => void
  readonly onLeftWidthChange: (width: number) => void
  readonly onRightWidthChange: (width: number) => void
}

export function useWorkbenchDocked(minimum: number): boolean {
  const [docked, setDocked] = useState(() => window.innerWidth >= minimum)
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${minimum}px)`)
    const update = (): void => setDocked(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [minimum])
  return docked
}

function Drawer({ open, onOpenChange, label, side, children }: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly label: string
  readonly side: 'left' | 'right'
  readonly children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const suppressEscapeRef = useRef(false)
  const [composerMenuOpen, setComposerMenuOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onComposerOpen = (): void => setComposerMenuOpen(true)
    const onComposerEscape = (): void => { suppressEscapeRef.current = true; setComposerMenuOpen(false) }
    document.addEventListener('mini-dsh:composer-menu-open', onComposerOpen)
    document.addEventListener('mini-dsh:composer-menu-escape', onComposerEscape)
    return () => {
      document.removeEventListener('mini-dsh:composer-menu-open', onComposerOpen)
      document.removeEventListener('mini-dsh:composer-menu-escape', onComposerEscape)
      if (opener?.isConnected) opener.focus()
    }
  }, [open])

  useEffect(() => {
    const onEscapeCapture = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || document.querySelector('.ui-menu-drawer-exception') === null) return
      event.preventDefault()
      event.stopImmediatePropagation()
      document.dispatchEvent(new CustomEvent('mini-dsh:close-composer-menu'))
    }
    if (open) window.addEventListener('keydown', onEscapeCapture, true)
    return () => window.removeEventListener('keydown', onEscapeCapture, true)
  }, [open])

  useEffect(() => {
    if (!open || composerMenuOpen) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active.closest('[data-conversation-dock]') !== null) dialogRef.current?.focus()
  }, [composerMenuOpen, open])

  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      if (!next && document.documentElement.dataset.composerMenuOpen === 'true') {
        suppressEscapeRef.current = false
        setComposerMenuOpen(false)
        delete document.documentElement.dataset.composerMenuOpen
        return
      }
      onOpenChange(next)
    }} modal={false}>
      <Dialog.Portal>
        <div
          data-workbench-scrim
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/45 [clip-path:polygon(0_0,100%_0,100%_var(--drawer-dock-top,100%),0_var(--drawer-dock-top,100%))]"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onOpenChange(false)}
        />
        <Dialog.Content
          ref={dialogRef}
          aria-label={label}
          onEscapeKeyDown={(event) => {
            if (suppressEscapeRef.current || composerMenuOpen || document.documentElement.dataset.composerMenuOpen === 'true') {
              event.preventDefault()
              suppressEscapeRef.current = false
              setComposerMenuOpen(false)
              delete document.documentElement.dataset.composerMenuOpen
            }
          }}
          className={`fixed top-0 z-50 flex h-[var(--drawer-dock-top,100dvh)] w-[min(100vw-2rem,420px)] flex-col overflow-hidden bg-canvas shadow-2xl outline-none ${side === 'left' ? 'left-0' : 'right-0'}`}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function WorkbenchShell({
  topBar,
  navigation,
  conversation,
  inspector,
  leftOpen,
  rightOpen,
  leftWidth,
  rightWidth,
  onLeftOpenChange,
  onRightOpenChange,
  onLeftWidthChange,
  onRightWidthChange,
}: WorkbenchShellProps) {
  const leftDocked = useWorkbenchDocked(1024)
  const rightDocked = useWorkbenchDocked(1280)
  const leftResizable = useResizablePanel({ side: 'left', value: leftWidth, min: 232, max: 420, onChange: onLeftWidthChange, onCommit: onLeftWidthChange })
  const rightResizable = useResizablePanel({ side: 'right', value: rightWidth, min: 280, max: 520, onChange: onRightWidthChange, onCommit: onRightWidthChange })
  const style = {
    '--left-panel-width': `${leftWidth}px`,
    '--right-panel-width': `${rightWidth}px`,
  } as CSSProperties

  const desktopLeft = leftDocked && leftOpen
  const desktopRight = rightDocked && rightOpen

  return (
    <div data-workbench-shell className="grid h-dvh grid-rows-[var(--topbar-height,48px)_minmax(0,1fr)] overflow-hidden bg-canvas text-ink" style={style}>
      <div data-workbench-topbar className="min-w-0">{topBar}</div>
      <div
        className="grid min-h-0 min-w-0 overflow-hidden"
        style={{ gridTemplateColumns: `${desktopLeft ? `${leftWidth}px 12px` : ''} minmax(0, 1fr) ${desktopRight ? `12px ${rightWidth}px` : ''}` }}
      >
        {desktopLeft ? <aside data-workbench-left className="min-h-0 min-w-0 overflow-hidden [&_.sidebar]:!static [&_.sidebar]:!visible [&_.sidebar]:!flex [&_.sidebar]:!h-full [&_.sidebar]:!w-full [&_.sidebar]:!translate-x-0">{navigation}</aside> : null}
        {desktopLeft ? <ResizableSeparator aria-label="Resize conversation navigation" {...leftResizable.separatorProps} /> : null}
        <main className="min-h-0 min-w-0 overflow-hidden">{conversation}</main>
        {desktopRight ? <ResizableSeparator aria-label="Resize context inspector" {...rightResizable.separatorProps} /> : null}
        {desktopRight ? <aside data-workbench-right className="min-h-0 min-w-0 overflow-hidden [&_.env-panel]:!static [&_.env-panel]:!flex [&_.env-panel]:!h-full [&_.env-panel]:!w-full">{inspector}</aside> : null}
      </div>
      {!leftDocked ? <Drawer open={leftOpen} onOpenChange={onLeftOpenChange} label="Conversation navigation" side="left"><div className="h-full [&_.sidebar]:!static [&_.sidebar]:!visible [&_.sidebar]:!flex [&_.sidebar]:!h-full [&_.sidebar]:!w-full [&_.sidebar]:!translate-x-0">{navigation}</div></Drawer> : null}
      {!rightDocked ? <Drawer open={rightOpen} onOpenChange={onRightOpenChange} label="Context inspector" side="right"><div className="h-full [&_.env-panel]:!static [&_.env-panel]:!flex [&_.env-panel]:!h-full [&_.env-panel]:!w-full">{inspector}</div></Drawer> : null}
    </div>
  )
}
