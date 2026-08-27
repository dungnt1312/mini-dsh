import type { ReactNode } from 'react'

export function Kbd({ children }: { readonly children: ReactNode }) {
  return <kbd className="ui-kbd">{children}</kbd>
}
