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
 *
 * Providers are a runtime registry persisted by {@link provider-store}:
 * every enabled entry becomes a registered `LlmProvider`, and the active
 * `(provider, model)` pair is stamped onto each step's request seam.
 * Workspace folders are per-session: tools resolve their root through the
 * ambient agent scope, falling back to the server default root.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AgentsService } from '../harness/agent/service.ts'
import { agentScope } from '../harness/agent/scope.ts'
import type { Agent } from '../harness/agent/agent.ts'
import { attachApproval, type ApprovalMode } from '../harness/approval/policy.ts'
import { LlmService } from '../harness/llm/service.ts'
import { OpenAiCompletionsProvider } from '../harness/llm/openai.ts'
import type { LlmProvider, ToolCall } from '../harness/llm/types.ts'
import type { Session } from '../harness/session/session.ts'
import type { SessionEvent } from '../harness/session/events.ts'
import { SessionsService } from '../harness/session/service.ts'
import { ToolsService } from '../harness/tools/service.ts'
import { bashTool } from '../capabilities/shell/bash.ts'
import { fsTools } from '../capabilities/fs/tools.ts'
import { Kernel } from '../kernel/registry.ts'
import {
  loadProviders,
  maskKey,
  saveProviders,
  slugify,
  type ProviderConfig,
} from './provider-store.ts'
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
    /**
     * A turn failed (e.g. a rejected API call) on one session; the reason is
     * broadcast so the UI can surface it instead of a bare `turn/end: failed`.
     */
    'web/turn-error'(payload: { readonly sessionId: SessionId; readonly message: string }): void
  }
}

/** One frame on the SSE stream: log snapshot, live session event, a pending approval question, or a turn failure. */
export type WebEnvelope =
  | { readonly kind: 'snapshot'; readonly events: SessionEvent[] }
  | { readonly kind: 'session'; readonly event: SessionEvent }
  | { readonly kind: 'approval'; readonly approvalId: string; readonly call: ToolCall }
  | { readonly kind: 'error'; readonly message: string }

