import { AsyncLocalStorage } from 'node:async_hooks'
import type { SessionId } from '../../util/brand.ts'

/**
 * The ambient agent scope: while `Agent.run()` drives a turn, tool pipeline
 * listeners can read which session's agent is executing — the miniature
 * counterpart of the upstream initiator scope. Routing an approval question
 * to the right human uses it; the store is absent outside any run.
 */
export const agentScope = new AsyncLocalStorage<{ sessionId: SessionId }>()
