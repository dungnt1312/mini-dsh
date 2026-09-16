import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { replaceFileAtomic } from '../storage/events-jsonl.ts'
import { BUNDLED_MODES, DEFAULT_MODE_ID, KNOWN_MODE_TOOLS } from './bundled.ts'
import { ModeError, type ModeDefinition, type ModeFrontmatter, type ModeSources, type ResolvedMode } from './types.ts'

export { BUNDLED_MODES, DEFAULT_MODE_ID }
export { ModeError }
export type { ModeDefinition, ModeFrontmatter, ModeSources, ResolvedMode }

/**
 * Workspace-scoped mode registry. Bundled modes are read-only constants;
 * custom modes are Markdown/frontmatter files under
 * `<home>/workspaces/<ws>/modes/<id>.md`, owned by that workspace.
 * Selecting a validated mode is live; a mode file is NOT hot-reloaded —
 * edits apply to future resolutions, and the resolved hash pins what an
 * execution actually saw.
 */
export class ModesService {
  private readonly home: string

  constructor(home: string) {
    this.home = home
  }

  private dir(workspaceId: string): string {
    return path.join(this.home, 'workspaces', workspaceId, 'modes')
  }

  private filePath(workspaceId: string, id: string): string {
    return path.join(this.dir(workspaceId), `${id}.md`)
  }

  /** Bundled + workspace modes (custom overrides never shadow bundled ids). */
  async list(workspaceId: string): Promise<ResolvedMode[]> {
    const rows: ResolvedMode[] = BUNDLED_MODES.map((definition) => ({ definition, source: 'bundled' as const }))
    let entries
    try {
      entries = await fs.readdir(this.dir(workspaceId), { withFileTypes: true })
    } catch {
      return rows
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const id = entry.name.slice(0, -3)
      if (BUNDLED_MODES.some((mode) => mode.id === id)) continue
      try {
        const resolved = await this.resolve(workspaceId, id)
        rows.push(resolved)
      } catch {
        // Invalid files are surfaced in resolve(); listing skips them
        // rather than serving something unvalidated.
      }
    }
    return rows
  }

  /**
   * Resolve one mode by id: bundled constants or a validated workspace
   * file. Unknown and invalid ids both fail loud.
   */
  async resolve(workspaceId: string, id: string): Promise<ResolvedMode> {
    const bundled = BUNDLED_MODES.find((mode) => mode.id === id)
    if (bundled !== undefined) return { definition: bundled, source: 'bundled' }
    let raw: string
    try {
      raw = await fs.readFile(this.filePath(workspaceId, id), 'utf8')
    } catch {
      throw new ModeError('not-found', `no mode '${id}'`)
    }
    const definition = parseModeFile(id, raw)
    return { definition, source: 'workspace', hash: sha256(raw) }
  }

  /**
   * Create or replace a workspace mode file. Content is the raw Markdown
   * (frontmatter + instructions body); it is validated BEFORE the write
   * lands, and `expectedHash` conflicts surface instead of clobbering
   * external edits.
   */
  async save(workspaceId: string, id: string, raw: string, expectedHash?: string): Promise<ResolvedMode> {
    if (BUNDLED_MODES.some((mode) => mode.id === id)) {
      throw new ModeError('duplicate', `'${id}' is a bundled mode; duplicate it to customize`)
    }
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
      throw new ModeError('invalid', `mode id '${id}' must be kebab-case`)
    }
    parseModeFile(id, raw) // validate before writing anything
    const file = this.filePath(workspaceId, id)
    await fs.mkdir(path.dirname(file), { recursive: true })
    let current: string | undefined
    try {
      current = await fs.readFile(file, 'utf8')
    } catch {
      current = undefined
    }
    if (current !== undefined && expectedHash !== undefined && sha256(current) !== expectedHash) {
      throw new ModeError('invalid', `conflict: '${id}' changed externally; re-read before saving`)
    }
    // Atomic replacement (temp + sync + rename): a crash mid-write never
    // leaves a half-valid mode file behind. The hash recheck narrows —
    // though it cannot eliminate — the external-editor race; the remaining
    // platform TOCTOU is a documented limit, not a guarantee.
    await replaceFileAtomic(file, raw)
    return { definition: parseModeFile(id, raw), source: 'workspace', hash: sha256(raw) }
  }

  /** Duplicate a bundled (or any) mode into the workspace for customization. */
  async duplicate(workspaceId: string, sourceId: string, newId: string): Promise<ResolvedMode> {
    const source = await this.resolve(workspaceId, sourceId)
    const raw = serializeModeFile({ ...source.definition, id: newId })
    return this.save(workspaceId, newId, raw)
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    if (BUNDLED_MODES.some((mode) => mode.id === id)) {
      throw new ModeError('duplicate', 'bundled modes cannot be deleted')
    }
    await fs.rm(this.filePath(workspaceId, id), { force: true })
  }
}

/** The exact frontmatter keys a mode file may carry. */
const KNOWN_FRONTMATTER_KEYS = new Set([
  'name', 'description', 'history', 'workspaceInstructions', 'skills',
  'memoryPinned', 'memoryRetrieval', 'toolExposure', 'permissionDefaults',
])

/**
 * Parse and validate one mode file STRICTLY: unknown keys, invalid enum
 * values, non-boolean flags, unknown tool names, and invalid permission
 * entries are REJECTED (ModeError), never silently coerced into a
 * different mode — invalid content is never executed.
 */
