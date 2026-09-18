import type { ReactNode } from 'react'
import Icon from '../common/Icon.tsx'
import { Spinner } from '../common/Spinner.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import type { StreamState } from '../../lib/api.ts'

const STREAM_TEXT: Readonly<Record<StreamState, string>> = {
  idle: 'No conversation selected',
  open: 'Connected',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
}

/**
 * Center-column header: navigation affordances when the sidebar is hidden,
 * the model picker, connection state and the workbench toggle.
 */
export function ChatHeader({ sidebarVisible, stream, workbenchOpen, modelControl, title, onOpenSidebar, onNew, onToggleWorkbench }: {
  readonly sidebarVisible: boolean
  readonly stream: StreamState
  readonly workbenchOpen: boolean
  readonly modelControl: ReactNode
  readonly title?: string | undefined
  readonly onOpenSidebar: () => void
  readonly onNew: () => void
  readonly onToggleWorkbench: () => void
}) {
  const connecting = stream === 'connecting' || stream === 'reconnecting'
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3">
      {!sidebarVisible ? (
        <>
          <IconButton label="Open sidebar" size="md" onClick={onOpenSidebar}><Icon name="panelLeft" size={18} /></IconButton>
          <IconButton label="New conversation" size="md" onClick={onNew}><Icon name="squarePen" size={18} /></IconButton>
        </>
      ) : null}
      <div className="flex min-w-0 items-center">{modelControl}</div>
      {title !== undefined && title !== '' ? <span className="hidden min-w-0 truncate px-2 text-sm text-fg-faint lg:block" title={title}>{title}</span> : null}
      <div className="flex-1" />
      <span role="status" className={connecting ? 'flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-fg-muted' : 'sr-only'}>
        {connecting ? <Spinner size={11} /> : null}
        {STREAM_TEXT[stream]}
      </span>
      <IconButton label={workbenchOpen ? 'Close workbench' : 'Open workbench'} size="md" aria-expanded={workbenchOpen} onClick={onToggleWorkbench}>
        <Icon name="panelRight" size={18} />
      </IconButton>
    </header>
  )
}
