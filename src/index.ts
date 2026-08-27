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
export type {
  LlmProvider,
  ModelMessage,
  ModelRequest,
  StreamEvent,
  ToolCall,
  ToolSchema,
} from './harness/llm/types.ts'
export { LlmService } from './harness/llm/service.ts'
export { MockLlmProvider, type MockScriptStep } from './harness/llm/mock.ts'
export { DeepSeekProvider } from './harness/llm/deepseek.ts'
export { OpenAiCompletionsProvider, type OpenAiCompletionsOptions } from './harness/llm/openai.ts'

// ── Harness: agent ───────────────────────────────────────────────────────
export type {
  AgentStatus,
  InboxItem,
  PreStepDecision,
} from './harness/agent/types.ts'
export { Agent } from './harness/agent/agent.ts'
export { AgentsService } from './harness/agent/service.ts'
export { agentScope } from './harness/agent/scope.ts'

// ── Harness: tool pipeline ───────────────────────────────────────────────
export type { PreExecuteDecision, ToolDefinition, ToolResult } from './harness/tools/types.ts'
export { ToolsService } from './harness/tools/service.ts'

// ── Harness: approval ────────────────────────────────────────────────────
export type { ApprovalMode, ApprovalOptions } from './harness/approval/policy.ts'
export { attachApproval } from './harness/approval/policy.ts'

// ── Capabilities: filesystem + shell ─────────────────────────────────────
export { fsTools, resolveWithin } from './capabilities/fs/tools.ts'
export { bashTool, type BashToolOptions } from './capabilities/shell/bash.ts'

// ── Web host ──────────────────────────────────────────────────────────────
export {
  createWebServer,
  extractModelIds,
  type PublicProvider,
  type WebEnvelope,
  type WebServer,
  type WebServerOptions,
} from './web/server.ts'
export {
  loadProviders,
  saveProviders,
  maskKey,
  slugify,
  type ProviderConfig,
} from './web/provider-store.ts'
