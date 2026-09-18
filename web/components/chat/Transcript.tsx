import { useMemo, type ReactNode } from 'react'
import { useStickToBottom } from '../../hooks/useStickToBottom.ts'
import type { ViewItem } from '../../lib/project.ts'
import type { OpenPathResolver } from '../artifacts/ArtifactsPanel.tsx'
import { AssistantMessage, AuditLine, DelegationCard, JumpToBottom, StatusLine, ToolCard, UserBubble } from './MessageParts.tsx'

interface Indexed { readonly item: ViewItem; readonly index: number }
type Block = { readonly kind: 'row'; readonly row: Indexed } | { readonly kind: 'activity'; readonly rows: readonly Indexed[] }

const ACTIVITY_KINDS: ReadonlySet<ViewItem['kind']> = new Set(['tool', 'delegation', 'audit'])

/**
 * Consecutive tool/delegation/audit rows render as one tight block so a busy
 * turn reads as a compact activity log between messages. Terminal markers
 * that render nothing, and a bare "failed" marker right after a detailed
 * failure card, are dropped so they cannot add empty spacing.
 */
export function groupBlocks(items: readonly ViewItem[]): readonly Block[] {
  const blocks: Block[] = []
  items.forEach((item, index) => {
    if (item.kind === 'status' && item.reason === 'completed') return
    const previous = items[index - 1]
    if (item.kind === 'status' && item.reason === 'failed' && previous?.kind === 'status' && previous.reason.includes(':')) return
    const last = blocks.at(-1)
    if (ACTIVITY_KINDS.has(item.kind)) {
      if (last?.kind === 'activity') blocks[blocks.length - 1] = { kind: 'activity', rows: [...last.rows, { item, index }] }
      else blocks.push({ kind: 'activity', rows: [{ item, index }] })
      return
    }
    blocks.push({ kind: 'row', row: { item, index } })
  })
  return blocks
}

/**
 * The conversation column: projected log items in one centered reading
 * column. The scroller spans the full pane so the wheel works anywhere; it
 * follows new output only while the reader is at the bottom.
 */
export function Transcript({ items, conversationId, modelLabel, workspaceId, onReuse, onOpenChild, onRetry, onOpenSettings, openPath }: {
  readonly items: readonly ViewItem[]
  readonly conversationId: string | null
  readonly modelLabel?: string
  readonly workspaceId?: string | null
  readonly onReuse?: (text: string) => void
  readonly onOpenChild?: (childSessionId: string) => void
  readonly onRetry?: () => void
  readonly onOpenSettings?: () => void
  readonly openPath?: OpenPathResolver
}) {
  const blocks = useMemo(() => groupBlocks(items), [items])
  const { scrollRef, contentRef, atBottom, onScroll, scrollToBottom } = useStickToBottom(conversationId)

  const render = ({ item, index }: Indexed): ReactNode => {
    switch (item.kind) {
      case 'user':
        return <UserBubble key={`user-${index}`} item={item} workspaceId={workspaceId ?? null} {...(onReuse !== undefined ? { onReuse } : {})} />
      case 'assistant':
        return <AssistantMessage key={`assistant-${item.ts ?? index}`} item={item} {...(modelLabel !== undefined ? { modelLabel } : {})} />
      case 'tool':
        return <ToolCard key={item.call.id} item={item} {...(openPath !== undefined ? { openPath } : {})} />
      case 'delegation':
        return <DelegationCard key={item.childSessionId} item={item} {...(workspaceId !== undefined ? { workspaceId } : {})} {...(onOpenChild !== undefined ? { onOpen: onOpenChild } : {})} />
      case 'audit':
        return <AuditLine key={`audit-${index}`} item={item} />
      case 'status':
        return <StatusLine key={`status-${index}`} reason={item.reason} {...(onRetry !== undefined ? { onRetry } : {})} {...(onOpenSettings !== undefined ? { onOpenSettings } : {})} />
      default:
        return null
    }
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        tabIndex={0}
        role="region"
        aria-label="Conversation transcript"
        className="absolute inset-0 overflow-y-auto overflow-x-hidden outline-none"
      >
        <div ref={contentRef} className="px-3 pb-8 pt-4 sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-1">
          {blocks.map((block) => block.kind === 'activity'
            ? <div key={`activity-${block.rows[0]?.index ?? 0}`} className="flex flex-col gap-0.5">{block.rows.map(render)}</div>
            : render(block.row))}
          </div>
        </div>
      </div>
      {!atBottom ? <JumpToBottom onClick={scrollToBottom} /> : null}
    </div>
  )
}
