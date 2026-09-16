import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent, type PointerEvent } from 'react'
import { PANEL_LIMITS } from '../lib/workbench-preferences.ts'

let selectionGuardCount = 0
let selectionGuardPrevious = ''

function acquireSelectionGuard(): void {
  if (selectionGuardCount === 0) {
    selectionGuardPrevious = document.documentElement.style.userSelect
    document.documentElement.style.userSelect = 'none'
  }
  selectionGuardCount += 1
}

function releaseSelectionGuard(): void {
  if (selectionGuardCount === 0) return
  selectionGuardCount -= 1
  if (selectionGuardCount === 0) document.documentElement.style.userSelect = selectionGuardPrevious
}

export function resizeValue(side: 'left' | 'right', origin: number, deltaX: number): number { return side === 'left' ? origin + deltaX : origin - deltaX }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)) }

export function useResizablePanel(options: { readonly side: 'left' | 'right'; readonly value: number; readonly min: number; readonly max: number; readonly onChange: (value: number) => void; readonly onCommit: (value: number) => void }): { readonly separatorProps: HTMLAttributes<HTMLDivElement>; readonly dragging: boolean } {
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ pointerId: number; clientX: number; value: number } | null>(null)
  const update = useCallback((value: number, commit = false) => { const next = clamp(value, options.min, options.max); options.onChange(next); if (commit) options.onCommit(next) }, [options])
  const release = useCallback(() => { if (dragRef.current === null) return; dragRef.current = null; releaseSelectionGuard(); setDragging(false) }, [])
  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragRef.current !== null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, value: options.value }
    acquireSelectionGuard(); setDragging(true)
  }, [options.value])
  const finishDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    update(resizeValue(options.side, drag.value, event.clientX - drag.clientX), true); release()
  }, [options.side, release, update])
  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => { const drag = dragRef.current; if (drag !== null && drag.pointerId === event.pointerId) update(resizeValue(options.side, drag.value, event.clientX - drag.clientX)) }, [options.side, update])
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = event.key === 'Home' ? options.min : event.key === 'End' ? options.max : null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { const step = event.shiftKey ? 32 : 8; const delta = event.key === 'ArrowRight' ? step : -step; next = options.value + (options.side === 'left' ? delta : -delta) }
    if (next !== null) { event.preventDefault(); update(next, true) }
  }, [options.max, options.min, options.side, options.value, update])
  const onDoubleClick = useCallback(() => update(PANEL_LIMITS[options.side].default, true), [options.side, update])
  useEffect(() => release, [release])
  return { dragging, separatorProps: { role: 'separator', tabIndex: 0, 'aria-orientation': 'vertical', 'aria-valuemin': options.min, 'aria-valuemax': options.max, 'aria-valuenow': options.value, onPointerDown, onPointerMove, onPointerUp: finishDrag, onPointerCancel: finishDrag, onKeyDown, onDoubleClick } }
}
