import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { SessionEvent } from '../session/events.ts'
import type { Session } from '../session/session.ts'

export { ContextBudgetError } from './budget.ts'

/** One immutable compaction checkpoint. */
export interface CompactionCheckpoint {
  readonly v: 1
  /** The checkpoint covers log events with seq <= this value. */
  readonly coversSeq: number
  /** The summary text that replaces the covered range in context. */
  readonly summary: string
  readonly provenance: {
    readonly model?: string
    readonly createdAt: number
    readonly trigger: 'manual' | 'automatic'
  }
}

/**
 * Checkpoint storage: one JSON file per checkpoint under
 * `<sessions-root>/<session-id>/checkpoints/<coversSeq>.json`. The original
 * events.jsonl is never touched — checkpoints are pure derived state, so
 * deleting them loses nothing canonical.
 */
export class CheckpointStore {
  constructor(private readonly sessionsRoot: string) {}

  private dir(sessionId: string): string {
    return path.join(this.sessionsRoot, sessionId, 'checkpoints')
  }

  async save(sessionId: string, checkpoint: CompactionCheckpoint): Promise<void> {
    const dir = this.dir(sessionId)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, `${checkpoint.coversSeq}.json`), `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8')
  }

  /** The newest checkpoint, or undefined when none exists. */
  async latest(sessionId: string): Promise<CompactionCheckpoint | undefined> {
    let names: string[]
    try {
      names = await fs.readdir(this.dir(sessionId))
    } catch {
      return undefined
    }
    const seqs = names
      .filter((name) => name.endsWith('.json'))
      .map((name) => Number.parseInt(name.slice(0, -5), 10))
      .filter((seq) => Number.isInteger(seq) && seq > 0)
      .sort((a, b) => b - a)
    for (const seq of seqs) {
      try {
        const raw = await fs.readFile(path.join(this.dir(sessionId), `${seq}.json`), 'utf8')
        const parsed = JSON.parse(raw) as CompactionCheckpoint
        if (parsed.v === 1 && typeof parsed.coversSeq === 'number' && typeof parsed.summary === 'string') {
          return parsed
        }
      } catch {
        continue // a corrupt checkpoint file is skipped, not fatal
      }
    }
    return undefined
  }
}

/** The summarizer a host provides: bounded, side-effect-free text-in/text-out. */
export type Summarizer = (input: { readonly text: string; readonly model?: string }) => Promise<string>

/**
 * Compact one session through `summarizer` at a COMPLETED exchange
 * boundary. Refuses while a turn is open — compaction never runs mid-Turn.
 * The summary has no side effects and never promotes into memory.
 */
export async function compactSession(
  session: Session,
  checkpoints: CheckpointStore,
  summarizer: Summarizer,
  options: { trigger: 'manual' | 'automatic'; model?: string; maxChars?: number } = { trigger: 'manual' },
): Promise<CompactionCheckpoint> {
  const events = session.events
  // Only a completed boundary: the newest turn/end must close the log.
  let lastEnd = 0
  let openTurnId: string | undefined
  for (const event of events) {
    if (event.type === 'turn/start') openTurnId = event.turnId
    else if (event.type === 'turn/end' && event.turnId === openTurnId) {
      lastEnd = event.seq
      openTurnId = undefined
    }
  }
  if (openTurnId !== undefined || lastEnd === 0) {
    throw new Error('compaction requires a completed exchange boundary (no open turn)')
  }

  const text = projectForSummary(events, lastEnd)
  const trimmed = options.maxChars !== undefined && text.length > options.maxChars ? text.slice(0, options.maxChars) : text
  const summary = await summarizer({ text: trimmed, ...(options.model !== undefined ? { model: options.model } : {}) })
  const checkpoint: CompactionCheckpoint = {
    v: 1,
    coversSeq: lastEnd,
    summary,
    provenance: {
      ...(options.model !== undefined ? { model: options.model } : {}),
      createdAt: Date.now(),
      trigger: options.trigger,
    },
  }
  await checkpoints.save(session.id, checkpoint)
  return checkpoint
}

/** Model-visible projection (same shape deriveMessages covers) as flat text. */
function projectForSummary(events: readonly SessionEvent[], throughSeq: number): string {
  const lines: string[] = []
  for (const event of events) {
    if (event.seq > throughSeq) break
    switch (event.type) {
      case 'user/message':
        lines.push(`user: ${event.content}`)
        break
      case 'assistant/message':
        lines.push(`assistant: ${event.content}`)
        if (event.toolCalls !== undefined) {
          for (const call of event.toolCalls) lines.push(`  [tool call] ${call.name}(${JSON.stringify(call.args)})`)
        }
        break
      case 'tool/result':
        lines.push(`  [tool result] ${event.output}`)
        break
      default:
        break
    }
  }
  return lines.join('\n')
}
