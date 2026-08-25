import type { SseEvent, ToolCall } from './types.ts'

/** View items projected from the durable log — the UI's deriveMessages(). */
export type ViewItem =
  | { readonly kind: 'user'; readonly content: string }
  | { readonly kind: 'assistant'; readonly content: string; readonly live: boolean; readonly toolCalls?: readonly ToolCall[] }
  | { readonly kind: 'tool'; readonly call: ToolCall; result?: { readonly ok: boolean; readonly output: string } }
  | { readonly kind: 'status'; readonly reason: string }

interface AssistantDraft {
  kind: 'assistant'
  content: string
  live: boolean
  toolCalls?: readonly ToolCall[]
}

/**
 * Project render items from session events. Streaming chunks accumulate
 * into the in-flight assistant item (the same object pushed into `items`,
 * mutated as chunks arrive); `assistant/message` finalizes it with the
 * authoritative content, and each `tool/result` answers the call its
 * `callId` names. Structural events are skipped; non-`completed` turn ends
 * surface as status lines.
 */
export function projectItems(events: readonly SseEvent[]): ViewItem[] {
  const items: ViewItem[] = []
  const toolItems = new Map<string, Extract<ViewItem, { kind: 'tool' }>>()
  let draft: AssistantDraft | null = null

  for (const event of events) {
    switch (event.type) {
      case 'user/message':
        if (event.content !== undefined) items.push({ kind: 'user', content: event.content })
        break
      case 'assistant/chunk':
        if (event.delta === undefined) break
        if (draft === null) {
          draft = { kind: 'assistant', content: '', live: true }
          items.push(draft)
        }
        draft.content += event.delta
        break
      case 'assistant/message': {
        const content = event.content ?? ''
        if (draft !== null) {
          if (content !== '') draft.content = content
          draft.live = false
          if (event.toolCalls !== undefined) draft.toolCalls = event.toolCalls
          draft = null
        } else if (content !== '' || event.toolCalls !== undefined) {
          items.push({
            kind: 'assistant',
            content,
            live: false,
            ...(event.toolCalls !== undefined ? { toolCalls: event.toolCalls } : {}),
          })
        }
        break
      }
      case 'tool/call': {
        if (event.call === undefined) break
        const item: Extract<ViewItem, { kind: 'tool' }> = { kind: 'tool', call: event.call }
        toolItems.set(event.call.id, item)
        items.push(item)
        break
      }
      case 'tool/result': {
        const item = event.callId === undefined ? undefined : toolItems.get(event.callId)
        if (item !== undefined) {
          item.result = { ok: event.ok === true, output: event.output ?? '' }
        }
        break
      }
      case 'turn/end':
        if (event.reason !== undefined && event.reason !== 'completed') {
          items.push({ kind: 'status', reason: event.reason })
        }
        break
      default:
        break
    }
  }
  return items
}
