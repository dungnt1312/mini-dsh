import { useEffect, useState } from 'react'
import Icon from '../common/Icon.tsx'
import CopyButton from '../common/CopyButton.tsx'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Markdown } from '../../Markdown.tsx'
import { ThinkingPanel } from './ThinkingPanel.tsx'
import { formatTime } from '../../lib/format.ts'
import { waitChild } from '../../lib/api.ts'
import { CodeChip } from '../ui/CodeChip.tsx'
import type { ChildRow } from '../../lib/types.ts'
import type { ToolCall } from '../../lib/types.ts'
import type { ViewItem } from '../../lib/project.ts'

function ToolGlyph({ name }: { readonly name: string }) {
  const family = name === 'bash' || name === 'Bash' ? 'shell' : 'fs'
  return (
    <span className={`tool-glyph ${family}`}>
      <Icon name={family === 'shell' ? 'terminal' : 'fileText'} size={11} />
    </span>
  )
}

/** Up to two leading string args become breadcrumb chips; the rest count. */
function argChips(call: ToolCall): readonly { readonly text: string }[] {
  return Object.entries(call.args)
    .filter(([, value]) => typeof value === 'string' && value !== '')
    .slice(0, 2)
    .map(([key, value]) => ({ text: `${key}: ${String(value)}` }))
}

export function UserBubble({ item, onReuse }: { readonly item: Extract<ViewItem, { kind: 'user' }>; readonly onReuse?: (text: string) => void }) {
  // No name label — alignment and surface carry the identity, like every
  // mainstream chat product. The timestamp stays available on hover. A
  // queued input renders as a dashed twin and is replaced in place by the
  // consuming user/message (same inputId) — see projectItems(). Hovering a
  // real message reveals copy + reuse (the log is never rewritten).
  return (
    <div className={`bubble user${item.queued === true ? ' bubble-queued' : ''}`} title={item.ts !== undefined ? formatTime(item.ts) : undefined}>
      {item.queued === true ? <span className="queued-chip">Queued</span> : null}
      <p className="bubble-text">{item.content}</p>
      {item.queued !== true && onReuse !== undefined ? (
        <span className="user-actions">
          <CopyButton text={item.content} />
          <IconButton label="Reuse in composer" onClick={() => onReuse(item.content)}>
            <Icon name="pencil" size={12} />
          </IconButton>
        </span>
      ) : null}
    </div>
  )
}

/** One assistant answer: thinking panel, markdown, then a quiet meta row. */
export function AssistantMessage({ item, modelLabel }: { readonly item: Extract<ViewItem, { kind: 'assistant' }>; readonly modelLabel?: string }) {
  // The label reports what actually served THIS step (recorded controls);
  // the workspace's current model is only the fallback for legacy events.
  const controlsLabel = item.controls !== undefined
    ? [item.controls.model, item.controls.provider].filter((part) => part !== undefined && part !== '').join(' · ')
    : ''
  return (
    <div className="assistant-wrap">
      <div className="bubble assistant">
        <div className="assistant-body">
          {item.thinking.length > 0 || item.thinkingLive ? (
            <ThinkingPanel thinking={item.thinking} live={item.live && item.thinkingLive} />
          ) : null}
          {item.content !== '' ? <Markdown content={item.content} /> : null}
          {item.content !== '' && item.live ? <span className="cursor" aria-hidden="true" /> : null}
        </div>
      </div>
      {!item.live && item.content !== '' ? (
        <div className="msg-meta">
          {controlsLabel !== ''
            ? <span className="meta-model">{controlsLabel}</span>
            : modelLabel !== undefined ? <span className="meta-model">{modelLabel}</span> : null}
          <span className="meta-time">{formatTime(item.ts)}</span>
          <CopyButton text={item.content} />
        </div>
      ) : null}
    </div>
  )
}

function verdict(state: 'ok' | 'failed'): ReturnType<typeof Icon> {
  return state === 'ok'
    ? <Icon name="check" size={12} className="verdict verdict-ok" />
    : <Icon name="close" size={12} className="verdict verdict-failed" />
}

/**
 * A tool invocation as a sharp breadcrumb row: verdict icon, tool name,
 * argument chips, duration right; expandable raw-output inset beneath.
 * MCP calls carry their server chip; a recovered result shows the amber
 * unknown-outcome verdict and leads its output with the recovery note.
 */
