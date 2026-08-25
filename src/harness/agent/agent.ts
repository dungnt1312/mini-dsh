import type { Context } from '../../kernel/index.ts'
import { newStepId, newTurnId, type StepId, type TurnId } from '../../util/brand.ts'
import type { ModelRequest, ToolCall, ToolSchema } from '../llm/types.ts'
import type { Session } from '../session/session.ts'
import type { AgentStatus, InboxItem, PreStepDecision } from './types.ts'

/** Loop-hygiene bound: a turn that keeps calling tools stops here. */
const DEFAULT_MAX_STEPS = 8

/** The tools surface the loop consumes; optional, structurally typed. */
interface ToolRuntime {
  schemas(): ToolSchema[]
  execute(call: ToolCall): Promise<{ ok: boolean; output: string }>
}

/**
 * The default driver: one agent bound to one durable session, running the
 * turn/step flow over an inbox.
 *
 * A **step** is one model request plus the tools it calls; a **turn** is
 * zero or more steps: it opens before its first input is claimed and closes
 * once nothing is owed — tools that ran owe the model their results, so the
 * turn spends another step. Input reaches the driver through one inbox:
 * user messages wake it, injected context waits until a user message does.
 */
export class Agent {
  status: AgentStatus = 'idle'

  private inbox: InboxItem[] = []

  constructor(
    private readonly ctx: Context,
    readonly session: Session,
    private readonly maxSteps: number = DEFAULT_MAX_STEPS,
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
   * upstream bounded claim), asks `agent/pre-step` to admit it, then spends
   * steps while tools keep owing the model their results, letting
   * `agent/turn-stopping` observe before the turn closes.
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

    let lastStep: StepId | null = null
    let reason: 'completed' | 'max-steps' = 'completed'
    for (let spent = 1; spent <= this.maxSteps; spent++) {
      const { stepId, toolCalls } = await this.step(turnId, spent === 1 ? decision.contents : [])
      lastStep = stepId
      if (toolCalls.length === 0) break
      if (spent === this.maxSteps) reason = 'max-steps'
    }

    await this.ctx.serial('agent/turn-stopping', { turnId, lastStep })
    this.session.append({ type: 'turn/end', turnId, reason })
  }

  /**
   * One step: append admitted input (first step only), request from the log
   * with the registered tool schemas, stream the reply, then run every
   * requested tool and append its durable call/result pair.
   *
   * @returns the step id and the tool calls the model made.
   */
  private async step(turnId: TurnId, contents: readonly string[]): Promise<{ stepId: StepId; toolCalls: readonly ToolCall[] }> {
    const stepId = newStepId()
    this.session.append({ type: 'step/start', turnId, stepId })
    for (const content of contents) {
      this.session.append({ type: 'user/message', turnId, content })
    }

    // The tools service is optional: without it the loop still runs, and
    // tool calls fail as unknown tools.
    const tools = this.ctx.get('tools') as ToolRuntime | undefined
    const projected: ModelRequest = {
      messages: this.session.deriveMessages(),
      ...(tools !== undefined ? { tools: tools.schemas() } : {}),
    }
    const request = await this.ctx.waterfall(
      'agent/request',
      projected,
      (replacement) => Promise.resolve(replacement ?? projected),
    )

    let full = ''
    let calls: readonly ToolCall[] = []
    for await (const event of this.ctx.llm.stream(request)) {
      if (event.type === 'delta') {
        full += event.delta
        this.session.append({ type: 'assistant/chunk', stepId, delta: event.delta })
      } else {
        calls = event.calls
      }
    }
    this.session.append({
      type: 'assistant/message',
      stepId,
      content: full,
      ...(calls.length > 0 ? { toolCalls: calls } : {}),
    })

    for (const call of calls) {
      this.session.append({ type: 'tool/call', stepId, call })
      const result = tools !== undefined
        ? await tools.execute(call)
        : { ok: false, output: `unknown tool '${call.name}' (no tools service mounted)` }
      this.session.append({ type: 'tool/result', stepId, callId: call.id, ok: result.ok, output: result.output })
    }

    this.session.append({ type: 'step/end', turnId, stepId })
    return { stepId, toolCalls: calls }
  }
}
