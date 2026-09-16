import type { ViewItem } from '../../lib/project.ts'

export type WorkbenchItem = Extract<ViewItem, { kind: 'tool' | 'delegation' }>

function isRunning(item: WorkbenchItem): boolean {
  return (item.kind === 'tool' && item.result === undefined) || (item.kind === 'delegation' && item.status === 'running')
}

function needsAttention(item: WorkbenchItem): boolean {
  return (item.kind === 'tool' && (item.recovered === true || item.result?.ok === false))
    || (item.kind === 'delegation' && (item.status === 'interrupted' || item.status === 'failed'))
}

function isCompleted(item: WorkbenchItem): boolean {
  return (item.kind === 'tool' && item.result !== undefined && item.recovered !== true && item.result.ok)
    || (item.kind === 'delegation' && item.status === 'completed')
}

/**
 * Select one existing projected item for the temporary elevated surface.
 * The original item reference is returned; no durable event is synthesized.
 */
export function latestWorkbenchItem(items: readonly ViewItem[]): WorkbenchItem | null {
  for (const predicate of [isRunning, needsAttention, isCompleted]) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index]
      if ((item.kind === 'tool' || item.kind === 'delegation') && predicate(item)) return item
    }
  }
  return null
}
