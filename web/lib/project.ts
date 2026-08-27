import type { SseEvent, ToolCall } from './types.ts'

/** View items projected from the durable log — the UI's deriveMessages(). */
export type ViewItem =
  | { readonly kind: 'user'; readonly content: string; readonly ts?: number }
  | {
      readonly kind: 'assistant'
      readonly content: string
      readonly live: boolean
      readonly ts?: number
      readonly thinking: readonly string[]
      readonly thinkingLive: boolean
      readonly toolCalls?: readonly ToolCall[]
    }
  | { readonly kind: 'tool'; readonly call: ToolCall; readonly ts?: number; doneAt?: number; result?: { readonly ok: boolean; readonly output: string } }
  | { readonly kind: 'status'; readonly reason: string }

interface AssistantDraft {
  kind: 'assistant'
  content: string
  live: boolean
  ts?: number
  thinking: string[]
  thinkingLive: boolean
  toolCalls?: readonly ToolCall[]
}

/**
 * Project render items from session events. Streaming chunks accumulate
 * into the in-flight assistant item (the same object pushed into `items`,
 * mutated as chunks arrive); thinking chunks fill `thinking` without
 * touching `content`. `assistant/message` finalizes the item, and each
 * `tool/result` answers the call its `callId` names (recording `doneAt`
 * for duration chips). Structural events are skipped; non-`completed`
 * turn ends surface as status lines.
 */
export function projectItems(events: readonly SseEvent[]): ViewItem[] {
  const items: ViewItem[] = []
  const toolItems = new Map<string, Extract<ViewItem, { kind: 'tool' }>>()
  let draft: AssistantDraft | null = null

  for (const event of events) {
    switch (event.type) {
      case 'user/message':
        if (event.content !== undefined) items.push({ kind: 'user', content: event.content, ...(event.timestamp !== undefined ? { ts: event.timestamp } : {}) })
        break
      case 'assistant/chunk':
        if (event.delta === undefined) break
        if (draft === null) {
          draft = { kind: 'assistant', content: '', live: true, thinking: [], thinkingLive: false, ...(event.timestamp !== undefined ? { ts: event.timestamp } : {}) }
          items.push(draft)
        }
        if (event.thinking === true) {
          draft.thinking.push(event.delta)
          draft.thinkingLive = true
        } else {
          draft.content += event.delta
          draft.thinkingLive = false
        }
        break
      case 'assistant/message': {
        const content = event.content ?? ''
        if (draft !== null) {
          if (content !== '') draft.content = content
          draft.live = false
          draft.thinkingLive = false
          if (event.toolCalls !== undefined) draft.toolCalls = event.toolCalls
          draft = null
        } else if (content !== '' || event.toolCalls !== undefined) {
          items.push({
            kind: 'assistant',
            content,
            live: false,
            thinking: [],
            thinkingLive: false,
            ...(event.timestamp !== undefined ? { ts: event.timestamp } : {}),
            ...(event.toolCalls !== undefined ? { toolCalls: event.toolCalls } : {}),
          })
        }
        break
      }
      case 'tool/call': {
        if (event.call === undefined) break
        const item: Extract<ViewItem, { kind: 'tool' }> = {
          kind: 'tool',
          call: event.call,
          ...(event.timestamp !== undefined ? { ts: event.timestamp } : {}),
        }
        toolItems.set(event.call.id, item)
        items.push(item)
        break
      }
      case 'tool/result': {
        const item = event.callId === undefined ? undefined : toolItems.get(event.callId)
        if (item !== undefined) {
          item.result = { ok: event.ok === true, output: event.output ?? '' }
          if (event.timestamp !== undefined) item.doneAt = event.timestamp
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

/**
 * Whether a turn is currently in flight: every `turn/start` is closed by a
 * `turn/end`; an unmatched start means the agent is still working. The Stop
 * button and activity indicators read this.
 */
export function isTurnRunning(events: readonly SseEvent[]): boolean {
  let open = 0
  for (const event of events) {
    if (event.type === 'turn/start') open += 1
    else if (event.type === 'turn/end') open = Math.max(0, open - 1)
  }
  return open > 0
}
