import { cva } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

const iconButtonStyles = cva(
  'inline-flex shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        ghost: 'hover:bg-hover',
        outline: 'border border-line hover:bg-hover',
        tinted: 'bg-muted text-fg hover:bg-hover',
        solid: 'bg-primary text-primary-fg hover:text-primary-fg hover:opacity-85',
      },
      size: { sm: 'size-8', md: 'size-9' },
    },
    defaultVariants: { variant: 'ghost', size: 'sm' },
  },
)

export const IconButton = forwardRef<HTMLButtonElement, {
  readonly label: string
  readonly variant?: 'ghost' | 'outline' | 'tinted' | 'solid'
  readonly size?: 'sm' | 'md'
  readonly className?: string
  readonly children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>>(function IconButton({ label, variant = 'ghost', size = 'sm', className, children, ...rest }, ref) {
  return <button ref={ref} type="button" title={label} aria-label={label} className={cn(iconButtonStyles({ variant, size }), className)} {...rest}>{children}</button>
})
