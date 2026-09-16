import * as Collapsible from '@radix-ui/react-collapsible'
import { useState } from 'react'
import Icon from '../common/Icon.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import type { ProjectRow, SessionListing } from '../../lib/types.ts'

interface RowProps {
  readonly session: SessionListing
  readonly active: boolean
  /** The open session's live turn state (fresher than the polled listing). */
  readonly liveRunning: boolean
  readonly onSelect: () => void
  readonly onRename: (id: string, title: string) => void
  readonly onDeleteRequest: (session: SessionListing) => void
}

function SessionRow({ session, active, liveRunning, onSelect, onRename, onDeleteRequest }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.title)
  // Spec: session row v2 — a reserved 10px status slot so the title never
  // shifts; running/cancelling come from the polled listing, the open
  // session's live turn state wins.
  const status = session.status ?? 'idle'
  const isRunning = status === 'running' || (active && liveRunning)
  const cancelling = status === 'cancelling'
  const queued = session.pendingInputs ?? 0
  const date = session.updatedAt !== undefined
    ? new Date(session.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : `${session.eventCount} events`

  if (editing) {
    return (
      <form
        className="session-item-shell"
        onSubmit={(event) => {
          event.preventDefault()
          onRename(session.id, draft)
          setEditing(false)
        }}
      >
        <input
          className="rename-input" aria-label="Conversation title"
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setEditing(false)
          }}
        />
      </form>
    )
  }

  return (
    <div className={`session-item-shell ${active ? 'active' : ''}`}>
      <button type="button" className="session-item" onClick={onSelect}>
        <span className={`session-status-dot${isRunning ? ' is-running' : ''}${cancelling ? ' is-cancelling' : ''}`} aria-hidden="true" />
        <span className="session-main">
          <span className="session-title">{session.title || 'New conversation'}</span>
          <span className="session-meta">
            {isRunning
              ? <span className="session-activity">working with {session.activity === 'tool' ? 'tool' : 'model'}</span>
              : cancelling ? <span className="session-activity">stopping…</span> : null}
            {queued > 0 ? <span className="session-queued">{queued} queued</span> : null}
            <span className="session-date">{isRunning ? 'now' : date}</span>
          </span>
        </span>
      </button>
      <span className="session-actions">
        <IconButton
          label="Rename"
          onClick={() => {
            setDraft(session.title)
            setEditing(true)
          }}
        >
          <Icon name="pencil" size={12} />
        </IconButton>
        <IconButton label="Delete" onClick={() => onDeleteRequest(session)}>
          <Icon name="trash" size={12} />
        </IconButton>
      </span>
    </div>
  )
}

/** Real-time buckets only — conversations without timestamps stay ungrouped. */
function dayBucket(ts: number | undefined): 'today' | 'yesterday' | 'earlier' | 'none' {
  if (ts === undefined) return 'none'
  const day = 86_400_000
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  if (ts >= startOfToday) return 'today'
  if (ts >= startOfToday - day) return 'yesterday'
  return 'earlier'
}

const BUCKET_LABELS: Readonly<Record<'today' | 'yesterday' | 'earlier', string>> = {
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
}
const BUCKET_ORDER: readonly ('today' | 'yesterday' | 'earlier' | 'none')[] = ['today', 'yesterday', 'earlier', 'none']

function bucketedList(sessions: readonly SessionListing[]): ReturnType<typeof Object.entries<SessionListing[]>> {
  const buckets = new Map<string, SessionListing[]>()
  for (const session of sessions) {
    const bucket = dayBucket(session.updatedAt)
    const rows = buckets.get(bucket) ?? []
    rows.push(session)
    buckets.set(bucket, rows)
  }
  return BUCKET_ORDER.filter((bucket) => (buckets.get(bucket)?.length ?? 0) > 0).map((bucket) => [bucket, buckets.get(bucket) ?? []])
}

