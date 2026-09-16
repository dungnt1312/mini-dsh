// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { useResizablePanel, resizeValue } from './useResizablePanel.ts'

function Harness({ side, value = 300, onChange, onCommit }: { readonly side: 'left' | 'right'; readonly value?: number; readonly onChange: (value: number) => void; readonly onCommit: (value: number) => void }) {
  const { separatorProps } = useResizablePanel({ side, value, min: 232, max: 420, onChange, onCommit })
  return <div data-testid={side} {...separatorProps} />
}
function pointer(type: string, pointerId: number, clientX: number, button = 0) { return new PointerEvent(type, { bubbles: true, pointerId, clientX, button }) }
function mount(side: 'left' | 'right', value = 300) {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const onChange = vi.fn(), onCommit = vi.fn(), container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container); act(() => root.render(<Harness side={side} value={value} onChange={onChange} onCommit={onCommit} />))
  const separator = container.querySelector(`[data-testid="${side}"]`) as HTMLDivElement
  Object.defineProperty(separator, 'setPointerCapture', { value: vi.fn() })
  return { container, root, separator, onChange, onCommit }
}
describe('resizeValue', () => { it('uses opposite pointer directions for left and right panels', () => { expect(resizeValue('left', 300, 40)).toBe(340); expect(resizeValue('right', 300, 40)).toBe(260) }) })
describe('useResizablePanel', () => {
  it('updates on movement but commits only on pointer release or cancel', () => {
    const { separator, onChange, onCommit, root, container } = mount('left')
    act(() => separator.dispatchEvent(pointer('pointerdown', 1, 100))); act(() => separator.dispatchEvent(pointer('pointermove', 1, 140)))
    expect(onChange).toHaveBeenLastCalledWith(340); expect(onCommit).not.toHaveBeenCalled()
    act(() => separator.dispatchEvent(pointer('pointerup', 1, 140))); expect(onCommit).toHaveBeenLastCalledWith(340)
    act(() => separator.dispatchEvent(pointer('pointerdown', 2, 100))); act(() => separator.dispatchEvent(pointer('pointercancel', 2, 50))); expect(onCommit).toHaveBeenLastCalledWith(250)
    act(() => root.unmount()); container.remove()
  })
  it('uses keyboard increments, bounds, and double-click reset', () => {
    const { separator, onChange, onCommit, root, container } = mount('right')
    act(() => separator.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }))); expect(onChange).toHaveBeenLastCalledWith(292)
    act(() => separator.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft', shiftKey: true }))); expect(onChange).toHaveBeenLastCalledWith(332)
    act(() => separator.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }))); expect(onChange).toHaveBeenLastCalledWith(232)
    act(() => separator.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }))); expect(onChange).toHaveBeenLastCalledWith(420)
    act(() => separator.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); expect(onChange).toHaveBeenLastCalledWith(336); expect(onCommit).toHaveBeenLastCalledWith(336)
    act(() => root.unmount()); container.remove()
  })
  it('keeps prior selection state until overlapping drags finish and restores it on unmount', () => {
    document.documentElement.style.userSelect = 'text'
    const left = mount('left'), right = mount('right')
    act(() => left.separator.dispatchEvent(pointer('pointerdown', 1, 0))); act(() => right.separator.dispatchEvent(pointer('pointerdown', 2, 0)))
    expect(document.documentElement.style.userSelect).toBe('none')
    act(() => left.separator.dispatchEvent(pointer('pointerup', 1, 10))); expect(document.documentElement.style.userSelect).toBe('none')
    act(() => right.root.unmount()); expect(document.documentElement.style.userSelect).toBe('text')
    act(() => left.root.unmount()); left.container.remove(); right.container.remove()
  })
  it('ignores non-primary pointer starts', () => {
    const { separator, onChange, root, container } = mount('left')
    act(() => separator.dispatchEvent(pointer('pointerdown', 1, 0, 2))); act(() => separator.dispatchEvent(pointer('pointermove', 1, 100)))
    expect(onChange).not.toHaveBeenCalled(); act(() => root.unmount()); container.remove()
  })
})
