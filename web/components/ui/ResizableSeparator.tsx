import { type HTMLAttributes } from 'react'
import { cn } from '../../lib/cn.ts'

export function ResizableSeparator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('group relative z-10 w-3 shrink-0 cursor-col-resize touch-none outline-none', className)}
      {...props}
    >
      <div aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-border-strong group-focus-visible:bg-accent" />
    </div>
  )
}
