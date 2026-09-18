import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { formatBytes, normalizeDraft, type DraftSegment, type RichDraft } from '../../lib/composer-draft.ts'

/**
 * The composer's input: a contenteditable that holds chips inline, where the
 * user put them.
 *
 * It is deliberately **uncontrolled**. Rewriting the content from React state
 * on every keystroke would destroy the caret, the selection and the browser's
 * undo stack, and would fight IME composition — which for Vietnamese input is
 * not an edge case but the normal path. React owns the initial content and
 * explicit resets only; everything else flows outward through `onChange`.
 *
 * Chips are `contenteditable="false"` spans built as plain DOM and carrying
 * their own payload, so the editor's DOM is the single source of truth and
 * serialization is a plain walk. They are not React nodes: a portal into an
 * element the browser may split, merge or delete during editing would fight
 * the same battle the controlled value already lost.
 */

export interface RichInputHandle {
  focus: () => void
  /** Replace the whole content (reuse, recall, clear-after-send). */
  setDraft: (draft: RichDraft) => void
  /** The caret's text node content and offset, for completion triggers. */
  caretContext: () => { readonly text: string; readonly offset: number } | null
  /** Replace `[start, end)` of the caret's text node with one segment. */
  replaceAtCaret: (start: number, end: number, insert: DraftSegment) => void
  /** Insert a segment at the caret, keeping words from gluing together. */
  insertAtCaret: (segment: DraftSegment) => void
}

export interface RichInputProps {
  readonly draft: RichDraft
  readonly onChange: (draft: RichDraft) => void
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  /** Files pasted or dropped onto the editor; the parent decides what to do. */
  readonly onFiles: (files: readonly File[]) => void
  readonly placeholder: string
  readonly disabled: boolean
  readonly ariaLabel: string
  readonly ariaDescribedBy?: string
  readonly autoFocus?: boolean
  readonly listId?: string
  readonly expanded: boolean
  readonly activeOptionId?: string
}

const CHIP_ATTRIBUTE = 'data-chip-segment'
const CHIP_CLASS = 'mx-0.5 inline-flex max-w-[16rem] select-none items-center gap-1 rounded-lg border border-line bg-hover px-1.5 py-0.5 align-baseline text-[13px] leading-5 text-fg'

/** Read the editor's DOM back into segments. */
export function serializeEditor(root: HTMLElement): RichDraft {
  const segments: DraftSegment[] = []
  const walk = (node: Node, depth: number): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        segments.push({ kind: 'text', text: child.textContent ?? '' })
        continue
      }
      if (!(child instanceof HTMLElement)) continue
      const encoded = child.getAttribute(CHIP_ATTRIBUTE)
      if (encoded !== null) {
        try {
          segments.push(JSON.parse(encoded) as DraftSegment)
        } catch {
          // A chip whose payload cannot be read is dropped rather than sent as
          // something the user never chose.
        }
        continue
      }
      // Browsers wrap new lines in <div>/<p> and end them with <br>; both mean
      // a line break, but a block's own trailing <br> must not double it.
      if (child.tagName === 'BR') {
        segments.push({ kind: 'text', text: '\n' })
        continue
      }
      if (depth === 0 && (child.tagName === 'DIV' || child.tagName === 'P')) {
        segments.push({ kind: 'text', text: '\n' })
        const last = child.lastChild
        if (last instanceof HTMLElement && last.tagName === 'BR') last.remove()
      }
      walk(child, depth + 1)
    }
  }
  walk(root, 0)
  return normalizeDraft(segments)
}

