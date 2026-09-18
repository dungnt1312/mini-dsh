import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export function Segmented<V extends string>({ value, options, onChange, label }: {
  readonly value: V | null
  readonly options: readonly { readonly value: V; readonly label: ReactNode }[]
  readonly onChange: (value: V) => void
  readonly label: string
}) {
  return (
    <span className="inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs text-fg-muted transition-colors hover:text-fg',
            option.value === value && 'bg-surface text-fg shadow-sm dark:bg-hover',
          )}
        >
          {option.label}
        </button>
      ))}
    </span>
  )
}
