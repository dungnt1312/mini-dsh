import { promises as fs } from 'node:fs'
import path from 'node:path'
import { resolveGrantedPath } from '../capabilities/fs/tools.ts'

/**
 * Read-only project browsing for the web workbench. Every path is relative to
 * a registered project root and resolved with the same containment rules as
 * the file tools: lexical and realpath (symlink/junction) escapes and
 * application-internal storage are refused. Nothing here writes.
 */

/** Largest file body returned; longer files are cut and flagged `truncated`. */
export const MAX_FILE_BYTES = 1024 * 1024
/** Bytes sniffed for a NUL byte to classify a file as binary. */
const BINARY_SNIFF_BYTES = 8 * 1024

export interface ProjectEntry {
  readonly name: string
  /** Root-relative path with `/` separators. */
  readonly path: string
  readonly kind: 'dir' | 'file'
  readonly size?: number
}

export interface ProjectListing {
  readonly path: string
  readonly entries: readonly ProjectEntry[]
}

/** One search hit; `score` is higher for a closer match on the file name. */
export interface ProjectMatch {
  readonly name: string
  readonly path: string
  readonly score: number
}

export interface ProjectSearch {
  readonly query: string
  readonly matches: readonly ProjectMatch[]
  /** True when the walk stopped on its budget, so results may be incomplete. */
  readonly truncated: boolean
}

export interface ProjectFile {
  readonly path: string
  readonly size: number
  readonly binary: boolean
  readonly truncated: boolean
  /** UTF-8 text; empty for binary files. */
  readonly content: string
}

export class ProjectFileError extends Error {}