/** Build one chip: an inert span carrying its payload and a remove button. */
function chipElement(segment: DraftSegment, document: Document): HTMLElement {
  const host = document.createElement('span')
  host.setAttribute(CHIP_ATTRIBUTE, JSON.stringify(segment))
  host.setAttribute('contenteditable', 'false')
  host.className = CHIP_CLASS

  const label = document.createElement('span')
  label.className = 'truncate'
  if (segment.kind === 'mention') {
    label.textContent = segment.path.split('/').at(-1) ?? segment.path
    host.title = `Project file: ${segment.path}`
    host.setAttribute('aria-label', `File mention ${segment.path}`)
  } else if (segment.kind === 'attachment') {
    label.textContent = segment.ref.name
    host.title = `${segment.ref.name} · ${formatBytes(segment.ref.bytes)} · ${segment.ref.mediaType}`
    host.setAttribute('aria-label', `Attachment ${segment.ref.name}`)
  } else {
    label.textContent = segment.text
  }
  host.append(label)

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.dataset['chipRemove'] = 'true'
  remove.className = 'flex shrink-0 items-center rounded text-fg-faint hover:text-fg'
  remove.setAttribute('aria-label', `Remove ${label.textContent ?? 'chip'}`)
  // Drawn rather than written: a glyph here would be a literal in the UI, and
  // the icon component cannot render into DOM the editor builds by hand.
  const cross = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  cross.setAttribute('viewBox', '0 0 24 24')
  cross.setAttribute('width', '13')
  cross.setAttribute('height', '13')
  cross.setAttribute('fill', 'none')
  cross.setAttribute('stroke', 'currentColor')
  cross.setAttribute('stroke-width', '2')
  cross.setAttribute('stroke-linecap', 'round')
  cross.setAttribute('aria-hidden', 'true')
  for (const points of [['6', '6', '18', '18'], ['18', '6', '6', '18']]) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', points[0] ?? '')
    line.setAttribute('y1', points[1] ?? '')
    line.setAttribute('x2', points[2] ?? '')
    line.setAttribute('y2', points[3] ?? '')
    cross.append(line)
  }
  remove.append(cross)
  host.append(remove)
  return host
}

