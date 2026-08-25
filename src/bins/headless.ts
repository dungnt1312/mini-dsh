/**
 * The one-shot/REPL headless runner: composes the harness plugins on the
 * kernel, binds one agent to one durable session, and streams replies to
 * stdout. Uses the DeepSeek provider when `DEEPSEEK_API_KEY` is set and
 * `--mock` is absent; otherwise falls back to the scripted mock.
 *
 * Usage:
 *   tsx src/bins/headless.ts --mock --message "hello"
 *   tsx src/bins/headless.ts            # interactive REPL, 'exit' quits
 */
import { createInterface } from 'node:readline/promises'
import {
  AgentsService,
  DeepSeekProvider,
  Kernel,
  LlmService,
  MockLlmProvider,
  SessionsService,
  type Session,
  type SessionEvent,
} from '../index.ts'

const MOCK_SCRIPT = [
  'Hello from the mini-dsh mock model. Set DEEPSEEK_API_KEY to talk to the real thing.',
  'I am a scripted stand-in, but the session log, turns, and streaming around me are real.',
  'Every reply I give was appended to the durable log first — model-visible means logged.',
]

interface CliOptions {
  readonly mock: boolean
  readonly message: string | undefined
}

function parseArgs(argv: readonly string[]): CliOptions {
  let mock = false
  let message: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--mock') mock = true
    else if (arg === '--message') message = argv[i + 1]
  }
  return { mock, message }
}

/** Render one session's stream to stdout as durable events arrive. */
function render(event: SessionEvent): void {
  switch (event.type) {
    case 'assistant/chunk':
      process.stdout.write(event.delta)
      break
    case 'assistant/message':
      process.stdout.write('\n')
      break
    case 'turn/end':
      if (event.reason === 'rejected') process.stdout.write('[turn rejected]\n')
      if (event.reason === 'empty') process.stdout.write('[turn closed empty]\n')
      break
    default:
      break
  }
}

async function main(): Promise<void> {
  const { mock, message } = parseArgs(process.argv.slice(2))
  const apiKey = process.env.DEEPSEEK_API_KEY

  const kernel = new Kernel()
  kernel.ctx.plugin(SessionsService)
  kernel.ctx.plugin(LlmService)
  kernel.ctx.plugin(AgentsService)

  if (mock || apiKey === undefined) {
    kernel.ctx.llm.register(new MockLlmProvider(MOCK_SCRIPT))
    if (!mock && apiKey === undefined) {
      process.stderr.write('no DEEPSEEK_API_KEY; using the mock provider (--mock to silence this)\n')
    }
  } else {
    const baseUrl = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
    kernel.ctx.llm.register(new DeepSeekProvider(apiKey, baseUrl))
  }

  const session: Session = kernel.ctx.sessions.create()
  kernel.ctx.on('session/event', (emitter, event) => {
    if (emitter === session) render(event)
  })

  const agent = kernel.ctx.agents.create(session)

  try {
    if (message !== undefined) {
      agent.send(message)
      await agent.run()
    } else {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      while (true) {
        const line = await rl.question('> ')
        const text = line.trim()
        if (text === 'exit' || text === 'quit') break
        if (text === '') continue
        agent.send(text)
        await agent.run()
      }
      rl.close()
    }
  } finally {
    await kernel.stop()
  }
}

void main()
