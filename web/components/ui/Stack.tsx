import type { ReactNode } from 'react'

export function Stack({ gap = 'space-3', children }: { readonly gap?: string; readonly children: ReactNode }) {
  return <div className={`ui-stack ui-stack-gap-${gap}`}>{children}</div>
}
