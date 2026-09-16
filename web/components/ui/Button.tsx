import { cva } from 'class-variance-authority'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'success' | 'danger' | 'outline-danger'

const buttonStyles = cva('ui-btn inline-flex items-center justify-center rounded-control font-medium transition-colors disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      primary: 'ui-btn-primary bg-accent text-accent-ink hover:bg-accent-hover',
      ghost: 'ui-btn-ghost hover:bg-surface-muted',
      outline: 'ui-btn-outline border border-border hover:bg-surface-muted',
      success: 'ui-btn-success bg-success text-white hover:brightness-95',
      danger: 'ui-btn-danger bg-danger text-white hover:brightness-95',
      'outline-danger': 'ui-btn-outline-danger border border-danger text-danger hover:bg-danger-soft',
    },
    size: { sm: 'ui-btn-sm min-h-8 px-2.5 text-xs', md: 'ui-btn-md min-h-9 px-3 text-sm' },
  },
  defaultVariants: { variant: 'outline', size: 'md' },
})

export function Button({ variant = 'outline', size = 'md', className, children, ...rest }: {
  readonly variant?: ButtonVariant
  readonly size?: 'sm' | 'md'
  readonly className?: string
  readonly children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn(buttonStyles({ variant, size }), className)} {...rest}>{children}</button>
}
