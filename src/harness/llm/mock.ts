import type { LlmProvider, ModelRequest, StreamEvent, ToolCall } from './types.ts'

/** One scripted model turn: a plain reply, or tool calls (with optional content). */
export type MockScriptStep =
  | string
  | { readonly content?: string; readonly toolCalls: readonly Omit<ToolCall, 'id'>[] }

function isToolStep(step: MockScriptStep): step is { content?: string; toolCalls: readonly Omit<ToolCall, 'id'>[] } {
  return typeof step === 'object'
}

/**
 * Deterministic scripted provider for tests and offline runs: replies cycle
 * through `steps` (clamping to the last one). A step is either a text reply
 * streamed as word deltas, or tool calls emitted after any content — so
 * consumers exercise the same chunk-reassembly and tool-call paths as a real
 * provider. The request (messages and tools) is ignored: determinism is the
 * point.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock'
  private index = 0

  constructor(private readonly steps: readonly MockScriptStep[]) {}

  async *stream(_request: ModelRequest): AsyncIterable<StreamEvent> {
    const last = this.steps[this.steps.length - 1]
    const step = this.steps[this.index] ?? last
    if (step === undefined) {
      throw new Error('mock llm: no scripted steps')
    }
    this.index = Math.min(this.index + 1, Math.max(this.steps.length - 1, 0))

    const reply = typeof step === 'string' ? step : (step.content ?? '')
    if (reply !== '') {
      const words = reply.match(/\S+\s*/g) ?? [reply]
      for (const word of words) {
        yield { type: 'delta', delta: word }
      }
    }
    if (isToolStep(step)) {
      yield {
        type: 'toolCalls',
        calls: step.toolCalls.map((call, position) => ({ ...call, id: `call-${this.index}-${position}` })),
      }
    }
  }
}