/** Options for {@link createWebServer}. */
export interface WebServerOptions {
  /** Default workspace root; sessions inherit it unless they override. */
  readonly root: string
  /**
   * Providers registered verbatim on top of the config file (injection seam
   * used by bins for env-configured entries and by tests for scripts).
   */
  readonly providers?: readonly LlmProvider[]
  /** Provider config file; defaults to `<homedir>/.mini-dsh/providers.json`. */
  readonly configFile?: string
  /** Create a `deepseek` entry from `DEEPSEEK_API_KEY` when the config has none. */
  readonly seedDeepseekFromEnv?: boolean
  /** Initial `(provider, model)`; defaults to the first usable provider's first model. */
  readonly activeModel?: { readonly provider?: string; readonly model?: string }
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
  /** User-chosen title; the derived title is the fallback. */
  customTitle: string | undefined
  /** Session-scoped workspace root; undefined inherits the server default. */
  folder: string | undefined
  /** Set when the session is deleted; open SSE streams end themselves. */
  closed?: boolean
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

/** Internal mutable runtime state shared with the API handlers. */
interface RuntimeState {
  activeProvider: string | undefined
  model: string | undefined
  folder: string
}

/** One provider as exposed over REST — never carries the raw API key. */
export interface PublicProvider {
  readonly id: string
  readonly name: string
  readonly baseUrl: string
  readonly enabled: boolean
  readonly keyMasked: string
  readonly models: readonly string[]
  readonly defaultModel?: string | undefined
}

function publicProvider(entry: ProviderConfig): PublicProvider {
  return {
    id: entry.id,
    name: entry.name,
    baseUrl: entry.baseUrl,
    enabled: entry.enabled,
    keyMasked: maskKey(entry.apiKey),
    models: [...entry.models],
    ...(entry.defaultModel !== undefined ? { defaultModel: entry.defaultModel } : {}),
  }
}

/** Boot the harness on a kernel and expose it over HTTP. */
export async function createWebServer(options: WebServerOptions): Promise<WebServer> {
  const kernel = new Kernel()
  kernel.ctx.plugin(SessionsService)
  kernel.ctx.plugin(LlmService)
  kernel.ctx.plugin(ToolsService)
  kernel.ctx.plugin(AgentsService)

  // ── provider registry ────────────────────────────────────────
  const configFile = options.configFile ?? path.join(homedir(), '.mini-dsh', 'providers.json')
  let list: ProviderConfig[] = loadProviders(configFile)
  if (list.length === 0 && options.seedDeepseekFromEnv === true) {
    const key = process.env['DEEPSEEK_API_KEY']?.trim()
    if (key !== undefined && key !== '') {
      list = [{
        id: 'deepseek',
        name: 'deepseek',
        baseUrl: process.env['DEEPSEEK_BASE_URL']?.trim() || 'https://api.deepseek.com',
        apiKey: key,
        models: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash', 'deepseek-v4-pro'],
        defaultModel: 'deepseek-chat',
        enabled: true,
      }]
      await saveProviders(configFile, list)
    }
  }

  const disposers = new Map<string, () => void>()
  const state: RuntimeState = {
    activeProvider: undefined,
    model: undefined,
    folder: options.root,
  }

  const instantiate = (entry: ProviderConfig): LlmProvider =>
    new OpenAiCompletionsProvider({
      name: entry.id,
      apiKey: entry.apiKey,
      baseUrl: entry.baseUrl,
      ...(entry.models.length > 0 ? { models: entry.models } : {}),
      ...(entry.defaultModel !== undefined ? { defaultModel: entry.defaultModel } : {}),
    })

  const injectionNames = (): readonly string[] =>
    (options.providers ?? []).map((provider) => provider.name)

  const isUsableConfigured = (entry: ProviderConfig): boolean => entry.enabled && entry.apiKey !== ''

  const usableIds = (): readonly string[] => [
    ...injectionNames(),
    ...list.filter(isUsableConfigured).map((entry) => entry.id),
  ]

  /** Re-register every provider source; called after any registry mutation. */
  const syncRegistrations = (): void => {
    for (const dispose of disposers.values()) dispose()
    disposers.clear()
    for (const provider of options.providers ?? []) {
      disposers.set(provider.name, kernel.ctx.llm.register(provider))
    }
    for (const entry of list) {
      if (!isUsableConfigured(entry) || disposers.has(entry.id)) continue
      disposers.set(entry.id, kernel.ctx.llm.register(instantiate(entry)))
    }
  }

  const setActive = (providerId: string, model?: string): string => {
    const ids = usableIds()
    const id = providerId === '' ? ids[0] : providerId
    if (id === undefined || !ids.includes(id)) {
      throw new Error(`no usable provider '${providerId}'`)
    }
    // Switch first so we can introspect the registered instance; if the pair
    // is invalid, revert to the previous selection before surfacing why.
    const previous = state.activeProvider
    kernel.ctx.llm.use(id)
    const available = kernel.ctx.llm.active().models ?? []
    const chosen = model ?? available[0]
    // An advertised list is a contract: reject names outside it. Providers
    // that have not synced models yet accept any non-empty choice.
    if (chosen !== undefined && available.length > 0 && !available.includes(chosen)) {
      if (previous !== undefined && previous !== id) kernel.ctx.llm.use(previous)
      throw new Error(`unknown model '${chosen}' for provider '${id}'; available: ${available.join(', ')}`)
    }
    state.activeProvider = id
    state.model = chosen
    return chosen ?? ''
  }

  syncRegistrations()
  if (options.activeModel?.provider !== undefined || options.activeModel?.model !== undefined) {
    try {
      setActive(options.activeModel.provider ?? '', options.activeModel.model)
    } catch {
      // An explicitly requested pair failed: leave registry empty-active and
      // let /api/meta report the blank selection.
    }
  } else {
    const first = usableIds()[0]
    if (first !== undefined) setActive(first)
  }

  // ── per-session workspace folders ────────────────────────────
  const sessions = new Map<SessionId, SessionEntry>()
  const activeFolder = (): string => {
    const scope = agentScope.getStore()
    if (scope !== undefined) {
      const own = sessions.get(scope.sessionId)?.folder
      if (own !== undefined) return own
    }
    return state.folder
  }

  for (const tool of fsTools(activeFolder)) {
    kernel.ctx.tools.register(tool)
  }
  kernel.ctx.tools.register(bashTool({ cwd: activeFolder }))

  // The model selector rides the agent/request seam: every step's request
  // is stamped with the selected model before the provider sees it.
  kernel.ctx.on('agent/request', async (request, next) => {
    return next({ ...request, ...(state.model !== undefined ? { model: state.model } : {}) })
  })

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

  /** Apply a new configured list: re-register, then repair the active pointer. */
  const setProviders = (next: readonly ProviderConfig[]): void => {
    list = [...next]
    syncRegistrations()
    const stillThere =
      state.activeProvider !== undefined &&
      (injectionNames().includes(state.activeProvider) ||
        list.some((entry) => entry.id === state.activeProvider))
    if (!stillThere) {
      const first = usableIds()[0]
      if (first !== undefined) setActive(first)
      else {
        state.activeProvider = undefined
        state.model = undefined
      }
    }
  }

  const persistList = async (next: readonly ProviderConfig[]): Promise<void> => {
    await saveProviders(configFile, next)
  }

  const staticDir = options.staticDir
    ?? fileURLToPath(new URL('../../web-dist/', import.meta.url))

  const deps: HandlerDeps = {
    kernel,
    sessions,
    pending,
    staticDir,
    state,
    providers: () => list,
    setProviders: (next) => {
      setProviders(next)
    },
    persistList,
    setActive: (providerId, model) => {
      try {
        setActive(providerId, model)
        return { ok: true }
      } catch (error) {
        return { ok: false, error: String(error instanceof Error ? error.message : error) }
      }
    },
    publicSummary: () => list.map(publicProvider),
  }

  const server = createServer((req, res) => {
    handle(req, res, deps).catch((error: unknown) => {
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
    for (const dispose of disposers.values()) dispose()
    disposers.clear()
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
      for (const dispose of disposers.values()) dispose()
      disposers.clear()
      await kernel.stop()
    },
  }
}

interface HandlerDeps {
  readonly kernel: Kernel
  readonly sessions: Map<SessionId, SessionEntry>
  readonly pending: Map<string, PendingApproval>
  readonly staticDir: string
  readonly state: RuntimeState
  readonly providers: () => readonly ProviderConfig[]
  readonly setProviders: (next: readonly ProviderConfig[]) => void
  readonly persistList: (next: readonly ProviderConfig[]) => Promise<void>
  /** Returns a user-readable error string on failure. */
  readonly setActive: (providerId: string, model?: string) => { ok: true } | { ok: false; error: string }
  readonly publicSummary: () => readonly PublicProvider[]
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

  if (req.method === 'GET' && pathname === '/api/meta') {
    send(200, {
      provider: deps.state.activeProvider ?? '',
      model: deps.state.model ?? '',
      models: activeModels(deps),
      folder: deps.state.folder,
      providers: deps.publicSummary(),
    })
    return
  }

  if (req.method === 'PUT' && pathname === '/api/model') {
    const body = await readJson(req)
    const rawModel = body['model']
    const rawProvider = body['provider']
    if ((rawModel !== undefined && typeof rawModel !== 'string') || (rawProvider !== undefined && typeof rawProvider !== 'string')) {
      send(400, { error: "body accepts optional strings 'model' and 'provider'" })
      return
    }
    const target = rawProvider ?? deps.state.activeProvider ?? ''
    if (target === '') {
      send(400, { error: 'no provider configured yet' })
      return
    }
    const outcome = deps.setActive(target, rawModel === '' ? undefined : (rawModel as string | undefined))
    if (!outcome.ok) {
      send(400, { error: outcome.error })
      return
    }
    send(200, { provider: deps.state.activeProvider, model: deps.state.model })
    return
  }

  if (req.method === 'PUT' && pathname === '/api/folder') {
    const body = await readJson(req)
    const outcome = await validateFolder(body['path'])
    if (!outcome.ok) {
      send(outcome.status, { error: outcome.error })
      return
    }
    deps.state.folder = outcome.path
    send(200, { folder: deps.state.folder })
    return
  }

  if (req.method === 'GET' && pathname === '/api/providers') {
    send(200, deps.providers().map(publicProvider))
    return
  }

  if (req.method === 'POST' && pathname === '/api/providers') {
    const body = await readJson(req)
    const created = await createProvider(deps, body)
    if (!created.ok) {
      send(created.status, { error: created.error })
      return
    }
    send(201, publicProvider(created.entry))
    return
  }

  const providerMatch = /^\/api\/providers\/([^/]+)$/.exec(pathname)

  if (req.method === 'PATCH' && providerMatch !== null) {
    const id = decodeURIComponent(providerMatch[1] ?? '')
    const body = await readJson(req)
    const patched = await patchProvider(deps, id, body)
    if (!patched.ok) {
      send(patched.status, { error: patched.error })
      return
    }
    send(200, publicProvider(patched.entry))
    return
  }

  if (req.method === 'DELETE' && providerMatch !== null) {
    const id = decodeURIComponent(providerMatch[1] ?? '')
    const current = deps.providers()
    if (!current.some((entry) => entry.id === id)) {
      send(404, { error: `no provider '${id}'` })
      return
    }
    const next = current.filter((entry) => entry.id !== id)
    deps.setProviders(next)
    await deps.persistList(next)
    send(200, { deleted: true })
    return
  }

  const testMatch = /^\/api\/providers\/([^/]+)\/test$/.exec(pathname)
  if (req.method === 'POST' && testMatch !== null) {
    const entry = deps.providers().find((e) => e.id === decodeURIComponent(testMatch[1] ?? ''))
    if (entry === undefined) {
      send(404, { error: 'no such provider' })
      return
    }
    const outcome = await pingCompletions(entry)
    send(outcome.ok ? 200 : 502, outcome)
    return
  }

  const syncMatch = /^\/api\/providers\/([^/]+)\/sync$/.exec(pathname)
  if (req.method === 'POST' && syncMatch !== null) {
    const id = decodeURIComponent(syncMatch[1] ?? '')
    const entry = deps.providers().find((e) => e.id === id)
    if (entry === undefined) {
      send(404, { error: 'no such provider' })
      return
    }
    try {
      const response = await fetch(`${entry.baseUrl.replace(/\/$/, '')}/models`, {
        headers: { authorization: `Bearer ${entry.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) {
        send(502, { ok: false, error: `HTTP ${response.status}` })
        return
      }
      const models = extractModelIds(await response.json())
      if (models.length === 0) {
        send(502, { ok: false, error: 'model list came back empty' })
        return
      }
      const next = deps.providers().map((candidate) => (
        candidate.id === id
          ? { ...candidate, models, ...(candidate.defaultModel === undefined && models.length > 0 ? { defaultModel: models[0] } : {}) }
          : candidate
      ))
      deps.setProviders(next)
      await deps.persistList(next)
      send(200, { ok: true, models })
    } catch (error) {
      send(502, { ok: false, error: String(error instanceof Error ? error.message : error) })
    }
    return
  }

  if (req.method === 'GET' && pathname === '/api/sessions') {
    const listing = [...deps.sessions.values()].map(({ session, customTitle, folder }) => ({
      id: session.id,
      title: customTitle ?? titleOf(session),
      eventCount: session.events.length,
      folder: folder ?? null,
    }))
    send(200, listing)
    return
  }

  if (req.method === 'POST' && pathname === '/api/sessions') {
    const body = await readJson(req)
    let folder: string | undefined
    const rawFolder = body['folder']
    if (rawFolder !== undefined) {
      if (typeof rawFolder !== 'string' || rawFolder.trim() === '') {
        send(400, { error: "'folder' must be a non-empty string" })
        return
      }
      const outcome = await validateFolder(rawFolder)
      if (!outcome.ok) {
        send(outcome.status, { error: outcome.error })
        return
      }
      folder = outcome.path
    }
    const session = deps.kernel.ctx.sessions.create()
    deps.sessions.set(session.id, { session, agent: deps.kernel.ctx.agents.create(session), customTitle: undefined, folder })
    send(201, { id: session.id, ...(folder !== undefined ? { folder } : {}) })
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

  const sessionMatch = /^\/api\/sessions\/([^/]+)$/.exec(pathname)
  const stopMatch = /^\/api\/sessions\/([^/]+)\/stop$/.exec(pathname)
  const folderMatch = /^\/api\/sessions\/([^/]+)\/folder$/.exec(pathname)

  if (req.method === 'PUT' && folderMatch !== null) {
    const entry = findSession(folderMatch[1] ?? '', deps)
    if (entry === undefined) {
      send(404, { error: 'no such session' })
      return
    }
    const body = await readJson(req)
    const rawPath = body['path']
    if (typeof rawPath !== 'string') {
      send(400, { error: "body needs a string 'path' (empty resets to inherit)" })
      return
    }
    if (rawPath.trim() === '') {
      entry.folder = undefined
      send(200, { folder: null })
      return
    }
    const outcome = await validateFolder(rawPath)
    if (!outcome.ok) {
      send(outcome.status, { error: outcome.error })
      return
    }
    entry.folder = outcome.path
    send(200, { folder: entry.folder })
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
    if (deps.state.model === undefined || deps.state.activeProvider === undefined) {
      send(400, { error: 'no provider/model configured; manage providers in settings' })
      return
    }
    entry.agent.send(content)
    // Fire-and-forget: the reply (and any failure, which closes the turn
    // durably) reaches the client through the SSE stream — the failure
    // reason is broadcast as an error envelope, not just logged.
    void entry.agent.run().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`web: agent run failed for ${entry.session.id}: ${message}`)
      deps.kernel.ctx.emit('web/turn-error', { sessionId: entry.session.id, message })
    })
    send(202, { queued: true })
    return
  }

  if (req.method === 'DELETE' && sessionMatch !== null) {
    const entry = findSession(sessionMatch[1] ?? '', deps)
    if (entry === undefined) {
      send(404, { error: 'no such session' })
      return
    }
    deps.sessions.delete(entry.session.id)
    deps.kernel.ctx.sessions.delete(entry.session.id)
    entry.closed = true
    send(200, { deleted: true })
    return
  }

  if (req.method === 'PATCH' && sessionMatch !== null) {
    const entry = findSession(sessionMatch[1] ?? '', deps)
    if (entry === undefined) {
      send(404, { error: 'no such session' })
      return
    }
    const body = await readJson(req)
    const title = body['title']
    if (typeof title !== 'string') {
      send(400, { error: 'body needs a string title (empty to reset to the derived title)' })
      return
    }
    const trimmed = title.trim()
    entry.customTitle = trimmed === '' ? undefined : trimmed.slice(0, 80)
    send(200, { id: entry.session.id, title: entry.customTitle ?? titleOf(entry.session) })
    return
  }

  if (req.method === 'POST' && stopMatch !== null) {
    const entry = findSession(stopMatch[1] ?? '', deps)
    if (entry === undefined) {
      send(404, { error: 'no such session' })
      return
    }
    entry.agent.stop()
    send(202, { stopped: true })
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

// ── provider helpers ───────────────────────────────────────────

function activeModels(deps: HandlerDeps): readonly string[] {
  if (deps.state.activeProvider === undefined) return []
  try {
    return deps.kernel.ctx.llm.active().models ?? []
  } catch {
    return []
  }
}

async function createProvider(
  deps: HandlerDeps,
  body: Record<string, unknown>,
): Promise<{ ok: false; status: number; error: string } | { ok: true; entry: ProviderConfig }> {
  const name = typeof body['name'] === 'string' ? body['name'].trim() : ''
  const baseUrl = typeof body['baseUrl'] === 'string' ? body['baseUrl'].trim() : ''
  const apiKey = typeof body['apiKey'] === 'string' ? body['apiKey'].trim() : ''
  if (name === '') return { ok: false, status: 400, error: "body needs a non-empty string 'name'" }
  if (baseUrl === '') return { ok: false, status: 400, error: "body needs a non-empty string 'baseUrl'" }
  if (!/^https?:\/\//.test(baseUrl)) return { ok: false, status: 400, error: `'${baseUrl}' is not an http(s) URL` }
  const base = slugify(name)
  let id = base
  let bump = 2
  while (deps.providers().some((entry) => entry.id === id)) {
    id = `${base}-${bump++}`
  }
  const models = Array.isArray(body['models'])
    ? (body['models'] as unknown[]).filter((model): model is string => typeof model === 'string')
    : []
  const entry: ProviderConfig = {
    id,
    name,
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
    models,
    ...(models.length > 0 ? { defaultModel: models[0] } : {}),
    enabled: true,
  }
  const next = [...deps.providers(), entry]
  deps.setProviders(next)
  await deps.persistList(next)
  return { ok: true, entry }
}

async function patchProvider(
  deps: HandlerDeps,
  id: string,
  body: Record<string, unknown>,
): Promise<{ ok: false; status: number; error: string } | { ok: true; entry: ProviderConfig }> {
  const current = deps.providers().find((entry) => entry.id === id)
  if (current === undefined) {
    return { ok: false, status: 404, error: `no provider '${id}'` }
  }
  let draft = current
  if (typeof body['name'] === 'string' && body['name'].trim() !== '') draft = { ...draft, name: body['name'].trim() }
  if (typeof body['baseUrl'] === 'string' && body['baseUrl'].trim() !== '') {
    const trimmed = body['baseUrl'].trim()
    if (!/^https?:\/\//.test(trimmed)) {
      return { ok: false, status: 400, error: `'${trimmed}' is not an http(s) URL` }
    }
    draft = { ...draft, baseUrl: trimmed.replace(/\/$/, '') }
  }
  if (typeof body['apiKey'] === 'string') draft = { ...draft, apiKey: body['apiKey'].trim() }
  if (typeof body['enabled'] === 'boolean') draft = { ...draft, enabled: body['enabled'] }
  if (Array.isArray(body['models'])) {
    draft = { ...draft, models: (body['models'] as unknown[]).filter((model): model is string => typeof model === 'string') }
  }
  if (typeof body['defaultModel'] === 'string' && body['defaultModel'] !== '') {
    draft = { ...draft, defaultModel: body['defaultModel'] }
  }
  const next = deps.providers().map((entry) => (entry.id === id ? draft : entry))
  deps.setProviders(next)
  await deps.persistList(next)
  return { ok: true, entry: draft }
}

/** Fire one tiny non-streaming completion; returns an operator-readable verdict. */
async function pingCompletions(entry: ProviderConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${entry.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${entry.apiKey}` },
      body: JSON.stringify({
        model: entry.defaultModel ?? entry.models[0] ?? 'test',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: String(error instanceof Error ? error.message : error) }
  }
}

/** Accept OpenAI `{data:[{id}]}` plus bare-array `[{id}]` / `["id"]` shapes. */
export function extractModelIds(parsed: unknown): string[] {
  const rows: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)['data'])
      ? (parsed as Record<string, unknown>)['data'] as unknown[]
      : []
  const ids: string[] = []
  for (const row of rows) {
    if (typeof row === 'string') {
      ids.push(row)
    } else if (row !== null && typeof row === 'object' && typeof (row as Record<string, unknown>)['id'] === 'string') {
      ids.push((row as Record<string, unknown>)['id'] as string)
    }
  }
  return ids
}

// ── shared helpers ─────────────────────────────────────────────

function findSession(rawId: string, deps: HandlerDeps): SessionEntry | undefined {
  return deps.sessions.get(rawId as SessionId)
}

async function validateFolder(
  raw: unknown,
): Promise<{ ok: true; path: string } | { ok: false; status: number; error: string }> {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, status: 400, error: "needs a non-empty string 'path'" }
  }
  const abs = path.resolve(raw)
  try {
    const stat = await fs.stat(abs)
    if (!stat.isDirectory()) return { ok: false, status: 400, error: `'${raw}' is not a directory` }
    return { ok: true, path: abs }
  } catch {
    return { ok: false, status: 400, error: `no such directory '${raw}'` }
  }
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
  const disposeError = deps.kernel.ctx.on('web/turn-error', (payload) => {
    if (payload.sessionId === session.id) writeFrame(res, { kind: 'error', message: payload.message })
  })
  const heartbeat = setInterval(() => {
    // A deleted session must end its streams: no more frames can ever come.
    if (entry.closed === true) {
      clearInterval(heartbeat)
      disposeSession()
      disposeApproval()
      disposeError()
      writeFrame(res, { kind: 'error', message: 'session deleted' })
      res.end()
      return
    }
    res.write(': ping\n\n')
  }, 2_000)

  req.on('close', () => {
    clearInterval(heartbeat)
    disposeSession()
    disposeApproval()
    disposeError()
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
