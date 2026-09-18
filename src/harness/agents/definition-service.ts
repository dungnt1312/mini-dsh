/**
 * Agent role definitions (G4): workspace-owned Markdown/frontmatter files
 * at `workspaces/<ws>/agents/*.md`, bundled roles are read-only and copied
 * explicitly for customization. A role is NOT a Mode — it restricts tools
 * and carries instructions within the effective mode/policy; it can never
 * grant anything the workspace policy or mode ceiling denies.
 */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { replaceFileAtomic } from '../storage/events-jsonl.ts'

export const BUNDLED_AGENT_ROLES = ['explorer', 'worker'] as const

export interface AgentDefinition {
  /** Stable lookup name (file name without .md). */
  readonly name: string
  readonly description: string
  /** System instructions prepended for the child's context. */
  readonly instructions: string
  /** Hard tool ceiling: the child can never call anything outside this list. */
  readonly tools: readonly string[]
  /** Tools the definition explicitly refuses even if the grant allows. */
  readonly disallowedTools: readonly string[]
  /** Skills preloaded into the child Turn (loaded once and hash-pinned). */
  readonly skills?: readonly string[]
  /** Optional model override; undefined inherits the session's selection. */
  readonly model?: string
  /** Deprecated compatibility metadata. Retained when importing old definitions, but never enforced. */
  readonly maxTurns?: number
}

export interface ResolvedAgentDefinition {
  readonly definition: AgentDefinition
  readonly source: 'bundled' | 'workspace'
  /** sha256 of the raw file (workspace definitions only). */
  readonly hash?: string
}

export class AgentDefinitionError extends Error {
  constructor(
    readonly code: 'not-found' | 'invalid' | 'duplicate' | 'conflict' | 'blocked',
    message: string,
  ) {
    super(message)
    this.name = 'AgentDefinitionError'
  }
}

/** Frontmatter keys a definition may carry (Claude-compatible subset). */
const KNOWN_KEYS = new Set([
  'name', 'description', 'tools', 'disallowedTools', 'skills', 'model', 'maxTurns',
])

/**
 * Parse one definition file. Strict: unknown keys, unknown tools, missing
 * descriptions and invalid compatibility metadata reject with the invalid
 * fields listed — definitions that parse into something else are never executed.
 */
