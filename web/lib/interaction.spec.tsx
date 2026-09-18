import { describe, expect, it } from 'vitest'
import { Generation, composerKey, emptyComposer, acceptedDraft, popupPosition, tabDestination } from './interaction.ts'
import { emptyDraft, textDraft } from './composer-draft.ts'

describe('navigation completion guards', () => {
  it('rejects a delayed create/delete after A → B → A', async () => {
    const navigation = new Generation()
    const started = navigation.next()
    let resolve!: () => void
    const pending = new Promise<void>((done) => { resolve = done })
    let current = 'original'
    const completion = pending.then(() => { if (navigation.matches(started)) current = 'created' })
    navigation.next(); navigation.next()
    resolve(); await completion
    expect(current).toBe('original')
  })
  it('rejects an older list/model refresh finishing last', () => {
    const requests = new Generation()
    const older = requests.next(), newer = requests.next()
    expect(requests.matches(newer)).toBe(true)
    expect(requests.matches(older)).toBe(false)
  })
})
describe('scoped send state', () => {
  it('acceptance cannot clear identical text in another workspace/session', () => {
    const a = composerKey('a', 's'), b = composerKey('b', 's'), c = composerKey('a', 'other')
    const state = { ...emptyComposer, draft: textDraft('same'), revision: 1 }
    const drafts = { [a]: state, [b]: state, [c]: state }
    drafts[a] = acceptedDraft(drafts[a]!, 1)
    expect(drafts[a]?.draft).toEqual(emptyDraft)
    expect(drafts[b]?.draft).toEqual(textDraft('same'))
    expect(drafts[c]?.draft).toEqual(textDraft('same'))
  })
  it('retains a changed draft even if text returns to the submitted value', () => {
    expect(acceptedDraft({ ...emptyComposer, draft: textDraft('same'), revision: 3 }, 1).draft).toEqual(textDraft('same'))
  })
  it('keys cannot collide on delimiter-containing IDs', () => {
    expect(composerKey('a:b', 'c')).not.toBe(composerKey('a', 'b:c'))
  })
})
describe('popup viewport placement', () => {
  it('flips above a bottom trigger and clamps the right edge', () => {
    const result = popupPosition({ left: 980, top: 650, bottom: 680, width: 80 }, 1024, 700)
    expect(result).toMatchObject({ left: 736, width: 280, bottom: 56, maxHeight: 360 })
    expect(result).not.toHaveProperty('top')
  })
  it('fits narrow viewports and opens below a top trigger', () => {
    const result = popupPosition({ left: 0, top: 10, bottom: 40, width: 300 }, 240, 500)
    expect(result).toMatchObject({ left: 8, width: 224, top: 46 })
  })
})
describe('settings roving tabs', () => {
  it('wraps arrows and handles Home/End without trapping Tab', () => {
    expect(tabDestination('ArrowLeft', 0, 5)).toBe(4)
    expect(tabDestination('ArrowRight', 4, 5)).toBe(0)
    expect(tabDestination('Home', 3, 5)).toBe(0)
    expect(tabDestination('End', 1, 5)).toBe(4)
    expect(tabDestination('Tab', 1, 5)).toBeNull()
  })
})
