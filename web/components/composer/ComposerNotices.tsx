import Icon from '../common/Icon.tsx'
import { cn } from '../../lib/cn.ts'

export interface ComposerNotice {
  readonly key: string
  readonly text: string
  /** `bad` blocks sending and is announced as an alert. */
  readonly tone: 'info' | 'warn' | 'bad'
  /** Referenced by the input's aria-describedby. */
  readonly id?: string
  readonly action?: { readonly label: string; readonly onClick: () => void }
  readonly onDismiss?: () => void
}

const toneClass: Record<ComposerNotice['tone'], string> = {
  info: 'text-fg-muted',
  warn: 'text-warn',
  bad: 'text-bad',
}

const toneIcon: Record<ComposerNotice['tone'], 'info' | 'alertTriangle'> = {
  info: 'info',
  warn: 'alertTriangle',
  bad: 'alertTriangle',
}

/**
 * One notice strip at the top of the composer. Every message the composer
 * raises (missing provider, oversized paste, blocked send, undo, convert)
 * shares this layout instead of stacking ad-hoc rows.
 */
export function ComposerNotices({ notices }: { readonly notices: readonly ComposerNotice[] }) {
  if (notices.length === 0) return null
  return (
    <ul className="m-0 flex list-none flex-col gap-1 px-5 pt-3 text-[13px]">
      {notices.map((notice) => (
        <li
          key={notice.key}
          id={notice.id}
          role={notice.tone === 'bad' ? 'alert' : 'status'}
          className={cn('flex min-w-0 items-center gap-2', toneClass[notice.tone])}
        >
          <Icon name={toneIcon[notice.tone]} size={14} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{notice.text}</span>
          {notice.action !== undefined ? (
            <button type="button" className="shrink-0 font-medium text-link hover:underline" onClick={notice.action.onClick}>
              {notice.action.label}
            </button>
          ) : null}
          {notice.onDismiss !== undefined ? (
            <button
              type="button"
              aria-label="Dismiss"
              className="shrink-0 rounded p-0.5 text-fg-faint hover:text-fg"
              onClick={notice.onDismiss}
            >
              <Icon name="close" size={12} />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
