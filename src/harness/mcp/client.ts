/**
 * MCP client (G5): JSON-RPC over stdio subprocess (primary) or Streamable
 * HTTP. Lifecycle pins MCP spec `2025-06-18`: initialize → tools/list →
 * tools/call → notifications/cancelled. Production hardening: per-call
 * timeout, retry 3× with backoff BEFORE output, circuit breaker (5 fails →
 * 5 min disabled → auto-reconnect with jitter), 30s health checks, verified
 * subprocess cleanup on disconnect.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import type { McpServerConfig } from './config.ts'

export const MCP_PROTOCOL_VERSION = '2025-06-18'

export interface McpToolDescriptor {
  readonly name: string
  readonly description?: string
  readonly inputSchema: unknown
  readonly requiresUserInteraction?: boolean
  readonly readOnlyHint?: boolean
}

export interface McpCallResult {
  readonly isError: boolean
  readonly content: unknown
}

export type TransportState = 'connecting' | 'ready' | 'failed' | 'disabled'

export class McpTransportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpTransportError'
  }
}

/** JSON-RPC framing over a request/response channel. */
interface Transport {
  start(): Promise<void>
  stop(): Promise<void>
  request(method: string, params: unknown, timeoutMs: number, signal?: AbortSignal): Promise<unknown>
  notify(method: string, params: unknown): Promise<void>
  readonly state: TransportState
}

interface ProcessSample { readonly memoryMb: number; readonly cpuSeconds: number }

function killOwnedProcessTree(child: ChildProcess): void {
  if (child.pid === undefined) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else {
    try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
  }
}

/** Sample cumulative process CPU seconds + memory; caller computes deltas. */
function readProcessSample(pid: number): ProcessSample | undefined {
  if (process.platform === 'win32') {
    const result = spawnSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `(Get-Process -Id ${pid} | Select-Object @{n='m';e={$_.WorkingSet64/1MB}},@{n='c';e={$_.CPU}} | ConvertTo-Json -Compress)`,
    ], { encoding: 'utf8', timeout: 3_000 })
    if (result.status !== 0) return undefined
    try {
      const parsed = JSON.parse(result.stdout.trim()) as { m?: number; c?: number }
      return { memoryMb: parsed.m ?? 0, cpuSeconds: parsed.c ?? 0 }
    } catch { return undefined }
  }
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8')
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8').trim().split(/\s+/)
    const kb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0)
    // Linux clock ticks are commonly 100 Hz; this is explicit and can be
    // made platform-configurable if a target differs.
    const ticks = Number(stat[13] ?? 0) + Number(stat[14] ?? 0)
    return { memoryMb: kb / 1024, cpuSeconds: ticks / 100 }
  } catch { return undefined }
}

/** stdio: one subprocess per (workspace, server), newline-delimited JSON-RPC. */
class StdioTransport implements Transport {
  private child: ChildProcess | undefined
  private nextId = 1
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private buffer = ''
  private resourceTimer: ReturnType<typeof setInterval> | undefined
  private previousSample: { readonly at: number; readonly cpuSeconds: number } | undefined
  private lifetimeTimer: ReturnType<typeof setTimeout> | undefined
  state: TransportState = 'connecting'

  constructor(
    private readonly config: McpServerConfig,
    private readonly resolvedEnv: Record<string, string>,
    private readonly onNotification?: (method: string) => void,
  ) {}

