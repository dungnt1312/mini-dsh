import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

/** Keyed scope boundaries reset state; generation invalidation drops late async feedback. */
export function useScopedState<T>(initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial)
  const generation = useRef(0)
  const alive = useRef(true)
  const token = generation.current
  useLayoutEffect(() => {
    alive.current = true
    generation.current = token
    return () => { alive.current = false; generation.current += 1 }
  }, [])
  return [value, next => { if (alive.current && generation.current === token) setValue(next) }]
}
