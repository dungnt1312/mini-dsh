import { assertNever } from '../../kernel/index.ts'
import type { StepId, TurnId } from '../../util/brand.ts'
import type { ModelMessage, ToolCall } from '../llm/types.ts'

/** Fields the session itself stamps onto every appended event. */
interface SessionEventStamp {
  readonly seq: number
  readonly timestamp: number
}

/**
 * The controls actually in force for one model request: which model served
 * the step and through which provider. Recorded on the step's answer so the
 * log answers "what did this reply come from" without guessing.
 */
export interface RequestControls {
  readonly model?: string
  readonly provider?: string
}

/**
 * The durable session log vocabulary: everything the model saw or said —
 * including the tools it called and what they answered — plus the turn/step
 * structure, approval traffic, durable input acceptance, and session
 * metadata around it. Closed union — new durable facts extend this type
 * and every switch over it, ending in `assertNever`.
 */
export type SessionEvent =
  | ({ readonly type: 'turn/start'; readonly turnId: TurnId } & SessionEventStamp)
  | ({ readonly type: 'user/message'; readonly turnId: TurnId; readonly content: string; readonly inputId?: string } & SessionEventStamp)
  | ({ readonly type: 'step/start'; readonly turnId: TurnId; readonly stepId: StepId } & SessionEventStamp)
  | ({ readonly type: 'assistant/chunk'; readonly stepId: StepId; readonly delta: string; readonly thinking?: boolean } & SessionEventStamp)
  | ({ readonly type: 'assistant/message'; readonly stepId: StepId; readonly content: string; readonly toolCalls?: readonly ToolCall[]; readonly controls?: RequestControls } & SessionEventStamp)
  | ({ readonly type: 'tool/call'; readonly stepId: StepId; readonly call: ToolCall; readonly policyRevision?: number } & SessionEventStamp)
  | ({ readonly type: 'tool/result'; readonly stepId: StepId; readonly callId: string; readonly ok: boolean; readonly output: string; /** Set on synthesized recovery records: the real outcome is unknown. */ readonly recovery?: true } & SessionEventStamp)
  | ({ readonly type: 'step/end'; readonly turnId: TurnId; readonly stepId: StepId } & SessionEventStamp)
  | ({ readonly type: 'turn/end'; readonly turnId: TurnId; readonly reason: TurnEndReason } & SessionEventStamp)
  | ({ readonly type: 'turn/error'; readonly turnId: TurnId; readonly kind: TurnErrorKind; readonly message: string } & SessionEventStamp)
  | ({ readonly type: 'approval/request'; readonly approvalId: string; readonly call: ToolCall } & SessionEventStamp)
  | ({ readonly type: 'approval/decision'; readonly approvalId: string; readonly decision: ApprovalDecision; readonly reason?: string } & SessionEventStamp)
  | ({ readonly type: 'input/queued'; readonly inputId: string; readonly clientRequestId?: string; readonly content: string } & SessionEventStamp)
  | ({ readonly type: 'session/title'; readonly title: string | null } & SessionEventStamp)
  | ({ readonly type: 'session/project'; readonly projectId: string | null } & SessionEventStamp)
  | ({ readonly type: 'session/child-meta'; readonly parentSessionId: string; readonly parentTurnId: string; readonly definition: string; readonly objective: string } & SessionEventStamp)
  | ({ readonly type: 'agent/child-spawn'; readonly childSessionId: string; readonly parentTurnId: string; readonly definition: string; readonly objective: string } & SessionEventStamp)
  | ({ readonly type: 'agent/child-result'; readonly childSessionId: string; readonly parentTurnId: string; readonly status: string } & SessionEventStamp)
  | ({ readonly type: 'mcp/call'; readonly server: string; readonly tool: string; readonly argsHash: string; readonly resultHash: string; readonly durationMs: number; readonly isError: boolean } & SessionEventStamp)
  | ({ readonly type: 'hook/run'; readonly event: string; readonly matcher: string; readonly exitCode: number | null; readonly durationMs: number; readonly decision: string } & SessionEventStamp)

/** Why a turn closed. */
export type TurnEndReason =
  | 'completed'
  | 'rejected'
  | 'empty'
  | 'failed'
  /** The user stopped the run; queued input stays queued. */
  | 'cancelled'
  /** The host restarted (or crashed) with the turn still open. */
  | 'interrupted'
  /** A configured limit (step budget, turn deadline) closed the turn. */
  | 'limit'

/** Durable classification of why a turn failed. */
export type TurnErrorKind = 'provider' | 'storage' | 'limit' | 'internal'

/** How an approval request was settled. */
export type ApprovalDecision = 'allow' | 'deny' | 'expired' | 'cancelled' | 'invalidated'

/** Distributive Omit so the union stays a union after removing stamped fields. */
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never

/** An event before stamping: what producers pass to `Session.append()`. */
export type SessionAppendedEvent = DistributiveOmit<SessionEvent, 'seq' | 'timestamp'>

/**
 * Project model history from the log: user, assistant (with its tool calls),
 * and tool results in order. Raw `assistant/chunk` events stay in the log
 * for replay and UI fidelity but never reach the model twice — the assembled
 * `assistant/message` is the durable fact, and each `tool/result` answers
 * the call its `callId` names. Recovery-synthesized results project like
 * real ones: their content says the outcome is unknown, and the `recovery`
 * flag keeps them distinguishable from original tool output.
 */
export function deriveMessages(events: readonly SessionEvent[]): ModelMessage[] {
  const messages: ModelMessage[] = []
  for (const event of events) {
    switch (event.type) {
      case 'user/message':
        messages.push({ role: 'user', content: event.content })
        break
      case 'assistant/message':
        messages.push(
          event.toolCalls === undefined
            ? { role: 'assistant', content: event.content }
            : { role: 'assistant', content: event.content, toolCalls: event.toolCalls },
        )
        break
      case 'tool/result':
        messages.push({ role: 'tool', content: event.output, toolCallId: event.callId })
        break
      case 'turn/start':
      case 'step/start':
      case 'assistant/chunk':
      case 'tool/call':
      case 'step/end':
      case 'turn/end':
      case 'turn/error':
      case 'approval/request':
      case 'approval/decision':
      case 'input/queued':
      case 'session/title':
      case 'session/project':
      case 'session/child-meta':
      case 'agent/child-spawn':
      case 'agent/child-result':
      case 'mcp/call':
      case 'hook/run':
        break
      default:
        assertNever(event)
    }
  }
  return messages
}
