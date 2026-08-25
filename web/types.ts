/** Client-side mirror of the wire shapes the server sends. */

export interface ToolCall {
  readonly id: string
  readonly name: string
  readonly args: Record<string, unknown>
}

/** One durable session event; fields are optional per `type`. */
export interface SseEvent {
  readonly type: string
  readonly seq: number
  readonly timestamp?: number
  readonly content?: string
  readonly delta?: string
  readonly call?: ToolCall
  readonly callId?: string
  readonly ok?: boolean
  readonly output?: string
  readonly reason?: string
  readonly toolCalls?: ToolCall[]
}

/** One frame on the events stream. */
export type Envelope =
  | { readonly kind: 'snapshot'; readonly events: SseEvent[] }
  | { readonly kind: 'session'; readonly event: SseEvent }
  | { readonly kind: 'approval'; readonly approvalId: string; readonly call: ToolCall }
  | { readonly kind: 'error'; readonly message: string }

export interface SessionListing {
  readonly id: string
  readonly title: string
  readonly eventCount: number
}

/** Server state: provider, active model, workspace folder. */
export interface Meta {
  readonly provider: string
  readonly model: string
  readonly folder: string
  /** Model names the provider offers, for the selector. */
  readonly models: readonly string[]
}

export interface PendingApproval {
  readonly approvalId: string
  readonly call: ToolCall
}
