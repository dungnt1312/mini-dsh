import { Service, type Context } from '../../kernel/index.ts'
import type { ToolCall } from '../llm/types.ts'

declare module 'mini-dsh' {
  interface Context {
    approval: ApprovalService
  }
}

/** What the policy wants for one tool call. */
export type ApprovalMode = 'allow' | 'ask' | 'deny'

/** Options for mounting the approval policy. */
export interface ApprovalOptions {
  /** Per-tool modes; calls for unnamed tools use `defaultMode`. */
  readonly policy?: Readonly<Record<string, ApprovalMode>>
  /** Mode for tools the policy map does not name. */
  readonly defaultMode?: ApprovalMode
  /**
   * Prompt shown to the human for `ask` calls; required before the first
   * `ask` decision. Returning true allows the call, false denies it.
   */
  readonly askUser?: (call: ToolCall) => Promise<boolean>
}

/**
 * The human-collaboration gate: one `tools/pre-execute` listener that turns
 * per-tool policy into allow/ask/deny decisions. `ask` calls pause for the
 * configured `askUser` answerer — the CLI supplies a readline prompt, tests
 * supply scripted answers. Unmounting the service removes the listener.
 */
export class ApprovalService extends Service {
  private readonly policy: Readonly<Record<string, ApprovalMode>>
  private readonly defaultMode: ApprovalMode
  private readonly askUser: ((call: ToolCall) => Promise<boolean>) | undefined

  constructor(ctx: Context, options: ApprovalOptions = {}) {
    super(ctx, 'approval')
    this.policy = options.policy ?? {}
    this.defaultMode = options.defaultMode ?? 'ask'
    this.askUser = options.askUser

    ctx.on('tools/pre-execute', async (payload, next) => {
      const mode = this.modeFor(payload.call.name)
      if (mode === 'allow') return next()
      if (mode === 'deny') {
        return { kind: 'deny', reason: `policy denies '${payload.call.name}'` }
      }
      if (this.askUser === undefined) {
        return { kind: 'deny', reason: `approval required for '${payload.call.name}' but no askUser answerer is configured` }
      }
      const allowed = await this.askUser(payload.call)
      return allowed ? next() : { kind: 'deny', reason: `the user denied '${payload.call.name}'` }
    })
  }

  /** The configured mode for one tool name. */
  modeFor(name: string): ApprovalMode {
    return this.policy[name] ?? this.defaultMode
  }
}
