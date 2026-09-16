import { Menu } from '../ui/Menu.tsx'
import Icon from '../common/Icon.tsx'
import {
  THINKING_LABELS,
  defaultThinkingLevel,
  effectiveThinking,
  getReasoningCapability,
} from '../../lib/model-info.ts'
import type { ModelSettings } from '../../lib/types.ts'

/**
 * The workspace's live thinking-level control (composer, next to the model
 * trigger). Rows: `Model default` (clears the override) plus the levels the
 * model documents — `Off` only when the provider can really disable
 * thinking. The trigger label always shows the level the next request
 * would carry, never a vague "auto".
 */
export function ThinkingMenu({
  model,
  value,
  settings,
  onSelect,
}: {
  readonly model: string | null
  /** Workspace override; null = the model's configured default. */
  readonly value: string | null
  readonly settings?: ModelSettings
  readonly onSelect: (level: string | null) => void
}) {
  if (model === null) return null
  const capability = getReasoningCapability(model)
  const effective = effectiveThinking(model, value, settings)
  if (capability === null || effective === null) return null

  const rows: { readonly level: string | null; readonly label: string }[] = [
    { level: null, label: 'Model default' },
    ...(capability.canDisable ? [{ level: 'off' as const, label: 'Off' }] : []),
    ...capability.levels.map((level) => ({ level: level as string, label: THINKING_LABELS[level] })),
  ]
  const fallbackLabel = THINKING_LABELS[defaultThinkingLevel(capability)]

  const pick = (close: () => void, level: string | null): void => {
    onSelect(level)
    close()
  }

  return (
    <Menu
      label="Workspace thinking level (next request)"
      panelClassName="thinking-menu"
      panelWidth={190}
      triggerClassName="ui-select-trigger composer-thinking-trigger"
      trigger={() => (
        <>
          <Icon name="zap" size={13} />
          <span className="composer-model-label">{effective.fromOverride ? THINKING_LABELS[effective.level] : fallbackLabel}</span>
          <Icon name="chevron" size={11} className="chevron" />
        </>
      )}
    >
      {(close) => rows.map((row) => {
        const active = row.level === null ? value === null : value === row.level
        return (
          <button
            key={row.level ?? 'default'}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            className="menu-row"
            onClick={() => pick(close, row.level)}
          >
            {row.label}
            {active ? <Icon name="check" size={12} className="menu-check" /> : null}
          </button>
        )
      })}
    </Menu>
  )
}
