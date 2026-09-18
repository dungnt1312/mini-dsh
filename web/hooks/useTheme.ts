import { useCallback, useEffect, useState } from 'react'
import { THEME_STORAGE_KEY, parseThemePreference, resolveTheme, type ThemePreference } from '../lib/theme.ts'

function readPreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

/** Applies the resolved theme to `<html data-theme>` and tracks system changes. */
export function useTheme(): { readonly preference: ThemePreference; readonly setPreference: (next: ThemePreference) => void } {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => { document.documentElement.dataset.theme = resolveTheme(preference, query.matches) }
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Appearance still applies for this tab when storage is unavailable.
    }
  }, [])

  return { preference, setPreference }
}
