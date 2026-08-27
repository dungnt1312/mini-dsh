import { useState } from 'react'
import Icon from '../common/Icon.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import type { SessionListing } from '../../lib/types.ts'

interface RowProps {
  readonly session: SessionListing
  readonly active: boolean
  readonly running: boolean
  readonly onSelect: () => void
  readonly onRename: (id: string, title: string) => void
  readonly onDeleteRequest: (session: SessionListing) => void
}

function SessionRow({ session, active, running, onSelect, onRename, onDeleteRequest }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.title)

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
          className="rename-input"
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
        <span className="session-text">
          <span className="session-title">{session.title || 'untitled session'}</span>
          <span className="session-sub">
            {session.eventCount} sự kiện{active && running ? ' · đang chạy' : ''}
          </span>
        </span>
      </button>
      <span className="session-actions">
        <IconButton
          label="Đổi tên"
          onClick={() => {
            setDraft(session.title)
            setEditing(true)
          }}
        >
          <Icon name="pencil" size={12} />
        </IconButton>
        <IconButton label="Xóa" onClick={() => onDeleteRequest(session)}>
          <Icon name="trash" size={12} />
        </IconButton>
      </span>
    </div>
  )
}

export function SessionList({
  sessions,
  current,
  filter,
  running,
  onSelect,
  onRename,
  onDeleteRequest,
}: {
  readonly sessions: readonly SessionListing[]
  readonly current: string | null
  readonly filter: string
  readonly running: boolean
  readonly onSelect: (id: string) => void
  readonly onRename: (id: string, title: string) => void
  readonly onDeleteRequest: (session: SessionListing) => void
}) {
  const query = filter.trim().toLowerCase()
  const shown = query === ''
    ? sessions
    : sessions.filter((s) => s.title.toLowerCase().includes(query))

  if (shown.length === 0) {
    return <p className="session-empty">{query === '' ? 'Chưa có phiên nào' : 'Không tìm thấy phiên nào'}</p>
  }

  return (
    <ul className="session-list">
      {shown.map((session) => (
        <li key={session.id}>
          <SessionRow
            session={session}
            active={session.id === current}
            running={running}
            onSelect={() => onSelect(session.id)}
            onRename={onRename}
            onDeleteRequest={onDeleteRequest}
          />
        </li>
      ))}
    </ul>
  )
}
