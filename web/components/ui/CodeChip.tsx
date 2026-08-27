import type { ReactNode } from 'react'

export function CodeChip({ children }: { readonly children: ReactNode }) {
  return <code className="ui-code">{children}</code>
}
