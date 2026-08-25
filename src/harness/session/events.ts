import { assertNever } from '../../kernel/index.ts'
import type { SessionId, StepId, TurnId } from '../../util/brand.ts'
import type { ModelMessage } from '../llm/types.ts'

/** Fields the session itself stamps onto every appended event. */
interface SessionEventStamp {
  readonly seq: number
  readonly timestamp: number
}

/**
 * The durable session log vocabulary: everything the model saw or said, plus
 * the turn/step structure around it. Closed union — new durable facts extend
 * this type and every switch over it, ending in `assertNever`.
 */
export type SessionEvent =
  | ({ readonly type: 'turn/start'; readonly turnId: TurnId } & SessionEventStamp)
  | ({ readonly type: 'user/message'; readonly turnId: TurnId; readonly content: string } & SessionEventStamp)
  | ({ readonly type: 'step/start'; readonly turnId: TurnId; readonly stepId: StepId } & SessionEventStamp)
  | ({ readonly type: 'assistant/chunk'; readonly stepId: StepId; readonly delta: string } & SessionEventStamp)
  | ({ readonly type: 'assistant/message'; readonly stepId: StepId; readonly content: string } & SessionEventStamp)
  | ({ readonly type: 'step/end'; readonly turnId: TurnId; readonly stepId: StepId } & SessionEventStamp)
  | ({ readonly type: 'turn/end'; readonly turnId: TurnId; readonly reason: TurnEndReason } & SessionEventStamp)

/** Why a turn closed. */
export type TurnEndReason =
  | 'completed'
  | 'rejected'
  | 'empty'

/** Distributive Omit so the union stays a union after removing stamped fields. */
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never

/** An event before stamping: what producers pass to `Session.append()`. */
export type SessionAppendedEvent = DistributiveOmit<SessionEvent, 'seq' | 'timestamp'>

/**
 * Project model history from the log: user and assistant messages in order.
 * Raw `assistant/chunk` events stay in the log for replay and UI fidelity
 * but never reach the model twice — the assembled `assistant/message` is the
 * durable fact.
 */
export function deriveMessages(events: readonly SessionEvent[]): ModelMessage[] {
  const messages: ModelMessage[] = []
  for (const event of events) {
    switch (event.type) {
      case 'user/message':
        messages.push({ role: 'user', content: event.content })
        break
      case 'assistant/message':
        messages.push({ role: 'assistant', content: event.content })
        break
      case 'turn/start':
      case 'step/start':
      case 'assistant/chunk':
      case 'step/end':
      case 'turn/end':
        break
      default:
        assertNever(event)
    }
  }
  return messages
}