export function ToolCard({ item }: { readonly item: Extract<ViewItem, { kind: 'tool' }> }) {
  const [expanded, setExpanded] = useState(false)
  const { call, result, ts, doneAt, server, recovered } = item
  const state = result === undefined ? 'pending' : recovered === true ? 'recovered' : result.ok ? 'ok' : 'failed'
  const ms = result !== undefined && ts !== undefined && doneAt !== undefined ? doneAt - ts : NaN
  const duration = fmtDuration(ms)
  const chips = argChips(call)
  const hidden = Object.keys(call.args).length - chips.length

  return (
    <div className={`tool-row ${state}`}>
      <button type="button" className="tool-head" onClick={() => setExpanded((prev) => !prev)} aria-expanded={expanded}>
        <Icon name="chevronRight" size={12} className={`chevron-down ${expanded ? 'chevron-rotated' : ''}`} />
        {state === 'pending'
          ? (
              <span className="tool-spin" aria-label="running"><i /><i /><i /></span>
            )
          : state === 'recovered'
            ? <Icon name="alertTriangle" size={12} className="verdict verdict-recovered" />
            : verdict(result?.ok === true ? 'ok' : 'failed')}
        <strong className="tool-name">{call.name}</strong>
        <ToolGlyph name={call.name} />
        {server !== undefined ? <CodeChip>{server}</CodeChip> : null}
        {chips.map((chip) => <CodeChip key={chip.text}>{chip.text}</CodeChip>)}
        {hidden > 0 ? <CodeChip>+{hidden}</CodeChip> : null}
        {recovered === true ? <span className="tool-flag">recovered</span> : null}
        {duration !== '' ? <span className="tool-duration">{duration}</span> : null}
      </button>
      {expanded ? <pre className="tool-output">{JSON.stringify(call.args, null, 2)}</pre> : null}
      {expanded && recovered === true && result !== undefined ? (
        <div className="tool-recovery-note" role="note">
          <Icon name="alertTriangle" size={12} />
          <span>Outcome unknown — the host restarted before this result was recorded.</span>
        </div>
      ) : null}
      {expanded && result !== undefined ? <pre className="tool-output">{result.output || '(empty)'}</pre> : null}
      {expanded && result === undefined ? <span className="tool-output pending-text">Running…</span> : null}
    </div>
  )
}

const DELEGATION_VERDICTS = {
  completed: { icon: 'check', className: 'verdict verdict-ok' },
  failed: { icon: 'close', className: 'verdict verdict-failed' },
  interrupted: { icon: 'alertTriangle', className: 'verdict verdict-recovered' },
  cancelled: { icon: 'circle', className: 'verdict verdict-cancelled' },
} as const

/**
 * One delegation from the durable spawn → result pair. The stream carries
 * the timeline (a parent turn ending first marks the card interrupted);
 * the settled result payload (summary, file references, error) is fetched
 * from the agents API when the card is expanded.
 */
