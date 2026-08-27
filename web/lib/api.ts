import type { Envelope, Meta, ProviderInput, ProviderSummary, SessionListing } from './types.ts'

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }
  return (await response.json()) as T
}

export function listSessions(): Promise<SessionListing[]> {
  return fetch('/api/sessions').then((r) => json<SessionListing[]>(r))
}

export function createSession(folder?: string): Promise<{ id: string; folder?: string }> {
  return fetch('/api/sessions', {
    method: 'POST',
    ...(folder !== undefined ? {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder }),
    } : {}),
  }).then((r) => json<{ id: string; folder?: string }>(r))
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

/** Set this session's workspace; an empty path resets it to server default. */
export function setSessionFolder(sessionId: string, path: string): Promise<{ folder: string | null }> {
  return fetch(`/api/sessions/${encodeURIComponent(sessionId)}/folder`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  }).then((r) => json<{ folder: string | null }>(r))
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

/** Server-side metadata: active pair, default folder, safe provider list. */
export function fetchMeta(): Promise<Meta> {
  return fetch('/api/meta').then((r) => json<Meta>(r))
}

/** Select an exact provider/model pair. Omit provider only for legacy callers. */
export function setModel(model: string, provider?: string): Promise<Meta> {
  return fetch('/api/model', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, ...(provider !== undefined ? { provider } : {}) }),
  }).then((r) => json<{ model: string }>(r)).then(() => fetchMeta())
}

/** Switch the default workspace inherited by sessions without their own path. */
export function setFolder(path: string): Promise<Meta> {
  return fetch('/api/folder', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  }).then((r) => json<{ folder: string }>(r)).then(() => fetchMeta())
}

export function listProviders(): Promise<ProviderSummary[]> {
  return fetch('/api/providers').then((r) => json<ProviderSummary[]>(r))
}

export function createProvider(input: Required<Pick<ProviderInput, 'name' | 'baseUrl' | 'apiKey'>> & ProviderInput): Promise<ProviderSummary> {
  return fetch('/api/providers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then((r) => json<ProviderSummary>(r))
}

export function updateProvider(id: string, input: ProviderInput): Promise<ProviderSummary> {
  return fetch(`/api/providers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then((r) => json<ProviderSummary>(r))
}

export function deleteProvider(id: string): Promise<{ deleted: boolean }> {
  return fetch(`/api/providers/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => json<{ deleted: boolean }>(r))
}

export function syncProvider(id: string): Promise<{ ok: boolean; models: string[] }> {
  return fetch(`/api/providers/${encodeURIComponent(id)}/sync`, { method: 'POST' }).then((r) =>
    json<{ ok: boolean; models: string[] }>(r),
  )
}

export function testProvider(id: string): Promise<{ ok: boolean; error?: string }> {
  return fetch(`/api/providers/${encodeURIComponent(id)}/test`, { method: 'POST' }).then((r) => json<{ ok: boolean; error?: string }>(r))
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
