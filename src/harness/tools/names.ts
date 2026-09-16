/**
 * Canonical Claude-style public tool names. The built-in capabilities were
 * historically lowercase; the public contract is the capitalized set, and
 * legacy names arriving from a model (or an old permission map) normalize
 * to canonical identity at the boundary — never as exposed duplicates.
 */
export const CANONICAL_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'] as const

export type CanonicalTool = (typeof CANONICAL_TOOLS)[number]

const LEGACY_MAP: Readonly<Record<string, CanonicalTool>> = {
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  glob: 'Glob',
  grep: 'Grep',
  bash: 'Bash',
}

/**
 * Normalize one tool name to its canonical identity. Canonical names pass
 * through; legacy lowercase names map up; unknown names return unchanged
 * so the registry's unknown-tool error stays truthful.
 */
export function canonicalToolName(name: string): string {
  return LEGACY_MAP[name.toLowerCase()] ?? name
}

/** Normalize a whole tool call (the durable log carries canonical names). */
export function canonicalCall<T extends { id: string; name: string; args: Record<string, unknown> }>(call: T): T {
  return call.name === canonicalToolName(call.name) ? call : { ...call, name: canonicalToolName(call.name) }
}

/** Normalize a permission map keyed by (possibly legacy) tool names. */
export function canonicalPolicy(policy: Readonly<Record<string, string>>): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [name, mode] of Object.entries(policy)) {
    normalized[canonicalToolName(name)] = mode
  }
  return normalized
}
