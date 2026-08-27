import { useEffect, useRef } from 'react'
import Icon from '../common/Icon.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Kbd } from '../ui/Kbd.tsx'
import { SessionList } from '../session/SessionList.tsx'
import { useHotkeys } from '../../hooks/useHotkeys.ts'
import type { StreamState } from '../../lib/api.ts'
import type { SessionListing } from '../../lib/types.ts'

const STREAM_LABELS: Readonly<Record<StreamState, string>> = {
  open: 'connected',
  reconnecting: 'reconnecting…',
  connecting: 'connecting…',
}

/**
 * Navigation rail: new-session + search actions, every session inside one
 * workspace group (the API has no per-session folder), connection footer.
 * Owns the Ctrl/Cmd+K focus-search hotkey because it owns the input.
 */
export function Sidebar({
  sessions,
  current,
  filter,
  stream,
  provider,
  folderLabel,
  running,
  open,
  onFilter,
  onSelect,
  onNew,
  onRename,
  onDeleteRequest,
  onClose,
}: {
  readonly sessions: readonly SessionListing[]
  readonly current: string | null
  readonly filter: string
  readonly stream: StreamState
  readonly provider: string | null
  readonly folderLabel: string
  readonly running: boolean
  readonly open: boolean
  readonly onFilter: (value: string) => void
  readonly onSelect: (id: string) => void
  readonly onNew: () => void
  readonly onRename: (id: string, title: string) => void
  readonly onDeleteRequest: (session: SessionListing) => void
  readonly onClose: () => void
}) {
  const searchRef = useRef<HTMLInputElement | null>(null)

  useHotkeys([{ key: 'k', mod: true, onPress: () => searchRef.current?.focus() }])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {open ? <div className="pane-scrim" onClick={onClose} aria-hidden="true" /> : null}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="side-top">
          <button type="button" className="new-session" onClick={onNew}>
            <Icon name="plus" size={13} />
            <span>New chat</span>
            <Kbd>Ctrl N</Kbd>
          </button>
          <div className="session-filter">
            <Icon name="search" size={13} />
            <input
              ref={searchRef}
              className="filter-input"
              value={filter}
              placeholder="Search"
              onChange={(event) => onFilter(event.target.value)}
            />
            {filter !== '' ? (
              <IconButton label="Xóa tìm kiếm" onClick={() => onFilter('')}>
                <Icon name="close" size={11} />
              </IconButton>
            ) : (
              <Kbd>Ctrl K</Kbd>
            )}
          </div>
        </div>

        <div className="group-head">
          <Icon name="chevronRight" size={11} />
          <span className="group-name">{folderLabel !== '' ? folderLabel.toUpperCase() : 'SESSIONS'}</span>
          <Icon name="plus" size={11} className="group-add" />
        </div>

        <SessionList
          sessions={sessions}
          current={current}
          filter={filter}
          running={running}
          onSelect={onSelect}
          onRename={onRename}
          onDeleteRequest={onDeleteRequest}
        />

        <div className="side-foot">
          <span className={`conn-dot ${stream}`} aria-hidden="true" />
          <span className="foot-provider">{provider ?? '—'}</span>
          <span className="foot-state">{STREAM_LABELS[stream]}</span>
          <IconButton label="Đóng" className="sidebar-close" onClick={onClose}>
            <Icon name="close" size={13} />
          </IconButton>
        </div>
      </aside>
    </>
  )
}
