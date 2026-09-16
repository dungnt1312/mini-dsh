import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

const segmentStyles = cva('ui-segment flex-1 rounded-control px-2 py-1 text-sm', { variants: { active: { true: 'ui-segment-active bg-surface-raised text-ink shadow-sm', false: 'hover:bg-surface-muted' } }, defaultVariants: { active: false } })
export function Segmented<V extends string>({ value, options, onChange, label }: { readonly value: V | null; readonly options: readonly { readonly value: V; readonly label: ReactNode }[]; readonly onChange: (value: V) => void; readonly label: string }) {
  return <span className="ui-segmented inline-flex" role="group" aria-label={label}>{options.map((option) => <button key={option.value} type="button" className={cn(segmentStyles({ active: option.value === value }))} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>)}</span>
}
