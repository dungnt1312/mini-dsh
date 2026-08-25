# Capabilities: the built-in tools

Capabilities are just tools registered into `ctx.tools`. This project ships two
families: a root-confined filesystem toolset and a bash shell tool. Both live in
`src/capabilities/` and depend only on the harness tool vocabulary.

```
src/capabilities/
├── fs/        read/write/edit/glob/grep tools, root-confined
└── shell/     bash tool: timeout, process-group kill, exit-code report
```

## Filesystem tools (`capabilities/fs/tools.ts`)

`fsTools(root)` returns all five tools bound to one workspace root. The root may
be a fixed path **or a live accessor** (`() => string`), so the tools follow a
folder switch without being re-registered — the web host uses the accessor form
for its `PUT /api/folder` route.

### Root confinement

Every path is resolved with `resolveWithin(root, target)`, which rejects any
target that escapes the workspace root:

```ts
export function resolveWithin(root: string, target: string): string {
  const absRoot = path.resolve(root)
  const abs = path.resolve(absRoot, target)
  if (abs !== absRoot && !abs.startsWith(`${absRoot}${path.sep}`)) {
    throw new Error(`path '${target}' escapes the workspace root`)
  }
  return abs
}
```

Escaping is a **tool failure**, not a silent redirect.

### The five tools

| Tool | What it does | Constraints |
|---|---|---|
| `read` | read a text file, return its content | capped at 1 MB |
| `write` | create or overwrite a file, creating parent directories | — |
| `edit` | replace the **first** occurrence of `old` with `new` | fails if `old` not found |
| `glob` | list workspace files matching a `*` / `**` pattern | 100 matches max |
| `grep` | regex search across workspace files, `path:line: text` | 250 matches max |

Tool outputs are truncated to a 60 KB output cap with a `… [truncated N chars]`
marker. Argument errors throw inside `execute` and surface as failed
`ToolResult`s in the pipeline.

## Shell tool (`capabilities/shell/bash.ts`)

`bashTool(options?)` runs one command per call:

- **Command**: `/bin/bash -lc <command>` (login shell, command string).
- **Output**: stdout and stderr are captured **together** (interleaved by
  arrival), truncated to a 60 KB output cap.
- **Exit code**: the resolved string always ends with `\n[exit code: N]` (or
  `null` when the process was killed without a code) — the model sees the code.
- **Timeout**: default 30 s; a per-call `timeoutMs` argument is clamped to the
  tool's configured maximum. On timeout the whole **process group** is killed.

### Why the process group

```ts
const child = spawn('/bin/bash', ['-lc', command], { cwd: cwd(), detached: true })
```

The child is **detached** so the timeout can `process.kill(-child.pid,
'SIGKILL')` the entire process group: killing only bash would leave grandchildren
(e.g. a `sleep` inside the command) holding the stdio pipes open and stall the
`close` event. Killing the group guarantees the promise settles.

### Options

```ts
interface BashToolOptions {
  timeoutMs?: number                          // default 30_000
  cwd?: string | (() => string)               // default process.cwd(); accessor form follows folder switches
}
```

Like the filesystem root, `cwd` may be a live accessor — the web host uses this
so the bash tool runs in the selected workspace folder.

## Where they are mounted

- **Headless CLI** (`src/bins/headless.ts`): `fsTools(root)` for every tool plus
  `bashTool()`.
- **Web host** (`src/web/server.ts`): `fsTools(() => state.folder)` plus
  `bashTool({ cwd: () => state.folder })`, so switching the workspace re-scopes
  both capabilities at runtime.

## Reading further

- Filesystem tool tests: `tests/capabilities/fs-tools.spec.ts`.
- Bash tool tests: `tests/capabilities/bash.spec.ts`.
