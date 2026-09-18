import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export function Panel({ variant = 'flat', className, children }: {
  readonly variant?: 'flat' | 'raised'
  readonly className?: string
  readonly children?: ReactNode
}) {
  return <div className={cn('rounded-xl border border-line', variant === 'raised' ? 'bg-surface p-3' : 'p-3', className)}>{children}</div>
}
