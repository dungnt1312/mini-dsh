import type { Context } from '../../kernel/index.ts'
import { newStepId, newTurnId, type StepId, type TurnId } from '../../util/brand.ts'
import type { ModelRequest } from '../llm/types.ts'
import type { Session } from '../session/session.ts'
import type { AgentStatus, InboxItem, PreStepDecision } from './types.ts'

/**
 * The default driver: one agent bound to one durable session, running the
 * turn/step flow over an inbox.
 *
 * A **step** is one model request plus (in later phases) the tools it
 * calls; a **turn** is zero or more steps: it opens before its first input
 * is claimed and closes once nothing is owed. Input reaches the driver
 * through one inbox: user messages wake it, injected context waits until a
 * user message does.
 */
export class Agent {
  status: AgentStatus = 'idle'

  private inbox: InboxItem[] = []

  constructor(
    private readonly ctx: Context,
    readonly session: Session,
  ) {}

  /** Queue a user message; wakes the driver on the next `run()`. */
  send(content: string): void {
    this.inbox.push({ kind: 'user', content })
  }

  /**
   * Queue context that must reach the next admitted request without waking
   * the driver: it waits in the inbox until a user message arrives.
   */
  inject(content: string): void {
    this.inbox.push({ kind: 'injected', content })
  }

  /**
   * Drive turns until the inbox drains, then go idle. Every step assembles
   * its request from `session.deriveMessages()` — model-visible means
   * logged.
   */
  async run(): Promise<void> {
    if (this.status === 'running') return
    this.status = 'running'
    try {
      // Only a user message opens a turn; injected context waits in the
      // inbox until one arrives and is claimed alongside it.
      while (this.inbox.some((item) => item.kind === 'user')) {
        await this.turn()
      }
    } finally {
      this.status = 'idle'
    }
  }

  /**
   * One turn. Claims the whole pending inbox (a simplification of the
   * upstream bounded claim), asks `agent/pre-step` to admit it, spends one
   * step when admitted, then lets `agent/turn-stopping` observe before the
   * turn closes.
   */
  private async turn(): Promise<void> {
    const turnId = newTurnId()
    this.session.append({ type: 'turn/start', turnId })

    const claimed = this.inbox.splice(0, this.inbox.length)
    const contents = claimed.map((item) => item.content)
    const decision = await this.ctx.waterfall(
      'agent/pre-step',
      { contents },
      (replacement) =>
        Promise.resolve({
          kind: 'enter',
          contents: replacement?.contents ?? contents,
        } satisfies PreStepDecision),
    )

    if (decision.kind === 'reject') {
      this.session.append({ type: 'turn/end', turnId, reason: 'rejected' })
      return
    }
    if (decision.contents.length === 0) {
      this.session.append({ type: 'turn/end', turnId, reason: 'empty' })
      return
    }

    const stepId = await this.step(turnId, decision.contents)
    await this.ctx.serial('agent/turn-stopping', { turnId, lastStep: stepId })
    this.session.append({ type: 'turn/end', turnId, reason: 'completed' })
  }

  /** One step: append admitted input, request from the log, stream the reply. */
  private async step(turnId: TurnId, contents: readonly string[]): Promise<StepId> {
    const stepId = newStepId()
    this.session.append({ type: 'step/start', turnId, stepId })
    for (const content of contents) {
      this.session.append({ type: 'user/message', turnId, content })
    }

    const projected: ModelRequest = { messages: this.session.deriveMessages() }
    const request = await this.ctx.waterfall(
      'agent/request',
      projected,
      (replacement) => Promise.resolve(replacement ?? projected),
    )

    let full = ''
    for await (const delta of this.ctx.llm.stream(request)) {
      full += delta
      this.session.append({ type: 'assistant/chunk', stepId, delta })
    }
    this.session.append({ type: 'assistant/message', stepId, content: full })
    this.session.append({ type: 'step/end', turnId, stepId })
    return stepId
  }
}
