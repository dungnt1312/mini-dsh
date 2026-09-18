import { cn } from '../../lib/cn.ts'

export function Spinner({ className, size = 14 }: { readonly className?: string; readonly size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block shrink-0 rounded-full border-2 border-line-strong border-t-fg animate-spin-slow', className)}
      style={{ width: size, height: size }}
    />
  )
}
