import { useEffect, useId, useRef, useState } from 'react'
import Icon from '../common/Icon.tsx'
import { Spinner } from '../common/Spinner.tsx'
import { Menu, menuItemClass } from '../ui/Menu.tsx'
import { CompletionPopover } from './CompletionPopover.tsx'
import { PolicyPopover } from './PolicyPopover.tsx'
import { RichInput, type RichInputHandle } from './RichInput.tsx'
import { ThinkingMenu } from './ThinkingMenu.tsx'
import { decodeModelChoice } from '../../lib/providers.ts'
import { cn } from '../../lib/cn.ts'
import {
  completionAt,
  moveActive,
  rankSkills,
  type CompletionItem,
  type CompletionRequest,
} from '../../lib/composer-completion.ts'
import {
  draftIsEmpty,
  draftText,
  emptyDraft,
  textDraft,
  type AttachmentRef,
  type DraftSegment,
  type RichDraft,
} from '../../lib/composer-draft.ts'
import type { ModelSettings } from '../../lib/types.ts'
import { composerChipClass } from './composer-chip.ts'

/** Keystrokes settle before a file search leaves for the server. */
const SEARCH_DEBOUNCE_MS = 120
/** Suggestions listed at once, for both menus. */
const MAX_SUGGESTIONS = 12

/** One workspace skill offered by the `/` menu. */
export interface SkillOption {
  readonly name: string
  readonly description?: string
}

const signature = (request: CompletionRequest): string => `${request.kind}:${request.start}:${request.query}`

export interface ScopePicker {
  readonly value: string | null
  readonly options: readonly { readonly id: string | null; readonly name: string; readonly path: string }[]
  readonly onChange: (id: string | null) => void
  readonly onPickFolder: () => void
}

/**
 * Message composer: a rich input over a control row — scope, mode, thinking
 * and permissions on the left; attach, Stop and Send/Queue on the right.
 * Enter sends, Shift+Enter breaks a line; while a turn runs Enter queues.
 * The input is disabled only by a missing model — never by a lost connection.
 *
 * Typing `@` suggests project files and `/` (at the start of a draft) suggests
 * workspace skills. A mention becomes an inline chip carrying a path the agent
 * reads for itself; an attachment chip carries a file already uploaded. Pasted
 * or dropped files upload the same way. ArrowUp on an empty draft brings back
 * the last message for editing.
 */
