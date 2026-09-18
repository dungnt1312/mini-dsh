import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const web = fileURLToPath(new URL('../../web', import.meta.url))
function files(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]) }

/** Parse `--name: #rrggbb` declarations from one theme block of app.css. */
function themeTokens(css: string, selector: string): Readonly<Record<string, string>> {
  const start = css.indexOf(`${selector} {`)
  const block = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...block.matchAll(/--([\w-]+): (#[0-9a-f]{6});/g)].map(match => [match[1]!, match[2]!]))
}
const lum = (hex: string) => hex.slice(1).match(/../g)!.map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i]!, 0)
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05)

describe('product copy and semantic palette audit', () => {
  it('contains no Vietnamese product literals; external content enters only through values', () => {
    const violations = files(web).filter(f => /\.(tsx?|html)$/.test(f) && !f.includes('.spec.')).flatMap(file => readFileSync(file, 'utf8').split('\n').flatMap((line, i) => /[À-ỹ]/u.test(line) ? [`${file}:${i + 1}: ${line}`] : []))
    expect(violations).toEqual([])
    expect(readFileSync(join(web, 'index.html'), 'utf8')).toContain('lang="en"')
  })
  it.each([[':root', 'light'], [':root[data-theme="dark"]', 'dark']])('meets AA text contrast on every neutral surface in the %s (%s) theme', (selector) => {
    const tokens = themeTokens(readFileSync(join(web, 'styles/app.css'), 'utf8'), selector)
    for (const text of ['fg', 'fg-muted', 'fg-faint']) {
      for (const surface of ['bg', 'sidebar', 'surface', 'muted', 'hover']) {
        expect(contrast(tokens[text]!, tokens[surface]!), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5)
      }
    }
    for (const state of ['ok', 'bad', 'warn']) {
      for (const surface of ['bg', 'sidebar', 'surface']) {
        expect(contrast(tokens[state]!, tokens[surface]!), `${state} on ${surface}`).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(contrast(tokens.primary!, tokens['primary-fg']!)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(tokens.link!, tokens.bg!)).toBeGreaterThanOrEqual(4.5)
  })
})
