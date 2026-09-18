/** Draft storage: tolerant of junk, bounded in size, empty drafts dropped. */
import { describe, expect, it } from 'vitest'
import { MAX_DRAFT_CHARS, MAX_STORED_DRAFTS, parseDrafts, serializeDrafts } from './composer-drafts.ts'

describe('parseDrafts', () => {
  it('keeps string drafts and ignores everything else', () => {
    expect(parseDrafts(JSON.stringify({ a: 'hello', b: 7, c: null, d: '' }))).toEqual({ a: 'hello' })
  })

  it('falls back to empty for missing, malformed or non-object payloads', () => {
    expect(parseDrafts(null)).toEqual({})
    expect(parseDrafts('{oops')).toEqual({})
    expect(parseDrafts(JSON.stringify(['a']))).toEqual({})
  })

  it('truncates an oversized stored draft', () => {
    const parsed = parseDrafts(JSON.stringify({ a: 'x'.repeat(MAX_DRAFT_CHARS + 50) }))
    expect(parsed['a']).toHaveLength(MAX_DRAFT_CHARS)
  })
})

describe('serializeDrafts', () => {
  it('drops blank drafts and round-trips the rest', () => {
    expect(parseDrafts(serializeDrafts({ a: 'keep', b: '   ', c: '' }))).toEqual({ a: 'keep' })
  })

  it('keeps only the newest keys', () => {
    const many = Object.fromEntries(Array.from({ length: MAX_STORED_DRAFTS + 5 }, (_, i) => [`key-${i}`, `draft ${i}`]))
    const kept = parseDrafts(serializeDrafts(many))
    expect(Object.keys(kept)).toHaveLength(MAX_STORED_DRAFTS)
    expect(kept[`key-${MAX_STORED_DRAFTS + 4}`]).toBe(`draft ${MAX_STORED_DRAFTS + 4}`)
    expect(kept['key-0']).toBeUndefined()
  })
})
