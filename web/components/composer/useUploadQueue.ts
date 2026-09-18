import { useCallback, useEffect, useRef, useState } from 'react'
import type { AttachmentRef } from '../../lib/composer-draft.ts'

export type UploadOutcome =
  | { readonly ok: true; readonly refs: readonly AttachmentRef[] }
  | { readonly ok: false }

interface Slot {
  outcome?: UploadOutcome
  readonly settle: (outcome: UploadOutcome) => void
}

/**
 * Runs uploads concurrently but settles them in the order they started, so
 * attachments land in the tray in the order the user added them even when a
 * later upload finishes first.
 *
 * `reset` drops every in-flight upload: their completions are ignored. The
 * composer calls it when the draft is replaced from outside (sent, switched
 * conversation), and unmounting does the same.
 */
export function useUploadQueue(): {
  readonly pending: number
  readonly enqueue: (upload: Promise<readonly AttachmentRef[]>, settle: (outcome: UploadOutcome) => void) => void
  readonly reset: () => void
} {
  const queue = useRef<Slot[]>([])
  const [pending, setPending] = useState(0)

  useEffect(() => () => { queue.current = [] }, [])

  const drain = useCallback((): void => {
    while (queue.current[0]?.outcome !== undefined) {
      const slot = queue.current.shift() as Slot
      slot.settle(slot.outcome as UploadOutcome)
    }
    setPending(queue.current.length)
  }, [])

  const enqueue = useCallback((upload: Promise<readonly AttachmentRef[]>, settle: (outcome: UploadOutcome) => void): void => {
    const slot: Slot = { settle }
    queue.current.push(slot)
    setPending(queue.current.length)
    void upload
      .then((refs): UploadOutcome => ({ ok: true, refs }), (): UploadOutcome => ({ ok: false }))
      .then((outcome) => {
        // Reset or unmounted since this upload started: nothing to settle.
        if (!queue.current.includes(slot)) return
        slot.outcome = outcome
        drain()
      })
  }, [drain])

  const reset = useCallback((): void => {
    queue.current = []
    setPending(0)
  }, [])

  return { pending, enqueue, reset }
}
