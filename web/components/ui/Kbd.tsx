import type { ReactNode } from 'react'

export function Kbd({ children }: { readonly children: ReactNode }) {
  return <kbd className="rounded border border-line px-1 font-mono text-[10px] leading-4 text-fg-faint">{children}</kbd>
}
