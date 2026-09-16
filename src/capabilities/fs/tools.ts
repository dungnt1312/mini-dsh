/**
 * Filesystem capability consumers: the `Read`/`Write`/`Edit`/`Glob`/`Grep`
 * tools, confined to an explicitly granted root directory. Paths resolve
 * against `root` and must stay inside it — lexically and through real
 * symlinks/junctions — and paths inside `deniedRoots` (application-internal
 * storage) are refused even when they sit under the workspace. Escaping is
 * a tool failure, not a silent redirect.
 *
 * These checks are application-level containment, not an OS sandbox and not
 * a guarantee against hostile external filesystem races.
 */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ToolDefinition, ToolExecution } from '../../harness/tools/types.ts'

const OUTPUT_CAP = 60_000
const GLOB_CAP = 100
const GREP_CAP = 250
const WALK_BUDGET = 20_000

/** The model-visible output cap for this execution (limits-overridable). */
function limitOf(exec: ToolExecution): number {
  return exec.outputLimit ?? OUTPUT_CAP
}

/** Case-normalizing containment check (Windows paths vary in case). Uses
 * `path.relative`, so drive roots (`C:\`) and UNC roots behave correctly. */
function within(parent: string, child: string): boolean {
  const p = process.platform === 'win32' ? parent.toLowerCase() : parent
  const c = process.platform === 'win32' ? child.toLowerCase() : child
  const rel = path.relative(p, c)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}

/** Resolve `target` inside `root`, rejecting lexical escapes. */
export function resolveWithin(root: string, target: string): string {
  const absRoot = path.resolve(root)
  const abs = path.resolve(absRoot, target)
  if (!within(absRoot, abs)) {
    throw new Error(`path '${target}' escapes the workspace root`)
  }
  return abs
}

async function realpathSafe(p: string): Promise<string> {
  try {
    return await fs.realpath(p)
  } catch {
    return p
  }
}

/** The deepest ancestor of `abs` that exists (abs itself when it exists). */
async function deepestExisting(abs: string): Promise<string> {
  let probe = abs
  for (;;) {
    try {
      await fs.stat(probe)
      return probe
    } catch {
      const parent = path.dirname(probe)
      if (parent === probe) return probe
      probe = parent
    }
  }
}

/**
 * Resolve a granted path: lexical containment, then a realpath check that
 * follows symlinks/junctions in the existing portion of the path (including
 * the creation path — the parent a new file would land in), then refusal of
 * anything inside `deniedRoots` (application-internal storage).
 */
export async function resolveGrantedPath(
  root: string,
  target: string,
  deniedRoots?: readonly string[],
): Promise<string> {
  const abs = resolveWithin(root, target)
  const existing = await deepestExisting(abs)
  const realExisting = await realpathSafe(existing)
  const rootReal = await realpathSafe(root)
  const realTarget = existing === abs ? realExisting : path.join(realExisting, path.relative(existing, abs))
  if (!within(rootReal, realTarget) || !within(root, abs)) {
    throw new Error(`path '${target}' escapes the workspace root`)
  }
  if (deniedRoots !== undefined) {
    for (const denied of deniedRoots) {
      const deniedReal = await realpathSafe(denied)
      if (within(denied, abs) || within(deniedReal, realTarget)) {
        throw new Error(`path '${target}' is inside application-internal storage and is not accessible to tools`)
      }
    }
  }
  return abs
}

function execRoots(exec: ToolExecution): { root: string; deniedRoots?: readonly string[] } {
  return {
    root: exec.root,
    ...(exec.deniedRoots !== undefined ? { deniedRoots: exec.deniedRoots } : {}),
  }
}

function granted(exec: ToolExecution, target: string): Promise<string> {
  const { root, deniedRoots } = execRoots(exec)
  return resolveGrantedPath(root, target, deniedRoots)
}

/** Truncate a tool output to its cap, keeping the head and a marker. */
function cap(output: string, limit: number): string {
  if (output.length <= limit) return output
  return `${output.slice(0, limit)}\n… [truncated ${output.length - limit} chars]`
}

/**
 * Walk `dir` recursively, yielding file paths (depth-first, sorted).
 * Symlinks are never followed; the run's abort signal is honored between
 * directories; the node budget keeps a huge tree from being materialized
 * just to truncate it afterwards.
 */