/** Normalize client input to a root-relative `/` path ('' is the root). */
function normalizeRelative(raw: string): string {
  const trimmed = raw.trim().replaceAll('\\', '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '')
  return trimmed === '.' ? '' : trimmed
}

async function resolve(root: string, raw: string, deniedRoots: readonly string[] | undefined): Promise<{ readonly abs: string; readonly rel: string }> {
  const rel = normalizeRelative(raw)
  if (path.isAbsolute(raw.trim()) || /^[a-zA-Z]:/.test(rel)) throw new ProjectFileError('path must be relative to the project root')
  try {
    const abs = await resolveGrantedPath(root, rel === '' ? '.' : rel, deniedRoots)
    return { abs, rel }
  } catch (error) {
    throw new ProjectFileError(error instanceof Error ? error.message : String(error))
  }
}

const byKindThenName = (a: ProjectEntry, b: ProjectEntry): number =>
  a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : a.name.toLowerCase().localeCompare(b.name.toLowerCase())

export async function listProjectEntries(root: string, raw: string, deniedRoots?: readonly string[]): Promise<ProjectListing> {
  const { abs, rel } = await resolve(root, raw, deniedRoots)
  const stat = await fs.stat(abs).catch(() => null)
  if (stat === null || !stat.isDirectory()) throw new ProjectFileError(`'${rel || '.'}' is not a directory in this project`)
  const dirents = await fs.readdir(abs, { withFileTypes: true })
  const entries: ProjectEntry[] = []
  for (const dirent of dirents) {
    const entryPath = rel === '' ? dirent.name : `${rel}/${dirent.name}`
    // Follow links only to classify them; opening one re-checks containment.
    const target = dirent.isSymbolicLink() ? await fs.stat(path.join(abs, dirent.name)).catch(() => null) : null
    if (dirent.isDirectory() || target?.isDirectory() === true) {
      entries.push({ name: dirent.name, path: entryPath, kind: 'dir' })
    } else if (dirent.isFile() || target?.isFile() === true) {
      const size = target?.size ?? (await fs.stat(path.join(abs, dirent.name)).catch(() => null))?.size
      entries.push({ name: dirent.name, path: entryPath, kind: 'file', ...(size !== undefined ? { size } : {}) })
    }
  }
  return { path: rel, entries: entries.sort(byKindThenName) }
}

/** Directory entries the walk may visit before it stops and reports `truncated`. */
export const MAX_SEARCH_ENTRIES = 20_000
/** Hard ceiling on returned matches, whatever the caller asks for. */
export const MAX_SEARCH_RESULTS = 50
/** Directories never walked: heavy or hidden trees nobody mentions by name. */
const SKIPPED_DIRS = new Set(['node_modules'])

/** Highest for a file name that starts with the query, lowest for a path hit. */
function score(relativePath: string, name: string, needle: string): number {
  if (needle === '') return 0
  const lowerName = name.toLowerCase()
  if (lowerName.startsWith(needle)) return 3
  if (lowerName.includes(needle)) return 2
  return relativePath.toLowerCase().includes(needle) ? 1 : -1
}

const byScoreThenPath = (a: ProjectMatch, b: ProjectMatch): number =>
  a.score !== b.score
    ? b.score - a.score
    : a.path.length !== b.path.length
      ? a.path.length - b.path.length
      : a.path.localeCompare(b.path)

/**
 * Bounded breadth-first file search under a project root, for the composer's
 * `@` mention picker. Names only — no file content is read. Symlinks are never
 * followed, hidden and `node_modules` trees are skipped, and the walk gives up
 * after {@link MAX_SEARCH_ENTRIES} entries rather than traversing forever. An
 * empty query lists the shallowest files, which makes a bare `@` useful.
 */
export async function searchProjectFiles(
  root: string,
  rawQuery: string,
  deniedRoots?: readonly string[],
  limit = 20,
): Promise<ProjectSearch> {
  const { abs } = await resolve(root, '', deniedRoots)
  const needle = rawQuery.trim().replaceAll('\\', '/').toLowerCase()
  const capped = Math.max(1, Math.min(Math.trunc(limit), MAX_SEARCH_RESULTS))
  const matches: ProjectMatch[] = []
  const queue: { readonly abs: string; readonly rel: string }[] = [{ abs, rel: '' }]
  let visited = 0
  let truncated = false

  while (queue.length > 0) {
    const folder = queue.shift()
    if (folder === undefined) break
    const dirents = await fs.readdir(folder.abs, { withFileTypes: true }).catch(() => [])
    for (const dirent of dirents) {
      if (visited >= MAX_SEARCH_ENTRIES) { truncated = true; break }
      visited += 1
      // A link can point anywhere; refusing to follow it keeps every reported
      // path lexically inside the root without a second containment check.
      if (dirent.isSymbolicLink() || dirent.name.startsWith('.')) continue
      const entryPath = folder.rel === '' ? dirent.name : `${folder.rel}/${dirent.name}`
      if (dirent.isDirectory()) {
        if (!SKIPPED_DIRS.has(dirent.name)) queue.push({ abs: path.join(folder.abs, dirent.name), rel: entryPath })
        continue
      }
      if (!dirent.isFile()) continue
      const hit = score(entryPath, dirent.name, needle)
      if (hit >= 0) matches.push({ name: dirent.name, path: entryPath, score: hit })
    }
    if (truncated) break
  }

  return { query: rawQuery.trim(), matches: matches.sort(byScoreThenPath).slice(0, capped), truncated }
}

export async function readProjectFile(root: string, raw: string, deniedRoots?: readonly string[]): Promise<ProjectFile> {
  const { abs, rel } = await resolve(root, raw, deniedRoots)
  const stat = await fs.stat(abs).catch(() => null)
  if (stat === null || !stat.isFile()) throw new ProjectFileError(`'${rel || '.'}' is not a file in this project`)
  const handle = await fs.open(abs, 'r')
  try {
    const length = Math.min(stat.size, MAX_FILE_BYTES)
    const buffer = Buffer.alloc(length)
    const { bytesRead } = length > 0 ? await handle.read(buffer, 0, length, 0) : { bytesRead: 0 }
    const body = buffer.subarray(0, bytesRead)
    const binary = body.subarray(0, BINARY_SNIFF_BYTES).includes(0)
    return {
      path: rel,
      size: stat.size,
      binary,
      truncated: stat.size > MAX_FILE_BYTES,
      content: binary ? '' : body.toString('utf8'),
    }
  } finally {
    await handle.close()
  }
}
