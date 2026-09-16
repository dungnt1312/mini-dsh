import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

const badgeStyles = cva('ui-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', {
  variants: {
    tone: {
      gray: 'ui-badge-gray bg-surface-muted text-ink-muted',
      blue: 'ui-badge-blue bg-accent-soft text-accent',
      green: 'ui-badge-green bg-success-soft text-success',
      amber: 'ui-badge-amber bg-warning-soft text-warning',
    },
  },
  defaultVariants: { tone: 'gray' },
})

export function Badge({ tone = 'gray', children }: { readonly tone?: 'gray' | 'blue' | 'green' | 'amber'; readonly children: ReactNode }) {
  return <span className={cn(badgeStyles({ tone }))}>{children}</span>
}
