// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { Menu } from './Menu.tsx'
import { Modal } from './Modal.tsx'
import { Select } from './Select.tsx'

function mount(node: React.ReactNode) { const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); act(() => root.render(node)); return { host, root } }
function click(element: Element) { act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true }))) }
function key(element: Element, value: string) { act(() => element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: value }))) }
describe('Radix primitive interactions', () => {
  it('Modal portals, dismisses with Escape, calls callback, and restores opener focus', () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const dismiss = vi.fn(), opener = document.createElement('button'); document.body.append(opener); opener.focus()
    const { root, host } = mount(<Modal open onDismiss={dismiss} label="Dialog"><button>inside</button></Modal>)
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement; expect(dialog).toBeTruthy(); expect(host.contains(dialog)).toBe(false)
    key(dialog, 'Escape'); expect(dismiss).toHaveBeenCalledTimes(1); act(() => root.unmount()); expect(document.activeElement).toBe(opener); opener.remove(); host.remove()
  })
  it('Menu portals, closes after selection, and restores trigger focus after outside pointer dismissal', async () => {
    const chosen = vi.fn(); const outside = document.createElement('button'); document.body.append(outside)
    const { root, host } = mount(<Menu label="Actions" trigger={() => 'Open'}>{(close) => <button role="menuitem" onClick={() => { chosen(); close() }}>Choose</button>}</Menu>)
    const trigger = host.querySelector('button') as HTMLButtonElement; click(trigger); const item = document.querySelector('[role="menuitem"]') as HTMLElement; expect(item).toBeTruthy(); expect(host.contains(item)).toBe(false)
    click(item); expect(chosen).toHaveBeenCalledTimes(1); expect(document.querySelector('[role="menuitem"]')).toBeNull()
    click(trigger); await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) }); act(() => { outside.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true, composed: true })); outside.dispatchEvent(new Event('pointerup', { bubbles: true, cancelable: true, composed: true })) }); await act(async () => { await Promise.resolve() }); expect(document.querySelector('[role="menuitem"]')).toBeNull(); expect(document.activeElement).toBe(trigger)
    act(() => root.unmount()); outside.remove(); host.remove()
  })
  it('Select portals searchable results, filters, chooses by keyboard, and accepts a direct custom trigger', () => {
    const change = vi.fn(); const options = Array.from({ length: 9 }, (_, i) => ({ value: `model-${i}`, label: `Model ${i}` }))
    const { root, host } = mount(<Select value="model-0" options={options} onChange={change} label="Model" renderTrigger={() => <button type="button" className="custom-trigger">Custom</button>} />)
    const trigger = host.querySelector('.custom-trigger') as HTMLButtonElement; expect(trigger.parentElement?.tagName).not.toBe('SPAN'); click(trigger)
    const search = document.querySelector('.select-search') as HTMLInputElement; expect(search).toBeTruthy(); act(() => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter?.call(search, 'Model 4'); search.dispatchEvent(new Event('input', { bubbles: true })) })
    key(search, 'Enter'); expect(change).toHaveBeenCalledWith('model-4'); expect(document.querySelector('[role="listbox"]')).toBeNull(); act(() => root.unmount()); host.remove()
  })
})
