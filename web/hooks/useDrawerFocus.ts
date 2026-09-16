import { useEffect, useRef, useState } from 'react'

/** Only overlay drawers own a focus boundary; subscribe across breakpoints. */
export function useDrawerFocus(open: boolean, media: string, onClose?: () => void) {
  const ref = useRef<HTMLElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [overlay, setOverlay] = useState(() => typeof window !== 'undefined' && window.matchMedia(media).matches)
  useEffect(() => {
    const query = window.matchMedia(media)
    const update = () => setOverlay(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [media])
  useEffect(() => {
    if (!open || !overlay) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = ref.current
    if (!panel) return
    const controls = () => [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((node) => node.tabIndex >= 0 && node.getClientRects().length > 0)
    controls()[0]?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[aria-modal="true"]') || (event.target as Element)?.closest?.('[data-select-popup]')) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current?.(); return }
      if (event.key !== 'Tab') return
      const elements = controls()
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus() }
  }, [open, overlay])
  return ref
}
