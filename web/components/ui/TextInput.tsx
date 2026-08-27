import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

/**
 * A single-line input wrapped in the shared field frame. `leading`/`trailing`
 * host icons or affordances (reveal buttons, units); `invalid` paints the
 * frame with the error border so validation reads without extra markup.
 */
export const TextInput = forwardRef<
  HTMLInputElement,
  {
    readonly leading?: ReactNode
    readonly trailing?: ReactNode
    readonly invalid?: boolean
    readonly mono?: boolean
    readonly className?: string
  } & InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ leading, trailing, invalid = false, mono = false, className = '', ...rest }, ref) {
  return (
    <div className={`ui-field ${invalid ? 'ui-field-invalid' : ''} ${className}`}>
      {leading !== undefined ? <span className="ui-field-leading">{leading}</span> : null}
      <input
        ref={ref}
        className={`ui-input ${mono ? 'ui-input-mono' : ''}`}
        spellCheck={false}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {trailing !== undefined ? <span className="ui-field-trailing">{trailing}</span> : null}
    </div>
  )
})
