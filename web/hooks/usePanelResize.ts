import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from 'react'

const KEY_STEP = 16
const KEY_STEP_LARGE = 64

/**
 * Pointer + keyboard resizing for a panel docked on the right edge. Dragging
 * left widens it. Returns props for a `role="separator"` handle; the caller
 * owns clamping and persistence through `onChange`.
 */
export function usePanelResize({ width, min, max, defaultWidth, onChange }: {
  readonly width: number
  readonly min: number
  readonly max: number
  readonly defaultWidth: number
  readonly onChange: (width: number) => void
}) {
  const drag = useRef<{ readonly startX: number; readonly startWidth: number; readonly userSelect: string } | null>(null)
  const clamp = useCallback((value: number) => Math.min(max, Math.max(min, Math.round(value))), [min, max])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startX: event.clientX, startWidth: width, userSelect: document.body.style.userSelect }
    document.body.style.userSelect = 'none'
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag.current === null) return
    onChange(clamp(drag.current.startWidth + (drag.current.startX - event.clientX)))
  }
  const end = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag.current === null) return
    document.body.style.userSelect = drag.current.userSelect
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    const next = event.key === 'ArrowLeft' ? width + step
      : event.key === 'ArrowRight' ? width - step
        : event.key === 'Home' ? max
          : event.key === 'End' ? min
            : null
    if (next === null) return
    event.preventDefault()
    onChange(clamp(next))
  }

  return {
    role: 'separator' as const,
    tabIndex: 0,
    'aria-orientation': 'vertical' as const,
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuenow': width,
    onPointerDown,
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
    onKeyDown,
    onDoubleClick: () => onChange(defaultWidth),
  }
}