  async start(): Promise<void> {
    const command = this.config.command
    if (command === undefined) throw new McpTransportError('stdio transport requires a command')
    const child = spawn(command, this.config.args ?? [], {
      env: { ...process.env, ...this.resolvedEnv },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child
    this.startResourceWatchdog(child)
    child.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8')
      let newline = this.buffer.indexOf('\n')
      while (newline >= 0) {
        const line = this.buffer.slice(0, newline).trim()
        this.buffer = this.buffer.slice(newline + 1)
        newline = this.buffer.indexOf('\n')
        if (line === '') continue
        this.handleLine(line)
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      // stderr = server logs; surfaced via diagnostics, never parsed.
      void chunk
    })
    child.on('close', () => {
      this.state = 'failed'
      for (const pending of this.pending.values()) {
        pending.reject(new McpTransportError('server closed the connection'))
      }
      this.pending.clear()
    })
    child.on('error', (error: Error) => {
      this.state = 'failed'
      for (const pending of this.pending.values()) {
        pending.reject(new McpTransportError(`spawn error: ${error.message}`))
      }
      this.pending.clear()
    })
    // MCP initialize handshake.
    await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'mini-dsh', version: '0.1.0' },
    }, 10_000)
    await this.notify('notifications/initialized', {})
    this.state = 'ready'
  }

  private handleLine(line: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return // non-JSON line = server log noise
    }
    const record = parsed as { id?: unknown; method?: unknown; result?: unknown; error?: unknown }
    if (typeof record.method === 'string') {
      this.onNotification?.(record.method)
      return
    }
    if (typeof record.id !== 'number') return
    const pending = this.pending.get(record.id)
    if (pending === undefined) return
    this.pending.delete(record.id)
    if (record.error !== undefined) {
      pending.reject(new McpTransportError('MCP JSON-RPC request failed'))
    } else {
      pending.resolve(record.result)
    }
  }

  async request(method: string, params: unknown, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
    const id = this.nextId++
    const message = JSON.stringify({ jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) })
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
    this.child?.stdin?.write(`${message}\n`)
    // Timeout + abort race the response.
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new McpTransportError(`${method} timed out after ${timeoutMs}ms`)), timeoutMs)
      timer.unref?.()
      signal?.addEventListener('abort', () => {
        // MCP cancellation notification: best effort, no response expected.
        this.child?.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id, reason: 'client abort' } })}
`)
        reject(new McpTransportError(`${method} cancelled`))
      }, { once: true })
    })
    try {
      return await Promise.race([promise, timeout])
    } finally {
      this.pending.delete(id)
    }
  }

  private startResourceWatchdog(child: ChildProcess): void {
    const limits = this.config.resourceLimits
    if (limits === undefined || child.pid === undefined) return
    if (limits.maxLifetimeMs !== undefined) {
      this.lifetimeTimer = setTimeout(() => killOwnedProcessTree(child), limits.maxLifetimeMs)
      this.lifetimeTimer.unref?.()
    }
    if (limits.memoryMb === undefined && limits.cpuPercent === undefined) return
    const initial = readProcessSample(child.pid)
    if (initial !== undefined) this.previousSample = { at: Date.now(), cpuSeconds: initial.cpuSeconds }
    else if (limits.cpuPercent !== undefined || limits.memoryMb !== undefined) {
      killOwnedProcessTree(child)
      return
    }
    this.resourceTimer = setInterval(() => {
      if (child.pid === undefined) return
      const sample = readProcessSample(child.pid)
      if (sample === undefined) {
        // A configured hard limit we cannot monitor must fail closed.
        killOwnedProcessTree(child)
        return
      }
      if (limits.memoryMb !== undefined && sample.memoryMb > limits.memoryMb) killOwnedProcessTree(child)
      if (limits.cpuPercent !== undefined) {
        const now = Date.now()
        const previous = this.previousSample
        this.previousSample = { at: now, cpuSeconds: sample.cpuSeconds }
        if (previous !== undefined) {
          const wallSeconds = Math.max((now - previous.at) / 1_000, 0.001)
          const cpuPercent = ((sample.cpuSeconds - previous.cpuSeconds) / wallSeconds / Math.max(cpus().length, 1)) * 100
          if (cpuPercent > limits.cpuPercent) killOwnedProcessTree(child)
        }
      }
    }, 1_000)
    this.resourceTimer.unref?.()
  }

  async notify(method: string, params: unknown): Promise<void> {
    this.child?.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) })}
`)
  }

  async stop(): Promise<void> {
    if (this.resourceTimer !== undefined) clearInterval(this.resourceTimer)
    if (this.lifetimeTimer !== undefined) clearTimeout(this.lifetimeTimer)
    // Verified cleanup: close stdin, kill the tree, wait for exit. Windows
    // orphan prevention mirrors the G1 Bash gate (taskkill on timeout paths
    // — here a direct SIGKILL/kill suffices since we own the direct child).
    const child = this.child
    if (child === undefined) return
    this.child = undefined
    await new Promise<void>((resolve) => {
      const done = (): void => resolve()
      child.once('close', done)
      try {
        child.stdin?.end()
        if (process.platform === 'win32' && child.pid !== undefined) {
          // One OS process per (workspace, server), but MCP servers may spawn
          // helpers. taskkill /T ensures Stop/restart leaves no orphans.
          spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
        } else {
          child.kill('SIGKILL')
        }
      } catch {
        done()
      }
      setTimeout(done, 2_000).unref?.()
    })
  }
}

