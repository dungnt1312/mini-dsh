/**
 * mini-dsh: a miniature TypeScript replica of the DeepSeek Harness
 * architecture — a Cordis-shaped plugin kernel plus an agent core (durable
 * session log, LLM streaming seam, turn/step driver).
 */
// ── Kernel ────────────────────────────────────────────────────────────────
export { EventBus, type Events, type DispatchMode, type EventOptions } from './kernel/events.ts'
export {
  Fiber,
  assertNever,
  type Effect,
  type EffectMeta,
  type FiberState,
} from './kernel/fiber.ts'
export { ServiceStore, type ServiceChange } from './kernel/store.ts'
export { Context, createContext } from './kernel/context.ts'
export { Service } from './kernel/service.ts'
export {
  Kernel,
  resolvePlugin,
  type PluginTarget,
  type ResolvedPlugin,
} from './kernel/registry.ts'
export {
  boot,
  bootFromFile,
  loadPluginModule,
  parseConfig,
  type ConfigEntry,
} from './kernel/loader.ts'

// ── Util ──────────────────────────────────────────────────────────────────
export type { Branded, SessionId, StepId, TurnId } from './util/brand.ts'
export { newSessionId, newStepId, newTurnId } from './util/brand.ts'

// ── Harness: session log ─────────────────────────────────────────────────
export {
  deriveMessages,
  type SessionAppendedEvent,
  type SessionEvent,
  type TurnEndReason,
} from './harness/session/events.ts'
export { Session } from './harness/session/session.ts'
export { SessionsService } from './harness/session/service.ts'

// ── Harness: LLM seam ────────────────────────────────────────────────────
export type { LlmProvider, ModelMessage, ModelRequest } from './harness/llm/types.ts'
export { LlmService } from './harness/llm/service.ts'
export { MockLlmProvider } from './harness/llm/mock.ts'
export { DeepSeekProvider } from './harness/llm/deepseek.ts'

// ── Harness: agent ───────────────────────────────────────────────────────
export type {
  AgentStatus,
  InboxItem,
  PreStepDecision,
} from './harness/agent/types.ts'
export { Agent } from './harness/agent/agent.ts'
export { AgentsService } from './harness/agent/service.ts'
