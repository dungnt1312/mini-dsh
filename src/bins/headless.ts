/**
 * The one-shot/REPL headless runner: composes the harness plugins on the
 * kernel — sessions, llm, tools, approval — mounts the filesystem and bash
 * capability tools, binds one agent to one durable session, and streams
 * replies and tool traffic to stdout.
 *
 * This runner has no Settings UI, therefore it requires `DEEPSEEK_API_KEY`.
 * Approval: `--yolo` allows every call; otherwise reads/globs are allowed and
 * write/edit/bash prompt on stderr before running.
 *
 * Usage:
 *   tsx src/bins/headless.ts --message "hello"
 *   tsx src/bins/headless.ts            # interactive REPL, 'exit' quits
 */
import { createInterface } from 'node:readline/promises'
import { loadRepoEnv, readApiKey } from './env.ts'
import {
  AgentsService,
  DeepSeekProvider,
  Kernel,
  LlmService,
  SessionsService,
  ToolsService,
  attachApproval,
  bashTool,
  fsTools,
  type ApprovalOptions,
  type Session,
  type SessionEvent,
} from '../index.ts'

loadRepoEnv()

interface CliOptions {
  readonly yolo: boolean
  readonly root: string
  readonly message: string | undefined
}

function parseArgs(argv: readonly string[]): CliOptions {
  let yolo = false
  let root = process.cwd()
  let message: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--yolo') yolo = true
    else if (arg === '--root') root = argv[i + 1] ?? root
    else if (arg === '--message') message = argv[i + 1]
  }
  return { yolo, root, message }
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
  const { yolo, root, message } = parseArgs(process.argv.slice(2))
  const apiKey = readApiKey()
  if (apiKey === undefined) {
    process.stderr.write('headless requires DEEPSEEK_API_KEY; use the web UI Settings panel to configure custom OpenAI-completions providers.\n')
    process.exitCode = 1
    return
  }

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
  kernel.ctx.llm.register(new DeepSeekProvider(apiKey, process.env['DEEPSEEK_BASE_URL'] ?? 'https://api.deepseek.com'))

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
