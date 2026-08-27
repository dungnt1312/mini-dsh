import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function IconButton({
  label,
  variant = 'ghost',
  size = 'sm',
  className = '',
  children,
  ...rest
}: {
  /** Required: announced by screen readers, shown as tooltip. */
  readonly label: string
  readonly variant?: 'ghost' | 'outline' | 'tinted' | 'solid'
  readonly size?: 'sm' | 'md'
  readonly className?: string
  readonly children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`ui-icon-btn ui-icon-btn-${size} ui-icon-btn-${variant} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
