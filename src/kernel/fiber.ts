/**
 * Effect body result accepted by {@link Fiber.effect}: a single disposer, a
 * promise of one, or a (possibly async) iterable yielding several.
 */
export type Effect = (() => unknown) | Promise<() => unknown> | Iterable<() => unknown>

/** Lifecycle states of one loaded plugin instance. */
export type FiberState = 'pending' | 'loading' | 'active' | 'unloading' | 'disposed' | 'failed'

/** Tree node exposed by {@link Fiber.getEffects} for diagnostics. */
export interface EffectMeta {
  /** Human-readable effect label. */
  label: string
  /** Metadata of nested effects registered while this effect ran. */
  children: EffectMeta[]
}

/**
 * Exhaustiveness check for closed unions: end every discriminated switch in
 * `default`/`else` position with a call so adding a variant breaks the build.
 */
export function assertNever(value: never, message = 'unreachable variant'): never {
  throw new Error(`${message}: ${String(value)}`)
}

/** Normalize every accepted {@link Effect} shape into one awaitable disposer. */
function normalizeDisposer(result: Effect): () => void | Promise<void> {
  if (typeof result === 'function') {
    const disposer: () => unknown = result
    return async () => {
      await disposer()
    }
  }
  if (result instanceof Promise) {
    return async () => {
      const disposer = await result
      await disposer()
    }
  }
  if (result !== null && typeof result === 'object' && Symbol.iterator in result) {
    const disposers = [...(result as Iterable<() => unknown>)]
    return async () => {
      for (const disposer of disposers.reverse()) {
        await disposer()
      }
    }
  }
  throw new TypeError(`invalid effect result: expected disposer, promise, or iterable; got ${typeof result}`)
}

let nextUid = 1

/**
 * One loaded plugin instance: its lifecycle state and registered effects.
 *
 * The fiber owns every registration the plugin makes through `ctx.effect()`,
 * `ctx.on()`, and `ctx.provide()`; disposal runs those cleanups in reverse
 * registration order, awaiting each one, so teardown unwinds predictably.
 */
export class Fiber {
  /** Unique id within the kernel; monotonically increasing. */
  readonly uid: number = nextUid++

  /** Current lifecycle state; `pending` while required services are absent. */
  state: FiberState = 'pending'

  private disposers: Array<() => void | Promise<void>> = []
  private effectMetas: EffectMeta[] = []

  /**
   * @param name — display name used in diagnostics, inherited from the plugin.
   */
  constructor(readonly name: string) {}

  /**
   * Register a cleanup-aware effect on this fiber.
   *
   * `execute` runs immediately; the disposer it produces is collected and run
   * in reverse registration order either when the returned disposer is called
   * or when the fiber unloads, whichever comes first. Calling the returned
   * disposer twice is a no-op. Throws when the fiber is already unloading,
   * disposed, or failed.
   *
   * @param label — effect label shown in {@link getEffects} diagnostics.
   * @returns a disposer that tears this one effect down and settles once done.
   */
  effect(execute: () => Effect, label = 'anonymous effect'): () => Promise<void> {
    switch (this.state) {
      case 'pending':
      case 'loading':
      case 'active':
        break
      case 'unloading':
      case 'disposed':
      case 'failed':
        throw new Error(`cannot create effect on fiber '${this.name}' in state '${this.state}'`)
      default:
        assertNever(this.state)
    }

    const disposer = normalizeDisposer(execute())
    this.disposers.push(disposer)
    this.effectMetas.push({ label, children: [] })

    let settled = false
    return async () => {
      if (settled) return
      settled = true
      const index = this.disposers.indexOf(disposer)
      if (index >= 0) this.disposers.splice(index, 1)
      await disposer()
    }
  }

  /** Copy of the currently registered effect labels, for diagnostics. */
  getEffects(): EffectMeta[] {
    return this.effectMetas.map((meta) => ({ label: meta.label, children: [...meta.children] }))
  }

  /**
   * Unload this fiber: run every collected disposer in reverse registration
   * order, awaiting each one, then settle as `disposed`. Safe to call twice;
   * the second call awaits the same teardown and returns.
   */
  async dispose(): Promise<void> {
    if (this.state === 'unloading' || this.state === 'disposed') return
    this.state = 'unloading'
    while (this.disposers.length > 0) {
      const disposer = this.disposers.pop()
      if (disposer) await disposer()
    }
    this.effectMetas = []
    this.state = 'disposed'
  }
}
