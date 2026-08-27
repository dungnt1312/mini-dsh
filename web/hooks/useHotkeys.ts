import { useEffect } from 'react'

/** A keydown binding: `mod` means Ctrl (or Cmd on mac). */
interface Hotkey {
  readonly key: string
  readonly mod?: boolean
  readonly onPress: () => void
}

/** A small global hotkey registry; `onPress` runs when the target is the body. */
export function useHotkeys(keys: readonly Hotkey[]): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement && event.target.type === 'text') return
      if (event.target instanceof HTMLTextAreaElement) return
      if (event.target instanceof HTMLSelectElement) return
      for (const candidate of keys) {
        const modMatches = candidate.mod === true
          ? (event.ctrlKey || event.metaKey)
          : !event.ctrlKey && !event.metaKey
        if (modMatches && event.key === candidate.key) {
          event.preventDefault()
          candidate.onPress()
          return
        }
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [keys])
}
