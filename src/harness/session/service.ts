import { Service, type Context } from '../../kernel/index.ts'
import type { SessionId } from '../../util/brand.ts'
import { Session } from './session.ts'

declare module 'mini-dsh' {
  interface Context {
    sessions: SessionsService
  }
}

/**
 * The session registry: creates, looks up, and forks durable conversation
 * logs. Persistence arrives in a later phase; today the store is in memory.
 */
export class SessionsService extends Service {
  private sessions = new Map<SessionId, Session>()

  constructor(ctx: Context) {
    super(ctx, 'sessions')
  }

  /** Create an empty session and register it. */
  create(): Session {
    const session = new Session(this.ctx)
    this.sessions.set(session.id, session)
    return session
  }

  /**
   * Look up a session by id for resume. Throws on an unknown id — a missing
   * referent is never silently skipped.
   */
  get(id: SessionId): Session {
    const session = this.sessions.get(id)
    if (session === undefined) {
      throw new Error(`sessions: no session '${id}'`)
    }
    return session
  }

  /** Fork a session; see {@link Session.fork}. */
  fork(source: Session, boundarySeq?: number): Session {
    const child = source.fork(boundarySeq)
    this.sessions.set(child.id, child)
    return child
  }

  /** Remove a session; unknown ids are silently ignored (like a no-op delete). */
  delete(id: SessionId): void {
    this.sessions.delete(id)
  }
}
