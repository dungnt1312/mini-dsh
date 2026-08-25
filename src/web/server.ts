/**
 * The web host half: an HTTP server exposing the harness over REST + SSE.
 *
 * The client renders from the durable log — `GET /api/sessions/:id/events`
 * streams a snapshot of the existing log and then live `session/event`
 * broadcasts — and approval questions ride the same stream as
 * `approval` envelopes, answered by `POST /api/approvals/:id`. The
 * `askUser` answerer routes questions to the right session through the
 * ambient {@link agentScope}, so several concurrent sessions share one
 * policy listener without cross-talk.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AgentsService } from '../harness/agent/service.ts'
import { agentScope } from '../harness/agent/scope.ts'
import type { Agent } from '../harness/agent/agent.ts'
import { attachApproval, type ApprovalMode } from '../harness/approval/policy.ts'
import { LlmService } from '../harness/llm/service.ts'
import type { LlmProvider, ToolCall } from '../harness/llm/types.ts'
import type { Session } from '../harness/session/session.ts'
import type { SessionEvent } from '../harness/session/events.ts'
import { SessionsService } from '../harness/session/service.ts'
import { ToolsService } from '../harness/tools/service.ts'
import { bashTool } from '../capabilities/shell/bash.ts'
import { fsTools } from '../capabilities/fs/tools.ts'
import { Kernel } from '../kernel/registry.ts'
import type { SessionId } from '../util/brand.ts'

declare module 'mini-dsh' {
  interface Events {
    /**
     * A tool call is waiting for a human answer on one session; emitted by
     * the web approval bridge and consumed by that session's SSE stream.
     */
    'web/approval'(payload: {
      readonly sessionId: SessionId
      readonly approvalId: string
      readonly call: ToolCall
    }): void
  }
}

/** One frame on the SSE stream: log snapshot, live session event, or a pending approval question. */
export type WebEnvelope =
  | { readonly kind: 'snapshot'; readonly events: SessionEvent[] }
  | { readonly kind: 'session'; readonly event: SessionEvent }
  | { readonly kind: 'approval'; readonly approvalId: string; readonly call: ToolCall }

/** Options for {@link createWebServer}. */
export interface WebServerOptions {
  /** Workspace root the filesystem tools are confined to. */
  readonly root: string
  /** The LLM provider to register (mock for keyless runs, DeepSeek otherwise). */
  readonly provider: LlmProvider
  /** Per-tool approval modes; defaults allow reads, ask on writes and bash. */
  readonly policy?: Readonly<Record<string, ApprovalMode>>
  /** Mode for tools the policy map does not name; defaults to `ask`. */
  readonly defaultMode?: ApprovalMode
  /** Directory of built client assets; defaults to the repo's `web-dist/`. */
  readonly staticDir?: string
  /** Port to listen on; `0` (default) picks an ephemeral port. */
  readonly port?: number
  /** Bind address; defaults to `127.0.0.1`. */
  readonly host?: string
}

/** A running web server: its URL plus a graceful shutdown. */
export interface WebServer {
  readonly url: string
  readonly port: number
  readonly kernel: Kernel
  close(): Promise<void>
}

interface SessionEntry {
  readonly session: Session
  readonly agent: Agent
}

interface PendingApproval {
  readonly sessionId: SessionId
  resolve(allow: boolean): void
}

const DEFAULT_POLICY: Readonly<Record<string, ApprovalMode>> = {
  read: 'allow',
  glob: 'allow',
  grep: 'allow',
  write: 'ask',
  edit: 'ask',
  bash: 'ask',
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json',
}

/** Boot the harness on a kernel and expose it over HTTP. */
export async function createWebServer(options: WebServerOptions): Promise<WebServer> {
  const kernel = new Kernel()
  kernel.ctx.plugin(SessionsService)
  kernel.ctx.plugin(LlmService)
  kernel.ctx.plugin(ToolsService)
  kernel.ctx.plugin(AgentsService)
  kernel.ctx.llm.register(options.provider)
  for (const tool of fsTools(options.root)) {
    kernel.ctx.tools.register(tool)
  }
  kernel.ctx.tools.register(bashTool())

  const sessions = new Map<SessionId, SessionEntry>()
  const pending = new Map<string, PendingApproval>()
  let approvalCounter = 0

  attachApproval(kernel.ctx, {
    policy: options.policy ?? DEFAULT_POLICY,
    defaultMode: options.defaultMode ?? 'ask',
    askUser: (call) =>
      new Promise<boolean>((resolve) => {
        const scope = agentScope.getStore()
        if (scope === undefined) {
          // No agent in flight: fail closed rather than guessing a session.
          resolve(false)
          return
        }
        const approvalId = `approval-${++approvalCounter}`
        pending.set(approvalId, { sessionId: scope.sessionId, resolve })
        kernel.ctx.emit('web/approval', { sessionId: scope.sessionId, approvalId, call })
      }),
  })

  const staticDir = options.staticDir
    ?? fileURLToPath(new URL('../../web-dist/', import.meta.url))

  const server = createServer((req, res) => {
    handle(req, res, { kernel, sessions, pending, staticDir }).catch((error: unknown) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' })
      }
      res.end(JSON.stringify({ error: String(error) }))
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve)
  })

  const address = server.address()
  if (address === null || typeof address === 'string') {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await kernel.stop()
    throw new Error('web: unexpected listen address')
  }

  return {
    url: `http://${options.host ?? '127.0.0.1'}:${address.port}`,
    port: address.port,
    kernel,
    close: async () => {
      // SSE connections never drain on their own — a browser holds its
      // EventSource open indefinitely — so close() would hang on them.
      // Force every connection down first, then wait for the listener.
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await kernel.stop()
    },
  }
}

