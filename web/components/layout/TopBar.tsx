import * as Popover from '@radix-ui/react-popover'
import { useEffect, useRef, useState } from 'react'
import Icon from '../common/Icon.tsx'
import { Badge } from '../ui/Badge.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { WorkspacePopover } from './WorkspacePopover.tsx'
import type { StreamState } from '../../lib/api.ts'
import type { WorkspaceRow } from '../../lib/types.ts'

/**
 * Global chrome (spec: TopBar v2): rail toggle, wordmark, workspace chip —
 * which carries the active workspace's stream dot plus ONE optional amber
 * approval badge (running counts never render on the chip) — and the
 * inspector / settings entry points. The popover owns switching AND
 * management (inline rename, kebab archive/restore/delete).
 */
export function TopBar({
  stream,
  sidebarOpen,
  envOpen,
  workspaces,
  activeWorkspaceId,
  newWorkspaceName,
  onNewWorkspaceName,
  onSelectWorkspace,
  onCreateWorkspace,
  onWorkspacesChanged,
  openSignal,
  onToggleSidebar,
  onToggleEnv,
  onOpenSettings,
}: {
  readonly stream: StreamState
  readonly sidebarOpen: boolean
  readonly envOpen?: boolean
  readonly workspaces: readonly WorkspaceRow[]
  readonly activeWorkspaceId: string | null
  readonly newWorkspaceName: string
  readonly onNewWorkspaceName: (value: string) => void
  readonly onSelectWorkspace: (id: string) => void
  readonly onCreateWorkspace: () => void
  readonly onWorkspacesChanged: () => Promise<void>
  /** Bump to open the switcher from elsewhere (archived banner link). */
  readonly openSignal?: number
  readonly onToggleSidebar: () => void
  readonly onToggleEnv: () => void
  readonly onOpenSettings: () => void
}) {
  const [wsOpen, setWsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const active = workspaces.find((row) => row.id === activeWorkspaceId) ?? null
  const approvals = active?.approvals ?? 0
  const seenSignal = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (openSignal === undefined) return
    if (seenSignal.current === undefined) { seenSignal.current = openSignal; return }
    if (openSignal !== seenSignal.current) {
      seenSignal.current = openSignal
      setWsOpen(true)
    }
  }, [openSignal])

  return (
    <header className="topbar">
      <div className="topbar-left">
        <IconButton label={sidebarOpen ? 'Close conversation navigation' : 'Open conversation navigation'} size="md" onClick={onToggleSidebar}>
          <Icon name="panelLeft" size={15} />
        </IconButton>
        <span className="topbar-wordmark">mini-dsh</span>
        <Popover.Root open={wsOpen} onOpenChange={setWsOpen}>
          <div className="topbar-workspace">
          <Popover.Trigger ref={triggerRef} className="ui-chip ui-chip-btn inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs cursor-pointer hover:bg-surface-muted" title="Choose workspace (running work is unaffected)">
            <span className={`ws-dot ws-dot-${stream}`} aria-hidden="true" />
            <b>{active?.name ?? 'workspace'}</b>
            {active?.archived === true ? <Badge tone="gray">archived</Badge> : null}
            {approvals > 0 ? <Badge tone="amber">⚠{approvals}</Badge> : null}
            <Icon name="chevron" size={11} className="ui-chip-caret chevron" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className="topbar-folder-pop topbar-ws-pop" side="bottom" align="start" sideOffset={6} collisionPadding={16} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus() }}>
              <div className="ws-pop-head">WORKSPACES</div>
              <WorkspacePopover workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} onSelect={(id) => { onSelectWorkspace(id); setWsOpen(false) }} onChanged={onWorkspacesChanged} newWorkspaceName={newWorkspaceName} onNewWorkspaceName={onNewWorkspaceName} onCreate={() => { onCreateWorkspace(); setWsOpen(false) }} />
            </Popover.Content>
          </Popover.Portal>
          </div>
        </Popover.Root>
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-actions">
        <IconButton label={envOpen ? 'Close context inspector' : 'Open context inspector'} size="md" onClick={onToggleEnv}>
          <Icon name="panelRight" size={15} />
        </IconButton>
        <IconButton label="Open settings" size="md" onClick={onOpenSettings}>
          <Icon name="sliders" size={15} />
        </IconButton>
      </div>
    </header>
  )
}
