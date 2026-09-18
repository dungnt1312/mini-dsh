/**
 * The composer draft model: an ordered list of segments, because chips live
 * inline in the text rather than in a tray beside it. A plain typed message is
 * a single text segment, so the simple case stays simple.
 *
 * Two kinds of chip exist and they are not the same thing:
 * - a **mention** is a reference to a file in the conversation's project. It
 *   sends a path and nothing else; the agent reads the file itself, under the
 *   same permission gates as any other file access.
 * - an **attachment** is a file the user uploaded. Its bytes are already
 *   stored server-side and the message carries the reference.
 */

export interface AttachmentRef {
  readonly id: string
  readonly name: string
  readonly mediaType: string
  readonly bytes: number
}

export type DraftSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'mention'; readonly path: string }
  | { readonly kind: 'attachment'; readonly ref: AttachmentRef }

export interface RichDraft {
  readonly segments: readonly DraftSegment[]
}

export const emptyDraft: RichDraft = { segments: [] }

export function textDraft(text: string): RichDraft {
  return text === '' ? emptyDraft : { segments: [{ kind: 'text', text }] }
}

/** Merge neighbouring text and drop empty text, so equal drafts compare equal. */
export function normalizeDraft(segments: readonly DraftSegment[]): RichDraft {
  const merged: DraftSegment[] = []
  for (const segment of segments) {
    if (segment.kind !== 'text') { merged.push(segment); continue }
    if (segment.text === '') continue
    const previous = merged[merged.length - 1]
    if (previous !== undefined && previous.kind === 'text') {
      merged[merged.length - 1] = { kind: 'text', text: previous.text + segment.text }
      continue
    }
    merged.push(segment)
  }
  return { segments: merged }
}

/**
 * What the model reads. A mention becomes its path and an attachment its file
 * name, both in the position the user put them, so "compare A with B" still
 * reads that way once the chips are gone.
 */
export function draftText(draft: RichDraft): string {
  return draft.segments
    .map((segment) => (segment.kind === 'text' ? segment.text : segment.kind === 'mention' ? segment.path : segment.ref.name))
    .join('')
}

/** The uploaded files this draft sends alongside its text. */
export function draftAttachments(draft: RichDraft): readonly AttachmentRef[] {
  const refs: AttachmentRef[] = []
  for (const segment of draft.segments) {
    if (segment.kind === 'attachment' && !refs.some((existing) => existing.id === segment.ref.id)) refs.push(segment.ref)
  }
  return refs
}

/** An attachment alone is a message; only nothing at all is unsendable. */
export function draftIsEmpty(draft: RichDraft): boolean {
  return draftText(draft).trim() === '' && draftAttachments(draft).length === 0
}

/** Human-readable size for an attachment chip. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
