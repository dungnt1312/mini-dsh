import * as RadixSwitch from '@radix-ui/react-switch'

/** Compatible controlled switch wrapper; its Radix root is the sole interactive control. */
export function Switch({ checked, onChange, label, hint, disabled = false }: { readonly checked: boolean; readonly onChange: (next: boolean) => void; readonly label: string; readonly hint?: string; readonly disabled?: boolean }) {
  return <label className={`ui-switch ${disabled ? 'is-disabled' : ''}`}>
    <RadixSwitch.Root className="ui-switch-input" checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label}>
      <span className="ui-switch-track" aria-hidden="true"><RadixSwitch.Thumb className="ui-switch-knob" /></span>
    </RadixSwitch.Root>
    <span className="ui-switch-text"><span className="ui-switch-label">{label}</span>{hint !== undefined ? <span className="ui-switch-hint">{hint}</span> : null}</span>
  </label>
}
