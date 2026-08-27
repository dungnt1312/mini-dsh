import type { InputHTMLAttributes, ReactNode } from 'react'

export function TextInput({
  leading,
  trailing,
  className = '',
  ...rest
}: {
  readonly leading?: ReactNode
  readonly trailing?: ReactNode
  readonly className?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`ui-field ${className}`}>
      {leading !== undefined ? <span className="ui-field-leading">{leading}</span> : null}
      <input className="ui-input" spellCheck={false} {...rest} />
      {trailing !== undefined ? <span className="ui-field-trailing">{trailing}</span> : null}
    </div>
  )
}
