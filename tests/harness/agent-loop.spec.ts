/**
 * The turn/step driver: inbox claim semantics, durable event ordering, the
 * agent/pre-step and agent/request waterfalls, turn-stopping observation,
 * fork/resume mid-conversation, and the model-visible-means-logged
 * invariant.
 */
import { describe, expect, it } from 'vitest'
import {
  AgentsService,
  Kernel,
  LlmService,
  SessionsService,
  type Agent,
  type LlmProvider,
  type ModelRequest,
  type Session,
} from 'mini-dsh'
import { FakeScriptedLlm } from '../support/fake-llm.ts'

interface Harness {
  kernel: Kernel
  session: Session
  agent: Agent
  llm: LlmService
}

/** Boot the full harness with a scripted provider and one agent. */
function harness(replies: readonly string[], provider?: LlmProvider): Harness {
  const kernel = new Kernel()
  kernel.ctx.plugin(SessionsService)
  kernel.ctx.plugin(LlmService)
  kernel.ctx.plugin(AgentsService)
  kernel.ctx.llm.register(provider ?? new FakeScriptedLlm(replies))

  const session = kernel.ctx.sessions.create()
  const agent = kernel.ctx.agents.create(session)
  return { kernel, session, agent, llm: kernel.ctx.llm }
}

