import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { load } from 'js-yaml'
import type { Fiber } from './fiber.ts'
import type { Kernel, PluginTarget } from './registry.ts'

/** One row of a `cordis.yml`-style composition file. */
export interface ConfigEntry {
  /** Module specifier: a relative path or a package name. */
  name: string
  /** Skip this entry. Patch layers flip this instead of deleting rows. */
  disabled?: boolean
}

/** Parse a composition file body into validated entries; fails loud on bad shape. */
export function parseConfig(source: string): ConfigEntry[] {
  const data: unknown = load(source)
  if (!Array.isArray(data)) {
    throw new Error('config root must be a list of plugin entries')
  }
  return data.map((row: unknown, index: number) => {
    if (row === null || typeof row !== 'object') {
      throw new Error(`config entry #${index} must be a mapping with a name`)
    }
    const record = row as Record<string, unknown>
    const { name, disabled } = record
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error(`config entry #${index} needs a non-empty string name`)
    }
    if (disabled !== undefined && typeof disabled !== 'boolean') {
      throw new Error(`config entry '${name}' has a non-boolean disabled field`)
    }
    return disabled === undefined ? { name } : { name, disabled }
  })
}

/**
 * Import a plugin module and pick its plugin export: the default export when
 * present, otherwise the module namespace itself (a named-export function
 * plugin). Throws when neither shape yields a plugin.
 */
export async function loadPluginModule(specifier: string, baseUrl: string): Promise<PluginTarget> {
  const url = new URL(specifier, baseUrl)
  const module = (await import(url.href)) as {
    default?: PluginTarget
    apply?: unknown
  } & PluginTarget
  const candidate = module.default ?? (typeof module === 'function' ? module : undefined)
  if (candidate !== undefined) {
    return candidate
  }
  if (typeof module.apply === 'function') {
    return module as PluginTarget
  }
  throw new Error(`module '${specifier}' exports no plugin (need default export or apply)`)
}

/**
 * Boot a kernel from a composition file: parse, import every enabled entry,
 * and mount it on the kernel's root context.
 *
 * @returns the mounted fibers, in file order.
 */
export async function bootFromFile(kernel: Kernel, path: string): Promise<Fiber[]> {
  const source = readFileSync(path, 'utf8')
  const fileUrl = pathToFileURL(path).href
  const baseUrl = fileUrl.slice(0, fileUrl.lastIndexOf('/') + 1)
  return boot(kernel, source, baseUrl)
}

/** Boot a kernel from composition source; see {@link bootFromFile}. */
export async function boot(kernel: Kernel, source: string, baseUrl: string): Promise<Fiber[]> {
  const fibers: Fiber[] = []
  for (const entry of parseConfig(source)) {
    if (entry.disabled) continue
    const target = await loadPluginModule(entry.name, baseUrl)
    fibers.push(kernel.ctx.plugin(target))
  }
  return fibers
}
