import { describe, expect, it } from 'vitest'
import { latestWorkbenchItem } from './workbench-projector.ts'
import type { ViewItem } from '../../lib/project.ts'

function tool(id: string, options: Partial<Extract<ViewItem, { kind: 'tool' }>> = {}): Extract<ViewItem, { kind: 'tool' }> {
  return { kind: 'tool', call: { id, name: 'Bash', args: {} }, ...options }
}

function delegation(id: string, status: Extract<ViewItem, { kind: 'delegation' }>['status']): Extract<ViewItem, { kind: 'delegation' }> {
  return { kind: 'delegation', childSessionId: id, definition: 'worker', objective: 'Do work', status }
}

const completedTool = (id: string) => tool(id, { result: { ok: true, output: 'done' } })
const failedTool = (id: string) => tool(id, { result: { ok: false, output: 'failed' } })
const recoveredTool = (id: string) => tool(id, { result: { ok: true, output: 'unknown' }, recovered: true })

describe('latestWorkbenchItem', () => {
  it('returns null when there is no tool or delegation', () => {
    expect(latestWorkbenchItem([{ kind: 'user', content: 'Hello' }])).toBeNull()
  })

  it.each([
    ['running delegation outranks newer settled tool', [delegation('running', 'running'), failedTool('failed')], 'running'],
    ['newest running work wins across tool and delegation', [tool('running-tool'), delegation('running-delegation', 'running'), completedTool('completed')], 'running-delegation'],
    ['newest attention item wins across tool and delegation', [failedTool('failed-tool'), delegation('interrupted', 'interrupted'), recoveredTool('recovered')], 'recovered'],
    ['failed delegation is attention work', [completedTool('completed'), delegation('failed-delegation', 'failed')], 'failed-delegation'],
    ['failed tool beats newer completed delegation', [failedTool('failed-tool'), delegation('completed-delegation', 'completed')], 'failed-tool'],
    ['recovered tool beats newer completed delegation', [recoveredTool('recovered-tool'), delegation('completed-delegation', 'completed')], 'recovered-tool'],
    ['interrupted delegation beats newer completed tool', [delegation('interrupted-delegation', 'interrupted'), completedTool('completed-tool')], 'interrupted-delegation'],
    ['failed delegation beats newer completed tool', [delegation('failed-delegation', 'failed'), completedTool('completed-tool')], 'failed-delegation'],
    ['completed fallback uses newest mixed work item', [completedTool('completed-tool'), delegation('completed-delegation', 'completed')], 'completed-delegation'],
  ] as const)('%s', (_name, items, expectedId) => {
    const selected = latestWorkbenchItem(items)
    const id = selected?.kind === 'tool' ? selected.call.id : selected?.childSessionId
    expect(id).toBe(expectedId)
  })

  it('returns null when only cancelled delegations exist', () => {
    expect(latestWorkbenchItem([delegation('cancelled', 'cancelled')])).toBeNull()
  })

  it('returns an original item without mutating items or their values', () => {
    const item = recoveredTool('recovered')
    const items: ViewItem[] = [{ kind: 'assistant', content: 'unchanged', live: false, thinking: [], thinkingLive: false }, item]
    const originalItems = [...items]
    const originalItem = structuredClone(item)

    expect(latestWorkbenchItem(items)).toBe(item)
    expect(items).toEqual(originalItems)
    expect(item).toEqual(originalItem)
  })
})
