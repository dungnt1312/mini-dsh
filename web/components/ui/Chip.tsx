import { cva } from 'class-variance-authority'
import type { MouseEventHandler, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import Icon from '../common/Icon.tsx'

const chipStyles = cva('ui-chip inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs', {
  variants: { interactive: { true: 'ui-chip-btn cursor-pointer hover:bg-surface-muted', false: '' } },
  defaultVariants: { interactive: false },
})

export function Chip({ children, caret = false, interactive = false, onClick, title, expanded }: {
  readonly children: ReactNode
  readonly caret?: boolean
  readonly interactive?: boolean
  readonly onClick?: MouseEventHandler<HTMLElement>
  readonly title?: string
  readonly expanded?: boolean
}) {
  const body = <>{children}{caret ? <Icon name="chevron" size={11} className="ui-chip-caret chevron" /> : null}</>
  if (!interactive) return <span className={chipStyles({ interactive })} title={title}>{body}</span>
  return <button type="button" className={cn(chipStyles({ interactive }))} title={title} aria-expanded={expanded} onClick={onClick}>{body}</button>
}