async function walk(dir: string, deniedRoots?: readonly string[], signal?: AbortSignal, budget = { left: WALK_BUDGET }): Promise<string[]> {
  // Indirect through a function: the signal can abort during any await, and
  // control-flow narrowing must not hide that from later checks.
  const stopped = (): boolean => signal?.aborted === true
  const found: string[] = []
  if (stopped()) throw new Error('cancelled: stop requested during search')
  if (budget.left <= 0 || deniedRoots?.some((denied) => within(denied, dir))) return found
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (stopped()) throw new Error('cancelled: stop requested during search')
    if (budget.left <= 0) break
    budget.left -= 1
    const full = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      found.push(...(await walk(full, deniedRoots, signal, budget)))
    } else if (entry.isFile()) {
      found.push(full)
    }
  }
  return found
}

/** Glob segment pattern (`*`, `**`, literals) to a regular expression. */
function globToRegExp(pattern: string): RegExp {
  let source = ''
  let i = 0
  while (i < pattern.length) {
    const char: string = pattern[i] ?? ''
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        source += '.*'
        i += 2
        if (pattern[i] === '/') i++
      } else {
        source += '[^/]*'
        i++
      }
    } else {
      source += escapeLiteral(char)
      i++
    }
  }
  return new RegExp(`^${source}$`)
}

function escapeLiteral(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function argString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string') {
    throw new Error(`argument '${key}' must be a string`)
  }
  return value
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Verify the caller's previously observed state still matches. `expectedSha256`
 * arrives from the model's last read; a mismatch means the file changed
 * externally and the mutation refuses instead of clobbering.
 */
async function assertObservedState(abs: string, expectedSha256: unknown): Promise<void> {
  if (expectedSha256 === undefined) return
  if (typeof expectedSha256 !== 'string') {
    throw new Error("argument 'expectedSha256' must be a string when provided")
  }
  let current: string
  try {
    current = await fs.readFile(abs, 'utf8')
  } catch {
    // The caller observed content that is now gone: that IS a change.
    throw new Error('conflict: the file was deleted after it was observed; re-read before writing')
  }
  const actual = sha256(current)
  if (actual !== expectedSha256.toLowerCase()) {
    throw new Error(
      `conflict: the file changed since it was observed (expected sha256 ${expectedSha256.slice(0, 12)}…, actual ${actual.slice(0, 12)}…); re-read before writing`,
    )
  }
}

/** The `Read` tool: file content (optionally a 1-based line window), size-capped. */
export function readTool(): ToolDefinition {
  return {
    name: 'Read',
    description:
      'Read a text file inside the workspace and return its content. Optional `offset` (1-based line) and `limit` (line count) read a window. Large reads are truncated and marked.',
    requiresRoot: true,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'file path relative to the workspace root' },
        offset: { type: 'number', description: '1-based line number to start from' },
        limit: { type: 'number', description: 'maximum number of lines to return' },
      },
      required: ['path'],
    },
    async execute(args, exec) {
      const abs = await granted(exec, argString(args, 'path'))
      let content: string
      try {
        content = await fs.readFile(abs, 'utf8')
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') throw new Error(`no such file: ${argString(args, 'path')}`)
        if (code === 'EISDIR') throw new Error(`${argString(args, 'path')} is a directory, not a file`)
        throw error
      }
      const offset = typeof args['offset'] === 'number' ? Math.floor(args['offset']) : undefined
      const limit = typeof args['limit'] === 'number' ? Math.floor(args['limit']) : undefined
      if (offset !== undefined || limit !== undefined) {
        const lines = content.split('\n')
        const start = Math.max((offset ?? 1) - 1, 0)
        const end = limit !== undefined ? start + Math.max(limit, 0) : lines.length
        content = lines.slice(start, end).join('\n')
      }
      return cap(content, limitOf(exec))
    },
  }
}

/** The `Write` tool: create or replace a complete file, detecting external changes. */
export function writeTool(): ToolDefinition {
  return {
    name: 'Write',
    description:
      'Create or overwrite a text file inside the workspace. Pass `expectedSha256` from your last read to refuse overwriting a file that changed externally; the result distinguishes creation from overwrite.',
    requiresRoot: true,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'file path relative to the workspace root' },
        content: { type: 'string', description: 'full file content to write' },
        expectedSha256: { type: 'string', description: 'sha256 of the file as last observed; a mismatch is a conflict' },
      },
      required: ['path', 'content'],
    },
    async execute(args, exec) {
      const rel = argString(args, 'path')
      const abs = await granted(exec, rel)
      const content = argString(args, 'content')
      let existed = false
      try {
        existed = (await fs.stat(abs)).isFile()
      } catch {
        existed = false
      }
      if (existed) {
        await assertObservedState(abs, args['expectedSha256'])
      }
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, content, 'utf8')
      return existed ? `overwrote ${rel} (${Buffer.byteLength(content, 'utf8')} bytes written)` : `created ${rel}`
    },
  }
}

