import { useMemo } from 'react'
import { useAutoScroll } from '../../hooks/useAutoScroll.ts'
import type { ViewItem } from '../../lib/project.ts'
import { AssistantMessage, AuditLine, DelegationCard, JumpToBottom, StatusLine, ToolCard, UserBubble } from './MessageParts.tsx'

/**
 * The chat pane: transcript projected from the log, auto-scrolled to the
 * tail while the user stays at the bottom; a jump-back pill appears as
 * soon as they scroll up.
 */
export function Transcript({ items, modelLabel, workspaceId, onReuse, onOpenChild, onRetry, onOpenSettings }: {
  readonly items: readonly ViewItem[]
  readonly modelLabel?: string
  readonly workspaceId?: string | null
  readonly onReuse?: (text: string) => void
  readonly onOpenChild?: (childSessionId: string) => void
  readonly onRetry?: () => void
  readonly onOpenSettings?: () => void
}) {
  // A bare "failed" end marker directly after a detailed failure card adds
  // nothing — the card already states the outcome.
  const bareFailedAfterCard = useMemo(() => {
    const skip = new Set<number>()
    for (let i = 0; i < items.length - 1; i += 1) {
      const item = items[i]
      const next = items[i + 1]
      if (item.kind === 'status' && item.reason.includes(':') && next.kind === 'status' && next.reason === 'failed') skip.add(i + 1)
    }
    return skip
  }, [items])
  const { tail, follow, onScroll, resume } = useAutoScroll([items])

  return (
    <div className="chat-scroll" onScroll={(event) => onScroll(event.currentTarget)}>
      <div className="transcript">
        {items.map((item, index) => {
          if (bareFailedAfterCard.has(index)) return null
          switch (item.kind) {
            case 'user':
              return <UserBubble key={index} item={item} {...(onReuse !== undefined ? { onReuse } : {})} />
            case 'assistant':
              return <AssistantMessage key={item.ts ?? index} item={item} {...(modelLabel !== undefined ? { modelLabel } : {})} />
            case 'tool':
              return <ToolCard key={item.call.id} item={item} />
            case 'delegation':
              return <DelegationCard key={item.childSessionId} item={item} {...(workspaceId !== undefined && workspaceId !== null ? { workspaceId } : {})} {...(onOpenChild !== undefined ? { onOpen: onOpenChild } : {})} />
            case 'audit':
              return <AuditLine key={`audit-${index}`} item={item} />
            case 'status':
              return (
                <StatusLine
                  key={index}
                  reason={item.reason}
                  {...(onRetry !== undefined ? { onRetry } : {})}
                  {...(onOpenSettings !== undefined ? { onOpenSettings } : {})}
                />
              )
            default:
              return null
          }
        })}
        <div ref={tail} className="transcript-tail" aria-hidden="true" />
      </div>
      {!follow ? <JumpToBottom onClick={resume} /> : null}
    </div>
  )
}
