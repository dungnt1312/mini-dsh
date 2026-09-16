import { taskPhase, type TaskPhase } from '../../lib/project.ts'
import type { SseEvent } from '../../lib/types.ts'
const LABELS: Record<TaskPhase, string> = { idle: 'Ready', preparing: 'Preparing · submitting or queued', running: 'Working', waiting: 'Approval required', completed: 'Completed', failed: 'Failed', interrupted: 'Interrupted', cancelled: 'Stopped', rejected: 'Request rejected', empty: 'Ended without a response', limit: 'Turn limit reached' }
export function TaskStatus({ events, pending, sending, connected }: { readonly events: readonly SseEvent[]; readonly pending: number; readonly sending: boolean; readonly connected: boolean }) {
  const phase = taskPhase(events, pending, sending)
  const recover = ['interrupted', 'cancelled', 'limit', 'empty'].includes(phase)
  // Failed and rejected turns render as one consolidated card inside the
  // transcript itself (see StatusLine) — a second banner would be duplication.
  if (phase === 'idle' || phase === 'completed' || phase === 'failed' || phase === 'rejected') return null
  return <section className={`task-status task-status-${phase}`} aria-label="Work status">
    <strong role="status">{LABELS[phase]}</strong>
    {phase === 'preparing' ? <p>The request is submitting or queued. Queued input does not run automatically after a restart.</p> : null}
    {!connected ? <p>Event connection unavailable. State may be out of date; a lost connection does not mean work has stopped.</p> : null}
    {recover ? <details><summary>Before continuing</summary><p>Inspect tool results and actual changes before continuing. Tools may already have run; nothing is replayed automatically.</p></details> : null}
    {events.some((event) => event.recovery === true) ? <p>A recovered tool outcome may be unknown. Inspect the file or target system before requesting another action.</p> : null}
  </section>
}
