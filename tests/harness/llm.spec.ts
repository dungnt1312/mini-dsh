/**
 * The LLM seam: provider registry effects, selection, fail-loud behavior,
 * and the `llm/stream` waterfall around the adapter call.
 */
import { describe, expect, it } from 'vitest'
import { Kernel, LlmService, MockLlmProvider, type LlmProvider, type ModelRequest } from 'mini-dsh'

function requestOf(...contents: string[]): ModelRequest {
  return { messages: contents.map((content) => ({ role: 'user' as const, content })) }
}

describe('llm seam', () => {
  it('mock provider streams a scripted reply as reassemblable deltas', async () => {
    const kernel = new Kernel()
    const provider = new MockLlmProvider(['one two three'])
    kernel.ctx.plugin(LlmService)
    kernel.ctx.llm.register(provider)

    let received = ''
    for await (const delta of kernel.ctx.llm.stream(requestOf('hi'))) {
      received += delta
    }
    expect(received).toBe('one two three')
    void kernel.stop()
  })

  it('consecutive calls advance the script and clamp to the last reply', async () => {
    const kernel = new Kernel()
    kernel.ctx.plugin(LlmService)
    kernel.ctx.llm.register(new MockLlmProvider(['first', 'second']))

    const collect = async (): Promise<string> => {
      let out = ''
      for await (const delta of kernel.ctx.llm.stream(requestOf('x'))) out += delta
      return out
    }
    expect(await collect()).toBe('first')
    expect(await collect()).toBe('second')
    expect(await collect()).toBe('second')
    void kernel.stop()
  })

  it('streaming with no provider fails loud', () => {
    const kernel = new Kernel()
    kernel.ctx.plugin(LlmService)
    expect(() => kernel.ctx.llm.stream(requestOf('x'))).toThrow(/no provider registered/)
    void kernel.stop()
  })

  it('use() fails loud on an unknown provider name', () => {
    const kernel = new Kernel()
    kernel.ctx.plugin(LlmService)
    kernel.ctx.llm.register(new MockLlmProvider(['x']))
    expect(() => kernel.ctx.llm.use('nope')).toThrow(/no provider named 'nope'/)
    void kernel.stop()
  })

  it('register is an effect: disposal removes the provider', async () => {
    const kernel = new Kernel()
    kernel.ctx.plugin(LlmService)
    const provider: LlmProvider = new MockLlmProvider(['only'])
    const dispose = kernel.ctx.llm.register(provider)
    expect(kernel.ctx.llm.active().name).toBe('mock')

    dispose()
    expect(() => kernel.ctx.llm.stream(requestOf('x'))).toThrow(/no provider registered/)
    void kernel.stop()
  })

  it('llm/stream waterfall: a listener can replace the request downstream', async () => {
    const kernel = new Kernel()
    kernel.ctx.plugin(LlmService)
    const seen: string[] = []
    const provider: LlmProvider = {
      name: 'spy',
      async *stream(request) {
        for (const message of request.messages) seen.push(`${message.role}:${message.content}`)
        yield 'spy reply'
      },
    }
    kernel.ctx.llm.register(provider)

    kernel.ctx.on('llm/stream', async (request, next) => {
      return next({
        ...request,
        messages: [{ role: 'system', content: 'injected system preamble' }, ...request.messages],
      })
    })

    let out = ''
    for await (const delta of kernel.ctx.llm.stream(requestOf('hi'))) out += delta
    expect(out).toBe('spy reply')
    expect(seen).toEqual(['system:injected system preamble', 'user:hi'])
    void kernel.stop()
  })
})
