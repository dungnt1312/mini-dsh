/**
 * G3 compaction: boundary enforcement (open turn refuses, completed
 * succeeds), byte-identical original log, checkpoint range/provenance, and
 * refusal surfaces instead of looping.
 */
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CheckpointStore, compactSession, Kernel, fileSessions, WorkspaceService } from 'mini-dsh'
import type { SessionId, StepId, TurnId } from 'mini-dsh'

let home = ''
let checkpoints: CheckpointStore

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), 'mini-dsh-g3-compact-'))
  checkpoints = new CheckpointStore(path.join(home, 'workspaces'))
})

afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true })
})

async function sessionWithHistory(): Promise<{ sessionId: SessionId; logPath: string }> {
  const kernel = new Kernel()
  kernel.ctx.plugin(fileSessions(home))
  const sessions = kernel.ctx.sessions
  const ws = new WorkspaceService(home)
  await ws.boot()
  await sessions.boot()
  const session = sessions.create(ws.defaultWorkspace)
  session.append({ type: 'turn/start', turnId: 't1' as TurnId })
  session.append({ type: 'user/message', turnId: 't1' as TurnId, content: 'plan the deploy' })
  session.append({ type: 'assistant/message', stepId: 's1' as StepId, content: 'here is the plan' })
  session.append({ type: 'turn/end', turnId: 't1' as TurnId, reason: 'completed' })
  await session.durable()
  const wsId = ws.defaultWorkspace
  const logPath = path.join(home, 'workspaces', wsId as string, 'sessions', session.id as string, 'events.jsonl')
  await kernel.stop()
  return { sessionId: session.id, logPath }
}

describe('compaction', () => {
  it('an open turn refuses compaction; a completed boundary succeeds', async () => {
    const kernel = new Kernel()
    kernel.ctx.plugin(fileSessions(home))
    const sessions = kernel.ctx.sessions
    const { sessionId } = await sessionWithHistory()
    await sessions.boot()
    const session = await sessions.load(sessionId)

    // Completed log: succeeds.
    const checkpoint = await compactSession(session, checkpoints, async ({ text }) => `SUMMARY:${text.split('\n').length} lines`, { trigger: 'manual' })
    expect(checkpoint.coversSeq).toBe(4)
    expect(checkpoint.summary).toMatch(/^SUMMARY:/)
    expect(checkpoint.provenance.trigger).toBe('manual')
    expect(typeof checkpoint.provenance.createdAt).toBe('number')

    // Open turn: refuses loudly.
    session.append({ type: 'turn/start', turnId: 't2' as TurnId })
    session.append({ type: 'user/message', turnId: 't2' as TurnId, content: 'new work' })
    await session.durable()
    await expect(compactSession(session, checkpoints, async ({ text }) => text, { trigger: 'manual' })).rejects.toThrow(/completed exchange boundary/)
    await kernel.stop()
  })

  it('the original JSONL stays byte-identical across compaction', async () => {
    const { sessionId, logPath } = await sessionWithHistory()
    const before = await fs.readFile(logPath, 'utf8')
    const kernel = new Kernel()
    kernel.ctx.plugin(fileSessions(home))
    await kernel.ctx.sessions.boot()
    const session = await kernel.ctx.sessions.load(sessionId)
    await compactSession(session, checkpoints, async ({ text }) => text.slice(0, 50), { trigger: 'manual' })
    const after = await fs.readFile(logPath, 'utf8')
    expect(after).toBe(before)
    // Checkpoint file exists beside the untouched log.
    const ckpt = await checkpoints.latest(sessionId)
    expect(ckpt?.coversSeq).toBe(4)
    await kernel.stop()
  })

  it('an opaque summarizer failure surfaces instead of retrying', async () => {
    const kernel = new Kernel()
    kernel.ctx.plugin(fileSessions(home))
    const { sessionId } = await sessionWithHistory()
    await kernel.ctx.sessions.boot()
    const session = await kernel.ctx.sessions.load(sessionId)
    await expect(
      compactSession(session, checkpoints, async () => {
        throw new Error('summarizer exploded')
      }, { trigger: 'manual' }),
    ).rejects.toThrow(/summarizer exploded/)
    await kernel.stop()
  })
})
