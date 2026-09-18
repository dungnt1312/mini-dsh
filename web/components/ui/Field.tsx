import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

/** Label + control + hint; the single child control receives id and aria-describedby. */
export function Field({ label, hint, tone = 'default', htmlFor, children }: {
  readonly label: string
  readonly hint?: ReactNode
  readonly tone?: 'default' | 'bad'
  readonly htmlFor?: string
  readonly children: ReactNode
}) {
  const generated = useId()
  const id = htmlFor ?? generated
  const hintId = `${id}-hint`
  const control = isValidElement(children) && children.type !== 'div'
    ? cloneElement(children as ReactElement<{ id?: string; 'aria-describedby'?: string }>, { id, ...(hint !== undefined ? { 'aria-describedby': hintId } : {}) })
    : children
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className="text-[13px] font-medium text-fg" htmlFor={id}>{label}</label>
      {control}
      {hint !== undefined ? <p id={hintId} className={cn('m-0 text-xs', tone === 'bad' ? 'text-bad' : 'text-fg-faint')}>{hint}</p> : null}
    </div>
  )
}
