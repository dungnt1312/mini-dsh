/**
 * The web bin: boots the harness behind an HTTP server and prints the URL.
 * Uses the DeepSeek provider when `DEEPSEEK_API_KEY` is set and `--mock` is
 * absent; otherwise the scripted mock. Serve the built client first:
 *
 *   npm run build:web
 *   npm run web [-- --port 3080 --root . --mock --yolo]
 */
import { createWebServer } from '../web/server.ts'
import { DeepSeekProvider } from '../harness/llm/deepseek.ts'
import { MockLlmProvider } from '../harness/llm/mock.ts'
import type { ApprovalMode } from '../harness/approval/policy.ts'

// A repo-root .env supplies DEEPSEEK_API_KEY when the process environment
// does not carry it. Real environment variables win over file entries.
try {
  process.loadEnvFile()
} catch {
  // No .env (or unreadable): environment-only configuration.
}

interface CliOptions {
  readonly port: number
  readonly root: string
  readonly mock: boolean
  readonly yolo: boolean
}

function parseArgs(argv: readonly string[]): CliOptions {
  let port = 3082
  let root = process.cwd()
  let mock = false
  let yolo = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--port') port = Number(argv[i + 1] ?? port) || port
    else if (arg === '--root') root = argv[i + 1] ?? root
    else if (arg === '--mock') mock = true
    else if (arg === '--yolo') yolo = true
  }
  return { port, root, mock, yolo }
}

async function main(): Promise<void> {
  const { port, root, mock, yolo } = parseArgs(process.argv.slice(2))
  const apiKey = process.env.DEEPSEEK_API_KEY

  const provider = mock || apiKey === undefined
    ? new MockLlmProvider([
        'Hello from the mini-dsh mock model. Set DEEPSEEK_API_KEY to talk to the real thing.',
        'I am a scripted stand-in, but the session log, turns, tools, and streaming around me are real.',
      ])
    : new DeepSeekProvider(apiKey, process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com')

  const policy: Readonly<Record<string, ApprovalMode>> = {
    read: 'allow',
    glob: 'allow',
    grep: 'allow',
    write: 'ask',
    edit: 'ask',
    bash: 'ask',
  }

  const server = await createWebServer({
    root,
    provider,
    ...(yolo ? {} : { policy }),
    defaultMode: yolo ? 'allow' : 'ask',
    port,
  })

  if (!mock && apiKey === undefined) {
    process.stderr.write('no DEEPSEEK_API_KEY; using the mock provider (--mock to silence this)\n')
  }
  process.stdout.write(`mini-dsh web: ${server.url}\n`)

  process.on('SIGINT', () => {
    void server.close().then(() => process.exit(0))
  })
}

void main()
