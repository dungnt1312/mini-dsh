import type { ModelRequest, LlmProvider } from './types.ts'

/**
 * Deterministic scripted provider for tests and offline runs: replies cycle
 * through `replies` (clamping to the last one), streamed as word deltas so
 * consumers exercise the same chunk-reassembly path as a real provider.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock'
  private index = 0

  constructor(private readonly replies: readonly string[]) {}

  async *stream(_request: ModelRequest): AsyncIterable<string> {
    const last = this.replies[this.replies.length - 1]
    const reply = this.replies[this.index] ?? last
    if (reply === undefined) {
      throw new Error('mock llm: no scripted replies')
    }
    this.index = Math.min(this.index + 1, Math.max(this.replies.length - 1, 0))
    const words = reply.match(/\S+\s*/g) ?? [reply]
    for (const word of words) {
      yield word
    }
  }
}
