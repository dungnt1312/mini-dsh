import { AsyncLocalStorage } from 'node:async_hooks'
import type { ProjectId, SessionId, WorkspaceId } from '../../util/brand.ts'

/**
 * The ambient agent scope: while `Agent.run()` drives a turn, pipeline
 * listeners can read which session/workspace/project is executing — the
 * miniature counterpart of the upstream initiator scope. The workspace and
 * project come from the host at agent creation and are fixed for the run:
 * model-supplied arguments can never choose a different workspace, and
 * approval routing, tool grants, and scoped controls all resolve through
 * this store. The store is absent outside any run.
 */
export interface AgentScope {
  readonly sessionId: SessionId
  readonly workspaceId?: WorkspaceId
  readonly projectId?: ProjectId
  /**
   * G4: present when this run is a CHILD agent. The definition's tool
   * ceiling rides here — the exposure gate enforces definition ∩ grant on
   * every child tool start. A child can never spawn children.
   */
  readonly childOf?: {
    readonly parentSessionId: SessionId
    readonly parentTurnId: string
    readonly definition: string
    /** Hard ceiling: definition ∩ spawn grant (MCP always explicit). */
    readonly toolCeiling: readonly string[]
    readonly modelOverride?: string
    readonly skills?: readonly string[]
  }
}

export const agentScope = new AsyncLocalStorage<AgentScope>()