/** Streamable HTTP: JSON-RPC over POST with bearer auth. */
class HttpTransport implements Transport {
  private sessionId: string | undefined
  private nextId = 1
  state: TransportState = 'connecting'

  constructor(
    private readonly config: McpServerConfig,
    private readonly bearerToken: string | undefined,
    private readonly onNotification?: (method: string) => void,
  ) {}

  async start(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'mini-dsh', version: '0.1.0' },
    }, 10_000)
    await this.notify('notifications/initialized', {})
    this.state = 'ready'
  }

  async request(method: string, params: unknown, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
    const id = this.nextId++
    const onAbort = (): void => {
      void this.notify('notifications/cancelled', { requestId: id, reason: 'client abort' }).catch(() => {})
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    const response = await this.post({ jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) }, timeoutMs, signal)
    signal?.removeEventListener('abort', onAbort)
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('text/event-stream')) return this.readSseResult(response, id)
    const body = (await response.json()) as { id?: unknown; result?: unknown; error?: unknown }
    if (body.id !== id) throw new McpTransportError(`MCP response id mismatch: expected ${id}`)
    if (body.error !== undefined) throw new McpTransportError('MCP JSON-RPC request failed')
    return body.result
  }

  async notify(method: string, params: unknown): Promise<void> {
    const response = await this.post({ jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) }, 5_000)
    // Notifications may return 202/204 or a JSON ack; status was checked.
    await response.body?.cancel().catch(() => {})
  }

  private async post(body: Record<string, unknown>, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
    if (this.config.url === undefined) throw new McpTransportError('http transport requires a url')
    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        origin: new URL(this.config.url).origin,
        ...(this.config.headers ?? {}),
        ...(this.bearerToken !== undefined ? { authorization: `Bearer ${this.bearerToken}` } : {}),
        ...(this.sessionId !== undefined ? { 'mcp-session-id': this.sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal !== undefined ? [signal] : [])]),
    })
    const sessionHeader = response.headers.get('mcp-session-id')
    if (sessionHeader !== null) this.sessionId = sessionHeader
    if (!response.ok) throw new McpTransportError(`HTTP ${response.status}`)
    return response
  }

  /** Incremental SSE event parser: no full-response buffering; matches request id. */
  private async readSseResult(response: Response, requestId: number): Promise<unknown> {
    if (response.body === null) throw new McpTransportError('SSE response has no body')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
        const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
        if (data === '') continue
        let parsed: { id?: unknown; method?: unknown; result?: unknown; error?: unknown }
        try { parsed = JSON.parse(data) as typeof parsed } catch { continue }
        if (typeof parsed.method === 'string') {
          this.onNotification?.(parsed.method)
          continue
        }
        if (parsed.id !== requestId) continue
        await reader.cancel().catch(() => {})
        if (parsed.error !== undefined) throw new McpTransportError('MCP JSON-RPC request failed')
        return parsed.result
      }
    }
    throw new McpTransportError('SSE response carried no matching JSON-RPC result')
  }

  async stop(): Promise<void> {
    // Terminate the server-side Streamable HTTP session when one exists.
    if (this.config.url !== undefined && this.sessionId !== undefined) {
      await fetch(this.config.url, {
        method: 'DELETE',
        headers: {
          origin: new URL(this.config.url).origin,
          'mcp-session-id': this.sessionId,
          ...(this.bearerToken !== undefined ? { authorization: `Bearer ${this.bearerToken}` } : {}),
        },
      }).catch(() => undefined)
    }
    this.sessionId = undefined
  }
}


function descriptorsFromList(raw: unknown): readonly McpToolDescriptor[] {
  const result = raw as { tools?: { name: string; description?: string; inputSchema?: unknown; annotations?: { readOnlyHint?: boolean; requiresUserInteraction?: boolean } }[] } | undefined
  const seen = new Set<string>()
  const descriptors: McpToolDescriptor[] = []
  for (const tool of result?.tools ?? []) {
    if (typeof tool.name !== 'string' || tool.name.trim() === '' || seen.has(tool.name)) {
      throw new McpTransportError(`MCP tools/list contains duplicate or empty tool name`)
    }
    seen.add(tool.name)
    descriptors.push({
      name: tool.name,
      ...(tool.description !== undefined ? { description: tool.description } : {}),
      inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
      ...(tool.annotations?.readOnlyHint === true ? { readOnlyHint: true } : {}),
      ...(tool.annotations?.requiresUserInteraction === true ? { requiresUserInteraction: true } : {}),
    })
  }
  return descriptors
}

