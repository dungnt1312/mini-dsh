import { useCallback, useEffect, useRef, useState } from 'react'
import { answerApproval, createSession, fetchMeta, listSessions, sendMessage, subscribeEvents, type StreamState } from './api.ts'
import { ApprovalBanner, Transcript } from './Transcript.tsx'
import type { PendingApproval, SessionListing, SseEvent } from './types.ts'

const SUGGESTIONS: readonly string[] = [
  'Liệt kê các file trong workspace này',
  'Tóm tắt kiến trúc của project bằng tiếng Việt',
  'Tìm chỗ có từ "tool" trong code rồi giải thích',
]

function connectionLabel(state: StreamState): string {
  switch (state) {
    case 'open':
      return 'stream live'
    case 'reconnecting':
      return 'reconnecting…'
    case 'connecting':
      return 'connecting…'
  }
}

/**
 * The web client: a session sidebar plus one chat pane. All chat state is
 * derived from the session event stream — the UI holds no model state of
 * its own, mirroring "render from session/event".
 */
export function App() {
  const [sessions, setSessions] = useState<readonly SessionListing[]>([])
  const [current, setCurrent] = useState<string | null>(null)
  const [events, setEvents] = useState<readonly SseEvent[]>([])
  const [approvals, setApprovals] = useState<readonly PendingApproval[]>([])
  const [draft, setDraft] = useState('')
  const [provider, setProvider] = useState<string | null>(null)
  const [stream, setStream] = useState<StreamState>('connecting')
  const [error, setError] = useState<string | null>(null)
  const seenSeq = useRef(0)

  useEffect(() => {
    void fetchMeta().then((meta) => setProvider(meta.provider)).catch(() => setProvider('unknown'))
    void (async () => {
      try {
        let listing = await listSessions()
        if (listing.length === 0) {
          await createSession()
          listing = await listSessions()
        }
        setSessions(listing)
        setCurrent((existing) => existing ?? listing[0]?.id ?? null)
      } catch (cause) {
        setError(String(cause))
      }
    })()
  }, [])

  useEffect(() => {
    if (current === null) return
    seenSeq.current = 0
    setEvents([])
    setApprovals([])
    setStream('connecting')
    const dispose = subscribeEvents(
      current,
      (envelope) => {
        if (envelope.kind === 'snapshot') {
          setEvents(envelope.events)
          seenSeq.current = envelope.events.at(-1)?.seq ?? 0
          return
        }
        if (envelope.kind === 'session') {
          const { event } = envelope
          if (event.seq <= seenSeq.current) return
          seenSeq.current = event.seq
          setEvents((prev) => [...prev, event])
          return
        }
        setApprovals((prev) => [...prev, { approvalId: envelope.approvalId, call: envelope.call }])
      },
      setStream,
    )
    return dispose
  }, [current])

  const refreshList = useCallback(async () => {
    try {
      setSessions(await listSessions())
    } catch (cause) {
      setError(String(cause))
    }
  }, [])

  const send = useCallback(async () => {
    if (current === null || draft.trim() === '') return
    const content = draft
    setDraft('')
    try {
      await sendMessage(current, content)
      void refreshList()
    } catch (cause) {
      setError(String(cause))
    }
  }, [current, draft, refreshList])

  const answer = useCallback(async (approvalId: string, allow: boolean) => {
    setApprovals((prev) => prev.filter((pending) => pending.approvalId !== approvalId))
    try {
      await answerApproval(approvalId, allow)
    } catch (cause) {
      setError(String(cause))
    }
  }, [])

  const newSession = useCallback(async () => {
    try {
      const { id } = await createSession()
      setSessions(await listSessions())
      setCurrent(id)
    } catch (cause) {
      setError(String(cause))
    }
  }, [])

  const activeTitle = sessions.find((session) => session.id === current)?.title ?? ''

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          mini-dsh<span className="accent">.web</span>
        </div>
        <button type="button" className="new-session" onClick={() => void newSession()}>
          <span aria-hidden="true">＋</span> new session
        </button>
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                className={`session-item ${session.id === current ? 'active' : ''}`}
                onClick={() => setCurrent(session.id)}
              >
                <span className="session-title">{session.title}</span>
                <span className="session-count">{session.eventCount}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="sidebar-foot">
          <span className={`conn-dot ${stream}`} aria-hidden="true" />
          <span className="conn-label">{connectionLabel(stream)}</span>
          {provider !== null ? <span className="provider-pill">{provider}</span> : null}
        </div>
      </aside>
      <main className="chat">
        <header className="chat-head">
          <h1 className="chat-title">{activeTitle || 'untitled session'}</h1>
          <div className="chat-head-right">
            <span className={`conn-dot ${stream}`} aria-hidden="true" />
            <span className="conn-label">{connectionLabel(stream)}</span>
            {provider !== null ? <span className="provider-pill">{provider}</span> : null}
          </div>
        </header>
        {error !== null ? <div className="error-bar" onClick={() => setError(null)}>{error}</div> : null}
        {events.length === 0 ? (
          <div className="empty">
            <div className="empty-mark" aria-hidden="true">⌬</div>
            <p className="empty-title">Bắt đầu một hội thoại</p>
            <p className="empty-sub">Agent đọc file, chạy bash và xin phép trước khi thay đổi.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="suggestion"
                  disabled={current === null}
                  onClick={() => {
                    void sendMessage(current ?? '', suggestion).then(() => void refreshList())
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Transcript events={events} />
        )}
        <ApprovalBanner approvals={approvals} onAnswer={(id, allow) => void answer(id, allow)} />
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <textarea
            className="composer-input"
            value={draft}
            rows={1}
            placeholder={current === null ? 'connecting…' : 'Nhắn tin cho agent…'}
            disabled={current === null}
            onChange={(event) => {
              setDraft(event.target.value)
              const el = event.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <button type="submit" className="send" disabled={draft.trim() === '' || current === null}>
            <span aria-hidden="true">↑</span>
          </button>
          <span className="composer-hint">enter để gửi · shift+enter xuống dòng</span>
        </form>
      </main>
    </div>
  )
}