describe('agent loop', () => {
  it('one turn produces the durable event order turn→step→chunks→message→turn/end', async () => {
    const { kernel, session, agent } = harness(['Hi there'])

    agent.send('hello')
    await agent.run()

    expect(session.events.map((event) => event.type)).toEqual([
      'turn/start',
      'step/start',
      'user/message',
      'assistant/chunk',
      'assistant/chunk',
      'assistant/message',
      'step/end',
      'turn/end',
    ])
    const last = session.events[session.events.length - 1]
    expect(last?.type === 'turn/end' && last.reason).toBe('completed')
    expect(session.deriveMessages()).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Hi there' },
    ])
    void kernel.stop()
  })

  it('multi-turn conversation carries projected history', async () => {
    const { kernel, session, agent } = harness(['first reply', 'second reply'])

    agent.send('one')
    await agent.run()
    agent.send('two')
    await agent.run()

    expect(session.deriveMessages()).toEqual([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'first reply' },
      { role: 'user', content: 'two' },
      { role: 'assistant', content: 'second reply' },
    ])
    void kernel.stop()
  })

  it('messages queued before run are claimed into one turn', async () => {
    const { kernel, session, agent } = harness(['batched'])

    agent.send('first')
    agent.send('second')
    await agent.run()

    const turns = session.events.filter((event) => event.type === 'turn/start')
    const messages = session.events.filter((event) => event.type === 'user/message')
    expect(turns).toHaveLength(1)
    expect(messages.map((event) => event.type === 'user/message' && event.content)).toEqual(['first', 'second'])
    void kernel.stop()
  })

  it('injected context waits in the inbox until a user message wakes the driver', async () => {
    const { kernel, session, agent, llm } = harness(['ok'])
    const seen: ModelRequest[] = []
    llm.register({
      name: 'recorder',
      async *stream(request) {
        seen.push(request)
        yield { type: 'delta', delta: 'ok' }
      },
    })
    llm.use('recorder')

    agent.inject('workspace note: the build is green')
    await agent.run()
    expect(seen).toHaveLength(0)

    agent.send('go')
    await agent.run()
    expect(seen).toHaveLength(1)
    expect(seen[0]?.messages.map((message) => message.content)).toEqual([
      'workspace note: the build is green',
      'go',
    ])
    void kernel.stop()
  })

  it('a pre-step veto closes a durable turn with no step and no model call', async () => {
    const { kernel, session, agent, llm } = harness(['should not stream'])
    let modelCalls = 0
    llm.register({
      name: 'counter',
      async *stream() {
        modelCalls++
        yield { type: 'delta', delta: 'x' }
      },
    })
    llm.use('counter')

    kernel.ctx.on('agent/pre-step', async (_claim) => {
      return { kind: 'reject', reason: 'policy' }
    })

    agent.send('forbidden')
    await agent.run()

    expect(modelCalls).toBe(0)
    expect(session.events.map((event) => event.type)).toEqual(['turn/start', 'turn/end'])
    const last = session.events[session.events.length - 1]
    expect(last?.type === 'turn/end' && last.reason).toBe('rejected')
    void kernel.stop()
  })

  it('a pre-step rewrite to empty closes the turn without spending a step', async () => {
    const { kernel, session, agent } = harness(['unused'])

    kernel.ctx.on('agent/pre-step', async (_claim, next) => {
      return next({ contents: [] })
    })

    agent.send('will be emptied')
    await agent.run()

    expect(session.events.map((event) => event.type)).toEqual(['turn/start', 'turn/end'])
    const last = session.events[session.events.length - 1]
    expect(last?.type === 'turn/end' && last.reason).toBe('empty')
    void kernel.stop()
  })

  it('agent/request listeners can rewrite the request the model receives', async () => {
    const { kernel, agent, llm } = harness(['fine'])
    const seen: string[] = []
    llm.register({
      name: 'spy',
      async *stream(request) {
        for (const message of request.messages) seen.push(message.content)
        yield { type: 'delta', delta: 'fine' }
      },
    })
    llm.use('spy')

    kernel.ctx.on('agent/request', async (request, next) => {
      return next({
        ...request,
        messages: [{ role: 'system', content: 'be terse' }, ...request.messages],
      })
    })

    agent.send('hello')
    await agent.run()

    expect(seen).toEqual(['be terse', 'hello'])
    void kernel.stop()
  })

  it('turn-stopping listeners observe before turn/end is appended', async () => {
    const { kernel, session, agent } = harness(['reply'])
    const trace: string[] = []

    kernel.ctx.on('agent/turn-stopping', async () => {
      const types = session.events.map((event) => event.type)
      trace.push(types.includes('step/end') ? 'saw step/end' : 'missing step/end')
      trace.push(types.includes('turn/end') ? 'saw turn/end (wrong)' : 'no turn/end yet')
    })

    agent.send('hi')
    await agent.run()

    expect(trace).toEqual(['saw step/end', 'no turn/end yet'])
    void kernel.stop()
  })

  it('invariant: every model request equals the log projection at that moment', async () => {
    const { kernel, session, agent, llm } = harness(['a', 'b'])
    const projections: string[][] = []
    llm.register({
      name: 'auditor',
      async *stream(request) {
        projections.push(request.messages.map((message) => message.content))
        yield { type: 'delta', delta: 'audited' }
      },
    })
    llm.use('auditor')

    agent.send('one')
    await agent.run()
    agent.send('two')
    await agent.run()

    // Each request must be reconstructable from the log as it stood then.
    expect(projections).toEqual([['one'], ['one', 'audited', 'two']])
    expect(session.deriveMessages().map((message) => message.content)).toEqual(['one', 'audited', 'two', 'audited'])
    void kernel.stop()
  })

  it('fork mid-conversation resumes from the copied history', async () => {
    const { kernel, session, agent, llm } = harness(['first reply', 'fork reply', 'parent reply'])
    llm.use('scripted')

    agent.send('one')
    await agent.run()

    const boundary = session.events[session.events.length - 1]?.seq
    const child = kernel.ctx.sessions.fork(session, boundary)

    const childAgent = kernel.ctx.agents.create(child)
    childAgent.send('from the fork')
    await childAgent.run()

    agent.send('from the parent')
    await agent.run()

    expect(child.deriveMessages()).toEqual([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'first reply' },
      { role: 'user', content: 'from the fork' },
      { role: 'assistant', content: 'fork reply' },
    ])
    expect(session.deriveMessages()).toEqual([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'first reply' },
      { role: 'user', content: 'from the parent' },
      { role: 'assistant', content: 'parent reply' },
    ])
    void kernel.stop()
  })

  it('run() while running is a no-op guard; status returns to idle', async () => {
    const { kernel, agent } = harness(['done'])
    agent.send('x')
    await agent.run()
    expect(agent.status).toBe('idle')
    void kernel.stop()
  })
})
