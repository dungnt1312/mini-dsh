import type { Context } from '../../kernel/index.ts'
import { newSessionId, type SessionId } from '../../util/brand.ts'
import type { ModelMessage } from '../llm/types.ts'
import { deriveMessages, type SessionAppendedEvent, type SessionEvent } from './events.ts'

declare module 'mini-dsh' {
  interface Events {
    /** A durable fact was appended to a session log; observers render from this. */
    'session/event'(session: Session, event: SessionEvent): void
  }
}

/**
 * One durable conversation: an append-only event log. The log is the source
 * of model context — `deriveMessages()` projects history from it, and a
 * runtime invariant asserts everything a model sees is reconstructable from
 * it, so a new model-visible input requires a new session event.
 */
export class Session {
  private log: SessionEvent[] = []

  constructor(
    private readonly ctx: Context,
    readonly id: SessionId = newSessionId(),
  ) {}

  /** The durable log so far, in append order. */
  get events(): readonly SessionEvent[] {
    return this.log
  }

  /**
   * Append a durable fact: stamps `seq` and `timestamp`, stores it, and
   * broadcasts `session/event`. Appending is the only way state grows.
   *
   * @returns the stamped event.
   */
  append(event: SessionAppendedEvent): SessionEvent {
    const stamped: SessionEvent = { ...event, seq: this.log.length + 1, timestamp: Date.now() }
    this.log.push(stamped)
    this.ctx.emit('session/event', this, stamped)
    return stamped
  }

  /** Project model history from this log; see {@link deriveMessages}. */
  deriveMessages(): ModelMessage[] {
    return deriveMessages(this.log)
  }

  /**
   * Fork this session into a new one, copying events up to and including
   * `boundarySeq` (all events when omitted), with `seq` rebased from 1.
   * Copied history is not re-broadcast; the child's future appends are.
   *
   * @returns the child session.
   */
  fork(boundarySeq?: number): Session {
    const child = new Session(this.ctx)
    const limit = boundarySeq ?? this.log[this.log.length - 1]?.seq ?? 0
    for (const event of this.log) {
      if (event.seq > limit) break
      child.log.push({ ...event, seq: child.log.length + 1 })
    }
    return child
  }
}
