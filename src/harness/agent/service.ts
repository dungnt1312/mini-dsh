import { Service, type Context } from '../../kernel/index.ts'
import type { Session } from '../session/session.ts'
import { Agent } from './agent.ts'

declare module 'mini-dsh' {
  interface Context {
    agents: AgentsService
  }
}

/**
 * The live agent registry: creates drivers bound to durable sessions. The
 * loop itself is this driver; a later phase swaps it behind the same
 * `ctx.agents` face.
 */
export class AgentsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'agents')
  }

  /**
   * Create an agent driving `session` (a fresh session when omitted).
   * Cross-service reads happen lazily at call time, so mount order never
   * matters for construction.
   */
  create(session?: Session): Agent {
    return new Agent(this.ctx, session ?? this.ctx.sessions.create())
  }
}
