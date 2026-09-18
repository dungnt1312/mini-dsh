import type { IconName } from '../components/common/Icon.tsx'

/** Icon and quiet color tint for one file, from the app's semantic palette. */
export interface FileIconStyle {
  readonly name: IconName
  readonly className: string
}

/** Files whose full name, not extension, picks the icon. */
const NAMED: Readonly<Record<string, IconName>> = {
  dockerfile: 'fileCode',
  makefile: 'fileCode',
  '.gitignore': 'gitBranch',
  '.gitattributes': 'gitBranch',
}

const BY_EXTENSION: Readonly<Record<string, IconName>> = {
  ts: 'fileCode', tsx: 'fileCode', js: 'fileCode', jsx: 'fileCode', mjs: 'fileCode', cjs: 'fileCode',
  py: 'fileCode', rb: 'fileCode', go: 'fileCode', rs: 'fileCode', java: 'fileCode', kt: 'fileCode',
  c: 'fileCode', h: 'fileCode', cpp: 'fileCode', hpp: 'fileCode', cc: 'fileCode', cs: 'fileCode',
  php: 'fileCode', swift: 'fileCode', scala: 'fileCode', vue: 'fileCode', svelte: 'fileCode',
  astro: 'fileCode', html: 'fileCode', htm: 'fileCode', css: 'fileCode', scss: 'fileCode',
  sass: 'fileCode', less: 'fileCode', sql: 'fileCode', graphql: 'fileCode', gql: 'fileCode',
  proto: 'fileCode', sh: 'fileCode', bash: 'fileCode', zsh: 'fileCode', fish: 'fileCode',
  ps1: 'fileCode', bat: 'fileCode', cmd: 'fileCode', xml: 'fileCode',
  json: 'fileJson', jsonc: 'fileJson', json5: 'fileJson',
  toml: 'fileCog', yaml: 'fileCog', yml: 'fileCog', ini: 'fileCog', cfg: 'fileCog', conf: 'fileCog', lock: 'fileCog',
  png: 'fileImage', jpg: 'fileImage', jpeg: 'fileImage', gif: 'fileImage', webp: 'fileImage',
  svg: 'fileImage', ico: 'fileImage', avif: 'fileImage', bmp: 'fileImage',
  mp3: 'fileAudio', wav: 'fileAudio', ogg: 'fileAudio', flac: 'fileAudio', m4a: 'fileAudio', aac: 'fileAudio',
  mp4: 'fileVideo', mov: 'fileVideo', webm: 'fileVideo', avi: 'fileVideo', mkv: 'fileVideo', m4v: 'fileVideo',
  zip: 'fileArchive', tar: 'fileArchive', gz: 'fileArchive', tgz: 'fileArchive', bz2: 'fileArchive',
  xz: 'fileArchive', rar: 'fileArchive', '7z': 'fileArchive', jar: 'fileArchive', whl: 'fileArchive',
  csv: 'fileSpreadsheet', tsv: 'fileSpreadsheet', xlsx: 'fileSpreadsheet', xls: 'fileSpreadsheet',
  xlsm: 'fileSpreadsheet', ods: 'fileSpreadsheet',
}

const CLASS_BY_ICON: Readonly<Partial<Record<IconName, string>>> = {
  fileCode: 'text-link',
  fileJson: 'text-warn',
  fileCog: 'text-fg-muted',
  fileImage: 'text-ok',
  fileAudio: 'text-bad',
  fileVideo: 'text-bad',
  fileArchive: 'text-warn',
  fileSpreadsheet: 'text-ok',
  gitBranch: 'text-fg-muted',
}

/** Pick the file-type icon for a path; unknown extensions fall back to `fileText`. */
export function fileIcon(path: string): IconName {
  const name = path.split(/[\\/]/).pop()?.toLowerCase() ?? ''
  if (name.startsWith('.env')) return 'fileCog'
  const named = NAMED[name]
  if (named !== undefined) return named
  const dot = name.lastIndexOf('.')
  if (dot > 0) {
    const icon = BY_EXTENSION[name.slice(dot + 1)]
    if (icon !== undefined) return icon
  }
  return 'fileText'
}

/** Icon plus its tint class; untinted types stay at `fg-faint`. */
export function fileStyle(path: string): FileIconStyle {
  const name = fileIcon(path)
  return { name, className: CLASS_BY_ICON[name] ?? 'text-fg-faint' }
}
