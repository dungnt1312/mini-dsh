import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadProviders, maskKey, parseProviders, saveProviders, slugify } from '../../src/web/provider-store.ts'

let dir = ''

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mini-dsh-providers-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('provider store', () => {
  it('missing or malformed file yields an empty list', () => {
    expect(loadProviders(path.join(dir, 'absent.json'))).toEqual([])
    expect(parseProviders('not json')).toEqual([])
    expect(parseProviders('{"id":"x"}')).toEqual([]) // object, not array
    expect(parseProviders('[{"nope":1}]')).toEqual([]) // junk entry dropped
  })

  it('round-trips through save + load', async () => {
    const file = path.join(dir, 'providers.json')
    await saveProviders(file, [
      { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: 'sk-1', models: ['deepseek-chat'], defaultModel: 'deepseek-chat', enabled: true },
      { id: 'proxy', name: 'cliproxy1', baseUrl: 'http://10.0.0.1:8000/v1', apiKey: '', models: [], enabled: false },
    ])
    const loaded = loadProviders(file)
    expect(loaded).toHaveLength(2)
    expect(loaded[0]?.name).toBe('DeepSeek')
    expect(loaded[1]?.enabled).toBe(false)
    const onDisk = await readFile(file, 'utf8')
    expect(onDisk).toContain('api.deepseek.com')
  })

  it('slugify produces stable url-safe ids', () => {
    expect(slugify('GLM Coding Lite!')).toBe('glm-coding-lite')
    expect(slugify('   ')).toBe('provider')
  })

  it('maskKey hides everything but the tail', () => {
    expect(maskKey('sk-abcd1234')).toBe('••••1234')
    expect(maskKey('abc')).toBe('••••')
    // A keyless provider must not look like it holds a hidden secret.
    expect(maskKey('')).toBe('')
  })

  it('seed helper inside plan: DEEPSEEK config matches expected shape', () => {
    // shape contract used by server seeding in T3
    const seeded = parseProviders(JSON.stringify([{
      id: 'deepseek',
      name: 'deepseek',
      baseUrl: process.env['DEEPSEEK_BASE_URL'] ?? 'https://api.deepseek.com',
      apiKey: 'env-key',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      defaultModel: 'deepseek-chat',
      enabled: true,
    }]))
    expect(seeded[0]?.defaultModel).toBe('deepseek-chat')
  })
})
