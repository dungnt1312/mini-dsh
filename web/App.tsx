import { useCallback, useEffect, useRef, useState } from 'react'
import { answerApproval, createSession, listSessions, sendMessage, subscribeEvents } from './api.ts'
import { ApprovalBanner, Transcript } from './Transcript.tsx'
import type { PendingApproval, SessionListing, SseEvent } from './types.ts'

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
  const [error, setError] = useState<string | null>(null)
  const seenSeq = useRef(0)

  useEffect(() => {
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
    const dispose = subscribeEvents(current, (envelope) => {
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
    })
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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          mini-dsh<span className="accent">.web</span>
        </div>
        <button type="button" className="new-session" onClick={() => void newSession()}>
          + new session
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
      </aside>
      <main className="chat">
        {error !== null ? <div className="error-bar" onClick={() => setError(null)}>{error}</div> : null}
        <Transcript events={events} />
        <ApprovalBanner approvals={approvals} onAnswer={(id, allow) => void answer(id, allow)} />
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <input
            value={draft}
            placeholder={current === null ? 'connecting…' : 'message the agent'}
            disabled={current === null}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" disabled={draft.trim() === '' || current === null}>
            send
          </button>
        </form>
      </main>
    </div>
  )
}
