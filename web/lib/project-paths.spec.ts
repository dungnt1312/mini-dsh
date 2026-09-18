import { describe, expect, it } from 'vitest'
import { baseName, toProjectRelative } from './project-paths.ts'

describe('toProjectRelative', () => {
  it('maps absolute paths inside the root, ignoring separator and drive-letter case', () => {
    expect(toProjectRelative('C:\\Work\\app', 'c:/work/app/src/index.ts')).toBe('src/index.ts')
    expect(toProjectRelative('/home/me/app/', '/home/me/app/README.md')).toBe('README.md')
  })
  it('keeps relative paths root-relative', () => {
    expect(toProjectRelative('C:/work/app', './src\\x.ts')).toBe('src/x.ts')
  })
  it('refuses paths outside the root, the root itself and traversal', () => {
    expect(toProjectRelative('C:/work/app', 'C:/work/application/x.ts')).toBeNull()
    expect(toProjectRelative('/home/me/app', '/home/me/App/x.ts')).toBeNull()
    expect(toProjectRelative('C:/work/app', 'C:/work/app')).toBeNull()
    expect(toProjectRelative('C:/work/app', '../secret.txt')).toBeNull()
    expect(toProjectRelative('C:/work/app', '')).toBeNull()
  })
  it('names a tab from the last segment', () => {
    expect(baseName('src/components/App.tsx')).toBe('App.tsx')
  })
})