interface HandlerDeps {
  readonly kernel: Kernel
  readonly sessions: Map<SessionId, SessionEntry>
  readonly pending: Map<string, PendingApproval>
  readonly staticDir: string
}

async function handle(req: IncomingMessage, res: ServerResponse, deps: HandlerDeps): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const { pathname } = url

  if (pathname.startsWith('/api/')) {
    await handleApi(req, res, pathname, deps)
    return
  }
  if (req.method === 'GET') {
    await serveStatic(res, pathname, deps.staticDir)
    return
  }
  res.writeHead(405, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'method not allowed' }))
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  deps: HandlerDeps,
): Promise<void> {
  const send = (status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  if (req.method === 'GET' && pathname === '/api/sessions') {
    const listing = [...deps.sessions.values()].map(({ session }) => ({
      id: session.id,
      title: titleOf(session),
      eventCount: session.events.length,
    }))
    send(200, listing)
    return
  }

  if (req.method === 'POST' && pathname === '/api/sessions') {
    const session = deps.kernel.ctx.sessions.create()
    deps.sessions.set(session.id, { session, agent: deps.kernel.ctx.agents.create(session) })
    send(201, { id: session.id })
    return
  }

  const eventsMatch = /^\/api\/sessions\/([^/]+)\/events$/.exec(pathname)
  if (req.method === 'GET' && eventsMatch !== null) {
    const entry = findSession(eventsMatch[1] ?? '', deps)
    if (entry === undefined) {
      send(404, { error: 'no such session' })
      return
    }
    streamEvents(req, res, entry, deps)
    return
  }

  const messageMatch = /^\/api\/sessions\/([^/]+)\/messages$/.exec(pathname)
  if (req.method === 'POST' && messageMatch !== null) {
    const entry = findSession(messageMatch[1] ?? '', deps)
    if (entry === undefined) {
      send(404, { error: 'no such session' })
      return
    }
    const body = await readJson(req)
    const content = body['content']
    if (typeof content !== 'string' || content.trim() === '') {
      send(400, { error: 'body needs a non-empty string content' })
      return
    }
    entry.agent.send(content)
    // Fire-and-forget: the reply (and any failure, which closes the turn
    // durably) reaches the client through the SSE stream.
    void entry.agent.run().catch((error: unknown) => {
      console.error(`web: agent run failed for ${entry.session.id}`, error)
    })
    send(202, { queued: true })
    return
  }

  const approvalMatch = /^\/api\/approvals\/([^/]+)$/.exec(pathname)
  if (req.method === 'POST' && approvalMatch !== null) {
    const approvalId = approvalMatch[1] ?? ''
    const waiting = deps.pending.get(approvalId)
    if (waiting === undefined) {
      send(404, { error: 'no such approval' })
      return
    }
    const body = await readJson(req)
    const allow = body['allow']
    if (typeof allow !== 'boolean') {
      send(400, { error: 'body needs a boolean allow' })
      return
    }
    deps.pending.delete(approvalId)
    waiting.resolve(allow)
    send(200, { answered: true })
    return
  }

  send(404, { error: 'no such route' })
}

function findSession(rawId: string, deps: HandlerDeps): SessionEntry | undefined {
  return deps.sessions.get(rawId as SessionId)
}

/** Derive a short listing title from the first user message. */
function titleOf(session: Session): string {
  for (const event of session.events) {
    if (event.type === 'user/message') {
      const content = event.content.trim().replace(/\s+/g, ' ')
      return content.length > 48 ? `${content.slice(0, 48)}…` : content
    }
  }
  return 'new session'
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const body = Buffer.concat(chunks).toString('utf8')
  if (body === '') return {}
  const parsed: unknown = JSON.parse(body)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('request body must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

/** Write one SSE `data:` frame and flush it. */
function writeFrame(res: ServerResponse, envelope: WebEnvelope): void {
  res.write(`data: ${JSON.stringify(envelope)}\n\n`)
}

/**
 * Stream one session: snapshot the current log, then relay live events and
 * approval questions until the client disconnects. Listeners are disposed
 * on close so a dropped browser tab never leaks registrations.
 */
function streamEvents(req: IncomingMessage, res: ServerResponse, entry: SessionEntry, deps: HandlerDeps): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  const { session } = entry

  writeFrame(res, { kind: 'snapshot', events: [...session.events] })

  const disposeSession = deps.kernel.ctx.on('session/event', (emitter, event) => {
    if (emitter.id === session.id) writeFrame(res, { kind: 'session', event })
  })
  const disposeApproval = deps.kernel.ctx.on('web/approval', (payload) => {
    if (payload.sessionId === session.id) {
      writeFrame(res, { kind: 'approval', approvalId: payload.approvalId, call: payload.call })
    }
  })
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n')
  }, 25_000)

  req.on('close', () => {
    clearInterval(heartbeat)
    disposeSession()
    disposeApproval()
  })
}

/** Serve the built client: `/` (and unknown paths) fall back to index.html for the router. */
async function serveStatic(res: ServerResponse, pathname: string, staticDir: string): Promise<void> {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const abs = path.resolve(staticDir, relative)
  if (abs !== path.resolve(staticDir) && !abs.startsWith(`${path.resolve(staticDir)}${path.sep}`)) {
    res.writeHead(403, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'forbidden' }))
    return
  }
  try {
    const content = await fs.readFile(abs)
    res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(abs)] ?? 'application/octet-stream' })
    res.end(content)
  } catch {
    // Unknown non-API path: serve the app shell so client-side state stands up.
    try {
      const shell = await fs.readFile(path.join(staticDir, 'index.html'))
      res.writeHead(200, { 'content-type': CONTENT_TYPES['.html'] ?? 'text/html' })
      res.end(shell)
    } catch {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'client not built; run npm run build:web' }))
    }
  }
}
