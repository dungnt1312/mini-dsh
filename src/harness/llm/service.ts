import { Service, type Context } from '../../kernel/index.ts'
import type { LlmProvider, ModelRequest, StreamEvent } from './types.ts'

declare module 'mini-dsh' {
  interface Context {
    llm: LlmService
  }
  interface Events {
    /**
     * Around-middleware over the active provider's stream call: listeners
     * may replace the request downstream or short-circuit with their own
     * iterable. Dispatched by `ctx.llm.stream()`; the default delegates to
     * the selected provider.
     */
    'llm/stream'(
      request: ModelRequest,
      next: (replacement?: ModelRequest) => AsyncIterable<StreamEvent>,
    ): AsyncIterable<StreamEvent>
  }
}

/**
 * The LLM capability seam: a provider registry plus the streaming entry
 * point. Consumers call `ctx.llm.stream(request)`; providers register
 * themselves as effects and can be swapped without touching callers.
 */
export class LlmService extends Service {
  private providers = new Map<string, LlmProvider>()
  private selected: string | undefined

  constructor(ctx: Context) {
    super(ctx, 'llm')
  }

  /**
   * Register a provider. The registration is an effect: it unwinds when the
   * owning fiber unloads.
   *
   * @returns a disposer removing the provider.
   */
  register(provider: LlmProvider): () => void {
    this.providers.set(provider.name, provider)
    if (this.selected === undefined) this.selected = provider.name
    const dispose = this.ctx.effect(() => () => {
      this.providers.delete(provider.name)
      if (this.selected === provider.name) this.selected = undefined
    }, `llm.register(${provider.name})`)
    return () => {
      void dispose()
    }
  }

  /**
   * Select the active provider by name. Fails loud on an unknown name so a
   * misconfigured composition never silently streams from the wrong one.
   */
  use(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`llm: no provider named '${name}' (registered: ${[...this.providers.keys()].join(', ') || 'none'})`)
    }
    this.selected = name
  }

  /** The active provider; throws when none is registered. */
  active(): LlmProvider {
    const provider = this.selected === undefined ? undefined : this.providers.get(this.selected)
    if (provider === undefined) {
      throw new Error('llm: no provider registered')
    }
    return provider
  }

  /**
   * Stream a completion through the `llm/stream` waterfall, whose default
   * delegates to the active provider. Model-visible input must come from
   * `Session.deriveMessages()` — anything else breaks the logged-context
   * invariant.
   *
   * An `async` listener returns a promise of the iterable rather than the
   * iterable itself; the chain result is normalized either way so consumers
   * always receive an `AsyncIterable`.
   */
  stream(request: ModelRequest): AsyncIterable<StreamEvent> {
    const chained = this.ctx.waterfall('llm/stream', request, (replacement) =>
      this.active().stream(replacement ?? request),
    )
    if (isAsyncIterable(chained)) return chained
    return (async function* resolve(awaited: Promise<AsyncIterable<StreamEvent>>) {
      yield* await awaited
    })(chained as Promise<AsyncIterable<StreamEvent>>)
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<StreamEvent> {
  return value !== null && typeof value === 'object' && Symbol.asyncIterator in value
}
