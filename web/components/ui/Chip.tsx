import type { MouseEventHandler, ReactNode } from 'react'
import Icon from '../common/Icon.tsx'

export function Chip({
  children,
  caret = false,
  interactive = false,
  onClick,
  title,
}: {
  readonly children: ReactNode
  readonly caret?: boolean
  readonly interactive?: boolean
  readonly onClick?: MouseEventHandler<HTMLElement>
  readonly title?: string
}) {
  const body = (
    <>
      {children}
      {caret ? <Icon name="chevron" size={11} className="ui-chip-caret chevron" /> : null}
    </>
  )
  if (!interactive) {
    return <span className="ui-chip" title={title}>{body}</span>
  }
  return (
    <button type="button" className="ui-chip ui-chip-btn" title={title} onClick={onClick}>
      {body}
    </button>
  )
}
