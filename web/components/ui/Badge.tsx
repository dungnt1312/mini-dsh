import type { ReactNode } from 'react'

export function Badge({
  tone = 'gray',
  children,
}: {
  readonly tone?: 'gray' | 'blue' | 'green' | 'amber'
  readonly children: ReactNode
}) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>
}
