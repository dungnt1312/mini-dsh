/**
 * The one-shot/REPL headless runner: composes the harness plugins on the
 * kernel — sessions, llm, tools, approval — mounts the filesystem and bash
 * capability tools, binds one agent to one durable session, and streams
 * replies and tool traffic to stdout.
 *
 * Providers: DeepSeek when `DEEPSEEK_API_KEY` is set and `--mock` is
 * absent; otherwise the scripted mock. Approval: `--yolo` allows every
 * call; otherwise reads/globs are allowed and write/edit/bash prompt on
 * stderr before running.
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
  ToolsService,
  attachApproval,
  bashTool,
  fsTools,
  type ApprovalOptions,
  type Session,
  type SessionEvent,
} from '../index.ts'

// A repo-root .env supplies DEEPSEEK_API_KEY when the process environment
// does not carry it. Real environment variables win over file entries.
try {
  process.loadEnvFile()
} catch {
  // No .env (or unreadable): environment-only configuration.
}

const MOCK_SCRIPT = [
  'Hello from the mini-dsh mock model. Set DEEPSEEK_API_KEY to talk to the real thing.',
  'I am a scripted stand-in, but the session log, turns, tools, and streaming around me are real.',
  'Every reply I give was appended to the durable log first — model-visible means logged.',
]

interface CliOptions {
  readonly mock: boolean
  readonly yolo: boolean
  readonly root: string
  readonly message: string | undefined
}

function parseArgs(argv: readonly string[]): CliOptions {
  let mock = false
  let yolo = false
  let root = process.cwd()
  let message: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--mock') mock = true
    else if (arg === '--yolo') yolo = true
    else if (arg === '--root') root = argv[i + 1] ?? root
    else if (arg === '--message') message = argv[i + 1]
  }
  return { mock, yolo, root, message }
}

/** Render one session's durable stream to stdout as events arrive. */
function render(event: SessionEvent): void {
  switch (event.type) {
    case 'assistant/chunk':
      process.stdout.write(event.delta)
      break
    case 'assistant/message':
      process.stdout.write('\n')
      break
    case 'tool/call':
      process.stdout.write(`\n[tool] ${event.call.name}(${JSON.stringify(event.call.args)})\n`)
      break
    case 'tool/result': {
      const output = event.output.length > 400 ? `${event.output.slice(0, 400)}\n… [truncated]` : event.output
      process.stdout.write(`[${event.ok ? 'tool→' : 'tool✗'}] ${output}\n`)
      break
    }
    case 'turn/end':
      if (event.reason === 'rejected') process.stdout.write('[turn rejected]\n')
      if (event.reason === 'empty') process.stdout.write('[turn closed empty]\n')
      if (event.reason === 'max-steps') process.stdout.write('[turn stopped at the step limit]\n')
      break
    default:
      break
  }
}

/** Prompt on stderr for approval of one tool call. */
async function askUser(call: { name: string; args: Record<string, unknown> }): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  try {
    const answer = await rl.question(`allow '${call.name}'(${JSON.stringify(call.args)})? [y/N] `)
    return answer.trim().toLowerCase().startsWith('y')
  } finally {
    rl.close()
  }
}

async function main(): Promise<void> {
  const { mock, yolo, root, message } = parseArgs(process.argv.slice(2))
  const apiKey = process.env.DEEPSEEK_API_KEY

  const kernel = new Kernel()
  kernel.ctx.plugin(SessionsService)
  kernel.ctx.plugin(LlmService)
  kernel.ctx.plugin(ToolsService)
  kernel.ctx.plugin(AgentsService)
  const options: ApprovalOptions = yolo
    ? { defaultMode: 'allow', askUser }
    : {
        defaultMode: 'ask',
        askUser,
        policy: { read: 'allow', glob: 'allow', grep: 'allow', write: 'ask', edit: 'ask', bash: 'ask' },
      }
  attachApproval(kernel.ctx, options)
  for (const tool of fsTools(root)) {
    kernel.ctx.tools.register(tool)
  }
  kernel.ctx.tools.register(bashTool())

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
