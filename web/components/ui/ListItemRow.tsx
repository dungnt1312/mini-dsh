import type { ReactNode } from 'react'

export function ListItemRow({
  leading, content, meta, actions, expanded, onToggle,
}: {
  readonly leading?: ReactNode
  readonly content: ReactNode
  readonly meta?: ReactNode
  readonly actions?: ReactNode
  readonly expanded?: boolean
  readonly onToggle?: () => void
}) {
  const clickable = onToggle !== undefined
  return (
    <button type="button" className={`ui-list-row ${expanded === true ? 'ui-list-row-expanded' : ''} ${clickable ? 'ui-list-row-clickable' : ''}`} onClick={onToggle} aria-expanded={expanded}>
      {leading !== undefined ? <span className="ui-list-row-leading">{leading}</span> : null}
      <span className="ui-list-row-content">{content}</span>
      {meta !== undefined ? <span className="ui-list-row-meta">{meta}</span> : null}
      {actions !== undefined ? <span className="ui-list-row-actions">{actions}</span> : null}
    </button>
  )
}
