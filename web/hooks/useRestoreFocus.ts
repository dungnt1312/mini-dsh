import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Remembers the element focused when a controlled dialog opens and returns
 * focus there on close. Radix only restores to its own Trigger, and these
 * dialogs are opened from ordinary buttons elsewhere in the shell.
 */
export function useRestoreFocus(open: boolean): (event: Event) => void {
  const opener = useRef<HTMLElement | null>(null)

  // Layout phase: capture before the dialog's focus scope moves focus inside.
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) opener.current = document.activeElement
  }, [open])

  // Passive cleanup runs after the dialog's nodes are detached, so its focus
  // trap can no longer pull focus back. Covers unmounts without a Radix close.
  useEffect(() => {
    if (!open) return
    return () => {
      const target = opener.current
      if (target !== null && target.isConnected) target.focus()
    }
  }, [open])

  return useCallback((event: Event) => {
    const target = opener.current
    if (target === null || !target.isConnected) return
    event.preventDefault()
    target.focus()
  }, [])
}
