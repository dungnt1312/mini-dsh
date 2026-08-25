import { createContext, type Context } from './context.ts'
import { EventBus } from './events.ts'
import { Fiber } from './fiber.ts'
import { Service } from './service.ts'
import { ServiceStore, type ServiceChange } from './store.ts'

/** Everything a plugin can be: a function, an `{ apply }` object, or a {@link Service} subclass. */
export type PluginTarget =
  | ((ctx: Context) => void | Promise<void>)
  | { name?: string; inject?: string[]; apply: (ctx: Context) => void | Promise<void> }
  | (new (ctx: Context) => unknown)

/** Normalized plugin description the kernel mounts. */
export interface ResolvedPlugin {
  /** Display name used in diagnostics. */
  name: string
  /** Required service names; the plugin stays `pending` until all exist. */
  inject: string[]
  /** The plugin body, run once its requirements are satisfied. */
  apply: (ctx: Context) => void | Promise<void>
}

/** One mounted plugin: its definition plus the fiber/context pair running it. */
interface PluginEntry {
  definition: ResolvedPlugin
  fiber: Fiber
  ctx: Context
}

/**
 * Normalize any {@link PluginTarget} into a {@link ResolvedPlugin}.
 *
 * A {@link Service} subclass is mounted by instantiating it (its constructor
 * claims the service name); a function runs directly; an object delegates to
 * its `apply`. Function targets may carry an `inject` static property.
 */
export function resolvePlugin(target: PluginTarget): ResolvedPlugin {
  if (typeof target === 'function') {
    const inject = (target as { inject?: string[] }).inject ?? []
    if (target.prototype instanceof Service) {
      const Constructor = target as new (ctx: Context) => unknown
      return {
        name: target.name || 'anonymous-service',
        inject,
        apply: (ctx: Context) => {
          new Constructor(ctx)
        },
      }
    }
    const fn = target as (ctx: Context) => void | Promise<void>
    return { name: target.name || 'anonymous', inject, apply: fn }
  }
  if (target && typeof target === 'object' && typeof target.apply === 'function') {
    return {
      name: target.name ?? 'anonymous',
      inject: target.inject ?? [],
      apply: target.apply,
    }
  }
  throw new TypeError(`not a plugin: expected function, Service subclass, or { apply } object`)
}

/**
 * The kernel runtime: one event bus, one service store, and the set of
 * mounted plugins with dependency-driven lifecycle.
 *
 * Boot order comes from `inject`, never from mount order: a plugin whose
 * requirements are missing stays `pending`, and mounting a provider wakes it.
 * When a required service disappears, every loaded dependent is disposed and
 * re-mounted — it pends again until the service returns.
 */
export class Kernel {
  /** The shared event bus. */
  readonly events = new EventBus()

  /** The flat service store backing `ctx.<name>` reads. */
  readonly services = new ServiceStore()

  /** The root fiber's context, for mounting plugins outside any plugin. */
  readonly ctx: Context

  private readonly rootFiber = new Fiber('root')
  private readonly entries = new Set<PluginEntry>()
  private readonly observeServices: () => void

  constructor() {
    this.ctx = createContext(this, this.rootFiber)
    this.observeServices = this.services.onChange((change) => this.onServiceChange(change))
  }

  /** Resolve a {@link PluginTarget} into its normalized form. */
  resolvePlugin(target: PluginTarget): ResolvedPlugin {
    return resolvePlugin(target)
  }

  /**
   * Mount a resolved plugin. Returns its fiber; when requirements are
   * missing the fiber stays `pending` and the plugin body has not run.
   *
   * Prefer {@link Context.plugin}, which also ties the child to a parent.
   */
  plugin(definition: ResolvedPlugin): Fiber {
    const fiber = new Fiber(definition.name)
    const entry: PluginEntry = { definition, fiber, ctx: createContext(this, fiber) }
    this.entries.add(entry)
    this.start(entry)
    return fiber
  }

  /**
   * Tear the kernel down: stop observing the store, dispose every mounted
   * plugin, then dispose the root fiber. Safe to call once per kernel.
   */
  async stop(): Promise<void> {
    this.observeServices()
    for (const entry of [...this.entries]) {
      await entry.fiber.dispose()
    }
    this.entries.clear()
    await this.rootFiber.dispose()
  }

  /** Try to run `entry`: pend while requirements are missing, fail loud on throw. */
  private start(entry: PluginEntry): void {
    const missing = entry.definition.inject.filter((name) => !this.services.has(name))
    if (missing.length > 0) {
      entry.fiber.state = 'pending'
      return
    }

    entry.fiber.state = 'loading'
    let result: void | Promise<void>
    try {
      result = entry.definition.apply(entry.ctx)
    } catch (error) {
      entry.fiber.state = 'failed'
      this.entries.delete(entry)
      throw error
    }
    if (result instanceof Promise) {
      // An async startup failure has no caller to throw to anymore; it fails
      // the fiber loudly on the console instead of an unhandled rejection.
      void result.then(
        () => this.activated(entry),
        (error: unknown) => {
          entry.fiber.state = 'failed'
          this.entries.delete(entry)
          console.error(`plugin '${entry.definition.name}' failed to start`, error)
        },
      )
    } else {
      this.activated(entry)
    }
  }

  private activated(entry: PluginEntry): void {
    entry.fiber.state = 'active'
    this.flushPending()
  }

  /** Re-try every `pending` entry — a new provider may satisfy it now. */
  private flushPending(): void {
    for (const entry of this.pendingEntries()) {
      this.start(entry)
    }
  }

  private pendingEntries(): PluginEntry[] {
    return [...this.entries].filter((entry) => entry.fiber.state === 'pending')
  }

  /**
   * Service additions wake pending plugins; removals dispose every loaded
   * dependent and re-mount it, so it pends until the service returns. The
   * removal of a service during kernel teardown is not observed: `stop()`
   * detaches the listener first.
   */
  private onServiceChange(change: ServiceChange): void {
    if (change.kind === 'added') {
      this.flushPending()
      return
    }
    for (const entry of [...this.entries]) {
      if (entry.fiber.state === 'pending') continue
      if (!entry.definition.inject.includes(change.name)) continue
      void this.restartEntry(entry)
    }
  }

  private async restartEntry(entry: PluginEntry): Promise<void> {
    await entry.fiber.dispose()
    this.entries.delete(entry)
    this.plugin(entry.definition)
  }
}
