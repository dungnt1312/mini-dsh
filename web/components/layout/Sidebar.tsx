import * as Popover from '@radix-ui/react-popover'
import { useRef, useState } from 'react'
import Icon from '../common/Icon.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Kbd } from '../ui/Kbd.tsx'
import { Menu, menuItemClass } from '../ui/Menu.tsx'
import { SessionList } from '../session/SessionList.tsx'
import { WorkspacePopover } from './WorkspacePopover.tsx'
import { useHotkeys } from '../../hooks/useHotkeys.ts'
import { cn } from '../../lib/cn.ts'
import type { ThemePreference } from '../../lib/theme.ts'
import type { ProjectRow, SessionListing, SessionSort, WorkspaceRow } from '../../lib/types.ts'

const THEME_OPTIONS: readonly { readonly value: ThemePreference; readonly label: string; readonly icon: 'monitor' | 'sun' | 'moon' }[] = [
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
]

const SORT_OPTIONS: readonly { readonly value: SessionSort; readonly label: string }[] = [
  { value: 'recent', label: 'Recent activity' },
  { value: 'oldest', label: 'Oldest activity' },
  { value: 'title', label: 'Title A–Z' },
]

/** Recency default keeps the server's listing order; the rest sort explicitly. */
function orderedSessions(sessions: readonly SessionListing[], sort: SessionSort, runningOnly: boolean, current: string | null, liveRunning: boolean): readonly SessionListing[] {
  const visible = runningOnly
    ? sessions.filter((session) => (session.status ?? 'idle') === 'running' || (session.id === current && liveRunning))
    : sessions
  const sorted = [...visible]
  sorted.sort((a, b) => {
    if (sort === 'title') return (a.title || 'New conversation').localeCompare(b.title || 'New conversation')
    const ta = a.updatedAt ?? 0
    const tb = b.updatedAt ?? 0
    return sort === 'oldest' ? ta - tb : tb - ta
  })
  return sorted
}

const rowClass = 'flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-fg hover:bg-hover disabled:pointer-events-none disabled:opacity-40'

export interface SidebarProps {
  readonly sessions: readonly SessionListing[]
  readonly projects: readonly ProjectRow[]
  readonly current: string | null
  readonly filter: string
  readonly running: boolean
  readonly workspaces: readonly WorkspaceRow[]
  readonly activeWorkspaceId: string | null
  readonly newWorkspaceName: string
  readonly onNewWorkspaceName: (value: string) => void
  readonly onSelectWorkspace: (id: string) => void
  readonly onCreateWorkspace: () => void
  readonly onWorkspacesChanged: () => Promise<void>
  readonly onFilter: (value: string) => void
  readonly onSelect: (id: string) => void
  readonly onNew: () => void
  readonly onNewInProject: (projectId: string) => void
  readonly onReorderProjects?: (orderedIds: readonly string[]) => void
  readonly onRename: (id: string, title: string) => void
  readonly onDeleteRequest: (session: SessionListing) => void
  readonly onOpenSettings: () => void
  readonly notifyEnabled: boolean
  readonly notifyBlocked: boolean
  readonly onToggleNotify: () => void
  readonly theme: ThemePreference
  readonly onTheme: (theme: ThemePreference) => void
  readonly onClose: () => void
}

/**
 * Conversation navigation: new chat + search, project-grouped history, and a
 * footer owning workspace switching, notifications, appearance and Settings.
 * An archived workspace disables New and shows one quiet note.
 */
