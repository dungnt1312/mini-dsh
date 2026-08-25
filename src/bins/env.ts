import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Load the repo-root `.env` for the bins: first from the repository the bin
 * file lives in (so running from any cwd still finds it), then from the
 * process cwd. Variables already present in the environment always win;
 * an empty-string `DEEPSEEK_API_KEY` is treated at the call site as absent.
 */
export function loadRepoEnv(): void {
  // src/bins/env.ts -> the repo root is two directories up.
  const binRelative = fileURLToPath(new URL('../../.env', import.meta.url))
  for (const candidate of [binRelative, '.env']) {
    if (!existsSync(candidate)) continue
    try {
      process.loadEnvFile(candidate)
    } catch {
      // Malformed or unreadable: environment-only configuration continues.
    }
  }
}

/**
 * Read `DEEPSEEK_API_KEY`, treating empty/whitespace values as absent so a
 * stale empty export falls back to the mock provider with a warning
 * instead of calling the API with a blank key.
 */
export function readApiKey(): string | undefined {
  const raw = process.env.DEEPSEEK_API_KEY
  const trimmed = raw?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}
