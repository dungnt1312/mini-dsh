import type { ReactNode } from 'react'

export function Toolbar({ children, spacer = true }: { readonly children: ReactNode; readonly spacer?: boolean }) {
  return (
    <div className="ui-toolbar">
      <div className="ui-toolbar-cluster">{children}</div>
      {spacer ? <span className="ui-toolbar-spacer" /> : null}
    </div>
  )
}
