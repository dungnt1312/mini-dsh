import { describe, expect, it } from 'vitest'
import { reconcileApprovals } from './useSessionStream.ts'
import type { SseEvent } from '../lib/types.ts'

const call = { id: 'call-1', name: 'Bash', args: { command: 'pwd' } }
const request: SseEvent = { seq: 1, type: 'approval/request', approvalId: 'approval-1', call }

describe('approval projection', () => {
  it('replays unresolved requests and deduplicates repeated questions', () => {
    expect(reconcileApprovals([{ approvalId: 'approval-1', call }], [request])).toEqual([{ approvalId: 'approval-1', call }])
  })
  it('removes answered approvals during reconnect replay', () => {
    expect(reconcileApprovals([], [request, { seq: 2, type: 'approval/decision', approvalId: 'approval-1', decision: 'allow' }])).toEqual([])
  })
  it('removes completed tools even if a decision frame was missed', () => {
    expect(reconcileApprovals([], [request, { seq: 2, type: 'tool/result', callId: call.id, ok: true }])).toEqual([])
  })
  it('clears stale approvals at turn completion without removing later requests', () => {
    expect(reconcileApprovals([], [request, { seq: 2, type: 'turn/end', reason: 'stopped' }])).toEqual([])
    expect(reconcileApprovals([], [{ seq: 2, type: 'turn/end' }, request])).toHaveLength(1)
  })
})