export function Composer({
  scope = null, policy, workspaceId = null, onPolicySaved, scopePicker, connected, sending = false, running,
  draft, onDraft, onSend, onStop, modelValue, thinkingValue = null, modelSettings, onThinking, modes, modeValue, onMode,
  onSearchFiles, onUploadFiles, skills, onRecallLast, autoFocus = false,
}: {
  readonly scope?: string | null
  readonly policy?: Record<string, string> | undefined
  readonly workspaceId?: string | null
  readonly onPolicySaved?: () => void
  /** Present before a conversation exists: the scope chip picks its project. */
  readonly scopePicker?: ScopePicker
  readonly sending?: boolean
  readonly connected: boolean
  readonly running: boolean
  readonly draft: RichDraft
  readonly onDraft: (draft: RichDraft) => void
  readonly onSend: () => void
  readonly onStop: () => void
  readonly modelValue: string | null
  /** Workspace thinking override; null = the model's configured default. */
  readonly thinkingValue?: string | null
  /** Per-model settings of the ACTIVE provider, for the thinking default. */
  readonly modelSettings?: Readonly<Record<string, ModelSettings>>
  readonly onThinking?: (level: string | null) => void
  readonly modes: readonly { readonly value: string; readonly label: string }[]
  readonly modeValue: string | null
  readonly onMode: (value: string) => void
  /** Absent without a project: `@` then has no files to offer. */
  readonly onSearchFiles?: (query: string) => Promise<readonly CompletionItem[]>
  /**
   * Store files and return their references. Absent means this conversation
   * cannot take uploads, and the attach control says so instead of failing.
   */
  readonly onUploadFiles?: (files: readonly File[]) => Promise<readonly AttachmentRef[]>
  /** Workspace skill catalog for the `/` menu. */
  readonly skills?: readonly SkillOption[]
  /** Newest own message, for ArrowUp on an empty draft. */
  readonly onRecallLast?: () => string | null
  readonly autoFocus?: boolean
}) {
  const editor = useRef<RichInputHandle | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [sendHint, setSendHint] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const hintId = useId()
  const modelHintId = useId()
  const listId = useId()
  const missingModel = modelValue === null
  const empty = draftIsEmpty(draft)
  const eligible = !empty && connected && !missingModel

  const [request, setRequest] = useState<CompletionRequest | null>(null)
  const [items, setItems] = useState<readonly CompletionItem[]>([])
  const [active, setActive] = useState(0)
  const [searching, setSearching] = useState(false)
  // Escape closes the list until the query itself changes.
  const [dismissed, setDismissed] = useState<string | null>(null)

  // A menu with no source stays shut: `@` needs a project, `/` needs skills.
  const available = request === null ? false : request.kind === 'file' ? onSearchFiles !== undefined : (skills ?? []).length > 0
  const open = request !== null && available && dismissed !== signature(request)
  const fileSearch = open && request?.kind === 'file' ? onSearchFiles : undefined
  const fileQuery = request?.kind === 'file' ? request.query : null

  // Skills are already in memory; only file suggestions go to the server, and
  // a stale response never overwrites a newer query.
  useEffect(() => {
    if (fileSearch === undefined || fileQuery === null) return
    let live = true
    setSearching(true)
    const timer = setTimeout(() => {
      void fileSearch(fileQuery)
        .then((found) => { if (live) { setItems(found.slice(0, MAX_SUGGESTIONS)); setActive(0) } })
        .catch(() => { if (live) setItems([]) })
        .finally(() => { if (live) setSearching(false) })
    }, SEARCH_DEBOUNCE_MS)
    return () => { live = false; clearTimeout(timer) }
  }, [fileSearch, fileQuery])

  useEffect(() => {
    if (!open || request?.kind !== 'skill') return
    setItems(rankSkills(skills ?? [], request.query, MAX_SUGGESTIONS).map((skill) => ({
      id: `skill:${skill.name}`,
      insert: `Use the ${skill.name} skill:`,
      label: skill.name,
      ...(skill.description !== undefined ? { detail: skill.description } : {}),
    })))
    setActive(0)
    setSearching(false)
  }, [open, request?.kind, request?.query, skills])

  /**
   * Re-read the caret and decide which menu, if any, belongs open. Triggers
   * are matched inside the caret's own text node, so a chip beside the caret
   * cannot be read as part of the query.
   */
  const syncCompletion = (): void => {
    const caret = editor.current?.caretContext() ?? null
    const next = caret === null ? null : completionAt(caret.text, caret.offset)
    setRequest(next)
    if (next === null) { setItems([]); setSearching(false) }
  }

  const closeCompletion = (): void => { setRequest(null); setItems([]); setSearching(false) }

  const pick = (item: CompletionItem): void => {
    if (request === null) return
    const segment: DraftSegment = item.segment ?? { kind: 'text', text: `${item.insert} ` }
    editor.current?.replaceAtCaret(request.start, request.end, segment)
    closeCompletion()
  }

  /** Upload dropped/pasted/chosen files and drop a chip in for each one. */
  const attach = (files: readonly File[]): void => {
    if (onUploadFiles === undefined || files.length === 0) return
    setUploading(true)
    void onUploadFiles(files)
      .then((refs) => {
        for (const ref of refs) editor.current?.insertAtCaret({ kind: 'attachment', ref })
      })
      .finally(() => setUploading(false))
  }

  const blockedReason = (): string => {
    if (missingModel) return 'Cannot send: configure a provider in Settings first.'
    if (!connected) return 'Cannot send: reconnecting. Your draft is kept.'
    if (empty) return 'Cannot send: message is empty.'
    return 'Cannot send.'
  }
  const submit = (): void => {
    if (sending) return
    if (!eligible) {
      setSendHint(blockedReason())
      return
    }
    setSendHint(null)
    onSend()
  }

  const placeholder = missingModel
    ? 'Configure a provider in Settings first…'
    : running
      ? 'Queue a follow-up…'
      : !connected
        ? 'Reconnecting — your draft is kept…'
        : 'Ask anything'
  const modelId = modelValue !== null ? decodeModelChoice(modelValue)?.model ?? null : null
  const modeRow = modes.find((mode) => mode.value === modeValue)

  return (
    <form
      className="relative flex flex-col rounded-[28px] border border-line bg-composer shadow-composer transition-colors focus-within:border-line-strong dark:border-transparent dark:focus-within:border-line-strong"
      onSubmit={(event) => { event.preventDefault(); submit() }}
    >
      {missingModel ? <p id={modelHintId} className="m-0 px-5 pt-3 text-[13px] text-warn">Configure a provider in Settings to send messages.</p> : null}
      {sendHint !== null ? <p id={hintId} className="sr-only" role="status" aria-live="polite">{sendHint}</p> : null}
      {open && request !== null ? (
        <CompletionPopover
          id={listId}
          kind={request.kind}
          items={items}
          activeIndex={active}
          loading={searching}
          note={items.length > 0 ? null : searching ? 'Searching…' : request.kind === 'file' ? 'No matching file' : 'No matching skill'}
          onPick={pick}
          onActivate={setActive}
        />
      ) : null}
      <RichInput
        ref={editor}
        draft={draft}
        autoFocus={autoFocus}
        placeholder={placeholder}
        disabled={missingModel}
        ariaLabel="Message"
        expanded={open}
        {...(open ? { listId } : {})}
        {...(open && items.length > 0 ? { activeOptionId: `${listId}-option-${active}` } : {})}
        {...(() => {
          const described = [missingModel ? modelHintId : null, sendHint !== null ? hintId : null].filter((id): id is string => id !== null).join(' ')
          return described === '' ? {} : { ariaDescribedBy: described }
        })()}
        onChange={(next) => { onDraft(next); syncCompletion() }}
        onFiles={attach}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (open) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              const delta = event.key === 'ArrowDown' ? 1 : -1
              event.preventDefault()
              setActive((index) => moveActive(index, delta, items.length))
              return
            }
            if ((event.key === 'Enter' || event.key === 'Tab') && items[active] !== undefined) {
              event.preventDefault()
              pick(items[active])
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              if (request !== null) setDismissed(signature(request))
              return
            }
          }
          if (event.key === 'ArrowUp' && empty && onRecallLast !== undefined) {
            const recalled = onRecallLast()
            if (recalled !== null && recalled !== '') {
              event.preventDefault()
              const recalledDraft = textDraft(recalled)
              editor.current?.setDraft(recalledDraft)
              onDraft(recalledDraft)
              return
            }
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <div className="flex items-center gap-1 px-2.5 pb-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
          {scopePicker !== undefined ? (
            <Menu
              label="Conversation scope — choose the project for the new conversation"
              side="top"
              panelClassName="w-80"
              triggerClassName={composerChipClass}
              trigger={() => (
                <>
                  <Icon name="folder" size={15} />
                  <span className="truncate">{scopePicker.options.find((option) => option.id === scopePicker.value)?.name ?? 'Chat only'}</span>
                  <Icon name="chevron" size={13} />
                </>
              )}
            >
              {(close) => (
                <>
                  <div className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-fg-faint">Project for this conversation</div>
                  {scopePicker.options.map((option) => (
                    <button
                      key={option.id ?? 'chat-only'}
                      type="button"
                      role="menuitemradio"
                      aria-checked={option.id === scopePicker.value}
                      className={menuItemClass}
                      onClick={() => { scopePicker.onChange(option.id); close() }}
                    >
                      <Icon name={option.id === null ? 'messageSquare' : 'folder'} size={15} className="text-fg-muted" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{option.name}</span>
                        <span className="truncate text-xs text-fg-faint">{option.path}</span>
                      </span>
                      {option.id === scopePicker.value ? <Icon name="check" size={15} /> : null}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-line" />
                  <button type="button" role="menuitem" className={menuItemClass} onClick={() => { scopePicker.onPickFolder(); close() }}>
                    <Icon name="plus" size={15} className="text-fg-muted" />
                    Choose folder…
                  </button>
                </>
              )}
            </Menu>
          ) : scope !== null ? (
            <span className={cn(composerChipClass, 'hover:bg-transparent hover:text-fg-muted')} title={scope}>
              <Icon name="folder" size={15} />
              <span className="truncate">{scope.split(/[\\/]/).at(-1)}</span>
            </span>
          ) : (
            <span
              className={cn(composerChipClass, 'cursor-help hover:bg-transparent hover:text-fg-muted')}
              title="No folder is attached, so file and shell tools are unavailable."
              aria-label="Chat only. No folder is attached, so file and shell tools are unavailable."
            >
              <Icon name="messageSquare" size={15} />
              Chat only
            </span>
          )}
          {modeValue !== null && modes.length > 0 ? (
            <Menu
              label="Workspace mode (next tool gate and request)"
              side="top"
              triggerClassName={cn(composerChipClass, modeValue === 'full-access' && 'text-warn hover:text-warn')}
              trigger={() => (
                <>
                  <Icon name="layers" size={15} />
                  <span className="truncate">{modeRow?.label ?? modeValue}</span>
                  <Icon name="chevron" size={13} />
                </>
              )}
            >
              {(close) => (
                <>
                  <div className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-fg-faint">Mode</div>
                  {modes.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={mode.value === modeValue}
                      className={cn(menuItemClass, mode.value === 'full-access' && 'text-warn')}
                      onClick={() => { onMode(mode.value); close() }}
                    >
                      <span className="flex-1">{mode.label}</span>
                      {mode.value === modeValue ? <Icon name="check" size={15} /> : null}
                    </button>
                  ))}
                </>
              )}
            </Menu>
          ) : null}
          {modelId !== null && onThinking !== undefined ? (
            <ThinkingMenu model={modelId} value={thinkingValue} {...(modelSettings?.[modelId] !== undefined ? { settings: modelSettings[modelId] } : {})} onSelect={onThinking} />
          ) : null}
          <PolicyPopover {...(policy !== undefined ? { policy } : {})} workspaceId={workspaceId} {...(onPolicySaved !== undefined ? { onSaved: onPolicySaved } : {})} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onUploadFiles !== undefined || onSearchFiles !== undefined ? (
            <Menu
              label="Attach a file"
              side="top"
              align="end"
              triggerClassName="flex size-9 items-center justify-center rounded-full border border-line text-fg-muted hover:bg-hover hover:text-fg"
              trigger={() => (uploading ? <Spinner size={14} /> : <Icon name="plus" size={18} />)}
            >
              {(close) => (
                <>
                  {onUploadFiles !== undefined ? (
                    <button
                      type="button"
                      role="menuitem"
                      className={menuItemClass}
                      onClick={() => { close(); fileInput.current?.click() }}
                    >
                      <Icon name="arrowUp" size={15} className="text-fg-muted" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span>Upload from this device</span>
                        <span className="truncate text-xs text-fg-faint">Images and text files</span>
                      </span>
                    </button>
                  ) : null}
                  {onSearchFiles !== undefined ? (
                    <button
                      type="button"
                      role="menuitem"
                      className={menuItemClass}
                      // The `@` flow already owns file picking; reusing it keeps
                      // one searching surface instead of two that can disagree.
                      onClick={() => { close(); editor.current?.focus(); editor.current?.insertAtCaret({ kind: 'text', text: '@' }); syncCompletion() }}
                    >
                      <Icon name="fileText" size={15} className="text-fg-muted" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span>Mention a project file</span>
                        <span className="truncate text-xs text-fg-faint">Inserts @ to search this project</span>
                      </span>
                    </button>
                  ) : null}
                </>
              )}
            </Menu>
          ) : null}
          {onUploadFiles !== undefined ? (
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                attach(Array.from(event.target.files ?? []))
                // Clear, so choosing the same file twice still fires a change.
                event.target.value = ''
              }}
            />
          ) : null}
          {running ? (
            <button
              type="button"
              aria-label="Stop work"
              title="Stop"
              onClick={onStop}
              className="flex size-9 items-center justify-center rounded-full border border-line-strong text-fg hover:bg-hover"
            >
              <Icon name="square" size={16} />
            </button>
          ) : null}
          {!running || !empty ? (
            <button
              type="submit"
              aria-label={running ? 'Queue message' : 'Send'}
              title={running ? 'Queue — runs after the current turn (Enter)' : 'Send (Enter) · Shift+Enter for a new line'}
              disabled={!eligible || sending}
              className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-fg transition-opacity hover:opacity-85 disabled:opacity-30"
            >
              {sending ? <Spinner size={14} className="border-primary-fg/40 border-t-primary-fg" /> : <Icon name="arrowUp" size={18} strokeWidth={2.2} />}
            </button>
          ) : null}
        </div>
      </div>
    </form>
  )
}