export function Sidebar(props: SidebarProps) {
  const { sessions, projects, current, filter, running, workspaces, activeWorkspaceId, onFilter, onSelect, onNew, onNewInProject, onRename, onDeleteRequest, onClose } = props
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [sort, setSort] = useState<SessionSort>('recent')
  const [runningOnly, setRunningOnly] = useState(false)
  const active = workspaces.find((row) => row.id === activeWorkspaceId) ?? null
  const archived = active?.archived === true
  const approvals = active?.approvals ?? 0
  const listed = orderedSessions(sessions, sort, runningOnly, current, running)
  const sortAdjusted = runningOnly || sort !== 'recent'

  useHotkeys([{ key: 'k', mod: true, onPress: () => searchRef.current?.focus() }])

  return (
    <nav aria-label="Conversations and projects" className="flex h-full min-h-0 w-full flex-col bg-sidebar text-fg">
      <div className="flex h-14 shrink-0 items-center justify-between px-3">
        <span className="px-1.5 text-[15px] font-semibold tracking-tight">mini-dsh</span>
        <IconButton label="Close sidebar" size="md" onClick={onClose}><Icon name="panelLeft" size={18} /></IconButton>
      </div>

      <div className="flex shrink-0 flex-col gap-px px-2">
        <button type="button" className={rowClass} onClick={onNew} disabled={archived} title={archived ? 'Workspace is archived' : undefined}>
          <Icon name="squarePen" size={17} />
          <span className="flex-1">New conversation</span>
          <Kbd>Ctrl N</Kbd>
        </button>
        <label className={cn(rowClass, 'cursor-text focus-within:bg-hover')}>
          <Icon name="search" size={17} />
          <input
            ref={searchRef}
            value={filter}
            aria-label="Search conversations"
            placeholder="Search conversations"
            onChange={(event) => onFilter(event.target.value)}
            className="h-9 min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg"
          />
          {filter !== '' ? (
            <button type="button" aria-label="Clear search" className="text-fg-faint hover:text-fg" onClick={() => onFilter('')}><Icon name="close" size={14} /></button>
          ) : <Kbd>Ctrl K</Kbd>}
        </label>
        {archived ? (
          <p className="m-0 mt-1 flex items-start gap-2 rounded-lg bg-warn-soft px-2.5 py-2 text-xs text-warn" role="note">
            <Icon name="archive" size={14} className="mt-px" />
            <span>
              Workspace archived. Restore it from{' '}
              <button type="button" className="underline underline-offset-2" onClick={() => setWorkspaceOpen(true)}>the workspace switcher</button>.
            </span>
          </p>
        ) : null}
        <div className="mt-1 flex h-8 shrink-0 items-center justify-between px-2">
          <span className="px-2.5 text-xs font-medium text-fg-faint">Conversations</span>
          <Menu
            label="Sort and filter conversations"
            side="bottom"
            align="end"
            panelClassName="w-60"
            triggerClassName={cn('flex size-8 items-center justify-center rounded-lg hover:bg-hover', sortAdjusted ? 'text-fg' : 'text-fg-muted hover:text-fg')}
            trigger={() => <Icon name="funnel" size={15} />}
          >
            {(close) => (
              <>
                <div className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-fg-faint">Sort</div>
                {SORT_OPTIONS.map((option) => (
                  <button key={option.value} type="button" role="menuitemradio" aria-checked={sort === option.value} className={menuItemClass} onClick={() => { setSort(option.value); close() }}>
                    <span className="flex-1">{option.label}</span>
                    {sort === option.value ? <Icon name="check" size={15} /> : null}
                  </button>
                ))}
                <div className="my-1 h-px bg-line" />
                <div className="px-2.5 pb-1 text-xs font-medium text-fg-faint">Filter</div>
                <button type="button" role="menuitemcheckbox" aria-checked={runningOnly} className={menuItemClass} onClick={() => setRunningOnly((value) => !value)}>
                  <span className="flex flex-1 flex-col">
                    <span>Running only</span>
                    <span className="text-xs text-fg-faint">Conversations with an active turn</span>
                  </span>
                  {runningOnly ? <Icon name="check" size={15} /> : null}
                </button>
              </>
            )}
          </Menu>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1">
        <SessionList
          sessions={listed}
          projects={projects}
          current={current}
          filter={filter}
          liveRunning={running}
          sort={sort}
          {...(runningOnly && filter.trim() === '' ? { emptyLabel: 'No running conversations' } : {})}
          onSelect={onSelect}
          onRename={onRename}
          onDeleteRequest={onDeleteRequest}
          onNewInProject={onNewInProject}
          {...(props.onReorderProjects !== undefined ? { onReorder: props.onReorderProjects } : {})}
        />
      </div>

      <div className="flex shrink-0 items-center gap-0.5 border-t border-line p-2">
        <Popover.Root open={workspaceOpen} onOpenChange={setWorkspaceOpen}>
          <Popover.Trigger className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left hover:bg-hover" aria-label={`Workspace: ${active?.name ?? 'none'}`}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold uppercase text-primary-fg" aria-hidden="true">
              {(active?.name ?? 'w').slice(0, 1)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm">{active?.name ?? 'workspace'}</span>
              <span className="truncate text-[11px] text-fg-faint">
                {approvals > 0 ? `${approvals} approval${approvals === 1 ? '' : 's'} pending` : archived ? 'Archived' : 'Workspace'}
              </span>
            </span>
            {approvals > 0 ? <span className="size-2 shrink-0 rounded-full bg-warn" aria-hidden="true" /> : null}
            <Icon name="chevron" size={14} className="shrink-0 rotate-180 text-fg-faint" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="top" align="start" sideOffset={6} collisionPadding={12} className="z-50 w-[min(340px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-1.5 text-fg shadow-pop outline-none animate-fade-up">
              <WorkspacePopover
                workspaces={workspaces}
                activeWorkspaceId={activeWorkspaceId}
                onSelect={(id) => { props.onSelectWorkspace(id); setWorkspaceOpen(false) }}
                onChanged={props.onWorkspacesChanged}
                newWorkspaceName={props.newWorkspaceName}
                onNewWorkspaceName={props.onNewWorkspaceName}
                onCreate={() => { props.onCreateWorkspace(); setWorkspaceOpen(false) }}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <Menu
          label="Preferences"
          side="top"
          align="end"
          panelClassName="w-64"
          triggerClassName="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-hover hover:text-fg"
          trigger={() => <Icon name={THEME_OPTIONS.find((option) => option.value === props.theme)?.icon ?? 'monitor'} size={17} />}
        >
          {(close) => (
            <>
              <div className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-fg-faint">Appearance</div>
              {THEME_OPTIONS.map((option) => (
                <button key={option.value} type="button" role="menuitemradio" aria-checked={props.theme === option.value} className={menuItemClass} onClick={() => { props.onTheme(option.value); close() }}>
                  <Icon name={option.icon} size={15} className="text-fg-muted" />
                  <span className="flex-1">{option.label}</span>
                  {props.theme === option.value ? <Icon name="check" size={15} /> : null}
                </button>
              ))}
              <div className="my-1 h-px bg-line" />
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={props.notifyEnabled}
                disabled={props.notifyBlocked}
                className={menuItemClass}
                onClick={props.onToggleNotify}
              >
                <Icon name="bell" size={15} className="text-fg-muted" />
                <span className="flex flex-1 flex-col">
                  <span>Approval notifications</span>
                  <span className="text-xs text-fg-faint">{props.notifyBlocked ? 'Denied in the browser' : 'Alerts while this tab is in the background'}</span>
                </span>
                {props.notifyEnabled ? <Icon name="check" size={15} /> : null}
              </button>
            </>
          )}
        </Menu>
        <IconButton label="Open settings" onClick={props.onOpenSettings}><Icon name="sliders" size={17} /></IconButton>
      </div>
    </nav>
  )
}
