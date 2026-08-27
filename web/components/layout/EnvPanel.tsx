import type { ReactNode } from 'react'
import Icon from '../common/Icon.tsx'
import { Badge } from '../ui/Badge.tsx'
import { Panel } from '../ui/Panel.tsx'
import { Select } from '../ui/Select.tsx'
import { SHOW_SLOTS } from '../../lib/config.ts'
import type { StreamState } from '../../lib/api.ts'
import type { ModelOption } from '../../lib/providers.ts'
import type { Meta } from '../../lib/types.ts'

const STREAM_LABELS: Readonly<Record<StreamState, string>> = {
  open: 'open',
  reconnecting: 'reconnecting…',
  connecting: 'connecting…',
}

function Row({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className="env-row">
      <span className="env-term">{term}</span>
      <span className="env-desc">{children}</span>
    </div>
  )
}

/**
 * Right rail mirrors session coordinates, session-scoped workspace, and the
 * active provider/model. Git/upload blocks remain behind SHOW_SLOTS.
 */
export function EnvPanel({
  open,
  meta,
  stream,
  sessionId,
  sessionFolder,
  eventCount,
  modelValue,
  modelOptions,
  onModel,
}: {
  readonly open: boolean
  readonly meta: Meta | null
  readonly stream: StreamState
  readonly sessionId: string | null
  readonly sessionFolder: string | null
  readonly eventCount: number
  readonly modelValue: string | null
  readonly modelOptions: readonly ModelOption[]
  readonly onModel: (value: string) => void
}) {
  const folder = sessionFolder ?? meta?.folder ?? '—'

  return (
    <aside className={`env-panel ${open ? 'env-panel-open' : ''}`}>
      <div className="env-head">
        ENVIRONMENT
        <Icon name="chevronRight" size={12} />
      </div>

      {SHOW_SLOTS ? (
        <Panel variant="raised" className="env-card env-git">
          <span className="env-git-branch">
            <Icon name="gitBranch" size={12} /> main
          </span>
          <span className="mono-dim">· 38</span>
          <span className="env-stats">
            <span className="delta-ok">+5,081</span>
            <span className="delta-bad">−288</span>
          </span>
          <Badge tone="amber">slot sau</Badge>
        </Panel>
      ) : null}

      <div className="env-label">SESSION</div>
      <Panel variant="raised" className="env-card">
        <Row term="id">{sessionId !== null ? `${sessionId.slice(0, 9)}…` : '—'}</Row>
        <Row term="events">{eventCount}</Row>
        <Row term="stream">
          <span className={`conn-text conn-text-${stream}`}>● {STREAM_LABELS[stream]}</span>
        </Row>
      </Panel>

      <div className="env-label">MODEL</div>
      <Panel variant="raised" className="env-card">
        <Row term="provider">{meta?.provider || '—'}</Row>
        <div className="env-row env-row-control">
          <span className="env-term">model</span>
          {modelValue !== null ? (
            <Select
              value={modelValue}
              options={modelOptions}
              onChange={onModel}
              disabled={meta === null}
              label="Chọn provider và model"
            />
          ) : <span className="env-desc">chưa cấu hình</span>}
        </div>
        <Row term="folder"><span className="env-path">{folder}</span></Row>
      </Panel>

      {SHOW_SLOTS ? (
        <div className="env-slot">
          Uploads · Diff staged <Badge tone="amber">slot sau</Badge>
          <br />
          Bật khi có API diffs / attachments.
        </div>
      ) : null}
    </aside>
  )
}
