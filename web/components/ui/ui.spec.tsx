import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Icon, { ICON_NAMES } from '../common/Icon.tsx'
import { SHOW_SLOTS } from '../../lib/config.ts'
import { activeModelValue, decodeModelChoice, encodeModelChoice, modelOptions } from '../../lib/providers.ts'
import { SettingsModal } from '../settings/SettingsModal.tsx'

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

describe('runtime provider UI helpers', () => {
  const meta = {
    provider: 'cliproxy1',
    model: 'gpt-5.6-sol',
    folder: '/workspace',
    models: ['gpt-5.6-sol'],
    providers: [
      { id: 'cliproxy1', name: 'cliproxy1', baseUrl: 'http://proxy/v1', enabled: true, keyMasked: '••••1234', models: ['gpt-5.6-sol', 'gpt-5.6-terra'] },
      { id: 'disabled', name: 'disabled', baseUrl: 'http://off/v1', enabled: false, keyMasked: '••••9999', models: ['nope'] },
    ],
  } as const

  it('encodes a model choice without ambiguity and excludes disabled providers', () => {
    expect(encodeModelChoice('cliproxy1', 'gpt-5.6-sol')).toBe('cliproxy1:gpt-5.6-sol')
    expect(decodeModelChoice('cliproxy1:gpt-5.6-sol')).toEqual({ provider: 'cliproxy1', model: 'gpt-5.6-sol' })
    expect(decodeModelChoice('not-a-choice')).toBeNull()
    expect(modelOptions(meta).map((option) => option.value)).toEqual([
      'cliproxy1:gpt-5.6-sol',
      'cliproxy1:gpt-5.6-terra',
    ])
    expect(activeModelValue(meta)).toBe('cliproxy1:gpt-5.6-sol')
  })

  it('settings modal lists providers through the shared dialog shell', () => {
    const html = renderToStaticMarkup(
      <SettingsModal
        open
        providers={meta.providers}
        activeProvider="cliproxy1"
        activeModel="gpt-5.6-sol"
        onDismiss={() => undefined}
        onRefresh={async () => undefined}
        onSelectActive={async () => undefined}
      />,
    )
    // Dialog chrome comes from the Modal primitive, not bespoke markup.
    expect(html).toContain('ui-modal-backdrop')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('Providers &amp; Models')
    // Every configured provider is selectable, with its model count as subtitle.
    expect(html).toContain('cliproxy1')
    expect(html).toContain('2 models')
    expect(html).toContain('Test connection')
    expect(html).not.toContain('sk-real-secret')
  })

  it('settings modal never renders a raw key field value', () => {
    const html = renderToStaticMarkup(
      <SettingsModal
        open
        providers={meta.providers}
        activeProvider="cliproxy1"
        onDismiss={() => undefined}
        onRefresh={async () => undefined}
        onSelectActive={async () => undefined}
      />,
    )
    // The key input is a password field seeded empty; only the mask is text.
    expect(html).toContain('type="password"')
    expect(html).not.toMatch(/value="sk-/)
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
import { Modal } from './Modal.tsx'
import { Field } from './Field.tsx'
import { Switch } from './Switch.tsx'

describe('dialog / form primitives', () => {
  it('Modal renders nothing while closed', () => {
    expect(renderToStaticMarkup(
      <Modal open={false} onDismiss={() => undefined} label="x"><p>body</p></Modal>,
    )).toBe('')
  })

  it('Modal carries dialog semantics and an optional header slot', () => {
    const html = renderToStaticMarkup(
      <Modal open onDismiss={() => undefined} label="Settings" width="md" header={<strong>Head</strong>}>
        <p>body</p>
      </Modal>,
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Settings"')
    expect(html).toContain('ui-modal-md')
    expect(html).toContain('ui-modal-head')
    expect(html).toContain('Head')
  })

  it('Field pairs a label with one hint line, tone-aware', () => {
    const html = renderToStaticMarkup(
      <Field label="Base URL" tone="bad" hint="Phải là http(s) URL.">
        <TextInput value="ftp://x" readOnly invalid />
      </Field>,
    )
    expect(html).toContain('ui-field-label')
    expect(html).toContain('ui-field-hint-bad')
    expect(html).toContain('ui-field-invalid')
    expect(html).toContain('aria-invalid="true"')
  })

  it('Switch keeps a real checkbox behind the track', () => {
    const html = renderToStaticMarkup(
      <Switch checked label="Enabled" hint="Tắt thì ẩn khỏi picker." onChange={() => undefined} />,
    )
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('ui-switch-track')
    expect(html).toContain('ui-switch-hint')
  })

  it('TextInput can render a monospace variant', () => {
    const html = renderToStaticMarkup(<TextInput mono value="gpt-5.6-sol" readOnly />)
    expect(html).toContain('ui-input-mono')
  })
})

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

describe('chat surfaces', () => {
  it('ToolCard breadcrumb formats arg chips while pending', async () => {
    const { ToolCard } = await import('../chat/MessageParts.tsx')
    const html = renderToStaticMarkup(
      <ToolCard item={{ kind: 'tool', call: { id: 't1', name: 'read', args: { path: 'src/x.ts', limit: 5 } } }} />,
    )
    expect(html).toContain('tool-row')
    expect(html).toContain('read')
    expect(html).toContain('path: src/x.ts')
    expect(html).toContain('+1')
  })

  it('ApprovalBar shows one card per pending call', async () => {
    const { ApprovalBar } = await import('../chat/ApprovalBar.tsx')
    const html = renderToStaticMarkup(
      <ApprovalBar
        approvals={[{ approvalId: 'a1', call: { id: 't', name: 'edit', args: { path: 'web/App.tsx' } } }]}
        onAnswer={() => undefined}
      />,
    )
    expect(html).toContain('edit · web/App.tsx')
    expect(html).toContain('Allow')
    expect(html).toContain('Deny')
  })
})
