import { useRef } from 'react'
import Icon from '../common/Icon.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Kbd } from '../ui/Kbd.tsx'
import { SessionList } from '../session/SessionList.tsx'
import { useHotkeys } from '../../hooks/useHotkeys.ts'
import type { StreamState } from '../../lib/api.ts'
import type { ProjectRow, SessionListing, WorkspaceRow } from '../../lib/types.ts'

const STREAM_LABELS: Readonly<Record<StreamState, string>> = {
  idle: 'No conversation selected',
  open: 'connected',
  reconnecting: 'reconnecting…',
  connecting: 'connecting…',
}

/**
 * Navigation rail (spec: Sidebar v2): New + search, project sections with
 * live session state, time-grouped loose conversations, connection footer.
 * An archived workspace disables New and shows one quiet banner — the list
 * stays readable.
 */
export function Sidebar({
  sessions,
  projects,
  current,
  filter,
  stream,
  provider,
  running,
  workspaceArchived = false,
  open,
  onFilter,
  onSelect,
  onNew,
  onNewInProject,
  onRename,
  onDeleteRequest,
  onOpenWorkspaces,
  notifyEnabled = false,
  notifyBlocked = false,
  onToggleNotify,
  onClose,
  hosted = false,
}: {
  readonly sessions: readonly SessionListing[]
  readonly projects: readonly ProjectRow[]
  readonly current: string | null
  readonly filter: string
  readonly stream: StreamState
  readonly provider: string | null
  readonly running: boolean
  readonly workspaceArchived?: boolean
  readonly open: boolean
  readonly onFilter: (value: string) => void
  readonly onSelect: (id: string) => void
  readonly onNew: () => void
  readonly onNewInProject?: (projectId: string) => void
  readonly onRename: (id: string, title: string) => void
  readonly onDeleteRequest: (session: SessionListing) => void
  readonly onOpenWorkspaces?: () => void
  readonly notifyEnabled?: boolean
  readonly notifyBlocked?: boolean
  readonly onToggleNotify?: () => void
  readonly onClose: () => void
  readonly hosted?: boolean
}) {
  const searchRef = useRef<HTMLInputElement | null>(null)

  useHotkeys([{ key: 'k', mod: true, onPress: () => searchRef.current?.focus() }])

  return (
      <aside aria-label="Conversations and projects" className={`sidebar ${open ? 'sidebar-open' : ''}${hosted ? ' sidebar-hosted' : ''}`} style={hosted ? { position: 'static', visibility: 'visible', transform: 'none' } : undefined}>
        <div className="side-top">
          <button
            type="button"
            className="new-session"
            onClick={onNew}
            disabled={workspaceArchived}
            title={workspaceArchived ? 'Workspace is archived' : undefined}
          >
            <Icon name="plus" size={14} />
            <span>New conversation</span>
            <Kbd>Ctrl N</Kbd>
          </button>
          <div className="session-filter">
            <Icon name="search" size={13} />
            <input
              ref={searchRef}
              className="filter-input"
              value={filter}
              aria-label="Search conversations" placeholder="Search conversations…"
              onChange={(event) => onFilter(event.target.value)}
            />
            {filter !== '' ? (
              <IconButton label="Clear search" onClick={() => onFilter('')}>
                <Icon name="close" size={11} />
              </IconButton>
            ) : (
              <Kbd>Ctrl K</Kbd>
            )}
          </div>
          {workspaceArchived ? (
            <div className="ws-archived-banner" role="note">
              <Icon name="alertTriangle" size={13} />
              <span>
                Workspace archived. Restore it from{' '}
                {onOpenWorkspaces !== undefined
                  ? <button type="button" className="env-link" onClick={onOpenWorkspaces}>the workspace switcher</button>
                  : 'the workspace switcher'}.
              </span>
            </div>
          ) : null}
        </div>

        <SessionList
          sessions={sessions}
          projects={projects}
          current={current}
          filter={filter}
          liveRunning={running}
          onSelect={onSelect}
          onRename={onRename}
          onDeleteRequest={onDeleteRequest}
          {...(onNewInProject !== undefined ? { onNewInProject } : {})}
        />

        <div className="side-foot">
          <span className={`conn-dot ${stream}`} aria-hidden="true" />
          <span className="foot-provider">{provider ?? '—'}</span>
          <span className="foot-state">{STREAM_LABELS[stream]}</span>
          {onToggleNotify !== undefined ? (
            <IconButton
              label={notifyBlocked
                ? 'Notifications denied in the browser'
                : notifyEnabled ? 'Notifications on — approval alerts in background tabs' : 'Notifications off — enable approval alerts'}
              variant={notifyEnabled ? 'outline' : 'ghost'}
              className={`notify-bell${notifyEnabled ? ' is-on' : ''}`}
              onClick={onToggleNotify}
            >
              <Icon name="bell" size={13} />
            </IconButton>
          ) : null}
          <IconButton label="Close" className="sidebar-close" onClick={onClose}>
            <Icon name="close" size={13} />
          </IconButton>
        </div>
      </aside>
  )
}
