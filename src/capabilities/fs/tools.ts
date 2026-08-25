/**
 * Filesystem capability consumers: `read`/`write`/`edit`/`glob`/`grep` tools
 * confined to a root directory. Paths resolve against `root` and must stay
 * inside it — escaping is a tool failure, not a silent redirect.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ToolDefinition } from '../../harness/tools/types.ts'

const READ_CAP = 1_000_000
const OUTPUT_CAP = 60_000
const GLOB_CAP = 100
const GREP_CAP = 250

/** Resolve `target` inside `root`, rejecting escapes. */
export function resolveWithin(root: string, target: string): string {
  const absRoot = path.resolve(root)
  const abs = path.resolve(absRoot, target)
  if (abs !== absRoot && !abs.startsWith(`${absRoot}${path.sep}`)) {
    throw new Error(`path '${target}' escapes the workspace root`)
  }
  return abs
}

/** Truncate a tool output to its cap, keeping the head and a marker. */
function cap(output: string, limit: number): string {
  if (output.length <= limit) return output
  return `${output.slice(0, limit)}\n… [truncated ${output.length - limit} chars]`
}

/** Walk `dir` recursively, yielding file paths (depth-first, sorted). */
async function walk(dir: string): Promise<string[]> {
  const found: string[] = []
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...(await walk(full)))
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

/** The `read` tool: file content, size-capped. */
export function readTool(root: string): ToolDefinition {
  return {
    name: 'read',
    description: 'Read a text file inside the workspace and return its content.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'file path relative to the workspace root' } },
      required: ['path'],
    },
    async execute(args) {
      const abs = resolveWithin(root, argString(args, 'path'))
      const content = await fs.readFile(abs, 'utf8')
      return cap(content, READ_CAP)
    },
  }
}

/** The `write` tool: create or overwrite a file, creating parent directories. */
export function writeTool(root: string): ToolDefinition {
  return {
    name: 'write',
    description: 'Create or overwrite a text file inside the workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'file path relative to the workspace root' },
        content: { type: 'string', description: 'full file content to write' },
      },
      required: ['path', 'content'],
    },
    async execute(args) {
      const abs = resolveWithin(root, argString(args, 'path'))
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, argString(args, 'content'), 'utf8')
      return `wrote ${argString(args, 'path')}`
    },
  }
}

/** The `edit` tool: replace the first occurrence of `old` with `new`. */
export function editTool(root: string): ToolDefinition {
  return {
    name: 'edit',
    description: 'Replace the first occurrence of `old` with `new` in a workspace file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'file path relative to the workspace root' },
        old: { type: 'string', description: 'exact text to replace' },
        new: { type: 'string', description: 'replacement text' },
      },
      required: ['path', 'old', 'new'],
    },
    async execute(args) {
      const rel = argString(args, 'path')
      const abs = resolveWithin(root, rel)
      const old = argString(args, 'old')
      const content = await fs.readFile(abs, 'utf8')
      const index = content.indexOf(old)
      if (index < 0) {
        throw new Error(`'${old}' not found in ${rel}`)
      }
      await fs.writeFile(abs, content.slice(0, index) + argString(args, 'new') + content.slice(index + old.length), 'utf8')
      return `edited ${rel}`
    },
  }
}

/** The `glob` tool: match relative paths against a `*`/`**` pattern. */
export function globTool(root: string): ToolDefinition {
  return {
    name: 'glob',
    description: 'List workspace files matching a glob pattern (`*` within a segment, `**` across segments).',
    parameters: {
      type: 'object',
      properties: { pattern: { type: 'string', description: 'glob pattern relative to the workspace root' } },
      required: ['pattern'],
    },
    async execute(args) {
      const absRoot = path.resolve(root)
      const pattern = argString(args, 'pattern')
      const regex = globToRegExp(pattern)
      const files = (await walk(absRoot))
        .map((full) => path.relative(absRoot, full))
        .filter((rel) => regex.test(rel))
        .slice(0, GLOB_CAP)
      return files.length === 0 ? 'no matches' : cap(files.join('\n'), OUTPUT_CAP)
    },
  }
}

/** The `grep` tool: regex search across workspace files, `path:line: text`. */
export function grepTool(root: string): ToolDefinition {
  return {
    name: 'grep',
    description: 'Search workspace files with a regular expression; returns `path:line: text` matches.',
    parameters: {
      type: 'object',
      properties: { pattern: { type: 'string', description: 'regular expression to search for' } },
      required: ['pattern'],
    },
    async execute(args) {
      const regex = new RegExp(argString(args, 'pattern'))
      const absRoot = path.resolve(root)
      const lines: string[] = []
      for (const full of await walk(absRoot)) {
        const rel = path.relative(absRoot, full)
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

/** All filesystem tools bound to one root. */
export function fsTools(root: string): ToolDefinition[] {
  return [readTool(root), writeTool(root), editTool(root), globTool(root), grepTool(root)]
}
