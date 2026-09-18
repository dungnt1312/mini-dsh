import { useId, useState } from 'react'
import Icon from '../common/Icon.tsx'
import { cn } from '../../lib/cn.ts'

/**
 * The model's reasoning trace: open while thinking streams, collapsed to a
 * one-line disclosure once the answer starts (a user toggle wins).
 */
export function ThinkingPanel({ thinking, live }: { readonly thinking: readonly string[]; readonly live: boolean }) {
  const [userPreference, setUserPreference] = useState<boolean | null>(null)
  const bodyId = useId()
  const content = thinking.join('')
  const open = userPreference ?? live

  if (content === '' && !live) return null

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setUserPreference(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="-mx-2 flex min-h-8 items-center gap-1.5 self-start rounded-lg px-2 text-sm text-fg-muted hover:text-fg"
      >
        <span className={cn(live && 'text-shimmer')}>{live ? 'Thinking…' : 'Thought process'}</span>
        <Icon name="chevronRight" size={14} className={cn('transition-transform', open && 'rotate-90')} />
      </button>
      {open ? (
        <div
          id={bodyId}
          role="region"
          aria-label="Thinking"
          aria-live={live ? 'polite' : undefined}
          aria-atomic={live ? 'false' : undefined}
          className="mb-2 ml-1 max-h-72 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-line pl-4 text-[13px] leading-relaxed text-fg-muted"
        >
          {content}
        </div>
      ) : null}
    </div>
  )
}
