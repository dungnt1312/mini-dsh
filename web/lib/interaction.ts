/** Monotonic tokens reject stale completions, including A → B → A navigation. */
export class Generation {
  private value = 0
  next() { return ++this.value }
  current() { return this.value }
  matches(token: number) { return token === this.value }
}

export const composerKey = (workspace: string | null, session: string | null) => JSON.stringify([workspace, session])
export interface ComposerState { draft: string; revision: number; sending: boolean; error: string | null }
export const emptyComposer: ComposerState = { draft: '', revision: 0, sending: false, error: null }
export function acceptedDraft(state: ComposerState, revision: number): ComposerState {
  return { ...state, draft: state.revision === revision ? '' : state.draft, sending: false }
}

/** A draft scope is valid when it is chat-only (null) or a registered project. */
export function validConversationScope(value: string | null, projectIds: readonly string[]): boolean {
  return value === null || projectIds.includes(value)
}

export function tabDestination(key: string, index: number, count: number): number | null {
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowRight') return (index + 1) % count
  if (key === 'ArrowLeft') return (index + count - 1) % count
  return null
}

export function popupPosition(rect: { left: number; top: number; bottom: number; width: number }, width: number, height: number) {
  const gap = 6, margin = 8
  const popupWidth = Math.max(0, Math.min(Math.max(rect.width, 280), width - margin * 2))
  const below = Math.max(0, height - rect.bottom - gap - margin)
  const above = Math.max(0, rect.top - gap - margin)
  const up = below < 240 && above > below
  return {
    left: Math.max(margin, Math.min(rect.left, width - popupWidth - margin)),
    width: popupWidth,
    maxHeight: Math.min(360, up ? above : below),
    ...(up ? { bottom: Math.max(margin, height - rect.top + gap) } : { top: Math.max(margin, rect.bottom + gap) }),
  }
}