export function DelegationCard({ item, workspaceId, onOpen }: {
  readonly item: Extract<ViewItem, { kind: 'delegation' }>
  readonly workspaceId?: string | null
  readonly onOpen?: (childSessionId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<ChildRow | null>(null)
  const settled = item.status !== 'running'

  useEffect(() => {
    if (!expanded || !settled || detail !== null || workspaceId === null || workspaceId === undefined) return
    let cancelled = false
    void waitChild(workspaceId, item.childSessionId, 1_000).then(
      (row) => { if (!cancelled) setDetail(row) },
      () => {},
    )
    return () => { cancelled = true }
  }, [expanded, settled, detail, workspaceId, item.childSessionId])

  const running = item.status === 'running'
  const v = item.status === 'running' ? null : DELEGATION_VERDICTS[item.status]
  const truncated = item.objective.length > 64 ? `${item.objective.slice(0, 64)}…` : item.objective

  return (
    <div className={`tool-row delegation delegation-${item.status}`}>
      <button type="button" className="tool-head" onClick={() => setExpanded((prev) => !prev)} aria-expanded={expanded}>
        <Icon name="chevronRight" size={12} className={`chevron-down ${expanded ? 'chevron-rotated' : ''}`} />
        {running
          ? <span className="tool-spin" aria-label="child running"><i /><i /><i /></span>
          : v !== null ? <Icon name={v.icon} size={12} className={v.className} /> : null}
        <span className="tool-glyph agent"><Icon name="gitBranch" size={11} /></span>
        <strong className="tool-name">Delegated to {item.definition !== '' ? item.definition : 'agent'}</strong>
        {item.objective !== '' ? <CodeChip>{truncated}</CodeChip> : null}
      </button>
      {expanded ? (
        <div className="delegation-body">
          <div className="delegation-section">
            <span className="delegation-label">Objective</span>
            <p>{item.objective !== '' ? item.objective : '—'}</p>
          </div>
          {settled ? (
            <div className="delegation-section">
              <span className="delegation-label">Result ({item.status})</span>
              {detail?.result !== undefined
                ? <p>{detail.result.summary}</p>
                : detail?.error !== undefined
                  ? <p>{detail.error}</p>
                  : <p className="delegation-pending">Result payload unavailable for this child session.</p>}
              {detail?.result !== undefined && detail.result.fileReferences.length > 0 ? (
                <div className="delegation-files">
                  {detail.result.fileReferences.map((file) => <CodeChip key={file}>{file}</CodeChip>)}
                </div>
              ) : null}
            </div>
          ) : null}
          {onOpen !== undefined ? (
            <button type="button" className="delegation-open" onClick={() => onOpen(item.childSessionId)}>
              Open conversation →
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const AUDIT_ICONS = {
  block: { icon: 'alertTriangle', className: 'verdict verdict-recovered' },
  fail: { icon: 'alertTriangle', className: 'verdict verdict-failed' },
  allow: { icon: 'check', className: 'verdict verdict-ok' },
  deny: { icon: 'close', className: 'verdict verdict-failed' },
  expired: { icon: 'circle', className: 'verdict verdict-cancelled' },
} as const

/**
 * A quiet audit line — hooks that blocked or failed, and correlated
 * approval decisions. Allowing hooks stay invisible: silence is normal.
 */
export function AuditLine({ item }: { readonly item: Extract<ViewItem, { kind: 'audit' }> }) {
  const v = AUDIT_ICONS[item.icon]
  return (
    <div className="audit-line" role="note">
      <Icon name={v.icon} size={12} className={v.className} />
      <span className="audit-text">{item.text}</span>
      {item.durationMs !== undefined ? <span className="tool-duration">{fmtDuration(item.durationMs)}</span> : null}
    </div>
  )
}

function fmtDuration(ms: number): string {
  if (Number.isNaN(ms)) return ''
  if (ms < 1_000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`
}

const REASONS: Readonly<Record<string, string>> = {
  completed: 'Completed',
  interrupted: 'Interrupted · inspect results before continuing',
  cancelled: 'Stopped by you',
  limit: 'Limit reached',
  stopped: 'Stopped by you',
  rejected: 'Rejected',
  empty: 'No content',
  failed: 'Failed',
}

export function StatusLine({ reason, onRetry, onOpenSettings }: { readonly reason: string; readonly onRetry?: () => void; readonly onOpenSettings?: () => void }) {
  if (reason.startsWith('Permission decision')) return <div className="status-line">{reason}</div>
  if (reason.includes(':')) {
    return (
      <div className="turn-error" role="alert">
        <Icon name="close" size={14} className="turn-error-icon" />
        <div className="turn-error-body">
          <p className="turn-error-head"><strong>Request failed.</strong> <span>Nothing was executed, so retrying is safe.</span></p>
          <div className="turn-error-actions">
            {onRetry !== undefined ? <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button> : null}
            {onOpenSettings !== undefined ? <button type="button" className="turn-error-link" onClick={onOpenSettings}>Open settings</button> : null}
            <details className="turn-error-details">
              <summary>Details</summary>
              <pre>{reason}</pre>
            </details>
          </div>
        </div>
      </div>
    )
  }
  return <div className="status-line">{REASONS[reason] ?? reason}</div>
}

export function JumpToBottom({ onClick }: { readonly onClick: () => void }) {
  return (
    <button type="button" className="jump-bottom" onClick={onClick}>
      <Icon name="arrowDown" size={13} />
      <span>Jump to latest</span>
    </button>
  )
}
