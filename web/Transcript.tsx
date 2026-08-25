import { useEffect, useRef, useState } from 'react'
import { Markdown } from './Markdown.tsx'
import { projectItems } from './project.ts'
import type { PendingApproval, SseEvent } from './types.ts'

const TOOL_GLYPHS: Readonly<Record<string, string>> = {
  read: '⌕',
  write: '✎',
  edit: '✎',
  glob: '⌗',
  grep: '⌕',
  bash: '>_',
}

/** Small monogram chip for a tool call, colored by capability family. */
function ToolGlyph({ name }: { readonly name: string }) {
  const glyph = TOOL_GLYPHS[name] ?? 'ƒ'
  const family = name === 'bash' ? 'shell' : 'fs'
  return <span className={`tool-glyph ${family}`}>{glyph}</span>
}

function formatTime(ts?: number): string {
  if (ts === undefined) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** The chat pane: transcript projected from the log, auto-scrolled to the tail. */
export function Transcript({ events }: { readonly events: readonly SseEvent[] }) {
  const items = projectItems(events)
  const bottom = useRef<HTMLDivElement | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [items, autoScroll])

  return (
    <div
      className="transcript"
      onScroll={(event) => {
        const el = event.currentTarget
        setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 48)
      }}
    >
      {items.map((item, index) => {
        switch (item.kind) {
          case 'user':
            return (
              <div key={index} className="bubble user" title={formatTime(item.ts)}>
                {item.content}
              </div>
            )
          case 'assistant':
            return (
              <div key={index} className={`bubble assistant ${item.live ? 'live' : ''}`} title={formatTime(item.ts)}>
                {item.content !== '' ? <Markdown content={item.content} /> : null}
                {item.live ? <span className="cursor" aria-hidden="true" /> : null}
                {item.toolCalls?.map((call) => (
                  <span key={call.id} className="call-preview">
                    requested <strong>{call.name}</strong>
                  </span>
                ))}
              </div>
            )
          case 'tool':
            return (
              <div key={item.call.id} className={`tool-card ${item.result === undefined ? 'pending' : item.result.ok ? 'ok' : 'failed'}`}>
                <div className="tool-head">
                  <ToolGlyph name={item.call.name} />
                  <span className="tool-name">{item.call.name}</span>
                  <code className="tool-args">{JSON.stringify(item.call.args)}</code>
                  {item.result === undefined ? (
                    <span className="tool-spin" aria-label="running">
                      <i /><i /><i />
                    </span>
                  ) : item.result.ok ? (
                    <span className="tool-verdict ok">done</span>
                  ) : (
                    <span className="tool-verdict bad">failed</span>
                  )}
                </div>
                {item.result !== undefined ? (
                  <pre className="tool-output">{item.result.output}</pre>
                ) : null}
              </div>
            )
          case 'status':
            return (
              <div key={index} className="status-line">
                turn closed · {item.reason}
              </div>
            )
          default:
            return null
        }
      })}
      <div ref={bottom} />
    </div>
  )
}

/** Pending approval questions with Allow/Deny buttons. */
export function ApprovalBanner({
  approvals,
  onAnswer,
}: {
  readonly approvals: readonly PendingApproval[]
  readonly onAnswer: (approvalId: string, allow: boolean) => void
}) {
  if (approvals.length === 0) return null
  return (
    <div className="approvals">
      {approvals.map(({ approvalId, call }) => (
        <div key={approvalId} className="approval">
          <span className="approval-text">
            <ToolGlyph name={call.name} />
            allow <strong>{call.name}</strong>
            <code>{JSON.stringify(call.args)}</code>?
          </span>
          <span className="approval-actions">
            <button type="button" className="allow" onClick={() => onAnswer(approvalId, true)}>
              Allow
            </button>
            <button type="button" className="deny" onClick={() => onAnswer(approvalId, false)}>
              Deny
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}
