import { cva } from 'class-variance-authority'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'success' | 'danger' | 'outline-danger'

const buttonStyles = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg hover:opacity-85',
        ghost: 'text-fg hover:bg-hover',
        outline: 'border border-line-strong text-fg hover:bg-hover',
        success: 'bg-primary text-primary-fg hover:opacity-85',
        danger: 'bg-bad text-bad-fg hover:opacity-90',
        'outline-danger': 'border border-line-strong text-bad hover:bg-bad-soft',
      },
      size: { sm: 'h-8 px-3 text-[13px]', md: 'h-9 px-4 text-sm' },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  },
)

export function Button({ variant = 'outline', size = 'md', className, children, ...rest }: {
  readonly variant?: ButtonVariant
  readonly size?: 'sm' | 'md'
  readonly className?: string
  readonly children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn(buttonStyles({ variant, size }), className)} {...rest}>{children}</button>
}
