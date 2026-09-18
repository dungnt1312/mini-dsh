import * as Collapsible from '@radix-ui/react-collapsible'
import { useState, type ReactNode } from 'react'
import Icon from '../common/Icon.tsx'
import { Spinner } from '../common/Spinner.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Menu, menuItemClass } from '../ui/Menu.tsx'
import { cn } from '../../lib/cn.ts'
import type { ProjectRow, SessionListing } from '../../lib/types.ts'

interface RowProps {
  readonly session: SessionListing
  readonly active: boolean
  /** The open session's live turn state (fresher than the polled listing). */
  readonly liveRunning: boolean
  /** Another listed session has the same visible title. */
  readonly duplicateTitle: boolean
  readonly onSelect: () => void
  readonly onRename: (id: string, title: string) => void
  readonly onDeleteRequest: (session: SessionListing) => void
}

function SessionRow({ session, active, liveRunning, duplicateTitle, onSelect, onRename, onDeleteRequest }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.title)
  const status = session.status ?? 'idle'
  const isRunning = status === 'running' || (active && liveRunning)
  const cancelling = status === 'cancelling'
  const queued = session.pendingInputs ?? 0

  if (editing) {
    return (
      <form
        className="px-1 py-0.5"
        onSubmit={(event) => { event.preventDefault(); onRename(session.id, draft); setEditing(false) }}
      >
        <input
          aria-label="Conversation title"
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => { if (event.key === 'Escape') setEditing(false) }}
          className="h-9 w-full rounded-lg border border-line-strong bg-bg px-2.5 text-sm outline-none"
        />
      </form>
    )
  }

  return (
    <div className={cn('group relative flex items-center rounded-lg text-fg hover:bg-hover', active && 'bg-hover')}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        className="flex min-h-9 min-w-0 flex-1 items-center gap-2 py-1.5 pl-2.5 pr-9 text-left text-sm"
      >
        <span className="min-w-0 flex-1 truncate">{session.title || 'New conversation'}</span>
        {duplicateTitle ? <span className="shrink-0 font-mono text-[11px] text-fg-faint" title={`Conversation ID: ${session.id}`}>#{session.id.slice(-4)}</span> : null}
        {queued > 0 ? <span className="shrink-0 text-[11px] text-fg-faint">{queued} queued</span> : null}
        {isRunning ? (
          <span className="flex shrink-0 items-center" title={`Working with ${session.activity === 'tool' ? 'tool' : 'model'}`}>
            <Spinner size={11} />
            <span className="sr-only">working with {session.activity === 'tool' ? 'tool' : 'model'}</span>
          </span>
        ) : cancelling ? <span className="shrink-0 text-[11px] text-fg-faint">stopping…</span> : null}
      </button>
      <span className={cn('absolute right-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 [@media(pointer:coarse)]:opacity-100', active && 'opacity-100')}>
        <Menu
          label={`Options for ${session.title || 'conversation'}`}
          align="start"
          triggerClassName="flex size-7 items-center justify-center rounded-md text-fg-muted hover:text-fg"
          trigger={() => <Icon name="dots" size={16} />}
        >
          {(close) => (
            <>
              <button type="button" role="menuitem" className={menuItemClass} onClick={() => { close(); setDraft(session.title); setEditing(true) }}>
                <Icon name="pencil" size={15} className="text-fg-muted" />Rename
              </button>
              <button type="button" role="menuitem" className={cn(menuItemClass, 'text-bad')} onClick={() => { close(); onDeleteRequest(session) }}>
                <Icon name="trash" size={15} />Delete
              </button>
            </>
          )}
        </Menu>
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

const BUCKET_LABELS: Readonly<Record<'today' | 'yesterday' | 'earlier', string>> = { today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier' }
const BUCKET_ORDER = ['today', 'yesterday', 'earlier', 'none'] as const

function bucketed(sessions: readonly SessionListing[]): readonly (readonly [typeof BUCKET_ORDER[number], readonly SessionListing[]])[] {
  const buckets = new Map<typeof BUCKET_ORDER[number], SessionListing[]>()
  for (const session of sessions) {
    const bucket = dayBucket(session.updatedAt)
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), session])
  }
  return BUCKET_ORDER.filter((bucket) => (buckets.get(bucket)?.length ?? 0) > 0).map((bucket) => [bucket, buckets.get(bucket) ?? []] as const)
}

