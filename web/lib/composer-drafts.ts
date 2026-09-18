/**
 * Unsent composer drafts, kept per workspace+session so a reload (or a crash)
 * never costs typed work. Only the draft content is stored: `sending` and
 * `error` belong to the request that was in flight, and replaying them after a
 * reload would claim a state the server never confirmed.
 *
 * Drafts now carry chips, so the stored shape is the segment list. Drafts
 * written by the earlier string-only version are read as a single text
 * segment rather than discarded.
 *
 * Storage is best-effort — every caller must work when it is unavailable.
 */
import { emptyDraft, normalizeDraft, textDraft, type DraftSegment, type RichDraft } from './composer-draft.ts'

export const DRAFTS_STORAGE_KEY = 'mini-dsh.drafts.v1'
/** Newest drafts kept; older conversations drop out rather than grow forever. */
export const MAX_STORED_DRAFTS = 20
/** Per-draft text ceiling; a pasted novel is truncated instead of blocking storage. */
export const MAX_DRAFT_CHARS = 20_000

export type StoredDrafts = Readonly<Record<string, RichDraft>>

function parseSegment(raw: unknown): DraftSegment | null {
  if (raw === null || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row['kind'] === 'text' && typeof row['text'] === 'string') {
    return { kind: 'text', text: row['text'].slice(0, MAX_DRAFT_CHARS) }
  }
  if (row['kind'] === 'mention' && typeof row['path'] === 'string' && row['path'] !== '') {
    return { kind: 'mention', path: row['path'] }
  }
  if (row['kind'] === 'attachment' && row['ref'] !== null && typeof row['ref'] === 'object') {
    const ref = row['ref'] as Record<string, unknown>
    if (
      typeof ref['id'] === 'string' && /^[0-9a-f]{64}$/.test(ref['id']) &&
      typeof ref['name'] === 'string' && typeof ref['mediaType'] === 'string' && typeof ref['bytes'] === 'number'
    ) {
      return { kind: 'attachment', ref: { id: ref['id'], name: ref['name'], mediaType: ref['mediaType'], bytes: ref['bytes'] } }
    }
  }
  return null
}

function parseDraft(raw: unknown): RichDraft {
  // A draft written before chips existed was a bare string.
  if (typeof raw === 'string') return textDraft(raw.slice(0, MAX_DRAFT_CHARS))
  if (raw === null || typeof raw !== 'object') return emptyDraft
  const segments = (raw as Record<string, unknown>)['segments']
  if (!Array.isArray(segments)) return emptyDraft
  const parsed: DraftSegment[] = []
  for (const entry of segments as unknown[]) {
    const segment = parseSegment(entry)
    if (segment !== null) parsed.push(segment)
  }
  return normalizeDraft(parsed)
}

export function parseDrafts(raw: string | null): StoredDrafts {
  if (raw === null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const drafts: Record<string, RichDraft> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const draft = parseDraft(value)
      if (draft.segments.length > 0) drafts[key] = draft
    }
    return drafts
  } catch {
    return {}
  }
}

/** Drop empty drafts and keep only the newest {@link MAX_STORED_DRAFTS} keys. */
export function serializeDrafts(drafts: StoredDrafts): string {
  const kept = Object.entries(drafts)
    .map(([key, draft]) => [key, normalizeDraft(draft.segments)] as const)
    .filter(([, draft]) => draft.segments.length > 0)
    .slice(-MAX_STORED_DRAFTS)
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
