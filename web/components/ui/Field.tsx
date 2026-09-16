import { cva } from 'class-variance-authority'
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

const fieldStyles = cva('ui-field-row flex flex-col gap-1.5', { variants: { tone: { default: '', bad: 'ui-field-row-bad' } }, defaultVariants: { tone: 'default' } })
const hintStyles = cva('ui-field-hint text-xs', { variants: { tone: { default: 'ui-field-hint-default text-ink-muted', bad: 'ui-field-hint-bad text-danger' } }, defaultVariants: { tone: 'default' } })
export function Field({ label, hint, tone = 'default', htmlFor, children }: { readonly label: string; readonly hint?: ReactNode; readonly tone?: 'default' | 'bad'; readonly htmlFor?: string; readonly children: ReactNode }) {
  const generated = useId(), id = htmlFor ?? generated, hintId = `${id}-hint`
  const control = isValidElement(children) && children.type !== 'div' ? cloneElement(children as ReactElement<{ id?: string; 'aria-describedby'?: string }>, { id, ...(hint !== undefined ? { 'aria-describedby': hintId } : {}) }) : children
  return <div className={cn(fieldStyles({ tone }))}><label className="ui-field-label" htmlFor={id}>{label}</label>{control}{hint !== undefined ? <p id={hintId} className={hintStyles({ tone })}>{hint}</p> : null}</div>
}
