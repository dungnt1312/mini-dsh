import type { ReactNode } from 'react'

export function Panel({
  variant = 'flat',
  className = '',
  children,
}: {
  readonly variant?: 'flat' | 'raised'
  readonly className?: string
  readonly children?: ReactNode
}) {
  return <div className={`ui-panel ui-panel-${variant} ${className}`}>{children}</div>
}
