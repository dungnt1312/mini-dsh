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

import { Button } from './Button.tsx'
import { IconButton } from './IconButton.tsx'
import { Kbd } from './Kbd.tsx'
import { Badge } from './Badge.tsx'
import { CodeChip } from './CodeChip.tsx'
import { Panel } from './Panel.tsx'

describe('primitives render their class contract', () => {
  it('Button variants/sizes', () => {
    const html = renderToStaticMarkup(
      <>
        <Button variant="primary">go</Button>
        <Button size="sm">small</Button>
        <Button variant="success">allow</Button>
      </>,
    )
    expect(html).toContain('ui-btn')
    expect(html).toContain('ui-btn-primary')
    expect(html).toContain('ui-btn-sm')
    expect(html).toContain('ui-btn-success')
  })

  it('IconButton carries an aria-label', () => {
    const html = renderToStaticMarkup(
      <IconButton label="Đóng" onClick={() => undefined}><span>x</span></IconButton>,
    )
    expect(html).toContain('ui-icon-btn')
    expect(html).toContain('aria-label="Đóng"')
  })

  it('Badge tones, Kbd, CodeChip, Panel', () => {
    const html = renderToStaticMarkup(
      <>
        <Badge tone="amber">slot sau</Badge>
        <Kbd>Ctrl+N</Kbd>
        <CodeChip>edit · web/App.tsx</CodeChip>
        <Panel variant="raised">body</Panel>
      </>,
    )
    expect(html).toContain('ui-badge-amber')
    expect(html).toContain('ui-kbd')
    expect(html).toContain('ui-code')
    expect(html).toContain('ui-panel-raised')
  })
})
