import type { Envelope, Meta, SessionListing } from './types.ts'

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

export function deleteSession(sessionId: string): Promise<{ deleted: boolean }> {
  return fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).then((r) =>
    json<{ deleted: boolean }>(r),
  )
}

export function renameSession(sessionId: string, title: string): Promise<{ id: string; title: string }> {
  return fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  }).then((r) => json<{ id: string; title: string }>(r))
}

export function stopSession(sessionId: string): Promise<{ stopped: boolean }> {
  return fetch(`/api/sessions/${encodeURIComponent(sessionId)}/stop`, { method: 'POST' }).then((r) =>
    json<{ stopped: boolean }>(r),
  )
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

/** Server-side metadata: provider, active model, and workspace folder. */
export function fetchMeta(): Promise<Meta> {
  return fetch('/api/meta').then((r) => json<Meta>(r))
}

/** Switch the active model; rejects with the available list on an unknown name. */
export function setModel(model: string): Promise<Meta> {
  return fetch('/api/model', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model }),
  }).then((r) => json<{ model: string }>(r)).then(() => fetchMeta())
}

/** Switch the workspace folder the tools are confined to. */
export function setFolder(path: string): Promise<Meta> {
  return fetch('/api/folder', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  }).then((r) => json<{ folder: string }>(r)).then(() => fetchMeta())
}

/** Live connection state of one session's event stream. */
export type StreamState = 'connecting' | 'open' | 'reconnecting'

/**
 * Subscribe to one session's event stream. `onState` reports the EventSource
 * lifecycle (initial connect, open, and the automatic reconnect on drop).
 * Returns a disposer closing the source; the browser reconnects on its own
 * until then.
 */
export function subscribeEvents(
  sessionId: string,
  onEnvelope: (envelope: Envelope) => void,
  onState?: (state: StreamState) => void,
): () => void {
  const source = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events`)
  source.onopen = () => onState?.('open')
  source.onerror = () => {
    onState?.(source.readyState === EventSource.CONNECTING ? 'reconnecting' : 'connecting')
  }
  source.onmessage = (message: MessageEvent<string>) => {
    onEnvelope(JSON.parse(message.data) as Envelope)
  }
  return () => {
    source.close()
  }
}
