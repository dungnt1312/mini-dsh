import * as Tabs from '@radix-ui/react-tabs'
import Icon from '../common/Icon.tsx'
import { ArtifactsPanel } from '../artifacts/ArtifactsPanel.tsx'
import { ContextPanel, type ContextPanelProps } from './ContextPanel.tsx'
import type { SseEvent } from '../../lib/types.ts'

export type InspectorTab = 'context' | 'artifacts'

export function InspectorPanel({ tab, onTabChange, onClose, context, events }: {
  readonly tab: InspectorTab
  readonly onTabChange: (tab: InspectorTab) => void
  readonly onClose?: () => void
  readonly context: ContextPanelProps
  readonly events: readonly SseEvent[]
}) {
  return (
    <aside className="env-panel env-panel-open env-panel-hosted">
      <Tabs.Root value={tab} onValueChange={(value) => onTabChange(value as InspectorTab)} className="flex min-h-0 flex-1 flex-col">
        <div className="env-head">
          <Tabs.List aria-label="Inspector views" className="flex gap-1 rounded-md bg-[var(--bg-inset)] p-1 normal-case tracking-normal">
            <Tabs.Trigger value="context" className="rounded px-2 py-1 text-xs text-[var(--text-dim)] data-[state=active]:bg-[var(--bg-active)] data-[state=active]:text-[var(--text)]">Context</Tabs.Trigger>
            <Tabs.Trigger value="artifacts" className="rounded px-2 py-1 text-xs text-[var(--text-dim)] data-[state=active]:bg-[var(--bg-active)] data-[state=active]:text-[var(--text)]">Artifacts</Tabs.Trigger>
          </Tabs.List>
          {onClose !== undefined ? <button type="button" className="ui-select-trigger" aria-label="Close context" onClick={onClose}><Icon name="close" size={14} /></button> : null}
        </div>
        <Tabs.Content value="context" className="min-h-0 flex-1 overflow-y-auto outline-none"><ContextPanel {...context} /></Tabs.Content>
        <Tabs.Content value="artifacts" className="min-h-0 flex-1 overflow-y-auto py-2 outline-none"><ArtifactsPanel events={events} /></Tabs.Content>
      </Tabs.Root>
    </aside>
  )
}