export function SessionList({
  sessions,
  projects,
  current,
  filter,
  liveRunning,
  onSelect,
  onRename,
  onDeleteRequest,
  onNewInProject,
}: {
  readonly sessions: readonly SessionListing[]
  readonly projects: readonly ProjectRow[]
  readonly current: string | null
  readonly filter: string
  readonly liveRunning: boolean
  readonly onSelect: (id: string) => void
  readonly onRename: (id: string, title: string) => void
  readonly onDeleteRequest: (session: SessionListing) => void
  readonly onNewInProject?: (projectId: string) => void
}) {
  const query = filter.trim().toLowerCase()
  const matches = (session: SessionListing): boolean => query === '' || session.title.toLowerCase().includes(query)
  // UI-local collapse state; sections start expanded, the one holding the
  // open session stays expanded.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const row = (session: SessionListing): React.ReactNode => (
    <li key={session.id}>
      <SessionRow
        session={session}
        active={session.id === current}
        liveRunning={liveRunning}
        onSelect={() => onSelect(session.id)}
        onRename={onRename}
        onDeleteRequest={onDeleteRequest}
      />
    </li>
  )

  const shown = sessions.filter(matches)
  if (shown.length === 0) {
    return <p className="session-empty">{query === '' ? 'No conversations yet' : 'No matching conversations'}</p>
  }

  // No projects → one bucketed list (the pre-sections behavior).
  if (projects.length === 0) {
    return (
      <ul className="session-list">
        {bucketedList(shown).map(([bucket, rows]) => (
          <li key={bucket} className="session-group">
            {bucket !== 'none' ? <div className="session-group-head">{BUCKET_LABELS[bucket as 'today']}</div> : null}
            <ul className="session-group-list">{rows.map(row)}</ul>
          </li>
        ))}
      </ul>
    )
  }

  const loose = shown.filter((session) => session.projectId === undefined || session.projectId === null)

  return (
    <ul className="session-list">
      {projects.map((project) => {
        const projectSessions = shown.filter((session) => session.projectId === project.id)
        if (projectSessions.length === 0) return null
        const runningCount = projectSessions.filter((session) => (session.status ?? 'idle') === 'running' || (session.id === current && liveRunning)).length
        const isCollapsed = collapsed[project.id] === true && !projectSessions.some((session) => session.id === current)
        return (
          <li key={project.id} className="session-group">
            <Collapsible.Root open={!isCollapsed} onOpenChange={(open) => setCollapsed((prev) => ({ ...prev, [project.id]: !open }))}>
              <div className="project-head">
                <Collapsible.Trigger className="project-head-btn">
                  <Icon name="chevronRight" size={11} className={isCollapsed ? 'chevron-down' : 'chevron-down chevron-rotated'} />
                  <span className="project-head-name">{project.name}</span>
                  {runningCount > 0 ? <span className="project-running">●{runningCount}</span> : null}
                  <span className="project-count">{projectSessions.length}</span>
                </Collapsible.Trigger>
                {onNewInProject !== undefined ? (
                  <IconButton label={`New conversation in ${project.name}`} onClick={() => onNewInProject(project.id)}>
                    <Icon name="plus" size={12} />
                  </IconButton>
                ) : null}
              </div>
              <Collapsible.Content><ul className="session-group-list">{projectSessions.map(row)}</ul></Collapsible.Content>
            </Collapsible.Root>
          </li>
        )
      })}
      {loose.length > 0 ? (
        <li className="session-group">
          <div className="session-group-head">CONVERSATIONS</div>
          {bucketedList(loose).map(([bucket, rows]) => (
            <div key={bucket}>
              {bucket !== 'none' ? <div className="session-group-head session-group-head-sub">{BUCKET_LABELS[bucket as 'today']}</div> : null}
              <ul className="session-group-list">{rows.map(row)}</ul>
            </div>
          ))}
        </li>
      ) : null}
    </ul>
  )
}