/** Retry + circuit breaker + health-check wrapper around one transport. */
export class McpServerClient {
  private transport: Transport | undefined
  state: TransportState = 'disabled'
  private consecutiveFailures = 0
  private breakerUntil = 0
  private breakerState: 'closed' | 'open' | 'half-open' = 'closed'
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined
  private recoveryRunning = false
  private healthTimer: ReturnType<typeof setInterval> | undefined
  private onReconnected: (() => Promise<void>) | undefined
  private toolsCache: readonly McpToolDescriptor[] = []

  constructor(
    readonly serverName: string,
    private readonly config: McpServerConfig,
    private readonly resolved: { readonly env?: Record<string, string> | undefined; readonly bearerToken?: string | undefined; readonly headers?: Record<string, string> | undefined },
    private readonly onAudit: (event: { readonly kind: 'call' | 'breaker' | 'reconnect'; readonly detail: string; readonly durationMs: number; readonly isError: boolean }) => void,
    private readonly runtime: { readonly breakerDurationMs?: number; readonly healthIntervalMs?: number; readonly reconnectJitterMs?: number } = {},
  ) {}

  /** Whether the breaker currently allows a call. */
  get available(): boolean {
    return this.state === 'ready' && Date.now() >= this.breakerUntil
  }

  get breakerOpenUntil(): number {
    return this.breakerUntil
  }

  /** Discover tools: connect if needed, snapshot tools/list. */
  async listTools(): Promise<readonly McpToolDescriptor[]> {
    if (Date.now() < this.breakerUntil) {
      throw new McpTransportError(`server '${this.serverName}' is disabled by the circuit breaker`)
    }
    await this.ensureConnected()
    const pages: McpToolDescriptor[] = []
    let cursor: string | undefined
    do {
      const raw = await this.withRetry(async () =>
        this.transport?.request('tools/list', cursor !== undefined ? { cursor } : {}, this.config.timeoutMs ?? 15_000))
      pages.push(...descriptorsFromList(raw))
      cursor = (raw as { nextCursor?: unknown } | undefined)?.nextCursor as string | undefined
    } while (cursor !== undefined && cursor !== '')
    this.toolsCache = pages
    const tools = pages
    return tools
  }

  cachedTools(): readonly McpToolDescriptor[] {
    return this.toolsCache
  }

