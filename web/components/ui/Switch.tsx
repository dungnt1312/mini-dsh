import * as RadixSwitch from '@radix-ui/react-switch'
import { cn } from '../../lib/cn.ts'

/** Controlled switch; the Radix root is the sole interactive control. */
export function Switch({ checked, onChange, label, hint, disabled = false }: {
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
  readonly label: string
  readonly hint?: string
  readonly disabled?: boolean
}) {
  return (
    <label className={cn('flex items-start justify-between gap-4', disabled && 'opacity-50')}>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm text-fg">{label}</span>
        {hint !== undefined ? <span className="text-xs text-fg-faint">{hint}</span> : null}
      </span>
      <RadixSwitch.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={label}
        className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-line-strong transition-colors data-[state=checked]:bg-primary"
      >
        <RadixSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-bg shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </RadixSwitch.Root>
    </label>
  )
}
