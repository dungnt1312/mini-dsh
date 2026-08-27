import { mkdir, readFile, readFileSync, rename, writeFile } from 'node:fs'
import path from 'node:path'

/** One configured OpenAI-completions provider, persisted as JSON. */
export interface ProviderConfig {
  /** URL-safe unique id (also used on REST paths). */
  readonly id: string
  readonly name: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly models: readonly string[]
  readonly defaultModel?: string | undefined
  readonly enabled: boolean
}

/**
 * Load the provider list from `file`. A missing or malformed file yields an
 * empty list — first boot before any configuration — never a throw.
 */
export function loadProviders(file: string): ProviderConfig[] {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  return parseProviders(raw)
}

/** Parse and sanitize the persisted shape; junk entries are dropped. */
export function parseProviders(raw: string): ProviderConfig[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: ProviderConfig[] = []
    for (const entry of parsed) {
      if (entry === null || typeof entry !== 'object') continue
      const candidate = entry as Record<string, unknown>
      const id = candidate['id']
      const name = candidate['name']
      const baseUrl = candidate['baseUrl']
      const apiKey = candidate['apiKey']
      if (typeof id !== 'string' || id === '') continue
      if (typeof name !== 'string' || name === '') continue
      if (typeof baseUrl !== 'string' || baseUrl === '') continue
      if (typeof apiKey !== 'string') continue
      const models = Array.isArray(candidate['models'])
        ? candidate['models'].filter((model): model is string => typeof model === 'string')
        : []
      const defaultModel = typeof candidate['defaultModel'] === 'string' ? candidate['defaultModel'] : undefined
      const enabled = candidate['enabled'] !== false
      out.push({ id, name, baseUrl, apiKey, models, ...(defaultModel !== undefined ? { defaultModel } : {}), enabled })
    }
    return out
  } catch {
    return []
  }
}

/** Persist the list atomically-ish: write sibling temp then rename over. */
export async function saveProviders(file: string, providers: readonly ProviderConfig[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    mkdir(path.dirname(file), { recursive: true }, (error) => {
      if (error !== null) reject(error)
      else resolve()
    })
  })
  const temp = `${file}.tmp`
  await new Promise<void>((resolve, reject) => {
    writeFile(temp, JSON.stringify(providers, null, 2), 'utf8', (error) => {
      if (error !== null) reject(error)
      else resolve()
    })
  })
  await new Promise<void>((resolve, reject) => {
    rename(temp, file, (error) => {
      if (error !== null) reject(error)
      else resolve()
    })
  })
}

/** Slugify a display name into a stable URL-safe id. */
export function slugify(name: string): string {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug === '' ? 'provider' : slug
}

/**
 * Mask an API key for transport/UI: reveal only the last 4 characters. A
 * keyless entry masks to the empty string — local gateways legitimately need
 * no credential, and dots there would claim a secret that does not exist.
 */
export function maskKey(apiKey: string): string {
  if (apiKey === '') return ''
  if (apiKey.length <= 4) return '••••'
  return `••••${apiKey.slice(-4)}`
}