export function parseModeFile(id: string, raw: string): ModeDefinition {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  const body = match !== null ? raw.slice(match[0].length) : raw
  const frontmatter = match !== null ? parseFrontmatter(match[1] ?? '') : {}
  const invalid: string[] = []

  for (const key of Object.keys(frontmatter)) {
    if (!KNOWN_FRONTMATTER_KEYS.has(key)) invalid.push(`unknown frontmatter key '${key}'`)
  }
  if (frontmatter.name !== undefined && typeof frontmatter.name !== 'string') {
    invalid.push("'name' must be a string")
  }
  const name = typeof frontmatter.name === 'string' && frontmatter.name.trim() !== '' ? frontmatter.name.trim() : id

  let history: ModeSources['history'] = 'recent'
  if (frontmatter.history !== undefined) {
    if (frontmatter.history === 'none' || frontmatter.history === 'compact' || frontmatter.history === 'recent') {
      history = frontmatter.history
    } else {
      invalid.push(`'history' must be none|recent|compact, got ${JSON.stringify(frontmatter.history)}`)
    }
  }
  const sources = {
    history,
    workspaceInstructions: true,
    memoryPinned: true,
    memoryRetrieval: true,
    skills: 'on-demand' as ModeSources['skills'],
  }
  for (const flag of ['workspaceInstructions', 'memoryPinned', 'memoryRetrieval'] as const) {
    const value: unknown = frontmatter[flag]
    if (value === undefined) {
      // default true
    } else if (value === true || value === false) {
      sources[flag] = value
    } else {
      invalid.push(`'${flag}' must be a boolean`)
    }
  }
  if (frontmatter.skills === undefined) {
    // default on-demand
  } else if (frontmatter.skills === 'off' || frontmatter.skills === 'on-demand') {
    sources.skills = frontmatter.skills
  } else {
    invalid.push(`'skills' must be off|on-demand, got ${JSON.stringify(frontmatter.skills)}`)
  }

  let toolExposure: string[] = []
  if (frontmatter.toolExposure !== undefined) {
    if (!Array.isArray(frontmatter.toolExposure)) {
      invalid.push("'toolExposure' must be an array of tool names")
    } else {
      const names = (frontmatter.toolExposure as unknown[]).map((tool) => String(tool))
      const unknown = names.filter((tool) => !KNOWN_MODE_TOOLS.includes(tool))
      if (unknown.length > 0) {
        invalid.push(`'toolExposure' names unknown tools: ${unknown.join(', ')} (known: ${KNOWN_MODE_TOOLS.join(', ')})`)
      } else {
        toolExposure = names
      }
    }
  }

  const permissionDefaults: Record<string, 'allow' | 'ask' | 'deny'> = {}
  if (frontmatter.permissionDefaults !== undefined) {
    if (frontmatter.permissionDefaults === null || typeof frontmatter.permissionDefaults !== 'object') {
      invalid.push("'permissionDefaults' must be an object of tool → allow|ask|deny")
    } else {
      for (const [tool, mode] of Object.entries(frontmatter.permissionDefaults as Record<string, unknown>)) {
        if (!KNOWN_MODE_TOOLS.includes(tool)) {
          invalid.push(`'permissionDefaults' names unknown tool '${tool}'`)
        } else if (mode === 'allow' || mode === 'ask' || mode === 'deny') {
          permissionDefaults[tool] = mode
        } else {
          invalid.push(`'permissionDefaults.${tool}' must be allow|ask|deny, got ${JSON.stringify(mode)}`)
        }
      }
    }
  }

  if (invalid.length > 0) {
    throw new ModeError('invalid', `mode '${id}' is invalid: ${invalid.join('; ')}`)
  }
  return {
    id,
    name,
    instructions: body.trim(),
    sources,
    toolExposure,
    permissionDefaults,
  }
}

function parseFrontmatter(block: string): ModeFrontmatter {
  // A minimal `key: value` parser keeps mode files dependency-free; values
  // may be inline JSON arrays/objects.
  const result: Record<string, unknown> = {}
  for (const line of block.split('\n')) {
    const match = /^([a-zA-Z][a-zA-Z0-9]*):\s*(.*)$/.exec(line.trim())
    if (match === null) continue
    const key = match[1] ?? ''
    const rawValue = match[2]?.trim() ?? ''
    try {
      result[key] = JSON.parse(rawValue) as unknown
    } catch {
      result[key] = rawValue
    }
  }
  return result as ModeFrontmatter
}

/** Serialize a definition back to canonical Markdown/frontmatter form. */
export function serializeModeFile(definition: ModeDefinition): string {
  const fm: string[] = [`name: ${JSON.stringify(definition.name)}`, `history: ${definition.sources.history}`,
    `workspaceInstructions: ${definition.sources.workspaceInstructions}`, `skills: ${definition.sources.skills}`,
    `memoryPinned: ${definition.sources.memoryPinned}`, `memoryRetrieval: ${definition.sources.memoryRetrieval}`,
    `toolExposure: ${JSON.stringify(definition.toolExposure)}`,
    `permissionDefaults: ${JSON.stringify(definition.permissionDefaults)}`]
  return `---\n${fm.join('\n')}\n---\n\n${definition.instructions.trim()}\n`
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}
