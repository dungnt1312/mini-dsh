import { useEffect, useRef, useState, type ReactNode } from 'react'
import Icon from '../common/Icon.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Menu } from '../ui/Menu.tsx'
import { PolicyPopover } from './PolicyPopover.tsx'
import { ModelMenu } from './ModelMenu.tsx'
import { ThinkingMenu } from './ThinkingMenu.tsx'
import { decodeModelChoice } from '../../lib/providers.ts'
import type { ModelSettings, ProviderSummary } from '../../lib/types.ts'
import type { ModelOption } from '../../lib/providers.ts'

export interface ConversationDockProps {
  readonly approvals: ReactNode
  readonly sendError: ReactNode
  readonly composer: ReactNode
}

/** Center-column dock; measured height becomes transcript bottom padding. */
export function ConversationDock({ approvals, sendError, composer }: ConversationDockProps) {
  const dockRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dock = dockRef.current
    if (dock === null) return
    const chat = dock.closest<HTMLElement>('.chat')
    if (chat === null) return
    const update = (): void => {
      const bounds = chat.getBoundingClientRect()
      const height = dock.offsetHeight
      chat.style.setProperty('--conversation-dock-height', `${height}px`)
      const transcript = chat.querySelector<HTMLElement>('.transcript')
      if (transcript !== null) transcript.style.paddingBottom = `${height + Math.max(0, bounds.top) + 24}px`
      dock.style.setProperty('--conversation-dock-left', `${bounds.left}px`)
      dock.style.setProperty('--conversation-dock-width', `${bounds.width}px`)
      dock.style.setProperty('--conversation-dock-bottom', `${Math.max(0, window.innerHeight - bounds.bottom)}px`)
      document.documentElement.style.setProperty('--drawer-dock-top', `${dock.getBoundingClientRect().top}px`)
    }
    update()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    resizeObserver?.observe(dock)
    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => update())
    mutationObserver?.observe(chat, { childList: true, subtree: true })
    window.addEventListener('resize', update)
    return () => {
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      window.removeEventListener('resize', update)
      chat.style.removeProperty('--conversation-dock-height')
      chat.querySelector<HTMLElement>('.transcript')?.style.removeProperty('padding-bottom')
      dock.style.removeProperty('--conversation-dock-left')
      dock.style.removeProperty('--conversation-dock-width')
      dock.style.removeProperty('--conversation-dock-bottom')
      document.documentElement.style.removeProperty('--drawer-dock-top')
    }
  }, [])

  return (
    <section ref={dockRef} data-conversation-dock aria-label="Conversation composer" className="conversation-dock">
      <div className="conversation-dock-surface">
        {approvals}
        {sendError}
        {composer}
      </div>
    </section>
  )
}

/**
 * Control-center composer (spec: Composer v2): autosizing textarea over a
 * two-cluster action row — left `[scope chip][mode trigger]`, right
 * `[stop ghost (running only)][model trigger][thinking trigger][policy ⓘ][send]`.
 * Enter sends, Shift+Enter breaks a line; while a turn runs the placeholder
 * swaps to the queue phrase, Enter queues, and the white send circle morphs
 * into the outline Queue circle. The textarea is disabled only by a missing
 * model — never by a lost connection.
 */
