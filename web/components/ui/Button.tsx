import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant =
  | 'primary'
  | 'ghost'
  | 'outline'
  | 'success'
  | 'danger'
  | 'outline-danger'

export function Button({
  variant = 'outline',
  size = 'md',
  className = '',
  children,
  ...rest
}: {
  readonly variant?: ButtonVariant
  readonly size?: 'sm' | 'md'
  readonly className?: string
  readonly children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`ui-btn ui-btn-${variant} ui-btn-${size} ${className}`} {...rest}>
      {children}
    </button>
  )
}
