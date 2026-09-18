/**
 * Shell capability consumer: the `Bash` tool. Bash means Bash — an explicit
 * adapter resolves the actual executable (Git Bash's `bash.exe` on Windows,
 * `/bin/bash` elsewhere, or `MINI_DSH_BASH`); when none exists the tool
 * disables itself with an actionable error instead of silently substituting
 * another shell.
 *
 * One command, captured output, wall-clock timeout, cancellation via the
 * run's abort signal, and verified cleanup: the whole process tree dies
 * (process-group kill on POSIX, `taskkill /T` on Windows), and spawn errors
 * settle the call instead of hanging it. Path checks confine file tools,
 * not shell access — a shell command can leave the workspace and nothing
 * here claims otherwise.
 */
import { spawn, spawnSync, type ChildProcess, type SpawnOptionsWithoutStdio } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { ToolDefinition, ToolExecution } from '../../harness/tools/types.ts'

const OUTPUT_CAP = 60_000
/** Capture stops shortly past the cap so the marker can note the discard. */
const CAPTURE_SLACK = 4_000

/** Options for the bash tool. */
export interface BashToolOptions {
  /** Wall-clock kill for one command; defaults to the harness limit (30s). */
  readonly timeoutMs?: number
  /**
   * Compatibility fallback for direct calls lacking an execution root. Pipeline
   * calls always use `ToolExecution.root` as the authoritative working folder.
   */
  readonly cwd?: string | (() => string)
  /** Explicit executable; overrides detection (e.g. a pinned Git Bash path). */
  readonly executable?: string
}

interface BashSpawn {
  readonly executable: string | undefined
  readonly hint: string
}

/** Locate a real bash. Checked in order: explicit option, env, known paths. */
function detectBash(explicit: string | undefined): BashSpawn {
  // An explicit executable is authoritative: if it is missing, the tool
  // disables with that fact — silently falling back would run somewhere
  // the operator did not choose.
  if (explicit !== undefined && explicit !== '') {
    return existsSync(explicit)
      ? { executable: explicit, hint: explicit }
      : { executable: undefined, hint: `the configured bash '${explicit}' does not exist; fix it or set MINI_DSH_BASH` }
  }
  const candidates: string[] = []
  const fromEnv = process.env['MINI_DSH_BASH']?.trim()
  if (fromEnv !== undefined && fromEnv !== '') candidates.push(fromEnv)
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      `${process.env['LOCALAPPDATA'] ?? ''}\\Programs\\Git\\bin\\bash.exe`,
    )
  } else {
    candidates.push('/bin/bash', '/usr/bin/bash')
  }
  for (const candidate of candidates) {
    if (candidate !== '' && existsSync(candidate)) return { executable: candidate, hint: candidate }
  }
  if (process.platform === 'win32') {
    // Portable/odd Git installs (Laragon, scoop, ...): resolve bash relative
    // to the git.exe on PATH. WSL launchers (System32, WindowsApps) are
    // deliberately skipped — Bash means Git Bash here, not a remote VM.
    for (const locator of [['where', 'git'], ['where', 'bash']]) {
      const lookup = spawnSync(locator[0] as string, locator.slice(1) as string[], { encoding: 'utf8' })
      if (lookup.status !== 0) continue
      for (const raw of lookup.stdout.split('\n')) {
        const found = raw.trim()
        if (found === '' || !existsSync(found)) continue
        if (/system32|windowsapps/i.test(found)) continue
        if (locator[1] === 'bash') return { executable: found, hint: found }
        for (const rel of ['../bin/bash.exe', '../usr/bin/bash.exe']) {
          const bashPath = path.resolve(found, rel)
          if (existsSync(bashPath)) return { executable: bashPath, hint: bashPath }
        }
      }
    }
    return {
      executable: undefined,
      hint: 'install Git Bash (https://git-scm.com) or point MINI_DSH_BASH at a bash.exe',
    }
  }
  // Last resort on PATH (POSIX `bash`).
  return { executable: 'bash', hint: 'bash on PATH' }
}

