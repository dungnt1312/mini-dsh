import type { Context } from './context.ts'

/**
 * Base class for plugins that expose a named capability on `ctx`.
 *
 * The constructor registers the instance under `name` through
 * `ctx.provide()`, so the service appears as `ctx.<name>` to consumers and
 * unregisters automatically when the owning fiber unloads.
 */
export abstract class Service {
  /** The context this service was registered in. */
  protected readonly ctx: Context

  /** The service name this instance is registered under. */
  readonly name: string

  /**
   * @param ctx — the fiber-owned context registering this instance.
   * @param name — the service name claimed on that context.
   */
  constructor(ctx: Context, name: string) {
    this.ctx = ctx
    this.name = name
    ctx.provide(name, this)
  }
}
