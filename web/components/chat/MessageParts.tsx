import { useState } from 'react'
import Icon from '../common/Icon.tsx'
import CopyButton from '../common/CopyButton.tsx'
import { Markdown } from '../../Markdown.tsx'
import { ThinkingPanel } from './ThinkingPanel.tsx'
import { formatTime } from '../../lib/format.ts'
import { CodeChip } from '../ui/CodeChip.tsx'
import type { ToolCall } from '../../lib/types.ts'
import type { ViewItem } from '../../lib/project.ts'

function ToolGlyph({ name }: { readonly name: string }) {
  const family = name === 'bash' ? 'shell' : 'fs'
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

export function UserBubble({ item }: { readonly item: Extract<ViewItem, { kind: 'user' }> }) {
  return (
    <div className="bubble user" title={formatTime(item.ts)}>
      <p className="bubble-text">{item.content}</p>
    </div>
  )
}

/** One assistant answer: thinking panel, markdown, then a mono meta-line. */
export function AssistantMessage({ item }: { readonly item: Extract<ViewItem, { kind: 'assistant' }> }) {
  return (
    <div className="assistant-wrap">
      <div className="bubble assistant">
        <div className="assistant-body">
          {item.thinking.length > 0 || item.thinkingLive ? (
            <ThinkingPanel thinking={item.thinking} live={item.live && item.thinkingLive} />
          ) : null}
          {item.content !== '' ? <Markdown content={item.content} /> : null}
          {item.content !== '' && item.live ? <span className="cursor" aria-hidden="true" /> : null}
          {item.toolCalls?.map((call) => (
            <span key={call.id} className="call-preview">
              requested <strong>{call.name}</strong>
            </span>
          ))}
        </div>
      </div>
      {!item.live && item.content !== '' ? (
        <div className="msg-meta">
          <span className="meta-time">{formatTime(item.ts)}</span>
          <CopyButton text={item.content} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * A tool invocation as a sharp breadcrumb row: verdict icon, tool name,
 * argument chips, duration right; expandable raw-output inset beneath.
 */
export function ToolCard({ item }: { readonly item: Extract<ViewItem, { kind: 'tool' }> }) {
  const [expanded, setExpanded] = useState(false)
  const { call, result, ts, doneAt } = item
  const state = result === undefined ? 'pending' : result.ok ? 'ok' : 'failed'
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
          : <Icon name={result?.ok === true ? 'check' : 'close'} size={12} className={`verdict verdict-${state}`} />}
        <strong className="tool-name">{call.name}</strong>
        <ToolGlyph name={call.name} />
        {chips.map((chip) => <CodeChip key={chip.text}>{chip.text}</CodeChip>)}
        {hidden > 0 ? <CodeChip>+{hidden}</CodeChip> : null}
        {duration !== '' ? <span className="tool-duration">{duration}</span> : null}
      </button>
      {expanded && result !== undefined ? <pre className="tool-output">{result.output || '(empty)'}</pre> : null}
      {expanded && result === undefined ? <span className="tool-output pending-text">đang chạy…</span> : null}
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
  stopped: 'bạn đã dừng',
  rejected: 'bị từ chối',
  empty: 'không có nội dung',
  failed: 'gặp lỗi',
}

export function StatusLine({ reason }: { readonly reason: string }) {
  return <div className="status-line">turn closed · {REASONS[reason] ?? reason}</div>
}

export function JumpToBottom({ onClick }: { readonly onClick: () => void }) {
  return (
    <button type="button" className="jump-bottom" onClick={onClick}>
      <Icon name="arrowDown" size={13} />
      <span>xuống cuối</span>
    </button>
  )
}
