import { useEffect, useRef, useState } from 'react'
import { subscribeEvents, type StreamState } from '../lib/api.ts'
import type { PendingApproval, SseEvent } from '../lib/types.ts'

/**
 * Live projection of one session: snapshot replay plus `session/event`
 * frames, deduplicated by `seq`, with pending approval questions surfaced
 * apart from the log (they ride the same stream but are not log facts).
 */
export function useSessionStream(sessionId: string | null) {
  const [events, setEvents] = useState<readonly SseEvent[]>([])
  const [approvals, setApprovals] = useState<readonly PendingApproval[]>([])
  const [stream, setStream] = useState<StreamState>('connecting')
  const [error, setError] = useState<string | null>(null)
  const seenSeq = useRef(0)

  useEffect(() => {
    if (sessionId === null) return
    seenSeq.current = 0
    setEvents([])
    setApprovals([])
    setStream('connecting')
    setError(null)
    const dispose = subscribeEvents(
      sessionId,
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
        if (envelope.kind === 'error') {
          setError(envelope.message)
          return
        }
        setApprovals((prev) => [...prev, { approvalId: envelope.approvalId, call: envelope.call }])
      },
      setStream,
    )
    return dispose
  }, [sessionId])

  return { events, approvals, stream, error }
}