export const RichInput = forwardRef<RichInputHandle, RichInputProps>(function RichInput({
  draft, onChange, onKeyDown, onFiles, placeholder, disabled, ariaLabel, ariaDescribedBy,
  autoFocus = false, listId, expanded, activeOptionId,
}, ref) {
  const host = useRef<HTMLDivElement | null>(null)
  /** The draft this editor itself last emitted, so its own echo is ignored. */
  const emitted = useRef<RichDraft | null>(null)

  const emit = (): void => {
    const element = host.current
    if (element === null) return
    const next = serializeEditor(element)
    emitted.current = next
    onChange(next)
  }

  /** Write a draft into the DOM. Resets only — never during normal typing. */
  const render = (next: RichDraft): void => {
    const element = host.current
    if (element === null) return
    element.replaceChildren()
    const document = element.ownerDocument
    for (const segment of next.segments) {
      if (segment.kind === 'text') {
        for (const [index, line] of segment.text.split('\n').entries()) {
          if (index > 0) element.append(document.createElement('br'))
          if (line !== '') element.append(document.createTextNode(line))
        }
        continue
      }
      element.append(chipElement(segment, document))
    }
    emitted.current = next
  }

  // Mount, then re-render only when the parent supplies a draft this editor
  // did not produce (reuse, recall, clear after send).
  useLayoutEffect(() => {
    if (emitted.current === draft) return
    render(draft)
  }, [draft])

  useLayoutEffect(() => {
    if (autoFocus) host.current?.focus()
  }, [autoFocus])

  const caretTextNode = (): { node: Text; offset: number } | null => {
    const element = host.current
    const selection = element?.ownerDocument.getSelection()
    if (element == null || selection == null || selection.rangeCount === 0) return null
    const { anchorNode, anchorOffset, isCollapsed } = selection
    if (!isCollapsed || anchorNode === null || !element.contains(anchorNode)) return null
    if (anchorNode.nodeType !== Node.TEXT_NODE) return null
    return { node: anchorNode as Text, offset: anchorOffset }
  }

  /** Replace `[start, end)` of the caret's text node with the given nodes. */
  const spliceAtCaret = (start: number, end: number, nodes: readonly Node[]): void => {
    const element = host.current
    if (element === null || nodes.length === 0) return
    const document = element.ownerDocument
    const caret = caretTextNode()
    const selection = document.getSelection()

    if (caret === null) {
      // No caret inside the editor (a chip inserted from a menu, say): append.
      for (const node of nodes) element.append(node)
      const tail = document.createTextNode('')
      element.append(tail)
      const range = document.createRange()
      range.setStart(tail, 0)
      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)
      emit()
      return
    }

    const text = caret.node.textContent ?? ''
    const parent = caret.node.parentNode
    if (parent === null) return
    const tail = document.createTextNode(text.slice(end))
    caret.node.textContent = text.slice(0, start)
    const anchor = caret.node.nextSibling
    for (const node of nodes) parent.insertBefore(node, anchor)
    parent.insertBefore(tail, anchor)
    if (caret.node.textContent === '') caret.node.remove()
    const range = document.createRange()
    range.setStart(tail, 0)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)
    emit()
  }

  const nodesFor = (segment: DraftSegment): Node[] => {
    const document = host.current?.ownerDocument
    if (document === undefined) return []
    if (segment.kind === 'text') return [document.createTextNode(segment.text)]
    // A chip needs breathing room, or the next typed word joins it visually.
    return [chipElement(segment, document), document.createTextNode(' ')]
  }

  useImperativeHandle(ref, () => ({
    focus: () => host.current?.focus(),
    setDraft: (next) => render(next),
    caretContext: () => {
      const caret = caretTextNode()
      return caret === null ? null : { text: caret.node.textContent ?? '', offset: caret.offset }
    },
    replaceAtCaret: (start, end, insert) => spliceAtCaret(start, end, nodesFor(insert)),
    insertAtCaret: (segment) => {
      const offset = caretTextNode()?.offset ?? 0
      spliceAtCaret(offset, offset, nodesFor(segment))
    },
  }))

  return (
    <div
      ref={host}
      data-composer-input
      role="combobox"
      contentEditable={!disabled}
      suppressContentEditableWarning
      tabIndex={0}
      aria-label={ariaLabel}
      aria-multiline="true"
      aria-expanded={expanded}
      aria-autocomplete="list"
      aria-disabled={disabled || undefined}
      {...(listId !== undefined ? { 'aria-controls': listId } : {})}
      {...(activeOptionId !== undefined ? { 'aria-activedescendant': activeOptionId } : {})}
      {...(ariaDescribedBy !== undefined ? { 'aria-describedby': ariaDescribedBy } : {})}
      data-placeholder={placeholder}
      onInput={emit}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        // Chips are inert content, so their remove button is handled here.
        const button = (event.target as HTMLElement).closest('[data-chip-remove]')
        if (button === null) return
        event.preventDefault()
        button.closest(`[${CHIP_ATTRIBUTE}]`)?.remove()
        emit()
        host.current?.focus()
      }}
      onPaste={(event) => {
        event.preventDefault()
        const files = Array.from(event.clipboardData.files)
        if (files.length > 0) {
          onFiles(files)
          return
        }
        // Plain text only: pasted markup would smuggle elements the serializer
        // does not understand into the draft.
        const text = event.clipboardData.getData('text/plain')
        const caret = caretTextNode()
        if (text !== '') spliceAtCaret(caret?.offset ?? 0, caret?.offset ?? 0, [event.currentTarget.ownerDocument.createTextNode(text)])
      }}
      onDrop={(event) => {
        const files = Array.from(event.dataTransfer.files)
        if (files.length === 0) return
        event.preventDefault()
        onFiles(files)
      }}
      className="composer-input max-h-[200px] min-h-[52px] w-full overflow-y-auto whitespace-pre-wrap break-words px-5 pb-1 pt-4 text-[15px] leading-6 outline-none"
    />
  )
})
