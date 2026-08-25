import type { Envelope, SessionListing } from './types.ts'

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }
  return (await response.json()) as T
}

export function listSessions(): Promise<SessionListing[]> {
  return fetch('/api/sessions').then((r) => json<SessionListing[]>(r))
}

export function createSession(): Promise<{ id: string }> {
  return fetch('/api/sessions', { method: 'POST' }).then((r) => json<{ id: string }>(r))
}

export function sendMessage(sessionId: string, content: string): Promise<void> {
  return fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  }).then((r) => json<{ queued: boolean }>(r)).then(() => undefined)
}

export function answerApproval(approvalId: string, allow: boolean): Promise<void> {
  return fetch(`/api/approvals/${encodeURIComponent(approvalId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ allow }),
  }).then((r) => json<{ answered: boolean }>(r)).then(() => undefined)
}

/**
 * Subscribe to one session's event stream. Returns a disposer closing the
 * `EventSource`; the browser reconnects on its own until then.
 */
export function subscribeEvents(sessionId: string, onEnvelope: (envelope: Envelope) => void): () => void {
  const source = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events`)
  source.onmessage = (message: MessageEvent<string>) => {
    onEnvelope(JSON.parse(message.data) as Envelope)
  }
  return () => {
    source.close()
  }
}
