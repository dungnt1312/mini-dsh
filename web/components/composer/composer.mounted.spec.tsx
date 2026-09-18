// @vitest-environment jsdom
/**
 * Composer behaviour around the rich input: the `@` and `/` menus, mention and
 * attachment chips, pasted files, and ArrowUp recall. Sending, chips in the
 * control row and permissions are covered by the product-copy specs.
 */
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Composer } from './Composer.tsx'
import { ToastHost } from '../common/Toast.tsx'
import { emptyDraft, type AttachmentRef, type RichDraft } from '../../lib/composer-draft.ts'
import type { CompletionItem } from '../../lib/composer-completion.ts'

const files: readonly CompletionItem[] = [
  { id: 'web/composer.ts', insert: 'web/composer.ts', segment: { kind: 'mention', path: 'web/composer.ts' }, label: 'composer.ts', detail: 'web' },
  { id: 'web/api.ts', insert: 'web/api.ts', segment: { kind: 'mention', path: 'web/api.ts' }, label: 'api.ts', detail: 'web' },
]

const PNG_REF: AttachmentRef = { id: 'a'.repeat(64), name: 'shot.png', mediaType: 'image/png', bytes: 2048 }

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
/** The draft the harness currently holds, as the app would. */
let current: RichDraft = emptyDraft

/** Mirror the app: the parent owns the draft and echoes back what it is given. */
function Harness(props: Partial<React.ComponentProps<typeof Composer>>): React.ReactNode {
  const [draft, setDraft] = useState<RichDraft>(emptyDraft)
  current = draft
  return (
    <ToastHost>
      <Composer {...baseProps} {...props} draft={draft} onDraft={(next) => { current = next; setDraft(next) }} />
    </ToastHost>
  )
}

function render(props: Partial<React.ComponentProps<typeof Composer>> = {}): void {
  act(() => root.render(<Harness {...props} />))
}

const input = (): HTMLElement => host.querySelector('[data-composer-input]') as HTMLElement
const options = (): HTMLElement[] => Array.from(host.querySelectorAll('[role="option"]'))
const chips = (): HTMLElement[] => Array.from(input().querySelectorAll('[data-chip-segment]'))

/** Type text and leave the caret at its end, the way a browser would. */
function type(text: string): void {
  const element = input()
  act(() => {
    element.textContent = text
    const node = element.firstChild as Text
    const range = document.createRange()
    range.setStart(node, text.length)
    range.collapse(true)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function key(value: string): void {
  act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: value })) })
}

const settle = async (): Promise<void> => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)) }) }

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  current = emptyDraft
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('file mentions', () => {
  it('searches after the caret settles and inserts the choice as a chip', async () => {
    const onSearchFiles = vi.fn(async () => files)
    render({ onSearchFiles })

    type('look at @comp')
    await settle()

    expect(onSearchFiles).toHaveBeenCalledWith('comp')
    expect(options().map((option) => option.textContent)).toEqual(['composer.tsweb', 'api.tsweb'])

    key('Enter')
    expect(chips()).toHaveLength(1)
    expect(chips()[0]?.getAttribute('aria-label')).toBe('File mention web/composer.ts')
    expect(current.segments).toEqual([
      { kind: 'text', text: 'look at ' },
      { kind: 'mention', path: 'web/composer.ts' },
      { kind: 'text', text: ' ' },
    ])
  })

  it('moves the active option with the arrow keys', async () => {
    render({ onSearchFiles: async () => files })
    type('@comp')
    await settle()
    key('ArrowDown')
    key('Enter')
    expect(current.segments).toContainEqual({ kind: 'mention', path: 'web/api.ts' })
  })

  it('stays shut without a project and closes on Escape', async () => {
    render({})
    type('@comp')
    await settle()
    expect(options()).toHaveLength(0)

    render({ onSearchFiles: async () => files })
    type('@comp')
    await settle()
    expect(options()).toHaveLength(2)
    key('Escape')
    expect(options()).toHaveLength(0)
    expect(input().getAttribute('aria-expanded')).toBe('false')
  })
})

describe('skill commands', () => {
  const skills = [{ name: 'review', description: 'Check a diff' }, { name: 'test', description: 'Run the suite' }]

  it('opens on a leading slash and inserts plain, editable text', () => {
    render({ skills })
    type('/rev')
    expect(options().map((option) => option.textContent)).toEqual(['reviewCheck a diff'])
    key('Enter')
    expect(chips()).toHaveLength(0)
    expect(current.segments).toEqual([{ kind: 'text', text: 'Use the review skill: ' }])
  })

  it('ignores a slash that is not the start of the draft', () => {
    render({ skills })
    type('run /rev')
    expect(options()).toHaveLength(0)
  })
})

describe('attachments', () => {
  it('uploads pasted files and drops a chip in for each one', async () => {
    const onUploadFiles = vi.fn(async () => [PNG_REF])
    render({ onUploadFiles })

    const file = new File([new Uint8Array([1, 2])], 'shot.png', { type: 'image/png' })
    await act(async () => {
      const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
      Object.defineProperty(event, 'clipboardData', { value: { files: [file], getData: () => '' } })
      input().dispatchEvent(event)
      await Promise.resolve()
    })
    await settle()

    expect(onUploadFiles).toHaveBeenCalledTimes(1)
    expect(chips()[0]?.getAttribute('aria-label')).toBe('Attachment shot.png')
    expect(current.segments).toContainEqual({ kind: 'attachment', ref: PNG_REF })
  })

  it('removes exactly the chip whose button was pressed', async () => {
    render({ onUploadFiles: async () => [PNG_REF] })
    type('before ')
    const element = input()
    await act(async () => {
      const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
      Object.defineProperty(event, 'clipboardData', { value: { files: [new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' })], getData: () => '' } })
      element.dispatchEvent(event)
      await Promise.resolve()
    })
    await settle()
    expect(chips()).toHaveLength(1)

    act(() => { (chips()[0]?.querySelector('[data-chip-remove]') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(chips()).toHaveLength(0)
    expect(current.segments.some((segment) => segment.kind === 'attachment')).toBe(false)
    // The chip's own trailing space stays behind, exactly as deleting a word would.
    expect(current.segments).toEqual([{ kind: 'text', text: 'before  ' }])
  })

  it('offers no attach control when the conversation cannot take files', () => {
    render({})
    expect(host.querySelector('[aria-label="Attach a file"]')).toBeNull()
    render({ onUploadFiles: async () => [] })
    expect(host.querySelector('[aria-label="Attach a file"]')).not.toBeNull()
  })
})

describe('recall', () => {
  it('loads the last message only when the draft is empty', () => {
    const onRecallLast = vi.fn(() => 'previous question')
    render({ onRecallLast })
    key('ArrowUp')
    expect(current.segments).toEqual([{ kind: 'text', text: 'previous question' }])

    onRecallLast.mockClear()
    type('typing')
    key('ArrowUp')
    expect(onRecallLast).not.toHaveBeenCalled()
  })

  it('does nothing when there is no earlier message', () => {
    render({ onRecallLast: () => null })
    key('ArrowUp')
    expect(current.segments).toEqual([])
  })
})
