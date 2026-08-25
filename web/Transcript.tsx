import { useEffect, useRef, useState } from 'react'
import { projectItems } from './project.ts'
import type { PendingApproval, SseEvent } from './types.ts'

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
              <div key={index} className="bubble user">
                {item.content}
              </div>
            )
          case 'assistant':
            return (
              <div key={index} className="bubble assistant">
                {item.content !== '' ? item.content : null}
                {item.live ? <span className="cursor">▍</span> : null}
                {item.toolCalls?.map((call) => (
                  <div key={call.id} className="call-preview">
                    wants {call.name}({JSON.stringify(call.args)})
                  </div>
                ))}
              </div>
            )
          case 'tool':
            return (
              <div key={item.call.id} className={`tool-card ${item.result?.ok === false ? 'failed' : ''}`}>
                <div className="tool-head">
                  {item.call.name}
                  <span className="tool-args">{JSON.stringify(item.call.args)}</span>
                  {item.result === undefined ? <span className="tool-spin">running…</span> : null}
                </div>
                {item.result !== undefined ? (
                  <pre className="tool-output">{item.result.output}</pre>
                ) : null}
              </div>
            )
          case 'status':
            return (
              <div key={index} className="status-line">
                turn closed: {item.reason}
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
          <span>
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
