/**
 * Shell capability consumer: the `bash` tool. Runs one command under
 * `/bin/bash -lc`, captures stdout and stderr together, enforces a
 * timeout, and reports the exit code to the model.
 */
import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process'
import type { ToolDefinition } from '../../harness/tools/types.ts'

const OUTPUT_CAP = 60_000

/** Options for the bash tool. */
export interface BashToolOptions {
  /** Wall-clock kill for one command; defaults to 30s. */
  readonly timeoutMs?: number
  /** Working directory; defaults to `process.cwd()`, or a live accessor so a folder switch is followed. */
  readonly cwd?: string | (() => string)
}

/** The `bash` tool: one command, captured output, timeout kill. */
export function bashTool(options: BashToolOptions = {}): ToolDefinition {
  const timeoutMs = options.timeoutMs ?? 30_000
  // Capture before narrowing: the closure would widen `options.cwd` again.
  const configuredCwd = options.cwd
  const cwd = typeof configuredCwd === 'function' ? configuredCwd : () => configuredCwd ?? process.cwd()
  return {
    name: 'bash',
    description: 'Run one bash command and return its combined stdout/stderr and exit code.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'the bash command line to run' },
        timeoutMs: { type: 'number', description: `kill after this many milliseconds (default 30000, max ${timeoutMs})` },
      },
      required: ['command'],
    },
    async execute(args) {
      const command = args['command']
      if (typeof command !== 'string' || command === '') {
        throw new Error("argument 'command' must be a non-empty string")
      }
      const requested = args['timeoutMs']
      const kill = typeof requested === 'number' ? Math.min(requested, timeoutMs) : timeoutMs

      return await new Promise<string>((resolve) => {
        // Detached so the timeout can kill the whole process group: a lone
        // SIGKILL on bash leaves grandchildren (e.g. `sleep`) holding the
        // stdio pipes open and stalls the close event.
        const options: SpawnOptionsWithoutStdio = { cwd: cwd(), detached: true }
        const child = spawn('/bin/bash', ['-lc', command], options)
        let output = ''
        const append = (chunk: Buffer): void => {
          output += chunk.toString('utf8')
        }
        child.stdout.on('data', append)
        child.stderr.on('data', append)
        const timer = setTimeout(() => {
          if (child.pid !== undefined) {
            try {
              process.kill(-child.pid, 'SIGKILL')
            } catch {
              child.kill('SIGKILL')
            }
          }
        }, kill)
        child.on('close', (code: number | null) => {
          clearTimeout(timer)
          const suffix = `\n[exit code: ${code ?? 'null'}]`
          const body = output.length > OUTPUT_CAP ? `${output.slice(0, OUTPUT_CAP)}\n… [truncated]` : output
          resolve(`${body}${suffix}`)
        })
      })
    },
  }
}
