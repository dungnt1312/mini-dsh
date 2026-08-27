import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Icon, { ICON_NAMES } from '../common/Icon.tsx'
import { SHOW_SLOTS } from '../../lib/config.ts'

describe('icon set', () => {
  it('covers the shell + kit vocabulary', () => {
    for (const name of [
      'plus', 'close', 'chevron', 'chevronRight', 'copy', 'check', 'menu',
      'trash', 'pencil', 'send', 'search', 'terminal', 'arrowDown',
      'folder', 'zap', 'clock', 'messageSquare', 'fileText', 'panelRight',
      'panelLeft', 'gitBranch', 'alertTriangle', 'sliders', 'square',
    ]) {
      expect(ICON_NAMES, name).toContain(name)
    }
  })

  it('renders an svg with stroke styling and no fill', () => {
    const html = renderToStaticMarkup(<Icon name="folder" size={14} />)
    expect(html).toContain('<svg')
    expect(html).toContain('stroke-width="1.8"')
  })
})

describe('feature flag', () => {
  it('ships with future-view slots hidden', () => {
    expect(SHOW_SLOTS).toBe(false)
  })
})