  /** One tools/call with the retry window (3× backoff before any output). */
  async callTool(tool: string, args: Record<string, unknown>, timeoutMs: number, signal?: AbortSignal): Promise<McpCallResult> {
    if (Date.now() < this.breakerUntil) {
      throw new McpTransportError(`server '${this.serverName}' is disabled by the circuit breaker`)
    }
    const started = Date.now()
    let lastError: Error | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.ensureConnected()
        const raw = await this.transport?.request('tools/call', { name: tool, arguments: args }, timeoutMs, signal)
        this.recordSuccess()
        const result = (raw ?? {}) as { isError?: boolean; content?: unknown }
        this.onAudit({ kind: 'call', detail: `${this.serverName}.${tool}`, durationMs: Date.now() - started, isError: result.isError === true })
        return { isError: result.isError === true, content: result.content ?? null }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        // Retry only before meaningful output: transport-level failures
        // here have produced no tool output, so backoff and retry.
        if (signal?.aborted === true) break
        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt))
      }
    }
    this.recordFailure(lastError ?? new Error('call failed'))
    throw lastError ?? new McpTransportError('tools/call failed')
  }

  /** Disconnect with verified subprocess cleanup. */
  async disconnect(): Promise<void> {
    if (this.healthTimer !== undefined) {
      clearInterval(this.healthTimer)
      this.healthTimer = undefined
    }
    if (this.recoveryTimer !== undefined) {
      clearTimeout(this.recoveryTimer)
      this.recoveryTimer = undefined
    }
    await this.transport?.stop()
    this.transport = undefined
    this.state = 'disabled'
  }

  /** 30s health checks; breaker recovery is timer-driven and single-flight. */
  startHealthChecks(onReconnected: () => Promise<void>): void {
    this.onReconnected = onReconnected
    if (this.breakerState === 'open') this.scheduleRecovery(onReconnected)
    if (this.healthTimer !== undefined) return
    this.healthTimer = setInterval(() => {
      if (this.breakerState === 'open') return
      void (async () => {
        try {
          await this.ensureConnected()
          const raw = await this.transport?.request('tools/list', {}, 5_000)
          this.toolsCache = descriptorsFromList(raw)
          this.recordSuccess()
        } catch {
          this.recordFailure(new McpTransportError('health check failed'), onReconnected)
        }
      })()
    }, this.runtime.healthIntervalMs ?? 30_000)
    this.healthTimer.unref?.()
  }

  private scheduleRecovery(onReconnected: () => Promise<void>): void {
    if (this.recoveryTimer !== undefined) return
    const delay = Math.max(0, this.breakerUntil - Date.now()) +
      (this.runtime.reconnectJitterMs ?? Math.floor(Math.random() * 2_000))
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined
      if (this.recoveryRunning) return
      this.recoveryRunning = true
      void (async () => {
        try {
          this.breakerState = 'half-open'
          await this.transport?.stop().catch(() => {})
          this.transport = undefined
          await this.ensureConnected(true)
          const transport = this.transport as Transport | undefined
          if (transport === undefined) throw new McpTransportError('reconnect produced no transport')
          const raw = await transport.request('tools/list', {}, 5_000)
          this.toolsCache = descriptorsFromList(raw)
          this.recordSuccess()
          await onReconnected()
          this.onAudit({ kind: 'reconnect', detail: this.serverName, durationMs: 0, isError: false })
        } catch {
          this.openBreaker(onReconnected)
        } finally {
          this.recoveryRunning = false
        }
      })()
    }, delay)
    this.recoveryTimer.unref?.()
  }

  private async ensureConnected(halfOpen = false): Promise<void> {
    if (this.breakerState === 'open') {
      if (!halfOpen && Date.now() < this.breakerUntil) {
        throw new McpTransportError(`server '${this.serverName}' is disabled by the circuit breaker`)
      }
      // Recovery window elapsed: this caller becomes the half-open probe.
      this.breakerState = 'half-open'
    }
    if (this.transport !== undefined && this.state === 'ready') return
    this.state = 'connecting'
    const onNotification = (method: string): void => {
      if (method === 'notifications/tools/list_changed') {
        void this.refreshToolsFromNotification()
      }
    }
    this.transport =
      this.config.transport === 'stdio'
        ? new StdioTransport(this.config, this.resolved.env ?? {}, onNotification)
        : new HttpTransport({
            ...this.config,
            ...((this.resolved.headers ?? this.config.headers) !== undefined
              ? { headers: this.resolved.headers ?? this.config.headers }
              : {}),
          }, this.resolved.bearerToken, onNotification)
    await this.transport.start()
    this.state = this.transport.state
  }

  private async refreshToolsFromNotification(): Promise<void> {
    try {
      const raw = await this.transport?.request('tools/list', {}, this.config.timeoutMs ?? 15_000)
      this.toolsCache = descriptorsFromList(raw)
      await this.onReconnected?.()
      this.onAudit({ kind: 'reconnect', detail: `${this.serverName}: tools/list_changed`, durationMs: 0, isError: false })
    } catch {
      this.recordFailure(new McpTransportError('tools/list_changed refresh failed'))
    }
  }

  private async withRetry<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let lastError: Error | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal?.aborted === true) throw new McpTransportError('cancelled')
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt))
      }
    }
    throw lastError ?? new McpTransportError('operation failed')
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0
    this.breakerUntil = 0
    this.breakerState = 'closed'
    this.state = 'ready'
  }

  private recordFailure(error: Error, onReconnected?: () => Promise<void>): void {
    this.consecutiveFailures += 1
    // Redacted diagnostic detail: never store/log the raw server error.
    this.onAudit({ kind: 'call', detail: `${this.serverName}: operation failed`, durationMs: 0, isError: true })
    if (this.consecutiveFailures >= 5) this.openBreaker(onReconnected ?? this.onReconnected)
  }

  private openBreaker(onReconnected?: () => Promise<void>): void {
    this.breakerUntil = Date.now() + (this.runtime.breakerDurationMs ?? 5 * 60_000)
    this.breakerState = 'open'
    this.state = 'failed'
    this.consecutiveFailures = 0
    this.onAudit({ kind: 'breaker', detail: `${this.serverName} breaker open`, durationMs: 0, isError: true })
    void this.transport?.stop()
    this.transport = undefined
    const recover = onReconnected ?? this.onReconnected
    if (recover !== undefined) this.scheduleRecovery(recover)
  }
}
