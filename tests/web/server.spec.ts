/**
 * The web host half: REST endpoints, the SSE stream (snapshot replay plus
 * live events), and the approval bridge routing questions to the right
 * session through the ambient agent scope.
 */
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  MockLlmProvider,
  createWebServer,
  type WebEnvelope,
  type WebServer,
} from 'mini-dsh'

let root = ''
let server: WebServer
let baseUrl = ''

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'mini-dsh-web-'))
})

afterAll(async () => {
  await server?.close()
  await fs.rm(root, { recursive: true, force: true })
})

/** Start a server with the scripted provider against the temp workspace. */
async function start(steps: readonly (string | { toolCalls: readonly { name: string; args: Record<string, unknown> }[] })[]): Promise<void> {
  server = await createWebServer({ root, provider: new MockLlmProvider(steps) })
  baseUrl = server.url
}

/** One persistent SSE reader: reusable `until` calls share the stream. */
class SseReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>
  private readonly decoder = new TextDecoder()
  private buffer = ''

  constructor(response: Response) {
    const body = response.body
    if (body === null) throw new Error('test setup: no SSE body')
    this.reader = body.getReader()
  }

  /** Read until `until` matches; returns everything seen on this call. */
  async until(until: (envelope: WebEnvelope) => boolean, timeoutMs = 5_000): Promise<WebEnvelope[]> {
    const seen: WebEnvelope[] = []
    const deadline = Date.now() + timeoutMs
    while (true) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        throw new Error(`timeout waiting for envelope; saw ${JSON.stringify(seen.map((e) => e.kind))}`)
      }
      const chunk = await Promise.race([
        this.reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), remaining)),
      ])
      if (chunk.done) return seen
      this.buffer += this.decoder.decode(chunk.value, { stream: true })
      let boundary = this.buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const frame = this.buffer.slice(0, boundary)
        this.buffer = this.buffer.slice(boundary + 2)
        boundary = this.buffer.indexOf('\n\n')
        const dataLine = frame.split('\n').find((line) => line.startsWith('data: '))
        if (dataLine === undefined) continue
        const envelope = JSON.parse(dataLine.slice('data: '.length)) as WebEnvelope
        seen.push(envelope)
        if (until(envelope)) return seen
      }
    }
  }
}

/** POST JSON and return the response, failing loud on 5xx transport errors. */
async function post(pathname: string, body?: unknown): Promise<Response> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }
  return fetch(`${baseUrl}${pathname}`, init)
}

