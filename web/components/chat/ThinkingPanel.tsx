import { useState } from 'react'
import Icon from '../common/Icon.tsx'
import { Spinner } from '../common/Spinner.tsx'

/**
 * The model's reasoning trace: thinking deltas stream in live with the
 * spinner; once the answer starts or the turn ends, the panel collapses
 * to a summary chip that expands on click (`userPreference` overrides the
 * auto state).
 */
export function ThinkingPanel({ thinking, live }: { readonly thinking: readonly string[]; readonly live: boolean }) {
  const [userPreference, setUserPreference] = useState<boolean | null>(null)
  const content = thinking.join('')
  const open = userPreference ?? live

  if (content === '' && !live) return null

  return (
    <div className={`thinking ${open ? 'thinking-open' : 'thinking-closed'}`}>
      <button
        type="button"
        className="thinking-head"
        onClick={() => setUserPreference(!open)}
        aria-expanded={open}
      >
        <Icon name="chevron" size={13} className={`chevron ${open ? 'chevron-up' : ''}`} />
        <span className="thinking-label">{live ? 'Đang suy nghĩ…' : 'Suy nghĩ'}</span>
        {live ? <Spinner className="thinking-spinner" /> : null}
        {!live && content !== '' ? (
          <span className="thinking-preview">{content.replace(/\s+/g, ' ').slice(0, 80)}</span>
        ) : null}
      </button>
      {open ? <div className="thinking-body">{content}</div> : null}
    </div>
  )
}
