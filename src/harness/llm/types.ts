/** One message in model history: the vocabulary shared by every provider. */
export interface ModelMessage {
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: string
}

/** One model request, projected from the session log by `deriveMessages()`. */
export interface ModelRequest {
  /** Provider-specific model name; providers apply their own default. */
  readonly model?: string
  readonly messages: readonly ModelMessage[]
}

/**
 * A model provider: consumes a request, yields content deltas as they
 * stream. Providers never touch sessions or the loop; the seam is the whole
 * contract.
 */
export interface LlmProvider {
  /** Provider name used for `ctx.llm.use()` selection. */
  readonly name: string
  stream(request: ModelRequest): AsyncIterable<string>
}