/** The `Edit` tool: exact text replacement, rejecting missing and ambiguous matches. */
export function editTool(): ToolDefinition {
  return {
    name: 'Edit',
    description:
      'Replace one exact occurrence of `old` with `new` in a workspace file. Fails on missing or ambiguous (multi-match) occurrences; pass `expectedSha256` to refuse editing a file that changed externally.',
    requiresRoot: true,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'file path relative to the workspace root' },
        old: { type: 'string', description: 'exact text to replace (must match exactly once)' },
        new: { type: 'string', description: 'replacement text' },
        expectedSha256: { type: 'string', description: 'sha256 of the file as last observed; a mismatch is a conflict' },
      },
      required: ['path', 'old', 'new'],
    },
    async execute(args, exec) {
      const rel = argString(args, 'path')
      const abs = await granted(exec, rel)
      const old = argString(args, 'old')
      const replacement = argString(args, 'new')
      let content: string
      try {
        content = await fs.readFile(abs, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`no such file: ${rel}`)
        throw error
      }
      await assertObservedState(abs, args['expectedSha256'])
      const first = content.indexOf(old)
      if (first < 0) {
        throw new Error(`'${old.slice(0, 80)}' not found in ${rel}`)
      }
      const second = content.indexOf(old, first + 1)
      if (second >= 0) {
        throw new Error(`ambiguous edit: '${old.slice(0, 80)}' occurs more than once in ${rel}; include more surrounding context`)
      }
      await fs.writeFile(abs, content.slice(0, first) + replacement + content.slice(first + old.length), 'utf8')
      return `edited ${rel}`
    },
  }
}

/** The `Glob` tool: match relative paths against a `*`/`**` pattern. */
export function globTool(): ToolDefinition {
  return {
    name: 'Glob',
    description: 'List workspace files matching a glob pattern (`*` within a segment, `**` across segments).',
    requiresRoot: true,
    parameters: {
      type: 'object',
      properties: { pattern: { type: 'string', description: 'glob pattern relative to the workspace root' } },
      required: ['pattern'],
    },
    async execute(args, exec) {
      const { root, deniedRoots } = execRoots(exec)
      const absRoot = path.resolve(root)
      const pattern = argString(args, 'pattern')
      const regex = globToRegExp(pattern)
      const files = (await walk(absRoot, deniedRoots, exec.signal))
        .map((full) => path.relative(absRoot, full).split(path.sep).join('/'))
        .filter((rel) => regex.test(rel))
        .slice(0, GLOB_CAP)
      return files.length === 0 ? 'no matches' : cap(files.join('\n'), OUTPUT_CAP)
    },
  }
}

/** The `Grep` tool: regex search across workspace files, `path:line: text`. */
export function grepTool(): ToolDefinition {
  return {
    name: 'Grep',
    description: 'Search workspace files with a regular expression; returns `path:line: text` matches.',
    requiresRoot: true,
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'regular expression to search for' },
        path: { type: 'string', description: 'optional subdirectory to search within' },
      },
      required: ['pattern'],
    },
    async execute(args, exec) {
      const regex = new RegExp(argString(args, 'pattern'))
      const { root, deniedRoots } = execRoots(exec)
      const absRoot = path.resolve(root)
      const base = args['path'] === undefined ? absRoot : await granted(exec, argString(args, 'path'))
      const lines: string[] = []
      for (const full of await walk(base, deniedRoots, exec.signal)) {
        const rel = path.relative(absRoot, full).split(path.sep).join('/')
        let content: string
        try {
          content = await fs.readFile(full, 'utf8')
        } catch {
          continue
        }
        const split = content.split('\n')
        for (let i = 0; i < split.length; i++) {
          if (regex.test(split[i] ?? '')) {
            lines.push(`${rel}:${i + 1}: ${split[i]}`)
            if (lines.length >= GREP_CAP) return cap(lines.join('\n'), OUTPUT_CAP)
          }
        }
      }
      return lines.length === 0 ? 'no matches' : cap(lines.join('\n'), OUTPUT_CAP)
    },
  }
}

/** All filesystem tools (root resolved per execution from the granted scope). */
export function fsTools(): ToolDefinition[] {
  return [readTool(), writeTool(), editTool(), globTool(), grepTool()]
}
