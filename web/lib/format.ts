/** Display helpers: times, durations, and compact argument summaries. */

export function formatTime(ts?: number): string {
  if (ts === undefined) return ''
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

/** Compact sidebar age: now, 5m, 3h, 2d, 1w — coarser buckets only. */
export function formatAge(ts: number | undefined, now = Date.now()): string {
  if (ts === undefined) return ''
  const diff = Math.max(0, now - ts)
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`
  return `${Math.floor(diff / 604_800_000)}w`
}

export function formatDuration(start?: number, end?: number): string {
  if (start === undefined || end === undefined) return ''
  const ms = end - start
  if (ms < 1_000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`
}

/** Short one-line summary of tool arguments: `{ path: 'src/x.ts', … }`. */
export function argsSummary(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return '{}'
  const head = entries[0]
  if (head === undefined) return '{}'
  const [key, value] = head
  const shown = `${key}: ${summarize(value)}`
  return entries.length > 1 ? `{ ${shown}, … }` : `{ ${shown} }`
}

function summarize(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > 48 ? `'${value.slice(0, 48)}…'` : `'${value}'`
  }
  return JSON.stringify(value)
}

/** Last segment of a filesystem path, honoring both separators. */
export function pathBasename(path: string): string {
  if (path === '') return ''
  const parts = path.split(/[\\/]/)
  return parts.at(-1) ?? path
}

/** First non-empty string argument — the human target of most tool calls. */
export function toolTarget(args: Record<string, unknown>): string {
  for (const value of Object.values(args)) {
    if (typeof value === 'string' && value !== '') return value
  }
  return ''
}

/** Budget fill tone by usage ratio: state color thresholds (≥80 warn, ≥95 bad). */
export function budgetTone(usedTokens: number, availableTokens: number): 'ok' | 'warn' | 'bad' {
  if (availableTokens <= 0) return 'bad'
  const ratio = usedTokens / availableTokens
  if (ratio >= 0.95) return 'bad'
  if (ratio >= 0.8) return 'warn'
  return 'ok'
}
