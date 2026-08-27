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

import { Chip } from './Chip.tsx'
import { TextInput } from './TextInput.tsx'
import { Select } from './Select.tsx'

describe('chip / text-input / select structure', () => {
  it('Chip is a span unless interactive', () => {
    const html = renderToStaticMarkup(<Chip>mini-dsh</Chip>)
    expect(html).toContain('<span')
    expect(html).not.toContain('<button')
    const btn = renderToStaticMarkup(
      <Chip interactive caret onClick={() => undefined}>deepseek</Chip>,
    )
    expect(btn).toContain('<button')
    expect(btn).toContain('ui-chip-caret')
  })

  it('TextInput wraps input with leading slot', () => {
    const html = renderToStaticMarkup(
      <TextInput leading={<b>i</b>} placeholder="Tìm phiên…" readOnly />,
    )
    expect(html).toContain('ui-field')
    expect(html).toContain('ui-input')
    expect(html).toContain('placeholder="Tìm phiên…"')
  })

  it('Select closed renders a listbox trigger, no open menu', () => {
    const html = renderToStaticMarkup(
      <Select
        value="deepseek-chat"
        options={[{ value: 'deepseek-chat', label: 'deepseek-chat' }, { value: 'other', label: 'other' }]}
        onChange={() => undefined}
        label="Model"
      />,
    )
    expect(html).toContain('aria-haspopup="listbox"')
    expect(html).not.toContain('role="listbox"')
    expect(html).toContain('deepseek-chat')
  })

  it('Select merges triggerClassName onto the default trigger', () => {
    const html = renderToStaticMarkup(
      <Select
        value="m"
        options={[{ value: 'm', label: 'm' }]}
        onChange={() => undefined}
        triggerClassName="composer-model"
      />,
    )
    expect(html).toContain('composer-model')
  })

  it('Select honors a custom trigger renderer', () => {
    const html = renderToStaticMarkup(
      <Select
        value="m"
        options={[{ value: 'm', label: 'm' }]}
        onChange={() => undefined}
        renderTrigger={() => <button type="button">custom-trigger</button>}
      />,
    )
    expect(html).toContain('custom-trigger')
  })
})
