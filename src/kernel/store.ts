/** A service became available or unavailable in the store. */
export interface ServiceChange {
  /** The service name that changed. */
  name: string
  /** Whether the service was added or removed. */
  kind: 'added' | 'removed'
}

/**
 * Flat per-application service store. Values are read through the context
 * proxy (`ctx.<name>`) or {@link ServiceStore.get}; `set` fails loud when the
 * name is already provided so a duplicate provider is never silent.
 */
export class ServiceStore {
  private services = new Map<string, unknown>()
  private listeners = new Set<(change: ServiceChange) => void>()

  /** Read a service value, or `undefined` when it is not provided. */
  get(name: string): unknown {
    return this.services.get(name)
  }

  /** Whether a service with `name` is currently provided. */
  has(name: string): boolean {
    return this.services.has(name)
  }

  /**
   * Register a service implementation. Throws when the name is already
   * provided; replacing a service goes through remove-then-add so dependents
   * restart against the new implementation.
   */
  set(name: string, value: unknown): void {
    if (this.services.has(name)) {
      throw new Error(`service '${name}' is already provided`)
    }
    this.services.set(name, value)
    this.broadcast({ name, kind: 'added' })
  }

  /** Remove a service; returns whether a value was actually removed. */
  delete(name: string): boolean {
    if (!this.services.delete(name)) return false
    this.broadcast({ name, kind: 'removed' })
    return true
  }

  /**
   * Observe additions and removals. The kernel uses this to wake pending
   * plugins and to restart dependents of a removed service.
   *
   * @returns a disposer removing the listener.
   */
  onChange(listener: (change: ServiceChange) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private broadcast(change: ServiceChange): void {
    for (const listener of [...this.listeners]) {
      listener(change)
    }
  }
}
