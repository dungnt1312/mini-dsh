import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Distance from the bottom (px) that still counts as "following the tail". */
const PIN_THRESHOLD = 80

/**
 * Keeps a scroll container glued to its bottom while the reader is at the tail.
 * Content growth (streaming chunks, expanded rows, late markdown layout) is
 * observed with a ResizeObserver instead of per-render effects, so a freshly
 * opened long conversation lands at the latest message and scrolling up is
 * never fought. `resetKey` (the conversation id) re-pins on navigation.
 */
export function useStickToBottom(resetKey: unknown) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const pinned = useRef(true)
  const [atBottom, setAtBottom] = useState(true)

  const jump = useCallback((behavior: ScrollBehavior) => {
    const element = scrollRef.current
    if (element === null) return
    element.scrollTo({ top: element.scrollHeight, behavior })
  }, [])

  useLayoutEffect(() => {
    pinned.current = true
    setAtBottom(true)
    jump('auto')
  }, [resetKey, jump])

  useEffect(() => {
    const content = contentRef.current
    if (content === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => { if (pinned.current) jump('auto') })
    observer.observe(content)
    return () => observer.disconnect()
  }, [jump])

  const onScroll = useCallback(() => {
    const element = scrollRef.current
    if (element === null) return
    const near = element.scrollHeight - element.scrollTop - element.clientHeight < PIN_THRESHOLD
    pinned.current = near
    setAtBottom(near)
  }, [])

  const scrollToBottom = useCallback(() => {
    pinned.current = true
    setAtBottom(true)
    jump('smooth')
  }, [jump])

  return { scrollRef, contentRef, atBottom, onScroll, scrollToBottom }
}
