import type { ReactNode } from 'react'

export function SectionHeader({ label, action }: { readonly label: string; readonly action?: ReactNode }) {
  return (
    <div className="ui-section-header">
      <span className="ui-section-label">{label}</span>
      {action !== undefined ? <span className="ui-section-action">{action}</span> : null}
    </div>
  )
}
