import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import ConfirmDialog from '../common/ConfirmDialog.tsx'
import { useToast } from '../common/Toast.tsx'
import { Panel } from '../ui/Panel.tsx'
import { compactSession, type ContextManifestView, type StreamState } from '../../lib/api.ts'
import { budgetTone } from '../../lib/format.ts'
import type { Meta, WorkspaceMeta } from '../../lib/types.ts'

const STREAM_LABELS: Readonly<Record<StreamState, string>> = {
  idle: 'No conversation selected',
  open: 'open',
  reconnecting: 'reconnecting…',
  connecting: 'connecting…',
}

function Row({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return <div className="env-row"><span className="env-term">{term}</span><span className="env-desc">{children}</span></div>
}

export interface ContextPanelProps {
  readonly meta: Meta | WorkspaceMeta | null
  readonly stream: StreamState
  readonly sessionId: string | null
  readonly sessionFolder: string | null
  readonly eventCount: number
  readonly manifest?: ContextManifestView | null
  readonly workspaceId?: string | null
  readonly running?: boolean
  readonly modeLabel?: string | null
  readonly onCompacted?: () => void
  readonly onOpenSettingsTab?: (tab: 'skills' | 'memory') => void
}

export function ContextPanel({
  meta,
  stream,
  sessionId,
  sessionFolder,
  eventCount,
  manifest,
  workspaceId,
  running = false,
  modeLabel,
  onCompacted,
  onOpenSettingsTab,
}: ContextPanelProps) {
  const toast = useToast()
  const folder = sessionFolder ?? (('folder' in (meta ?? {}) ? String((meta as { folder?: string }).folder ?? '') : '') || '—')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (running && !busy) setConfirming(false)
  }, [busy, running])

  const compact = async (): Promise<void> => {
    if (workspaceId === null || workspaceId === undefined || sessionId === null || running || busy) return
    setBusy(true)
    try {
      const result = await compactSession(workspaceId, sessionId)
      toast.notify(`Compacted — ${result.summaryChars} chars summarized through seq ${result.coversSeq}.`, 'ok')
      setConfirming(false)
      onCompacted?.()
    } catch (cause) {
      toast.notify(String(cause))
    } finally {
      setBusy(false)
    }
  }

  const canCompact = workspaceId !== null && workspaceId !== undefined && sessionId !== null
  const budget = manifest?.budget
  const tone = budget !== undefined ? budgetTone(budget.usedTokens, budget.availableTokens) : null
  const percent = budget === undefined ? 0 : Math.min(100, Math.round((budget.usedTokens / Math.max(1, budget.availableTokens)) * 100))
  const budgetStyle = { '--budget-percent': `${percent}%` } as CSSProperties

  return (
    <section aria-label="Conversation context" className="flex min-h-0 flex-col gap-2">
      <div className="env-label">Conversation</div>
      <Panel variant="raised" className="env-card">
        <Row term="id">{sessionId !== null ? `${sessionId.slice(0, 9)}…` : '—'}</Row>
        <Row term="events">{eventCount}</Row>
        <Row term="stream"><span className={`conn-text conn-text-${stream}`}>● {STREAM_LABELS[stream]}</span></Row>
      </Panel>

      <div className="env-label">Effective controls</div>
      <Panel variant="raised" className="env-card">
        <Row term="provider">{meta?.provider || '—'}</Row>
        <Row term="model">{meta?.model || 'Not configured'}</Row>
        <Row term="mode">{modeLabel ?? '—'}</Row>
        <Row term="folder"><span className="env-path">{folder}</span></Row>
      </Panel>

      <div className="env-label env-label-row">
        <span>Last request manifest</span>
        <button type="button" className="env-compact" disabled={!canCompact || running || busy}
          title={!canCompact ? 'Select a conversation' : running ? 'Stop the turn first' : 'Summarize older turns into a checkpoint'}
          onClick={() => setConfirming(true)}>{busy ? 'Compacting…' : 'Compact…'}</button>
      </div>
      {manifest !== undefined && manifest !== null ? (
        <Panel variant="raised" className="env-card">
          <Row term="mode">{manifest.modeId} · rev {manifest.modeRevision}</Row>
          <Row term="budget">
            {budget !== undefined ? (
              <span className="budget-stack" style={budgetStyle}>
                <span className={`budget-bar budget-bar-${tone}`}><span className="budget-fill w-[var(--budget-percent)]" /></span>
                ~{budget.usedTokens}/{budget.availableTokens} tok {budget.estimated ? '(est)' : '(verified)'}
              </span>
            ) : '—'}
          </Row>
          <Row term="history">{manifest.history.setting}: {manifest.history.includedTurns} turns{manifest.history.omittedTurns > 0 ? ` (${manifest.history.omittedTurns} omitted)` : ''}</Row>
          <Row term="tools">{manifest.sources.toolNames !== undefined && manifest.sources.toolNames.length > 0 ? manifest.sources.toolNames.join(', ') : String(manifest.sources.toolSchemas)}</Row>
          {manifest.sources.skills.length > 0 ? <Row term="skills">{onOpenSettingsTab !== undefined ? <button type="button" className="env-link" onClick={() => onOpenSettingsTab('skills')}>{manifest.sources.skills.join(', ')}</button> : <>{manifest.sources.skills.join(', ')}</>}</Row> : null}
          {manifest.sources.memory.length > 0 ? <Row term="memory">{onOpenSettingsTab !== undefined ? <button type="button" className="env-link" onClick={() => onOpenSettingsTab('memory')}>{manifest.sources.memory.join(', ')}</button> : <>{manifest.sources.memory.join(', ')}</>}</Row> : null}
          {manifest.omissions.length > 0 ? <Row term="omitted"><span title={manifest.omissions.join('\n')}>{manifest.omissions.length} sources omitted</span></Row> : null}
        </Panel>
      ) : (
        <Panel variant="raised" className="env-card env-manifest-empty">
          No request has been assembled for this conversation yet.
        </Panel>
      )}

      <ConfirmDialog open={confirming && !running} title="Compact this conversation?" confirmLabel="Compact" tone="success" busy={busy || running}
        onConfirm={() => void compact()} onDismiss={() => { if (!busy) setConfirming(false) }}
        body={<p>Older turns will be summarized into a checkpoint and omitted from future requests. The full log stays on disk; compaction cannot be undone in the live context.</p>} />
    </section>
  )
}
