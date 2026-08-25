import type { Context } from '../../kernel/index.ts'
import type { ToolCall } from '../llm/types.ts'

/** What the policy wants for one tool call. */
export type ApprovalMode = 'allow' | 'ask' | 'deny'

/** Options for attaching an approval policy. */
export interface ApprovalOptions {
  /** Per-tool modes; calls for unnamed tools use `defaultMode`. */
  readonly policy?: Readonly<Record<string, ApprovalMode>>
  /** Mode for tools the policy map does not name. */
  readonly defaultMode?: ApprovalMode
  /**
   * Answerer consulted for `ask` calls; required before the first `ask`
   * decision. Returning true allows the call, false denies it. Routing the
   * question to the right human (terminal prompt, web banner) is the
   * answerer's concern; the policy itself stays transport-agnostic.
   */
  readonly askUser?: (call: ToolCall) => Promise<boolean>
}

/**
 * Attach an approval policy to `ctx` as one `tools/pre-execute` listener:
 * per-tool allow/ask/deny decisions, with `ask` calls pausing for the
 * configured answerer. `ask` without an answerer fails closed. The listener
 * is owned by the calling fiber — unloading that fiber removes the policy,
 * so several scoped policies can coexist.
 */
export function attachApproval(ctx: Context, options: ApprovalOptions = {}): void {
  const policy = options.policy ?? {}
  const defaultMode = options.defaultMode ?? 'ask'

  ctx.on('tools/pre-execute', async (payload, next) => {
    const mode = policy[payload.call.name] ?? defaultMode
    if (mode === 'allow') return next()
    if (mode === 'deny') {
      return { kind: 'deny', reason: `policy denies '${payload.call.name}'` }
    }
    if (options.askUser === undefined) {
      return { kind: 'deny', reason: `approval required for '${payload.call.name}' but no askUser answerer is configured` }
    }
    const allowed = await options.askUser(payload.call)
    return allowed ? next() : { kind: 'deny', reason: `the user denied '${payload.call.name}'` }
  })
}