describe('web server', () => {
  it('creates and lists sessions, deriving a title from the first message', async () => {
    await start(['hello there'])
    const created = await post('/api/sessions')
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }

    const listed = (await (await fetch(`${baseUrl}/api/sessions`)).json()) as Array<{ id: string; title: string }>
    expect(listed.map((s) => s.id)).toContain(id)
    expect(listed.find((s) => s.id === id)?.title).toBe('new session')

    await post(`/api/sessions/${id}/messages`, { content: 'first question' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const titled = (await (await fetch(`${baseUrl}/api/sessions`)).json()) as Array<{ id: string; title: string }>
    expect(titled.find((s) => s.id === id)?.title).toBe('first question')
  })

  it('streams snapshot then live events, ending with a completed turn', async () => {
    await start(['the reply'])
    const { id } = (await (await post('/api/sessions')).json()) as { id: string }

    const sse = new SseReader(await fetch(`${baseUrl}/api/sessions/${id}/events`))
    void post(`/api/sessions/${id}/messages`, { content: 'hello' })
    const envelopes = await sse.until(
      (envelope) => envelope.kind === 'session' && envelope.event.type === 'turn/end',
    )

    expect(envelopes[0]?.kind).toBe('snapshot')
    // Streaming chunks are collapsed: their count is a provider detail.
    const kinds = envelopes
      .filter((e) => e.kind === 'session' && e.event.type !== 'assistant/chunk')
      .map((e) => (e.kind === 'session' ? e.event.type : ''))
    expect(kinds).toEqual([
      'turn/start',
      'step/start',
      'user/message',
      'assistant/message',
      'step/end',
      'turn/end',
    ])
    const chunks = envelopes.filter((e) => e.kind === 'session' && e.event.type === 'assistant/chunk')
    expect(chunks.length).toBeGreaterThan(0)
  })

  it('an approval question rides the stream; allowing it completes the tool round-trip', async () => {
    await start([
      { toolCalls: [{ name: 'write', args: { path: 'approved.txt', content: 'data' } }] },
      'written and verified',
    ])
    const { id } = (await (await post('/api/sessions')).json()) as { id: string }

    const sse = new SseReader(await fetch(`${baseUrl}/api/sessions/${id}/events`))
    void post(`/api/sessions/${id}/messages`, { content: 'write the file' })
    const approvalFrame = await sse.until((envelope) => envelope.kind === 'approval')
    const question = approvalFrame.find((e) => e.kind === 'approval')
    expect(question?.kind === 'approval' && question.call.name).toBe('write')

    const allow = await post(`/api/approvals/${question?.kind === 'approval' ? question.approvalId : ''}`, { allow: true })
    expect(allow.status).toBe(200)

    const rest = await sse.until((envelope) => envelope.kind === 'session' && envelope.event.type === 'turn/end')
    const toolResult = rest.find((e) => e.kind === 'session' && e.event.type === 'tool/result')
    expect(toolResult?.kind === 'session' && toolResult.event.type === 'tool/result' && toolResult.event.ok).toBe(true)
    const content = await fs.readFile(path.join(root, 'approved.txt'), 'utf8')
    expect(content).toBe('data')
  })

  it('denying an approval surfaces the reason as a failed tool result', async () => {
    await start([
      { toolCalls: [{ name: 'write', args: { path: 'blocked.txt', content: 'x' } }] },
      'acknowledged',
    ])
    const { id } = (await (await post('/api/sessions')).json()) as { id: string }

    const sse = new SseReader(await fetch(`${baseUrl}/api/sessions/${id}/events`))
    void post(`/api/sessions/${id}/messages`, { content: 'try to write' })
    const approvalFrame = await sse.until((envelope) => envelope.kind === 'approval')
    const question = approvalFrame.find((e) => e.kind === 'approval')

    await post(`/api/approvals/${question?.kind === 'approval' ? question.approvalId : ''}`, { allow: false })

    const rest = await sse.until((envelope) => envelope.kind === 'session' && envelope.event.type === 'turn/end')
    const toolResult = rest.find((e) => e.kind === 'session' && e.event.type === 'tool/result')
    expect(toolResult?.kind === 'session' && toolResult.event.type === 'tool/result' && toolResult.event.ok).toBe(false)
    expect(toolResult?.kind === 'session' && toolResult.event.type === 'tool/result' && toolResult.event.output).toMatch(
      /the user denied 'write'/,
    )
    await expect(fs.readFile(path.join(root, 'blocked.txt'), 'utf8')).rejects.toThrow(/ENOENT/)
  })

  it('a second answer to a settled approval is a 404', async () => {
    await start([{ toolCalls: [{ name: 'write', args: { path: 'once.txt', content: 'x' } }] }, 'done'])
    const { id } = (await (await post('/api/sessions')).json()) as { id: string }

    const sse = new SseReader(await fetch(`${baseUrl}/api/sessions/${id}/events`))
    void post(`/api/sessions/${id}/messages`, { content: 'go' })
    const approvalFrame = await sse.until((envelope) => envelope.kind === 'approval')
    const question = approvalFrame.find((e) => e.kind === 'approval')
    const approvalId = question?.kind === 'approval' ? question.approvalId : ''

    expect((await post(`/api/approvals/${approvalId}`, { allow: true })).status).toBe(200)
    expect((await post(`/api/approvals/${approvalId}`, { allow: true })).status).toBe(404)
  })

  it('a fresh SSE connection replays the full log as a snapshot', async () => {
    await start(['reply one'])
    const { id } = (await (await post('/api/sessions')).json()) as { id: string }
    await post(`/api/sessions/${id}/messages`, { content: 'hello' })
    await new Promise((resolve) => setTimeout(resolve, 150))

    const sse = new SseReader(await fetch(`${baseUrl}/api/sessions/${id}/events`))
    const envelopes = await sse.until((envelope) => envelope.kind === 'snapshot')
    const snapshot = envelopes[0]
    expect(snapshot?.kind === 'snapshot' && snapshot.events.map((e) => e.type)).toContain('assistant/message')
  })

  it('unknown routes and sessions fail loud', async () => {
    await start(['x'])
    expect((await fetch(`${baseUrl}/api/nope`)).status).toBe(404)
    expect((await fetch(`${baseUrl}/api/sessions/missing/events`)).status).toBe(404)
    const bad = await post(`/api/sessions/missing/messages`, { content: 'hi' })
    expect(bad.status).toBe(404)
  })
})
