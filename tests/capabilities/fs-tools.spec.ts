/**
 * Filesystem capability tools against a temp workspace: read/write/edit
 * round-trips (canonical names), read windows, observed-state conflict
 * detection, ambiguous-edit rejection, glob/grep discovery, and the full
 * containment contract — lexical escapes, symlink/junction escapes,
 * creation-path checks, and denied application storage.
 */
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fsTools, type ToolDefinition, type ToolExecution } from 'mini-dsh'

let root = ''
let outside = ''
let tools: Map<string, ToolDefinition>

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'mini-dsh-fs-'))
  outside = await fs.mkdtemp(path.join(tmpdir(), 'mini-dsh-fs-out-'))
  tools = new Map(fsTools().map((tool) => [tool.name, tool]))
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

function tool(name: string): ToolDefinition {
  const definition = tools.get(name)
  if (definition === undefined) throw new Error(`test setup: missing tool '${name}'`)
  return definition
}

function exec(extra: Partial<ToolExecution> = {}): ToolExecution {
  return { root, ...extra }
}

function shaOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

describe('fs tools', () => {
  it('Write creates parent directories and Read returns the content', async () => {
    const result = await tool('Write').execute({ path: 'src/app.ts', content: 'export const x = 1\n' }, exec())
    expect(result).toBe('created src/app.ts')
    const content = await tool('Read').execute({ path: 'src/app.ts' }, exec())
    expect(content).toBe('export const x = 1\n')
  })

  it('Write distinguishes overwrite from creation and honors a fresh expectedSha256', async () => {
    const overwritten = await tool('Write').execute({ path: 'src/app.ts', content: 'v2\n', expectedSha256: shaOf('export const x = 1\n') }, exec())
    expect(overwritten).toContain('overwrote src/app.ts')
  })

  it('Write with a stale expectedSha256 refuses to clobber external edits', async () => {
    await fs.writeFile(path.join(root, 'conflict.txt'), 'current bytes', 'utf8')
    await expect(
      tool('Write').execute({ path: 'conflict.txt', content: 'mine', expectedSha256: shaOf('older bytes') }, exec()),
    ).rejects.toThrow(/conflict/)
    expect(await fs.readFile(path.join(root, 'conflict.txt'), 'utf8')).toBe('current bytes')
  })

  it('Edit replaces the single occurrence and fails loud when absent', async () => {
    await tool('Write').execute({ path: 'notes.md', content: 'alpha beta gamma\n' }, exec())
    await tool('Edit').execute({ path: 'notes.md', old: 'beta', new: 'BETA' }, exec())

    const updated = await tool('Read').execute({ path: 'notes.md' }, exec())
    expect(updated).toBe('alpha BETA gamma\n')

    await expect(tool('Edit').execute({ path: 'notes.md', old: 'missing', new: 'x' }, exec())).rejects.toThrow(/not found/)
  })

  it('Edit rejects ambiguous matches instead of replacing the first', async () => {
    await tool('Write').execute({ path: 'dup.txt', content: 'same same\n' }, exec())
    await expect(tool('Edit').execute({ path: 'dup.txt', old: 'same', new: 'x' }, exec())).rejects.toThrow(/ambiguous/)
    expect(await fs.readFile(path.join(root, 'dup.txt'), 'utf8')).toBe('same same\n')
  })

  it('Edit with a stale expectedSha256 leaves the target unchanged', async () => {
    await fs.writeFile(path.join(root, 'edit-conflict.txt'), 'live content', 'utf8')
    await expect(
      tool('Edit').execute(
        { path: 'edit-conflict.txt', old: 'live', new: 'dead', expectedSha256: shaOf('stale') },
        exec(),
      ),
    ).rejects.toThrow(/conflict/)
    expect(await fs.readFile(path.join(root, 'edit-conflict.txt'), 'utf8')).toBe('live content')
  })

  it('Read supports a 1-based line window and reports missing files clearly', async () => {
    await tool('Write').execute({ path: 'lines.txt', content: 'one\ntwo\nthree\nfour\n' }, exec())
    const window = await tool('Read').execute({ path: 'lines.txt', offset: 2, limit: 2 }, exec())
    expect(window).toBe('two\nthree')

    await expect(tool('Read').execute({ path: 'nope.ts' }, exec())).rejects.toThrow(/no such file/)
  })

  it('Glob matches * within a segment and ** across segments', async () => {
    await tool('Write').execute({ path: 'src/deep/util.ts', content: 'x' }, exec())
    await tool('Write').execute({ path: 'docs/guide.md', content: 'x' }, exec())

    const ts = await tool('Glob').execute({ pattern: '**/*.ts' }, exec())
    expect(ts.split('\n').sort()).toEqual(['src/app.ts', 'src/deep/util.ts'])

    const shallow = await tool('Glob').execute({ pattern: 'src/*' }, exec())
    expect(shallow.split('\n').sort()).toEqual(['src/app.ts'])
  })

  it('Grep returns path:line: text matches across the workspace', async () => {
    await tool('Write').execute({ path: 'src/findme.ts', content: 'const target = 1\nconst other = 2\n' }, exec())
    const hits = await tool('Grep').execute({ pattern: 'target' }, exec())
    expect(hits).toContain('src/findme.ts:1: const target = 1')
    expect(hits).not.toContain('other')

    const none = await tool('Grep').execute({ pattern: 'no-such-token-anywhere' }, exec())
    expect(none).toBe('no matches')
  })

  it('lexical escapes of the root are rejected', async () => {
    await expect(tool('Read').execute({ path: '../../etc/hostname' }, exec())).rejects.toThrow(/escapes the workspace root/)
    await expect(tool('Write').execute({ path: '/etc/passwd', content: 'x' }, exec())).rejects.toThrow(/escapes the workspace root/)
  })

  it('a symlink/junction pointing outside the root is rejected, including as a creation path', async () => {
    await fs.writeFile(path.join(outside, 'secret.txt'), 'outside', 'utf8')
    await fs.symlink(outside, path.join(root, 'leak'), 'junction')
    await expect(tool('Read').execute({ path: 'leak/secret.txt' }, exec())).rejects.toThrow(/escapes the workspace root/)
    // Creation through the link would land outside: refused too.
    await expect(tool('Write').execute({ path: 'leak/planted.txt', content: 'x' }, exec())).rejects.toThrow(/escapes the workspace root/)
  })

  it('Read output honors the execution output limit with an explicit marker', async () => {
    await tool('Write').execute({ path: 'big.txt', content: 'x'.repeat(50_000) }, exec())
    const output = await tool('Read').execute({ path: 'big.txt' }, exec({ outputLimit: 1_000 }))
    expect(output.length).toBeLessThan(2_000)
    expect(output).toMatch(/truncated/)
  })

  it('denied roots (application-internal storage) are refused even under the workspace', async () => {
    const dataDir = path.join(root, '.internal')
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(path.join(dataDir, 'events.jsonl'), 'secret records', 'utf8')
    const guarded = exec({ deniedRoots: [dataDir] })
    await expect(tool('Read').execute({ path: '.internal/events.jsonl' }, guarded)).rejects.toThrow(/application-internal storage/)
    await expect(tool('Write').execute({ path: '.internal/events.jsonl', content: 'x' }, guarded)).rejects.toThrow(/application-internal storage/)
    await expect(tool('Grep').execute({ pattern: 'secret' }, guarded)).resolves.toBe('no matches')
    // Outside the denied root everything still works.
    await expect(tool('Read').execute({ path: 'src/app.ts' }, guarded)).resolves.toBe('v2\n')
  })
})
