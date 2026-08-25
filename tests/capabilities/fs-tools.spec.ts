/**
 * Filesystem capability tools against a temp workspace: read/write/edit
 * round-trips, glob/grep discovery, and root-confinement rejection.
 */
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fsTools } from 'mini-dsh'
import type { ToolDefinition } from 'mini-dsh'

let root = ''
let tools: Map<string, ToolDefinition>

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'mini-dsh-fs-'))
  tools = new Map(fsTools(root).map((tool) => [tool.name, tool]))
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

function tool(name: string): ToolDefinition {
  const definition = tools.get(name)
  if (definition === undefined) throw new Error(`test setup: missing tool '${name}'`)
  return definition
}

describe('fs tools', () => {
  it('write creates parent directories and read returns the content', async () => {
    await tool('write').execute({ path: 'src/app.ts', content: 'export const x = 1\n' })
    const content = await tool('read').execute({ path: 'src/app.ts' })
    expect(content).toBe('export const x = 1\n')
  })

  it('edit replaces the first occurrence and fails loud when absent', async () => {
    await tool('write').execute({ path: 'notes.md', content: 'alpha beta gamma\n' })
    await tool('edit').execute({ path: 'notes.md', old: 'beta', new: 'BETA' })

    const updated = await tool('read').execute({ path: 'notes.md' })
    expect(updated).toBe('alpha BETA gamma\n')

    await expect(tool('edit').execute({ path: 'notes.md', old: 'missing', new: 'x' })).rejects.toThrow(/not found/)
  })

  it('glob matches * within a segment and ** across segments', async () => {
    await tool('write').execute({ path: 'src/deep/util.ts', content: 'x' })
    await tool('write').execute({ path: 'docs/guide.md', content: 'x' })

    const ts = await tool('glob').execute({ pattern: '**/*.ts' })
    expect(ts.split('\n').sort()).toEqual(['src/app.ts', 'src/deep/util.ts'])

    const shallow = await tool('glob').execute({ pattern: 'src/*' })
    expect(shallow.split('\n').sort()).toEqual(['src/app.ts'])
  })

  it('grep returns path:line: text matches across the workspace', async () => {
    await tool('write').execute({ path: 'src/findme.ts', content: 'const target = 1\nconst other = 2\n' })
    const hits = await tool('grep').execute({ pattern: 'target' })
    expect(hits).toContain('src/findme.ts:1: const target = 1')
    expect(hits).not.toContain('other')

    const none = await tool('grep').execute({ pattern: 'no-such-token-anywhere' })
    expect(none).toBe('no matches')
  })

  it('paths escaping the root are rejected', async () => {
    await expect(tool('read').execute({ path: '../../etc/hostname' })).rejects.toThrow(/escapes the workspace root/)
    await expect(tool('write').execute({ path: '/etc/passwd', content: 'x' })).rejects.toThrow(/escapes the workspace root/)
  })

  it('reading a missing file fails loud', async () => {
    await expect(tool('read').execute({ path: 'nope.ts' })).rejects.toThrow(/ENOENT/)
  })

  it('tools follow a live root accessor when the folder switches', async () => {
    const rootB = await fs.mkdtemp(path.join(tmpdir(), 'mini-dsh-fs-b-'))
    let current = root
    const dynamic = new Map(fsTools(() => current).map((t) => [t.name, t]))
    const writeTool = dynamic.get('write')
    if (writeTool === undefined) throw new Error('test setup: missing write tool')

    await writeTool.execute({ path: 'switch.txt', content: 'first' })
    expect((await fs.readFile(path.join(root, 'switch.txt'), 'utf8')).trim()).toBe('first')

    current = rootB
    await writeTool.execute({ path: 'switch.txt', content: 'second' })
    // The second write landed in the new root; the old root keeps its file.
    expect((await fs.readFile(path.join(rootB, 'switch.txt'), 'utf8')).trim()).toBe('second')
    expect((await fs.readFile(path.join(root, 'switch.txt'), 'utf8')).trim()).toBe('first')
    await fs.rm(rootB, { recursive: true, force: true })
  })
})
