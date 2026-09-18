import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export function CodeChip({ children, title, className }: { readonly children: ReactNode; readonly title?: string; readonly className?: string }) {
  return <code className={cn('inline-block max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 align-middle font-mono text-xs text-fg-muted', className)} title={title}>{children}</code>
}
