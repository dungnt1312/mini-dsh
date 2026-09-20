export interface WorkbenchPreferencesV1 {
  readonly leftWidth: number
  readonly rightWidth: number
  readonly leftCollapsed: boolean
  readonly rightCollapsed: boolean
  /** Selected fixed workbench view; opened file tabs are transient. */
  readonly inspectorTab: 'files' | 'context' | 'artifacts' | 'agents'
}

export const WORKBENCH_STORAGE_KEY = 'mini-dsh.workbench.v1'

export const WORKBENCH_DEFAULTS: WorkbenchPreferencesV1 = {
  leftWidth: 280,
  rightWidth: 560,
  leftCollapsed: false,
  rightCollapsed: false,
  inspectorTab: 'files',
}

export const PANEL_LIMITS = {
  left: { min: 232, max: 420, default: 280 },
  right: { min: 360, max: 1100, default: 560 },
} as const

export function clampPanelWidth(side: 'left' | 'right', value: number): number {
  const limits = PANEL_LIMITS[side]
  if (!Number.isFinite(value)) return limits.default
  return Math.min(limits.max, Math.max(limits.min, value))
}

function isInspectorTab(value: unknown): value is WorkbenchPreferencesV1['inspectorTab'] {
  return value === 'files' || value === 'context' || value === 'artifacts' || value === 'agents'
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