export function Composer({
  scope = null, policy, workspaceId = null, onPolicySaved, onManageModels,
  scopePicker,
  connected,
  sending = false,
  running,
  draft,
  onDraft,
  onSend,
  onStop,
  modelValue,
  modelLabel,
  modelOptions,
  providers = [],
  onModel,
  /** Workspace thinking override; null = the model's configured default. */
  thinkingValue = null,
  /** Per-model settings of the ACTIVE provider, for the thinking default. */
  modelSettings,
  onThinking,
  modes,
  modeValue,
  onMode,
}: {
  readonly scope?: string | null
  readonly policy?: Record<string, string> | undefined
  readonly workspaceId?: string | null
  readonly onPolicySaved?: () => void
  readonly onManageModels?: () => void
  /**
   * Pre-conversation project selector (spec: no-modal new-chat flow) — the
   * scope chip becomes a picker while no conversation is open. Absent → the
   * chip is the read-only display of the fixed, open conversation's scope.
   * The footer opens the server-backed folder picker (browsers never reveal
   * absolute paths, so folders are chosen by navigating real directories).
   */
  readonly scopePicker?: {
    readonly value: string | null
    readonly options: readonly { readonly id: string | null; readonly name: string; readonly path: string }[]
    readonly onChange: (id: string | null) => void
    readonly onPickFolder: () => void
  }
  readonly sending?: boolean
  readonly connected: boolean
  readonly running: boolean
  readonly draft: string
  readonly onDraft: (value: string) => void
  readonly onSend: () => void
  readonly onStop: () => void
  readonly modelValue: string | null
  /** `provider/model` display form of the active pair; falls back to modelValue. */
  readonly modelLabel?: string | undefined
  readonly modelOptions: readonly ModelOption[]
  readonly providers?: readonly ProviderSummary[]
  readonly onModel: (value: string) => void
  readonly thinkingValue?: string | null
  readonly modelSettings?: Readonly<Record<string, ModelSettings>>
  readonly onThinking?: (level: string | null) => void
  readonly modes: readonly { readonly value: string; readonly label: string }[]
  readonly modeValue: string | null
  readonly onMode: (value: string) => void
}) {
  const area = useRef<HTMLTextAreaElement | null>(null)
  const [focused, setFocused] = useState(false)

  const resize = (element: HTMLTextAreaElement): void => {
    element.style.setProperty('--composer-input-height', `${Math.min(element.scrollHeight, 160)}px`)
  }

  const eligible = draft.trim() !== '' && connected && modelValue !== null
  const submit = (): void => {
    if (sending || !eligible) return
    onSend()
  }
  const fullAccess = modeValue === 'full-access'
  const modeRow = modes.find((mode) => mode.value === modeValue)

  const placeholder = modelValue === null
    ? 'Configure a provider in Settings first…'
    : running
      ? 'Keep typing to queue a follow-up…'
      : !connected
        ? 'Reconnecting — your draft is kept…'
        : 'Ask a question or describe a change…'

  return (
    <form
      className={`composer ${focused ? 'composer-focused' : ''}`}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <textarea
        aria-label="Message"
        ref={area}
        className="composer-input"
        value={draft}
        rows={2}
        style={{ height: 'var(--composer-input-height, auto)' }}
        placeholder={placeholder}
        disabled={modelValue === null}
        onChange={(event) => {
          onDraft(event.target.value)
          resize(event.currentTarget)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <div className="composer-actions">
        <div className="composer-left">
          {scopePicker !== undefined ? (
            <Menu
              label="Conversation scope — choose the project for the new conversation"
              panelClassName="scope-menu"
              triggerClassName="ui-select-trigger scope-chip scope-chip-picking"
              trigger={() => (
                <>
                  <Icon name="folder" size={11} />
                  <span className="scope-chip-name">{scopePicker.options.find((option) => option.id === scopePicker.value)?.name ?? 'Chat only'}</span>
                  <Icon name="chevron" size={10} className="chevron" />
                </>
              )}
            >
              {(close) => (
                <>
                  {scopePicker.options.map((option) => (
                    <button
                      key={option.id ?? 'chat-only'}
                      type="button"
                      role="menuitemradio"
                      aria-checked={option.id === scopePicker.value}
                      className="menu-row scope-option"
                      onClick={() => { scopePicker.onChange(option.id); close() }}
                    >
                      <span className="scope-option-main">
                        <span className="scope-option-name">{option.name}</span>
                        <span className="scope-option-path">{option.path}</span>
                      </span>
                      {option.id === scopePicker.value ? <Icon name="check" size={12} className="menu-check" /> : null}
                    </button>
                  ))}
                  <hr className="policy-divider" />
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-row scope-register-row"
                    onClick={() => { scopePicker.onPickFolder(); close() }}
                  >
                    <Icon name="plus" size={12} />
                    <span>Choose folder…</span>
                  </button>
                </>
              )}
            </Menu>
          ) : scope !== null
            ? <span className="scope-chip" title={scope}><Icon name="folder" size={11} /><span className="scope-chip-name">{scope.split(/[\\/]/).at(-1)}</span></span>
            : (
                <span className="scope-chip scope-chip-chat" title="No folder is attached, so file and shell tools are unavailable.">
                  <Icon name="info" size={11} />
                  Chat only
                </span>
              )}
          {modeValue !== null && modes.length > 0 ? (
            <Menu
              label="Workspace mode (next tool gate and request)"
              panelClassName="mode-menu"
              triggerClassName={`ui-select-trigger composer-mode-trigger${fullAccess ? ' mode-full-access' : ''}`}
              trigger={() => (
                <>
                  <Icon name="shield" size={13} />
                  <span className="composer-model-label">{modeRow?.label ?? modeValue}</span>
                  <Icon name="chevron" size={11} className="chevron" />
                </>
              )}
            >
              {(close) => modes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={mode.value === modeValue}
                  className={`menu-row${mode.value === 'full-access' ? ' mode-full-access' : ''}`}
                  onClick={() => { onMode(mode.value); close() }}
                >
                  {mode.value === 'full-access' ? <Icon name="shield" size={12} /> : null}
                  {mode.label}
                  {mode.value === modeValue ? <Icon name="check" size={12} className="menu-check" /> : null}
                </button>
              ))}
            </Menu>
          ) : null}
        </div>
        <span className="composer-spacer" />
        <div className="composer-right">
          {running ? (
            <IconButton label="Stop work" size="md" className="composer-stop" onClick={onStop}>
              <Icon name="square" size={11} />
            </IconButton>
          ) : null}
          {modelValue !== null && modelOptions.length > 0 ? (
            <ModelMenu
              {...(modelLabel !== undefined ? { modelLabel } : { modelLabel: modelValue })}
              modelValue={modelValue}
              options={modelOptions}
              providers={providers}
              {...(modelSettings !== undefined ? { modelSettings } : {})}
              onModel={onModel}
              {...(onManageModels !== undefined ? { onManage: onManageModels } : { onManage: () => {} })}
            />
          ) : null}
          {modelValue !== null && onThinking !== undefined ? (
            <ThinkingMenu
              model={decodeModelChoice(modelValue)?.model ?? null}
              value={thinkingValue}
              {...(modelSettings !== undefined ? { settings: modelSettings[decodeModelChoice(modelValue)?.model ?? ''] } : {})}
              onSelect={onThinking}
            />
          ) : null}
          <PolicyPopover {...(policy !== undefined ? { policy } : {})} workspaceId={workspaceId} {...(onPolicySaved !== undefined ? { onSaved: onPolicySaved } : {})} />
          {running ? (
            <button
              type="submit"
              className="composer-send composer-queue"
              aria-label="Queue message"
              title="Queue — runs after the current turn (Enter)"
              disabled={!eligible}
            >
              <Icon name="arrowDown" size={16} />
            </button>
          ) : (
            <button
              type="submit"
              className="composer-send"
              aria-label="Send"
              title="Send (Enter) · Shift+Enter for a new line"
              disabled={!eligible}
            >
              <Icon name="send" size={16} />
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
