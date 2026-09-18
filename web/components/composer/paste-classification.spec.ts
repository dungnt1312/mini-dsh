import { describe, expect, it } from 'vitest'
import { classifyPlainTextPaste, SAFE_MODEL_VISIBLE_BYTES, utf8Bytes } from './paste-classification.ts'

describe('plain-text paste classification', () => {
  it('measures UTF-8 rather than UTF-16 bytes', () => {
    expect(utf8Bytes('é')).toBe(2)
    expect(utf8Bytes('🙂')).toBe(4)
  })

  it('keeps short plain text inline', () => {
    expect(classifyPlainTextPaste('short\ntext')).toEqual({ kind: 'inline' })
  })

  it('offers conversion for middle-band text', () => {
    expect(classifyPlainTextPaste('x'.repeat(5_000))).toEqual({ kind: 'convertible' })
  })

  it('uploads text past the long-paste threshold', () => {
    expect(classifyPlainTextPaste('x'.repeat(8_001))).toEqual({ kind: 'attachment' })
    expect(classifyPlainTextPaste(Array.from({ length: 161 }, () => 'line').join('\n'))).toEqual({ kind: 'attachment' })
  })

  it('uploads code-like logs above their lower threshold', () => {
    expect(classifyPlainTextPaste(Array.from({ length: 101 }, () => 'const value = log();').join('\n').padEnd(5_001, ' '))).toEqual({ kind: 'attachment' })
  })

  it('uses exact UTF-8 byte boundaries instead of JavaScript string length', () => {
    expect(utf8Bytes('🙂'.repeat(15_000))).toBe(SAFE_MODEL_VISIBLE_BYTES)
    expect(utf8Bytes('🙂'.repeat(15_000) + 'a')).toBe(SAFE_MODEL_VISIBLE_BYTES + 1)
  })

  it('classifies the exact long-paste threshold consistently', () => {
    expect(classifyPlainTextPaste('x'.repeat(8_000))).not.toEqual({ kind: 'attachment' })
    expect(classifyPlainTextPaste('x'.repeat(8_001))).toEqual({ kind: 'attachment' })
  })
})
