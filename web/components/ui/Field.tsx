import type { ReactNode } from 'react'

/**
 * Labelled form row: label on top, control below, one hint line underneath.
 * `tone="bad"` turns the hint into an error line so callers pass validation
 * text through the same slot instead of appending their own markup.
 */
export function Field({
  label,
  hint,
  tone = 'default',
  htmlFor,
  children,
}: {
  readonly label: string
  readonly hint?: ReactNode
  readonly tone?: 'default' | 'bad'
  readonly htmlFor?: string
  readonly children: ReactNode
}) {
  return (
    <div className="ui-field-row">
      <label className="ui-field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint !== undefined ? <p className={`ui-field-hint ui-field-hint-${tone}`}>{hint}</p> : null}
    </div>
  )
}
