import { useMemo } from 'react'
import { projectItems } from '../../lib/project.ts'
import { useAutoScroll } from '../../hooks/useAutoScroll.ts'
import type { SseEvent } from '../../lib/types.ts'
import { AssistantMessage, JumpToBottom, StatusLine, ToolCard, UserBubble } from './MessageParts.tsx'

/**
 * The chat pane: transcript projected from the log, auto-scrolled to the
 * tail while the user stays at the bottom; a jump-back pill appears as
 * soon as they scroll up.
 */
export function Transcript({ events }: { readonly events: readonly SseEvent[] }) {
  const items = useMemo(() => projectItems(events), [events])
  const { tail, follow, onScroll, resume } = useAutoScroll([items])

  return (
    <div className="chat-scroll" onScroll={(event) => onScroll(event.currentTarget)}>
      <div className="transcript">
        {items.map((item, index) => {
          switch (item.kind) {
            case 'user':
              return <UserBubble key={index} item={item} />
            case 'assistant':
              return <AssistantMessage key={item.ts ?? index} item={item} />
            case 'tool':
              return <ToolCard key={item.call.id} item={item} />
            case 'status':
              return <StatusLine key={index} reason={item.reason} />
            default:
              return null
          }
        })}
        <div ref={tail} />
      </div>
      {!follow ? <JumpToBottom onClick={resume} /> : null}
    </div>
  )
}
