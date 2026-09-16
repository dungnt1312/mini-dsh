export interface WorkbenchPreferencesV1 {
  readonly leftWidth: number
  readonly rightWidth: number
  readonly leftCollapsed: boolean
  readonly rightCollapsed: boolean
  readonly inspectorTab: 'context' | 'artifacts'
}

export const WORKBENCH_STORAGE_KEY = 'mini-dsh.workbench.v1'

export const WORKBENCH_DEFAULTS: WorkbenchPreferencesV1 = {
  leftWidth: 280,
  rightWidth: 336,
  leftCollapsed: false,
  rightCollapsed: false,
  inspectorTab: 'context',
}

export const PANEL_LIMITS = {
  left: { min: 232, max: 420, default: 280 },
  right: { min: 280, max: 520, default: 336 },
} as const

export function clampPanelWidth(side: 'left' | 'right', value: number): number {
  const limits = PANEL_LIMITS[side]
  if (!Number.isFinite(value)) return limits.default
  return Math.min(limits.max, Math.max(limits.min, value))
}

function isInspectorTab(value: unknown): value is WorkbenchPreferencesV1['inspectorTab'] {
  return value === 'context' || value === 'artifacts'
}

export function parseWorkbenchPreferences(raw: string | null): WorkbenchPreferencesV1 {
  if (raw === null) return WORKBENCH_DEFAULTS

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return WORKBENCH_DEFAULTS
    const record = parsed as Record<string, unknown>
    return {
      leftWidth: typeof record.leftWidth === 'number'
        ? clampPanelWidth('left', record.leftWidth)
        : WORKBENCH_DEFAULTS.leftWidth,
      rightWidth: typeof record.rightWidth === 'number'
        ? clampPanelWidth('right', record.rightWidth)
        : WORKBENCH_DEFAULTS.rightWidth,
      leftCollapsed: typeof record.leftCollapsed === 'boolean'
        ? record.leftCollapsed
        : WORKBENCH_DEFAULTS.leftCollapsed,
      rightCollapsed: typeof record.rightCollapsed === 'boolean'
        ? record.rightCollapsed
        : WORKBENCH_DEFAULTS.rightCollapsed,
      inspectorTab: isInspectorTab(record.inspectorTab)
        ? record.inspectorTab
        : WORKBENCH_DEFAULTS.inspectorTab,
    }
  } catch {
    return WORKBENCH_DEFAULTS
  }
}
