import type { StepId, TurnId } from '../../util/brand.ts'

/** One queued input: user messages wake the driver, injected context waits. */
export interface InboxItem {
  readonly kind: 'user' | 'injected'
  readonly content: string
}

/** Live agent status. */
export type AgentStatus = 'idle' | 'running'

/**
 * The `agent/pre-step` waterfall decision: enter with the (possibly
 * rewritten) claimed messages, or reject the claim outright. A rejected or
 * first-enter-rewritten-empty claim still closes a durable turn that spent
 * no step, so the log records the attempt.
 */
export type PreStepDecision =
  | { readonly kind: 'enter'; readonly contents: readonly string[] }
  | { readonly kind: 'reject'; readonly reason?: string }

declare module 'mini-dsh' {
  interface Events {
    /**
     * Around-middleware deciding what one step admits: listeners rewrite the
     * claimed messages by forwarding a replacement through `next()`, or veto
     * by returning `{ kind: 'reject' }` without calling it.
     */
    'agent/pre-step'(
      claim: { readonly contents: readonly string[] },
      next: (replacement?: { readonly contents: readonly string[] }) => Promise<PreStepDecision>,
    ): Promise<PreStepDecision>

    /**
     * Around-middleware over the model request assembled from the log:
     * listeners may replace the request downstream (e.g. prepend a system
     * message) or short-circuit. The default returns the log-projected
     * request unchanged.
     */
    'agent/request'(
      request: import('../llm/types.ts').ModelRequest,
      next: (replacement?: import('../llm/types.ts').ModelRequest) => Promise<import('../llm/types.ts').ModelRequest>,
    ): Promise<import('../llm/types.ts').ModelRequest>

    /**
     * Serial listeners run once a turn's work has settled, before `turn/end`
     * is appended. Phase 2 listeners observe; continuation decisions (a tool
     * owing another request) arrive with the tool pipeline.
     */
    'agent/turn-stopping'(state: { readonly turnId: TurnId; readonly lastStep: StepId | null }): Promise<void>
  }
}
