import { cva } from 'class-variance-authority'
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

const frameStyles = cva('ui-field flex items-center', { variants: { invalid: { true: 'ui-field-invalid border-danger', false: '' } }, defaultVariants: { invalid: false } })
const inputStyles = cva('ui-input min-w-0 flex-1 bg-transparent', { variants: { mono: { true: 'ui-input-mono font-mono', false: '' } }, defaultVariants: { mono: false } })
export const TextInput = forwardRef<HTMLInputElement, { readonly leading?: ReactNode; readonly trailing?: ReactNode; readonly invalid?: boolean; readonly mono?: boolean; readonly className?: string } & InputHTMLAttributes<HTMLInputElement>>(function TextInput({ leading, trailing, invalid = false, mono = false, className, ...rest }, ref) {
  return <div className={cn(frameStyles({ invalid }), className)}>{leading !== undefined ? <span className="ui-field-leading">{leading}</span> : null}<input ref={ref} className={inputStyles({ mono })} spellCheck={false} aria-invalid={invalid || undefined} {...rest} />{trailing !== undefined ? <span className="ui-field-trailing">{trailing}</span> : null}</div>
})
