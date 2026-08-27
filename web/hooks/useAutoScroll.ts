import { useEffect, useRef, useState } from 'react'

/**
 * Auto-scroll a list to its tail while the user stays near it; scrolling up
 * disables it and `shouldFollow` stays false until the user returns to the
 * bottom. Returns the sentinel ref plus a flag for the jump-back control.
 */
export function useAutoScroll(deps: readonly unknown[]) {
  const tail = useRef<HTMLDivElement | null>(null)
  const [follow, setFollow] = useState(true)

  useEffect(() => {
    if (follow) tail.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, follow])

  const onScroll = (element: HTMLElement): void => {
    setFollow(element.scrollHeight - element.scrollTop - element.clientHeight < 48)
  }

  return { tail, follow, onScroll, resume: () => setFollow(true) }
}
