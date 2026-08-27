/**
 * Track-and-knob toggle over a real checkbox: the input stays in the DOM for
 * keyboard and form semantics while CSS draws the track. `hint` explains the
 * consequence of flipping it.
 */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
  readonly label: string
  readonly hint?: string
  readonly disabled?: boolean
}) {
  return (
    <label className={`ui-switch ${disabled ? 'is-disabled' : ''}`}>
      <input
        type="checkbox"
        className="ui-switch-input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="ui-switch-track" aria-hidden="true"><span className="ui-switch-knob" /></span>
      <span className="ui-switch-text">
        <span className="ui-switch-label">{label}</span>
        {hint !== undefined ? <span className="ui-switch-hint">{hint}</span> : null}
      </span>
    </label>
  )
}
