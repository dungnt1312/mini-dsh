import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export const TextInput = forwardRef<HTMLInputElement, {
  readonly leading?: ReactNode
  readonly trailing?: ReactNode
  readonly invalid?: boolean
  readonly mono?: boolean
  readonly className?: string
} & InputHTMLAttributes<HTMLInputElement>>(function TextInput({ leading, trailing, invalid = false, mono = false, className, ...rest }, ref) {
  return (
    <div
      className={cn(
        'flex h-9 min-w-0 items-center gap-2 rounded-lg border bg-surface px-3 text-sm transition-colors focus-within:border-fg-faint',
        invalid ? 'border-bad' : 'border-line',
        className,
      )}
    >
      {leading !== undefined ? <span className="flex shrink-0 text-fg-faint">{leading}</span> : null}
      <input
        ref={ref}
        className={cn('h-full min-w-0 flex-1 bg-transparent outline-none disabled:opacity-50', mono && 'font-mono text-[13px]')}
        spellCheck={false}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {trailing !== undefined ? <span className="-mr-2 flex shrink-0">{trailing}</span> : null}
    </div>
  )
})
