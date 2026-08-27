/**
 * The message and stream vocabulary shared by every provider and consumer:
 * messages (including tool traffic), one model request, tool schemas, and
 * the stream events a provider yields.
 */

/** One model-invoked tool call: `id` correlates the request with its result. */
export interface ToolCall {
  readonly id: string
  readonly name: string
  /** JSON object arguments; validated at the model-JSON boundary. */
  readonly args: Record<string, unknown>
}

/** One message in model history. */
export interface ModelMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool'
  readonly content: string
  /** Tool calls the assistant requested; assistant messages only. */
  readonly toolCalls?: readonly ToolCall[]
  /** Which call this result answers; tool messages only. */
  readonly toolCallId?: string
}

/** A tool's model-facing schema, joined into request assembly. */
export interface ToolSchema {
  readonly name: string
  readonly description: string
  /** JSON-Schema-ish parameters object: `{ properties, required }`. */
  readonly parameters: {
    readonly type: 'object'
    readonly properties: Record<string, unknown>
    readonly required?: readonly string[]
  }
}

/** One model request, projected from the session log by `deriveMessages()`. */
export interface ModelRequest {
  /** Provider-specific model name; providers apply their own default. */
  readonly model?: string
  readonly messages: readonly ModelMessage[]
  /** Tool schemas the model may call this step; omitted when none. */
  readonly tools?: readonly ToolSchema[]
}

/** What a provider yields while streaming one completion. */
export type StreamEvent =
  | { readonly type: 'delta'; readonly delta: string; readonly thinking?: true }
  | { readonly type: 'toolCalls'; readonly calls: readonly ToolCall[] }

/**
 * A model provider: consumes a request, yields stream events — content
 * deltas as they arrive, then the accumulated tool calls. Providers never
 * touch sessions or the loop; the seam is the whole contract.
 */
export interface LlmProvider {
  /** Provider name used for `ctx.llm.use()` selection. */
  readonly name: string
  /** Model names this provider offers, for UI selection. */
  readonly models?: readonly string[]
  stream(request: ModelRequest): AsyncIterable<StreamEvent>
}
