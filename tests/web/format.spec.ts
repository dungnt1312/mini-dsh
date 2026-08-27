import { describe, expect, it } from 'vitest'
import { pathBasename, toolTarget } from '../../web/lib/format.ts'

describe('pathBasename', () => {
  it('returns the last segment for win/unix paths', () => {
    expect(pathBasename('C:\\workspace\\mini-dsh')).toBe('mini-dsh')
    expect(pathBasename('/home/dev/project')).toBe('project')
    expect(pathBasename('plain')).toBe('plain')
    expect(pathBasename('')).toBe('')
  })
})

describe('toolTarget', () => {
  it('picks the first non-empty string argument', () => {
    expect(toolTarget({ path: 'src/x.ts' })).toBe('src/x.ts')
    expect(toolTarget({ command: 'npm test' })).toBe('npm test')
    expect(toolTarget({ pattern: '', limit: 5 })).toBe('')
    expect(toolTarget({ limit: 5 })).toBe('')
  })
})
