import { useCallback, useState } from 'react'
import {
  PANEL_LIMITS,
  parseWorkbenchPreferences,
  WORKBENCH_DEFAULTS,
  WORKBENCH_STORAGE_KEY,
  type WorkbenchPreferencesV1,
} from '../lib/workbench-preferences.ts'

function readPreferences(): WorkbenchPreferencesV1 {
  try {
    return parseWorkbenchPreferences(window.localStorage.getItem(WORKBENCH_STORAGE_KEY))
  } catch {
    return WORKBENCH_DEFAULTS
  }
}

function persistPreferences(preferences: WorkbenchPreferencesV1): void {
  try {
    window.localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Presentation preferences remain usable when browser storage is unavailable.
  }
}

export function useWorkbenchPreferences(): {
  readonly preferences: WorkbenchPreferencesV1
  readonly patchPreferences: (patch: Partial<WorkbenchPreferencesV1>) => void
  readonly resetPanelWidth: (side: 'left' | 'right') => void
} {
  const [preferences, setPreferences] = useState<WorkbenchPreferencesV1>(readPreferences)

  const patchPreferences = useCallback((patch: Partial<WorkbenchPreferencesV1>) => {
    setPreferences((current) => {
      const next = parseWorkbenchPreferences(JSON.stringify({ ...current, ...patch }))
      persistPreferences(next)
      return next
    })
  }, [])

  const resetPanelWidth = useCallback((side: 'left' | 'right') => {
    patchPreferences({ [side === 'left' ? 'leftWidth' : 'rightWidth']: PANEL_LIMITS[side].default })
  }, [patchPreferences])

  return { preferences, patchPreferences, resetPanelWidth }
}
