import * as Collapsible from '@radix-ui/react-collapsible'
import { forwardRef, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { useScopedState } from '../../hooks/useScopedState.ts'
import Icon from '../common/Icon.tsx'
import { ErrorNotice } from '../common/ErrorNotice.tsx'
import { Badge } from '../ui/Badge.tsx'
import { Button } from '../ui/Button.tsx'
import { cn } from '../../lib/cn.ts'

/**
 * Shared building blocks for the Settings panels, so every tab has the same
 * section headers, lists, notices, confirmations and busy handling.
 */

export type NoticeState = { readonly kind: 'ok' | 'bad' | 'info'; readonly text: string } | null

/** Inline result of the last action: success, failure (with raw details) or info. */
export function Notice({ kind, text }: { readonly kind: 'ok' | 'bad' | 'info'; readonly text: string }) {
  if (kind === 'bad') return <ErrorNotice raw={text} />
  return (
    <p role="status" className={cn('m-0 flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]', kind === 'ok' ? 'bg-ok-soft text-ok' : 'bg-muted text-fg-muted')}>
      <Icon name={kind === 'ok' ? 'check' : 'info'} size={14} className="mt-0.5 shrink-0" />
      <span className="min-w-0">{text}</span>
    </p>
  )
}

/** One short muted paragraph that explains the tab, above its first section. */
export function PanelIntro({ children }: { readonly children: ReactNode }) {
  return <p className="m-0 max-w-3xl text-[13px] leading-5 text-fg-muted">{children}</p>
}

const ISOLATION_TEXT = 'MCP servers, subprocesses, and hooks run with host process privileges. Application controls are not an OS sandbox. Server writes are outside the application writer lease.'

/** Honest isolation statement shown wherever host-privileged execution exists. */
export function IsolationNote() {
  return (
    <p className="m-0 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
      <Icon name="alertTriangle" size={14} className="mt-0.5 shrink-0" />
      <span className="min-w-0">
        MCP servers, subprocesses, and hooks run with host process privileges. Application controls are
        <b> not an OS sandbox</b>. Server writes are outside the application writer lease.
      </span>
    </p>
  )
}

/**
 * The isolation warning as one always-visible line, with the full statement
 * one click away. The headline keeps the load-bearing claim — host privileges,
 * no OS sandbox — so collapsing detail never hides the risk itself, and unlike
 * a tooltip it stays readable without a pointer.
 */
export function IsolationSummary() {
  return (
    <Disclosure
      summary={
        <span className="flex items-center gap-1.5 text-warn">
          <Icon name="alertTriangle" size={13} className="shrink-0" />
          Runs with host privileges — not an OS sandbox
        </span>
      }
    >
      <p className="m-0 text-[13px] leading-5 text-fg-muted">{ISOLATION_TEXT}</p>
    </Disclosure>
  )
}

export function WorkspaceRequired() {
  return <Notice kind="info" text="Choose a workspace first." />
}

/** Titled block of a panel; `manage-section` is a stable hook for browser tests. */
export const Section = forwardRef<HTMLElement, {
  readonly title: ReactNode
  readonly count?: number
  readonly actions?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}>(function Section({ title, count, actions, children, className }, ref) {
  return (
    <section ref={ref} className={cn('manage-section flex min-w-0 flex-col gap-3', className)}>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="truncate">{title}</span>
          {count !== undefined ? <Badge>{count}</Badge> : null}
        </h3>
        {actions !== undefined ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
})

/**
 * Stack of panel sections. Full height so a `PanelFooter` rests on the bottom
 * edge even when the sections above it do not fill the dialog.
 */
export function PanelBody({ children }: { readonly children: ReactNode }) {
  return <div className="flex min-h-full min-w-0 flex-col gap-7">{children}</div>
}

/**
 * Result of the last action, pinned to the bottom of the scrolling panel.
 * A save or delete at the far end of a long tab confirms itself in place
 * instead of writing to a heading the operator has already scrolled past.
 */
export function PanelFooter({ notice, children }: { readonly notice?: NoticeState; readonly children?: ReactNode }) {
  if (notice === null || notice === undefined) {
    if (children === undefined) return null
    return <div className="sticky bottom-0 z-10 -mx-5 mt-auto flex flex-wrap items-center gap-2 border-t border-line bg-surface px-5 py-3">{children}</div>
  }
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-auto flex flex-col gap-2 border-t border-line bg-surface px-5 py-3">
      <Notice kind={notice.kind} text={notice.text} />
      {children !== undefined ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}

/**
 * Collapsed-by-default block for settings most operators never change.
 * Keeping them out of the first screen is what makes the common path short,
 * so `defaultOpen` exists only for a draft that already sets one of them.
 */
export function Disclosure({ summary, count, defaultOpen = false, children }: {
  readonly summary: ReactNode
  readonly count?: number
  readonly defaultOpen?: boolean
  readonly children: ReactNode
}) {
  const [open, setOpen] = useScopedState(defaultOpen)
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="rounded-xl border border-line">
      <Collapsible.Trigger className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left text-[13px] font-medium text-fg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-link">
        <Icon name="chevronRight" size={14} className={cn('shrink-0 text-fg-faint transition-transform', open && 'rotate-90')} aria-hidden="true" />
        <span className="min-w-0 flex-1">{summary}</span>
        {count !== undefined && count > 0 ? <Badge tone="blue">{count}</Badge> : null}
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div className="flex min-w-0 flex-col gap-4 border-t border-line px-3.5 py-3.5">{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

export function ItemList({ children, label }: { readonly children: ReactNode; readonly label?: string }) {
  return <ul aria-label={label} className="m-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-xl border border-line p-0">{children}</ul>
}

/** One list row: identity on the left, actions on the right, details below. */
export function ItemRow({ title, meta, actions, children, selected = false }: {
  readonly title: ReactNode
  readonly meta?: ReactNode
  readonly actions?: ReactNode
  readonly children?: ReactNode
  readonly selected?: boolean
}) {
  return (
    <li className={cn('flex min-w-0 flex-col gap-2 px-3.5 py-3', selected && 'bg-hover')}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">{title}</div>
          {meta !== undefined ? <div className="min-w-0 break-words text-xs text-fg-faint">{meta}</div> : null}
        </div>
        {actions !== undefined ? <div className="flex shrink-0 flex-wrap items-center gap-1">{actions}</div> : null}
      </div>
      {children}
    </li>
  )
}

export function EmptyState({ children }: { readonly children: ReactNode }) {
  return <p className="m-0 rounded-xl border border-dashed border-line px-3.5 py-4 text-center text-[13px] text-fg-muted">{children}</p>
}

/** Monospace multi-line input; `tall` for whole documents. */
export const CodeArea = forwardRef<HTMLTextAreaElement, { readonly tall?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function CodeArea({ tall = false, className, rows, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        spellCheck={false}
        rows={rows ?? (tall ? 14 : 3)}
        className={cn(
          'manage-code w-full min-w-0 resize-y rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12.5px] leading-5 text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-fg-faint',
          tall && 'manage-code-tall min-h-64',
          className,
        )}
        {...rest}
      />
    )
  },
)

/** Two-step destructive action kept inline, next to the thing it removes. */
export function InlineConfirm({ message, confirmLabel, busy, onConfirm, onCancel, cancelLabel = 'Cancel' }: {
  readonly message: ReactNode
  readonly confirmLabel: string
  readonly busy: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
  readonly cancelLabel?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-bad-soft px-3 py-2 text-[13px]">
      <span className="min-w-0 flex-1 basis-48 text-fg">{message}</span>
      <Button variant="danger" size="sm" disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
    </div>
  )
}

/**
 * One async action at a time per panel. The lock is a ref so a double click
 * in the same frame cannot start a second request; `busy` names the running
 * action so only its button shows progress.
 */
export function useActionRunner(onError: (text: string) => void): {
  readonly busy: string | null
  readonly run: (key: string, action: () => Promise<void>) => Promise<void>
} {
  const [busy, setBusy] = useScopedState<string | null>(null)
  const lock = useRef(false)
  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    if (lock.current) return
    lock.current = true
    setBusy(key)
    try {
      await action()
    } catch (cause) {
      onError(String(cause))
    } finally {
      lock.current = false
      setBusy(null)
    }
  }
  return { busy, run }
}

/** A positive integer from a text field, or null when blank or invalid. */
export function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number.parseInt(trimmed, 10)
  return value > 0 ? value : null
}
