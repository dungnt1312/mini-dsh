import type { WorkbenchItem } from './workbench-projector.ts'

interface WorkbenchSurfaceProps {
  readonly item: WorkbenchItem | null
  readonly workspaceId: string | null
  readonly onOpenChild: (sessionId: string) => void
}

function duration(item: Extract<WorkbenchItem, { kind: 'tool' }>): string | null {
  if (item.ts === undefined || item.doneAt === undefined) return null
  const elapsed = item.doneAt - item.ts
  if (elapsed < 1_000) return `${elapsed}ms`
  if (elapsed < 60_000) return `${(elapsed / 1_000).toFixed(1)}s`
  return `${Math.floor(elapsed / 60_000)}m ${Math.round((elapsed % 60_000) / 1_000)}s`
}

function ToolWorkbench({ item }: { readonly item: Extract<WorkbenchItem, { kind: 'tool' }> }) {
  const outcome = item.result === undefined ? 'Running' : item.recovered === true ? 'Outcome unknown' : item.result.ok ? 'Completed' : 'Failed'
  const elapsed = duration(item)

  return (
    <section className="rounded-xl border border-border bg-bg-card p-4 shadow-sm" aria-label="Active workbench item">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-text-faint">Tool</span>
        <strong className="font-mono text-sm text-text">{item.call.name}</strong>
        <span className="text-sm text-text-dim">{outcome}</span>
        {elapsed !== null ? <span className="ml-auto font-mono text-xs text-text-faint">{elapsed}</span> : null}
      </div>
      {item.recovered === true ? (
        <div className="mt-3 flex gap-2 rounded-lg border border-warn-border bg-bg-inset px-3 py-2 text-sm text-text-dim" role="note">
          <span>Outcome unknown — the host restarted before this result was recorded.</span>
        </div>
      ) : null}
      <details className="mt-3 text-sm text-text-dim" open>
        <summary className="cursor-pointer text-text">Arguments</summary>
        <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-bg-inset p-3 font-mono text-xs whitespace-pre-wrap break-words">{JSON.stringify(item.call.args, null, 2)}</pre>
      </details>
      {item.result !== undefined ? (
        <details className="mt-3 text-sm text-text-dim" open>
          <summary className="cursor-pointer text-text">Output</summary>
          <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-bg-inset p-3 font-mono text-xs whitespace-pre-wrap break-words">{item.result.output || '(empty)'}</pre>
        </details>
      ) : null}
    </section>
  )
}

function DelegationWorkbench({ item, onOpenChild }: { readonly item: Extract<WorkbenchItem, { kind: 'delegation' }>; readonly onOpenChild: (sessionId: string) => void }) {
  return (
    <section className="rounded-xl border border-border bg-bg-card p-4 shadow-sm" aria-label="Active workbench item">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-text-faint">Delegation</span>
        <strong className="text-sm text-text">{item.definition !== '' ? item.definition : 'agent'}</strong>
        <span className="text-sm text-text-dim">{item.status}</span>
      </div>
      <div className="mt-3">
        <span className="text-xs font-medium uppercase tracking-wide text-text-faint">Objective</span>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text-dim">{item.objective !== '' ? item.objective : '—'}</p>
      </div>
      <button type="button" className="mt-3 text-sm text-accent-text underline-offset-2 hover:underline" onClick={() => onOpenChild(item.childSessionId)}>
        Open conversation
      </button>
    </section>
  )
}

/** A secondary presentation of one already-projected durable work item. */
export function WorkbenchSurface({ item, onOpenChild }: WorkbenchSurfaceProps) {
  if (item === null) return null
  return (
    <div data-workbench-surface className="mx-auto w-[calc(100%_-_48px)] max-w-[var(--content-w)] pb-2">
      {item.kind === 'tool' ? <ToolWorkbench item={item} /> : <DelegationWorkbench item={item} onOpenChild={onOpenChild} />}
    </div>
  )
}