export function parseAgentDefinition(name: string, raw: string): AgentDefinition {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  const body = (match !== null ? raw.slice(match[0].length) : raw).trim()
  const frontmatter = match !== null ? parseFrontmatter(match[1] ?? '') : {}
  const invalid: string[] = []

  for (const key of Object.keys(frontmatter)) {
    if (!KNOWN_KEYS.has(key)) invalid.push(`unknown frontmatter key '${key}'`)
  }
  const description = typeof frontmatter.description === 'string' ? frontmatter.description.trim() : ''
  if (description === '') invalid.push("'description' is required and must be a non-empty string")

  let tools: string[] = []
  if (frontmatter.tools !== undefined) {
    if (Array.isArray(frontmatter.tools)) {
      tools = (frontmatter.tools as unknown[]).map((tool) => String(tool))
    } else {
      invalid.push("'tools' must be an array of tool names")
    }
  }
  let disallowedTools: string[] = []
  if (frontmatter.disallowedTools !== undefined) {
    if (Array.isArray(frontmatter.disallowedTools)) {
      disallowedTools = (frontmatter.disallowedTools as unknown[]).map((tool) => String(tool))
    } else {
      invalid.push("'disallowedTools' must be an array of tool names")
    }
  }

  let skills: string[] | undefined
  if (frontmatter.skills !== undefined) {
    if (Array.isArray(frontmatter.skills) && (frontmatter.skills as unknown[]).every((skill) => typeof skill === 'string')) {
      skills = frontmatter.skills as string[]
    } else {
      invalid.push("'skills' must be an array of skill names")
    }
  }

  let model: string | undefined
  if (frontmatter.model !== undefined) {
    if (typeof frontmatter.model === 'string' && frontmatter.model.trim() !== '') {
      model = frontmatter.model.trim()
    } else {
      invalid.push("'model' must be a non-empty string")
    }
  }

  let maxTurns: number | undefined
  if (frontmatter.maxTurns !== undefined) {
    const value = Number(frontmatter.maxTurns)
    if (Number.isInteger(value) && value > 0) maxTurns = value
    else invalid.push(`'maxTurns' must be a positive integer, got ${JSON.stringify(frontmatter.maxTurns)}`)
  }

  if (body === '') invalid.push('instructions body must not be empty')
  if (invalid.length > 0) {
    throw new AgentDefinitionError('invalid', `agent definition '${name}' is invalid: ${invalid.join('; ')}`)
  }
  return {
    name,
    description,
    instructions: body,
    tools,
    disallowedTools,
    ...(skills !== undefined ? { skills } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(maxTurns !== undefined ? { maxTurns } : {}),
  }
}

/** Bundled role definitions (read-only; copied for customization). */
export function bundledDefinition(name: string): AgentDefinition {
  if (name === 'explorer') {
    return {
      name: 'explorer',
      description: 'Read-only explorer: investigates the project with Read/Glob/Grep and reports findings.',
      instructions:
        'You are a read-only explorer. Investigate with read tools only and report concise findings with file references. You cannot write, edit, or run commands.',
      tools: ['Read', 'Glob', 'Grep'],
      disallowedTools: ['Write', 'Edit', 'Bash', 'Skill', 'MemoryCreate', 'MemoryUpdate', 'MemoryForget'],
    }
  }
  if (name === 'worker') {
    return {
      name: 'worker',
      description: 'Bounded worker: executes one concrete task with file tools, constrained by the effective mode/permissions.',
      instructions:
        'You are a focused worker. Complete exactly the assigned task, verify your changes, and report what you did with file references. Stay within the granted tools.',
      tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'],
      disallowedTools: ['Bash'],
    }
  }
  throw new AgentDefinitionError('not-found', `no bundled agent role '${name}'`)
}

function parseFrontmatter(block: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const line of block.split('\n')) {
    const match = /^([a-zA-Z][a-zA-Z0-9]*):\s*(.*)$/.exec(line.trim())
    if (match === null) continue
    const rawValue = match[2]?.trim() ?? ''
    try {
      result[match[1] as string] = JSON.parse(rawValue) as unknown
    } catch {
      result[match[1] as string] = rawValue
    }
  }
  return result
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/** Workspace-scoped definition registry (bundled read-only + workspace files). */
export class AgentDefinitionService {
  constructor(private readonly home: string) {}

  private dir(workspaceId: string): string {
    return path.join(this.home, 'workspaces', workspaceId, 'agents')
  }

  private filePath(workspaceId: string, name: string): string {
    return path.join(this.dir(workspaceId), `${name}.md`)
  }

  async list(workspaceId: string): Promise<ResolvedAgentDefinition[]> {
    const rows: ResolvedAgentDefinition[] = BUNDLED_AGENT_ROLES.map((name) => ({
      definition: bundledDefinition(name),
      source: 'bundled' as const,
    }))
    let entries
    try {
      entries = await fs.readdir(this.dir(workspaceId), { withFileTypes: true })
    } catch {
      return rows
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const name = entry.name.slice(0, -3)
      if ((BUNDLED_AGENT_ROLES as readonly string[]).includes(name)) continue
      try {
        rows.push(await this.resolve(workspaceId, name))
      } catch {
        // Invalid files surface on resolve; the catalog skips them.
      }
    }
    return rows.sort((a, b) => a.definition.name.localeCompare(b.definition.name))
  }

  async resolve(workspaceId: string, name: string): Promise<ResolvedAgentDefinition> {
    if ((BUNDLED_AGENT_ROLES as readonly string[]).includes(name)) {
      return { definition: bundledDefinition(name), source: 'bundled' }
    }
    let raw: string
    try {
      raw = await fs.readFile(this.filePath(workspaceId, name), 'utf8')
    } catch {
      throw new AgentDefinitionError('not-found', `no agent definition '${name}'`)
    }
    return { definition: parseAgentDefinition(name, raw), source: 'workspace', hash: sha256(raw) }
  }

  /** Save with strict validation and optional external-edit conflict check. */
  async save(workspaceId: string, name: string, raw: string, expectedHash?: string): Promise<ResolvedAgentDefinition> {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) {
      throw new AgentDefinitionError('invalid', `agent name '${name}' must be kebab-case`)
    }
    if ((BUNDLED_AGENT_ROLES as readonly string[]).includes(name)) {
      throw new AgentDefinitionError('duplicate', `'${name}' is a bundled role; copy it to customize`)
    }
    parseAgentDefinition(name, raw) // validate before writing
    const file = this.filePath(workspaceId, name)
    await fs.mkdir(path.dirname(file), { recursive: true })
    const current = await fs.readFile(file, 'utf8').catch(() => undefined)
    if (current !== undefined && expectedHash !== undefined && sha256(current) !== expectedHash) {
      throw new AgentDefinitionError('conflict', `definition '${name}' changed externally; re-read before saving`)
    }
    await replaceFileAtomic(file, raw)
    return { definition: parseAgentDefinition(name, raw), source: 'workspace', hash: sha256(raw) }
  }

  async delete(workspaceId: string, name: string): Promise<void> {
    if ((BUNDLED_AGENT_ROLES as readonly string[]).includes(name)) {
      throw new AgentDefinitionError('duplicate', 'bundled roles cannot be deleted')
    }
    await fs.rm(this.filePath(workspaceId, name), { force: true })
  }
}
