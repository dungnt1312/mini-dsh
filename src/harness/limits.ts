/**
 * Centralized bounded-execution defaults. Every limit the harness enforces
 * lives here so operators (and tests) override one shape; nothing scatters
 * magic numbers through the loop.
 */
export interface HarnessLimits {
  /** @deprecated Ignored. Turns no longer have a model-step budget. */
  readonly maxSteps?: number
  /** @deprecated Ignored. Turns no longer have a wall-clock deadline. */
  readonly turnDeadlineMs?: number
  /** Kill a provider stream that stays silent this long (inactivity). */
  readonly streamInactivityMs: number
  /** Default wall-clock kill for one bash command. */
  readonly toolTimeoutMs: number
  /** Undecided approval requests expire (never approve implicitly). */
  readonly approvalExpiryMs: number
  /** Model-visible cap for one tool result. */
  readonly toolOutputLimit: number
  /** Bound on durably queued pending inputs per session. */
  readonly maxPendingInputs: number
  /** Projected log size (chars) that triggers automatic compaction at a completed boundary; 0 disables. */
  readonly automaticCompactionChars: number
  /** Largest single composer attachment accepted for storage. */
  readonly maxAttachmentBytes: number
  /** Attachments one message may carry. */
  readonly maxAttachmentsPerMessage: number
  /** Model-visible cap for one inlined text attachment. */
  readonly attachmentTextLimit: number
}

export const DEFAULT_LIMITS: HarnessLimits = {
  streamInactivityMs: 120_000,
  toolTimeoutMs: 30_000,
  approvalExpiryMs: 5 * 60_000,
  toolOutputLimit: 60_000,
  maxPendingInputs: 100,
  automaticCompactionChars: 0,
  maxAttachmentBytes: 10 * 1024 * 1024,
  maxAttachmentsPerMessage: 10,
  attachmentTextLimit: 60_000,
}

/** Merge a partial override over the defaults; non-positive values are ignored. */
export function resolveLimits(partial?: Partial<HarnessLimits>): HarnessLimits {
  if (partial === undefined) return DEFAULT_LIMITS
  const merged = { ...DEFAULT_LIMITS }
  for (const key of Object.keys(merged) as (keyof HarnessLimits)[]) {
    const value = partial[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      merged[key] = value
    }
  }
  return merged
}
