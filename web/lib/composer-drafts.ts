/**
 * Unsent composer drafts, kept per workspace+session so a reload (or a crash)
 * never costs typed work. Only the text is stored: `sending` and `error` belong
 * to the request that was in flight, and replaying them after a reload would
 * claim a state the server never confirmed.
 *
 * Storage is best-effort — every caller must work when it is unavailable.
 */

export const DRAFTS_STORAGE_KEY = 'mini-dsh.drafts.v1'
/** Newest drafts kept; older conversations drop out rather than grow forever. */
export const MAX_STORED_DRAFTS = 20
/** Per-draft ceiling; a pasted novel is truncated instead of blocking storage. */
export const MAX_DRAFT_CHARS = 20_000

/** Composer keys in write order, oldest first. */
export type StoredDrafts = Readonly<Record<string, string>>

export function parseDrafts(raw: string | null): StoredDrafts {
  if (raw === null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const drafts: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value !== '') drafts[key] = value.slice(0, MAX_DRAFT_CHARS)
    }
    return drafts
  } catch {
    return {}
  }
}

/** Drop empty drafts and keep only the newest {@link MAX_STORED_DRAFTS} keys. */
export function serializeDrafts(drafts: StoredDrafts): string {
  const kept = Object.entries(drafts)
    .filter(([, value]) => value.trim() !== '')
    .slice(-MAX_STORED_DRAFTS)
    .map(([key, value]) => [key, value.slice(0, MAX_DRAFT_CHARS)] as const)
  return JSON.stringify(Object.fromEntries(kept))
}

export function readDrafts(): StoredDrafts {
  try {
    return parseDrafts(window.localStorage.getItem(DRAFTS_STORAGE_KEY))
  } catch {
    return {}
  }
}

export function persistDrafts(drafts: StoredDrafts): void {
  try {
    window.localStorage.setItem(DRAFTS_STORAGE_KEY, serializeDrafts(drafts))
  } catch {
    // A full or blocked store must never break typing.
  }
}
