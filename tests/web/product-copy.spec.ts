import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const web = fileURLToPath(new URL('../../web', import.meta.url))
function files(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]) }
describe('product copy and semantic palette audit', () => {
  it('contains no Vietnamese product literals; external content enters only through values', () => {
    const violations = files(web).filter(f => /\.(tsx?|html)$/.test(f) && !f.includes('.spec.')).flatMap(file => readFileSync(file, 'utf8').split('\n').flatMap((line, i) => /[À-ỹ]/u.test(line) ? [`${file}:${i + 1}: ${line}`] : []))
    expect(violations).toEqual([])
    expect(readFileSync(join(web, 'index.html'), 'utf8')).toContain('lang="en"')
  })
  it('meets text and meaningful control contrast on neutral surfaces', () => {
    const css = readFileSync(join(web, 'styles/tokens.css'), 'utf8')
    const token = (name: string) => css.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))![1]!
    const lum = (hex: string) => hex.slice(1).match(/../g)!.map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i]!, 0)
    const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05)
    for (const text of ['text', 'text-dim', 'text-faint', 'ok', 'bad', 'amber']) for (const bg of ['bg', 'bg-pane', 'bg-elevated']) expect(contrast(token(text), token(bg))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('accent'), token('text-inverse'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('border-strong'), token('bg'))).toBeGreaterThanOrEqual(3)
  })
})