/**
 * Kill a spawned process tree. Best effort — the caller verifies through
 * the exit/close events, and the tool settles on `exit` after a kill so a
 * straggler grandchild holding the stdio pipes cannot stall the result.
 */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined) {
    child.kill('SIGKILL')
    return
  }
  if (process.platform === 'win32') {
    // Windows has no process groups; taskkill /T takes the tree down. A
    // second pass reaps MSYS children that were mid-spawn during the first
    // tree walk (taskkill's parent walk races Git Bash's fork chain).
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    killer.on('error', () => {
      child.kill('SIGKILL')
    })
    setTimeout(() => {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on('error', () => {})
      child.kill('SIGKILL')
    }, 250).unref?.()
    return
  }
  try {
    // Detached spawn put the child in its own group: a lone SIGKILL on bash
    // would leave grandchildren (e.g. `sleep`) holding the stdio pipes open.
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

/** The `Bash` tool: one command, captured output, timeout and stop handling. */
export function bashTool(options: BashToolOptions = {}): ToolDefinition {
  const timeoutMs = options.timeoutMs ?? 30_000
  // Used only for direct compatibility calls without a granted root. Pipeline
  // executions must derive their working directory from `exec.root`.
  const configuredCwd = options.cwd
  const fallbackCwd = typeof configuredCwd === 'function' ? configuredCwd : () => configuredCwd ?? process.cwd()
  const detection = detectBash(options.executable)
  return {
    name: 'Bash',
    description: 'Run one bash command and return its combined stdout/stderr and exit code.',
    requiresRoot: true,
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'the bash command line to run' },
        timeoutMs: { type: 'number', description: `kill after this many milliseconds (default 30000, max ${timeoutMs})` },
      },
      required: ['command'],
    },
    async execute(args, exec: ToolExecution) {
      const command = args['command']
      if (typeof command !== 'string' || command === '') {
        throw new Error("argument 'command' must be a non-empty string")
      }
      if (detection.executable === undefined) {
        return `error: bash is not available on this system; ${detection.hint}`
      }
      const requested = args['timeoutMs']
      const kill = typeof requested === 'number' ? Math.min(requested, timeoutMs) : timeoutMs

      return await new Promise<string>((resolve) => {
        let settled = false
        let killed = false
        let timer: ReturnType<typeof setTimeout> | undefined
        let graceTimer: ReturnType<typeof setTimeout> | undefined
        const onAbort = (): void => {
          killed = true
          killTree(child)
        }
        const finish = (output: string): void => {
          if (settled) return
          settled = true
          if (timer !== undefined) clearTimeout(timer)
          if (graceTimer !== undefined) clearTimeout(graceTimer)
          exec.signal?.removeEventListener('abort', onAbort)
          resolve(output)
        }
        const report = (code: number | null): string => {
          const suffix = killed && exec.signal?.aborted === true
            ? `\n[terminated by stop]`
            : killed
              ? `\n[terminated: timeout or stop]`
              : code === null
                ? `\n[terminated, no exit code]`
                : `\n[exit code: ${code}]`
          const limit = exec.outputLimit ?? OUTPUT_CAP
          const dropped = captureCapped ? '\n… [output truncated during capture]' : ''
          const body = output.length > limit
            ? `${output.slice(0, limit)}\n… [truncated ${output.length - limit} chars]`
            : output
          return `${body}${dropped}${suffix}`
        }
        if (exec.signal?.aborted === true) {
          finish('cancelled: stop requested before this command started')
          return
        }
        // Detached so the timeout can kill the whole process tree. Some
        // platforms throw synchronously for non-executable targets — that
        // must settle the call, never hang it.
        let child: ChildProcess
        try {
          child = spawn(detection.executable as string, ['-lc', command], {
            // The tool pipeline rejects empty roots before executing this
            // requiresRoot tool. The fallback retains direct-call compatibility.
            cwd: exec.root !== '' ? exec.root : fallbackCwd(),
            detached: true,
          })
        } catch (error) {
          finish(`error: bash spawn failed (${String(error)}); verify the shell at '${detection.hint}'`)
          return
        }
        let output = ''
        let captureCapped = false
        const captureCap = (exec.outputLimit ?? OUTPUT_CAP) + CAPTURE_SLACK
        const append = (chunk: Buffer): void => {
          if (captureCapped) return
          output += chunk.toString('utf8')
          if (output.length > captureCap) {
            // A firehose must not eat memory while it runs: stop capturing,
            // the model-visible result is bounded regardless.
            captureCapped = true
            output = output.slice(0, captureCap)
          }
        }
        exec.signal?.addEventListener('abort', onAbort, { once: true })

        timer = setTimeout(() => {
          killed = true
          killTree(child)
        }, kill)
        timer.unref?.()

        child.stdout?.on('data', append)
        child.stderr?.on('data', append)
        child.on('error', (error: Error) => {
          finish(`error: bash spawn failed (${error.message}); verify the shell at '${detection.hint}'`)
        })
        child.on('close', (code: number | null) => {
          finish(report(code))
        })
        // After a kill, settle on `exit` with a short grace for the output:
        // a straggler grandchild can hold the stdio pipes past the death of
        // the shell, and the call must not wait on it.
        child.on('exit', (code: number | null) => {
          if (!killed) return
          graceTimer = setTimeout(() => finish(report(code)), 400)
          graceTimer.unref?.()
        })
      })
    },
  }
}
