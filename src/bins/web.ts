/**
 * The web bin: boots the harness behind an HTTP server and prints the URL.
 * A `DEEPSEEK_API_KEY` seeds a real DeepSeek provider on first boot; without
 * it the server still starts so the browser Settings panel can add any
 * OpenAI-completions compatible provider. Serve the built client first:
 *
 *   npm run build:web
 *   npm run web [-- --port 3082 --root . --yolo]
 */
import { createWebServer } from '../web/server.ts'
import type { ApprovalMode } from '../harness/approval/policy.ts'
import { loadRepoEnv } from './env.ts'

// A repo-root .env supplies DEEPSEEK_API_KEY when the process environment
// does not carry it. Real environment variables win over file entries.
loadRepoEnv()

interface CliOptions {
  readonly port: number
  readonly root: string
  readonly yolo: boolean
}

function parseArgs(argv: readonly string[]): CliOptions {
  let port = 3082
  let root = process.cwd()
  let yolo = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--port') port = Number(argv[i + 1] ?? port) || port
    else if (arg === '--root') root = argv[i + 1] ?? root
    else if (arg === '--yolo') yolo = true
  }
  return { port, root, yolo }
}

async function main(): Promise<void> {
  const { port, root, yolo } = parseArgs(process.argv.slice(2))

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
    seedDeepseekFromEnv: true,
    ...(yolo ? {} : { policy }),
    defaultMode: yolo ? 'allow' : 'ask',
    port,
  })

  process.stdout.write(`mini-dsh web: ${server.url}\n`)
  if (process.env['DEEPSEEK_API_KEY']?.trim() === '') {
    process.stderr.write('DEEPSEEK_API_KEY is blank; configure a provider in the web Settings panel.\n')
  } else if (process.env['DEEPSEEK_API_KEY'] === undefined) {
    process.stderr.write('no provider seeded; open Settings to add an OpenAI-completions compatible provider.\n')
  }

  process.on('SIGINT', () => {
    // First interrupt: close gracefully. A second interrupt exits at once,
    // in case teardown itself is stuck.
    process.on('SIGINT', () => process.exit(130))
    void server.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error('shutdown failed', error)
        process.exit(1)
      },
    )
  })
}

void main()
