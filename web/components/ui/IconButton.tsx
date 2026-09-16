import { cva } from 'class-variance-authority'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

const iconButtonStyles = cva('ui-icon-btn inline-flex items-center justify-center rounded-control transition-colors disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      ghost: 'ui-icon-btn-ghost hover:bg-surface-muted',
      outline: 'ui-icon-btn-outline border border-border hover:bg-surface-muted',
      tinted: 'ui-icon-btn-tinted bg-accent-soft text-accent hover:bg-accent-soft/80',
      solid: 'ui-icon-btn-solid bg-accent text-accent-ink hover:bg-accent-hover',
    },
    size: { sm: 'ui-icon-btn-sm size-8', md: 'ui-icon-btn-md size-10' },
  },
  defaultVariants: { variant: 'ghost', size: 'sm' },
})

export function IconButton({ label, variant = 'ghost', size = 'sm', className, children, ...rest }: {
  readonly label: string
  readonly variant?: 'ghost' | 'outline' | 'tinted' | 'solid'
  readonly size?: 'sm' | 'md'
  readonly className?: string
  readonly children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" title={label} aria-label={label} className={cn(iconButtonStyles({ variant, size }), className)} {...rest}>{children}</button>
}
