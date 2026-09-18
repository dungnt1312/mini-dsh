// @vitest-environment jsdom
/**
 * Composer keyboard behaviour: the `@` and `/` menus, and ArrowUp recall.
 * Sending, chips and permissions are covered by the product-copy specs.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Composer } from './Composer.tsx'
import { ToastHost } from '../common/Toast.tsx'
import type { CompletionItem } from '../../lib/composer-completion.ts'

const files: readonly CompletionItem[] = [
  { id: 'web/composer.ts', insert: 'web/composer.ts', label: 'composer.ts', detail: 'web' },
  { id: 'web/components/composer-chip.ts', insert: 'web/components/composer-chip.ts', label: 'composer-chip.ts', detail: 'web/components' },
]

const baseProps = {
  connected: true,
  running: false,
  onSend: () => {},
  onStop: () => {},
  modelValue: 'openai::gpt-4o',
  modes: [],
  modeValue: null,
  onMode: () => {},
}

let host: HTMLDivElement
let root: Root

function render(props: Partial<React.ComponentProps<typeof Composer>> & { draft: string; onDraft: (value: string) => void }): void {
  // The permission chip reads the toast context the real app provides.
  act(() => root.render(<ToastHost><Composer {...baseProps} {...props} /></ToastHost>))
}

const input = (): HTMLTextAreaElement => host.querySelector('[data-composer-input]') as HTMLTextAreaElement

/** Type into the textarea the way a user does: value, caret, then events. */
function type(value: string, caret = value.length): void {
  const element = input()
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(element, value)
    element.setSelectionRange(caret, caret)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function key(value: string): void {
  act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: value })) })
}

const options = (): HTMLElement[] => Array.from(host.querySelectorAll('[role="option"]'))

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('file mentions', () => {
  it('searches after the caret settles and inserts the picked path', async () => {
    const onDraft = vi.fn()
    const onSearchFiles = vi.fn(async () => files)
    render({ draft: '', onDraft, onSearchFiles })

    type('@comp')
    render({ draft: '@comp', onDraft, onSearchFiles })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)) })

    expect(onSearchFiles).toHaveBeenCalledWith('comp')
    expect(options().map((option) => option.textContent)).toEqual(['composer.tsweb', 'composer-chip.tsweb/components'])
    expect(input().getAttribute('aria-expanded')).toBe('true')

    key('ArrowDown')
    key('Enter')
    expect(onDraft).toHaveBeenLastCalledWith('web/components/composer-chip.ts ')
  })

  it('stays shut without a project and closes on Escape', async () => {
    const onDraft = vi.fn()
    render({ draft: '', onDraft })
    type('@comp')
    render({ draft: '@comp', onDraft })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)) })
    expect(options()).toHaveLength(0)

    const onSearchFiles = vi.fn(async () => files)
    render({ draft: '@comp', onDraft, onSearchFiles })
    type('@comp')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)) })
    expect(options()).toHaveLength(2)
    key('Escape')
    expect(options()).toHaveLength(0)
    expect(input().getAttribute('aria-expanded')).toBe('false')
  })
})

describe('skill commands', () => {
  const skills = [{ name: 'review', description: 'Check a diff' }, { name: 'test', description: 'Run the suite' }]

  it('opens on a leading slash and inserts the skill invocation', () => {
    const onDraft = vi.fn()
    render({ draft: '', onDraft, skills })
    type('/rev')
    render({ draft: '/rev', onDraft, skills })
    expect(options().map((option) => option.textContent)).toEqual(['reviewCheck a diff'])
    key('Enter')
    expect(onDraft).toHaveBeenLastCalledWith('Use the review skill: ')
  })

  it('ignores a slash that is not the start of the draft', () => {
    const onDraft = vi.fn()
    render({ draft: '', onDraft, skills })
    type('run /rev')
    render({ draft: 'run /rev', onDraft, skills })
    expect(options()).toHaveLength(0)
  })
})

describe('recall', () => {
  it('loads the last message only when the draft is empty', () => {
    const onDraft = vi.fn()
    const onRecallLast = vi.fn(() => 'previous question')
    render({ draft: '', onDraft, onRecallLast })
    key('ArrowUp')
    expect(onDraft).toHaveBeenCalledWith('previous question')

    onDraft.mockClear()
    render({ draft: 'typing', onDraft, onRecallLast })
    key('ArrowUp')
    expect(onDraft).not.toHaveBeenCalled()
  })

  it('does nothing when there is no earlier message', () => {
    const onDraft = vi.fn()
    render({ draft: '', onDraft, onRecallLast: () => null })
    key('ArrowUp')
    expect(onDraft).not.toHaveBeenCalled()
  })
})
