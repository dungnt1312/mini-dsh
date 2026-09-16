/**
 * G3 server behaviors: the live mode control (validated selection, cached
 * definition), the exposure ceiling denying stale-batch calls, Chat sending
 * no tool schemas, mid-Turn mode switches gating the NEXT call, and the
 * manifest endpoint.
 */
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createWebServer, type LlmProvider, type WebServer } from 'mini-dsh'

let root = ''
const servers: WebServer[] = []

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'mini-dsh-g3-web-'))
})

afterAll(async () => {
  for (const server of servers) await server.close().catch(() => {})
  await fs.rm(root, { recursive: true, force: true })
})

async function start(providers: readonly LlmProvider[]): Promise<WebServer> {
  const home = await fs.mkdtemp(path.join(tmpdir(), 'mini-dsh-g3-home-'))
  const server = await createWebServer({ home, providers, configFile: path.join(home, 'p.json') })
  servers.push(server)
  return server
}

async function post(base: string, pathname: string, body?: unknown): Promise<Response> {
  return fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

/** Connect, read the snapshot, return event types (cancel the stream). */
async function snapshotTypes(base: string, wsId: string, sessionId: string): Promise<string[]> {
  const response = await fetch(`${base}/api/workspaces/${wsId}/sessions/${sessionId}/events`)
  const reader = (response.body as ReadableStream).getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const deadline = Date.now() + 6_000
  try {
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now()
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), remaining)),
      ])
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const boundary = buffer.indexOf('\n\n')
      if (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        const dataLine = frame.split('\n').find((line) => line.startsWith('data: '))
        if (dataLine !== undefined) {
          const envelope = JSON.parse(dataLine.slice('data: '.length)) as { kind: string; events?: { type: string }[] }
          reader.cancel().catch(() => {})
          return envelope.kind === 'snapshot' ? (envelope.events ?? []).map((event) => event.type) : []
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  return []
}

describe('live mode control', () => {
  it('Chat sends no tool schemas and executes no tools', async () => {
    const requests: { tools?: { name: string }[] }[] = []
    const spy: LlmProvider = {
      name: 'scripted', models: ['scripted'],
      async *stream(request) {
        const tools = request.tools?.map((schema) => ({ name: schema.name }))
        requests.push(tools !== undefined ? { tools } : {})
        yield { type: 'delta', delta: 'plain answer' }
      },
    }
    const server = await start([spy])
    const base = server.url
    const wsId = (await (await fetch(`${base}/api/workspaces`)).json() as { id: string }[])[0]!.id
    expect((await fetch(`${base}/api/workspaces/${wsId}/mode`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modeId: 'chat' }),
    })).status).toBe(200)

    const { id } = (await (await post(base, `/api/workspaces/${wsId}/sessions`)).json()) as { id: string }
    await post(base, `/api/workspaces/${wsId}/sessions/${id}/messages`, { content: 'hello' })
    await new Promise((resolve) => setTimeout(resolve, 250))

    expect(requests).toHaveLength(1)
    expect(requests[0]?.tools).toBeUndefined()
    // Unknown modes are refused; the selector validates.
    expect((await fetch(`${base}/api/workspaces/${wsId}/mode`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modeId: 'no-such' }),
    })).status).toBe(404)
  })

  it('a mid-batch mode switch gates unstarted calls: current tool finishes, the rest deny truthfully', async () => {
    let calls = 0
    const loop: LlmProvider = {
      name: 'scripted', models: ['scripted'],
      async *stream() {
        calls += 1
        if (calls === 1) {
          yield { type: 'toolCalls', calls: [
            { id: 'c1', name: 'Glob', args: { pattern: '*' } },
            { id: 'c2', name: 'Write', args: { path: 'blocked.txt', content: 'x' } },
          ] }
          return
        }
        yield { type: 'delta', delta: 'done' }
      },
    }
    const server = await start([loop])
    const base = server.url
    const wsId = (await (await fetch(`${base}/api/workspaces`)).json() as { id: string }[])[0]!.id
    // A bound project grants the file tools (G2: no project, no grant).
    const projDir = await fs.mkdtemp(path.join(tmpdir(), 'mini-dsh-g3-proj-'))
    const project = (await (await post(base, `/api/workspaces/${wsId}/projects`, { name: 'P', path: projDir })).json()) as { id: string }

    const { id } = (await (await post(base, `/api/workspaces/${wsId}/sessions`, { projectId: project.id })).json()) as { id: string }
    // Gate c1 so it CANNOT finish before the live mode switch lands: the
    // batch's second call is provably still unstarted at flip time, which is
    // exactly the stale-batch case under test. (Waiting on the log alone
    // races a fast Glob against the PUT under parallel load.)
    let releaseGate: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    // Delay ONLY the first batch call at the authorization boundary (the
    // real Glob tool still runs afterwards). This makes "c2 not yet started
    // when the mode flips" a fact rather than a timing hope.
    server.kernel.ctx.on('tools/pre-execute', async (payload, next) => {
      if (payload.call.id === 'c1' && payload.exec.signal?.aborted !== true) await gate
      return next()
    })
    void post(base, `/api/workspaces/${wsId}/sessions/${id}/messages`, { content: 'go' })
    for (let i = 0; i < 50; i++) {
      const events = await readAllEvents(base, wsId, id)
      if (events.some((event) => event.type === 'tool/call' && (event as { call?: { id?: string } }).call?.id === 'c1')) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect((await fetch(`${base}/api/workspaces/${wsId}/mode`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modeId: 'plan' }),
    })).status).toBe(200)
    // Plan is now the live mode: release the running call so the batch can
    // advance to the (now unexposed) second call.
    releaseGate?.()
    // Wait for the turn to settle before reading the log (generous under
    // parallel-suite load).
    for (let i = 0; i < 60; i++) {
      const listing = (await (await fetch(`${base}/api/workspaces/${wsId}/sessions`)).json()) as { id: string; status: string }[]
      if (listing.find((row) => row.id === id)?.status === 'idle') break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }

    // Retry the snapshot until both tool results have landed.
    let events: { type: string; [key: string]: unknown }[] = []
    for (let i = 0; i < 10; i++) {
      events = await readAllEvents(base, wsId, id)
      const results = events.filter((event) => event.type === 'tool/result')
      if (results.length >= 2) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    const results = events.filter((event) => event.type === 'tool/result')
    const glob = results.find((event) => (event as { callId?: string }).callId === 'c1')
    const write = results.find((event) => (event as { callId?: string }).callId === 'c2')
    expect(glob !== undefined && (glob as { ok?: boolean }).ok).toBe(true)
    expect(write !== undefined && (write as { ok?: boolean }).ok).toBe(false)
    expect(write !== undefined && (write as { output?: string }).output).toMatch(/no longer exposed|does not expose 'Write'/)
    // The blocked file was never written.
    await expect(fs.readFile(path.join(root, 'blocked.txt'), 'utf8')).rejects.toThrow()
  }, 30_000)

  it('returns 204 rather than a false 404 before any request has a manifest', async () => {
    const server = await start([])
    const base = server.url
    const wsId = (await (await fetch(`${base}/api/workspaces`)).json() as { id: string }[])[0]!.id
    const { id } = (await (await post(base, `/api/workspaces/${wsId}/sessions`)).json()) as { id: string }
    const response = await fetch(`${base}/api/workspaces/${wsId}/sessions/${id}/manifest`)
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  it('the manifest endpoint records mode/model/revision and omissions', async () => {
    const server = await start([{
      name: 'scripted', models: ['scripted'],
      async *stream() { yield { type: 'delta', delta: 'hi' } },
    }])
    const base = server.url
    const wsId = (await (await fetch(`${base}/api/workspaces`)).json() as { id: string }[])[0]!.id
    await fetch(`${base}/api/workspaces/${wsId}/mode`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modeId: 'chat' }),
    })
    const { id } = (await (await post(base, `/api/workspaces/${wsId}/sessions`)).json()) as { id: string }
    await post(base, `/api/workspaces/${wsId}/sessions/${id}/messages`, { content: 'hello' })
    await new Promise((resolve) => setTimeout(resolve, 250))

    const manifest = (await (await fetch(`${base}/api/workspaces/${wsId}/sessions/${id}/manifest`)).json()) as {
      modeId: string
      modeRevision: number
      sources: { toolSchemas: number }
      omissions: string[]
      budget: { estimated: boolean }
    }
    expect(manifest.modeId).toBe('chat')
    expect(manifest.sources.toolSchemas).toBe(0)
    expect(manifest.omissions.some((line) => line.includes('tool-schemas'))).toBe(true)
    expect(manifest.budget.estimated).toBe(true)
    expect(manifest.modeRevision).toBeGreaterThanOrEqual(2)
  })

  it('workspace meta exposes the selected mode; policy defaults come from the mode', async () => {
    const server = await start([{
      name: 'scripted', models: ['scripted'],
      async *stream() { yield { type: 'delta', delta: 'hi' } },
    }])
    const base = server.url
    const wsId = (await (await fetch(`${base}/api/workspaces`)).json() as { id: string }[])[0]!.id
    const meta = (await (await fetch(`${base}/api/workspaces/${wsId}/meta`)).json()) as {
      mode: { id: string; revision: number }
      policy: Record<string, string>
    }
    expect(meta.mode.id).toBe('ask-before-changes')
    // Effective policy reflects the mode's defaults.
    expect(meta.policy.Read).toBe('allow')
    expect(meta.policy.Write).toBe('ask')
    // After switching to full access the defaults follow.
    await fetch(`${base}/api/workspaces/${wsId}/mode`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modeId: 'full-access' }),
    })
    const after = (await (await fetch(`${base}/api/workspaces/${wsId}/meta`)).json()) as { policy: Record<string, string>; mode: { id: string } }
    expect(after.mode.id).toBe('full-access')
    expect(after.policy.Bash).toBe('allow')
  })
})

/** Read one session's events via a fresh snapshot connection. */
async function readAllEvents(base: string, wsId: string, sessionId: string): Promise<{ type: string; [key: string]: unknown }[]> {
  const response = await fetch(`${base}/api/workspaces/${wsId}/sessions/${sessionId}/events`)
  const reader = (response.body as ReadableStream).getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const deadline = Date.now() + 6_000
  try {
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now()
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), remaining)),
      ])
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const boundary = buffer.indexOf('\n\n')
      if (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        const dataLine = frame.split('\n').find((line) => line.startsWith('data: '))
        if (dataLine !== undefined) {
          const envelope = JSON.parse(dataLine.slice('data: '.length)) as { kind: string; events?: { type: string; [key: string]: unknown }[] }
          return envelope.kind === 'snapshot' ? (envelope.events ?? []) : []
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  return []
}
