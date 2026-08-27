import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import Icon from '../common/Icon.tsx'

export interface SelectOption {
  readonly value: string
  readonly label: string
}

/**
 * Accessible single-select dropdown: ↑↓ move, Enter picks, Esc closes and
 * refocuses the trigger, click-outside closes. The menu opens upward so it
 * clears composer/bottom-sheet placements. `triggerClassName` restyles the
 * default trigger in place; `renderTrigger` fully replaces it (the rendered
 * node owns opening via its own handlers — see EnvPanel usage).
 */
export function Select({
  value,
  options,
  onChange,
  disabled = false,
  label,
  triggerClassName = '',
  renderTrigger,
}: {
  readonly value: string
  readonly options: readonly SelectOption[]
  readonly onChange: (value: string) => void
  readonly disabled?: boolean
  readonly label?: string
  readonly triggerClassName?: string
  readonly renderTrigger?: (current: SelectOption | undefined, open: boolean) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)

  const currentIndex = options.findIndex((option) => option.value === value)
  const current = currentIndex >= 0 ? options[currentIndex] : undefined

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = (): void => {
    if (disabled) return
    setActive(currentIndex >= 0 ? currentIndex : null)
    setOpen((prev) => !prev)
  }

  const pick = (index: number): void => {
    const option = options[index]
    if (option === undefined) return
    onChange(option.value)
    setOpen(false)
    btnRef.current?.focus()
  }

  const onKeyDown = (event: ReactKeyboardEvent): void => {
    if (!open) {
      if (!disabled && (event.key === 'ArrowDown' || event.key === 'Enter')) toggle()
      return
    }
    if (event.key === 'Escape') {
      event.stopPropagation()
      setOpen(false)
      btnRef.current?.focus()
      return
    }
    if (options.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((prev) => (prev === null ? 0 : Math.min(prev + 1, options.length - 1)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((prev) => (prev === null ? options.length - 1 : Math.max(prev - 1, 0)))
    } else if (event.key === 'Home') {
      setActive(0)
    } else if (event.key === 'End') {
      setActive(options.length - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      pick(active ?? Math.max(currentIndex, 0))
    }
  }

  return (
    <div className="ui-select" ref={rootRef} onKeyDown={onKeyDown}>
      {renderTrigger !== undefined
        ? renderTrigger(current, open)
        : (
            <button
              type="button"
              ref={btnRef}
              className={`ui-select-trigger ${triggerClassName}`}
              disabled={disabled}
              aria-haspopup="listbox"
              aria-expanded={open}
              onClick={toggle}
            >
              <span className="ui-select-value">{current?.label ?? value}</span>
              <Icon name="chevron" size={12} className={`chevron ${open ? 'chevron-up' : ''}`} />
            </button>
          )}
      {open ? (
        <ul className="ui-menu up" role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`ui-option ${option.value === value ? 'ui-option-selected' : ''} ${
                  index === active ? 'ui-option-active' : ''
                }`}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(index)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