function GroupHead({ children }: { readonly children: ReactNode }) {
  return <div className="px-2.5 pb-1 pt-4 text-xs font-medium text-fg-faint">{children}</div>
}

export function SessionList({ sessions, projects, current, filter, liveRunning, onSelect, onRename, onDeleteRequest, onNewInProject }: {
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
  // UI-local collapse state; the group holding the open session stays expanded.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const query = filter.trim().toLowerCase()
  const shown = sessions.filter((session) => query === '' || session.title.toLowerCase().includes(query))
  const titleCounts = new Map<string, number>()
  for (const session of sessions) {
    const title = session.title.trim().toLocaleLowerCase()
    if (title !== '') titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1)
  }

  const rows = (list: readonly SessionListing[]): ReactNode => (
    <ul className="m-0 flex list-none flex-col gap-px p-0">
      {list.map((session) => (
        <li key={session.id}>
          <SessionRow
            session={session}
            active={session.id === current}
            liveRunning={liveRunning}
            duplicateTitle={(titleCounts.get(session.title.trim().toLocaleLowerCase()) ?? 0) > 1}
            onSelect={() => onSelect(session.id)}
            onRename={onRename}
            onDeleteRequest={onDeleteRequest}
          />
        </li>
      ))}
    </ul>
  )
  const timeline = (list: readonly SessionListing[]): ReactNode => bucketed(list).map(([bucket, group]) => (
    <div key={bucket}>
      {bucket !== 'none' ? <GroupHead>{BUCKET_LABELS[bucket]}</GroupHead> : null}
      {rows(group)}
    </div>
  ))

  if (shown.length === 0) {
    return <p className="m-0 px-2.5 py-4 text-sm text-fg-faint">{query === '' ? 'No conversations yet' : 'No matching conversations'}</p>
  }
  if (projects.length === 0) return <div className="flex flex-col">{timeline(shown)}</div>

  const loose = shown.filter((session) => session.projectId === undefined || session.projectId === null)
  return (
    <div className="flex flex-col">
      {projects.map((project) => {
        const projectSessions = shown.filter((session) => session.projectId === project.id)
        if (projectSessions.length === 0) return null
        const runningCount = projectSessions.filter((session) => (session.status ?? 'idle') === 'running' || (session.id === current && liveRunning)).length
        const isCollapsed = collapsed[project.id] === true && !projectSessions.some((session) => session.id === current)
        return (
          <Collapsible.Root key={project.id} open={!isCollapsed} onOpenChange={(open) => setCollapsed((prev) => ({ ...prev, [project.id]: !open }))} className="mt-3 first:mt-1">
            <div className="group flex items-center rounded-lg hover:bg-hover">
              <Collapsible.Trigger className="flex min-h-9 min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-sm font-medium">
                <Icon name="folder" size={15} className="shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {runningCount > 0 ? <span className="flex items-center gap-1 text-[11px] font-normal text-fg-faint"><Spinner size={10} />{runningCount}<span className="sr-only">running</span></span> : null}
                <span className="text-[11px] font-normal text-fg-faint">{projectSessions.length}</span>
                <Icon name="chevronRight" size={13} className={cn('shrink-0 text-fg-faint transition-transform', !isCollapsed && 'rotate-90')} />
              </Collapsible.Trigger>
              {onNewInProject !== undefined ? (
                <IconButton label={`New conversation in ${project.name}`} className="mr-0.5 size-7 opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(pointer:coarse)]:opacity-100" onClick={() => onNewInProject(project.id)}>
                  <Icon name="plus" size={15} />
                </IconButton>
              ) : null}
            </div>
            <Collapsible.Content className="ml-3 border-l border-line pl-1.5">{rows(projectSessions)}</Collapsible.Content>
          </Collapsible.Root>
        )
      })}
      {loose.length > 0 ? (
        <div className="mt-2">
          <GroupHead>Chats</GroupHead>
          {timeline(loose)}
        </div>
      ) : null}
    </div>
  )
}
