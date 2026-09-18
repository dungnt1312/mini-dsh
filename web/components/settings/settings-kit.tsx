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

export function WorkspaceRequired() {
  return <Notice kind="info" text="Choose a workspace first." />
}

/** Titled block of a panel; `manage-section` is a stable hook for browser tests. */
export function Section({ title, count, actions, children, className }: {
  readonly title: ReactNode
  readonly count?: number
  readonly actions?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <section className={cn('manage-section flex min-w-0 flex-col gap-3', className)}>
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
}

/** Stack of panel sections with consistent spacing. */
export function PanelBody({ children }: { readonly children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-7">{children}</div>
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
