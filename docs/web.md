# The web host

The web host exposes the harness over HTTP. `createWebServer()` boots a fresh
kernel, mounts the harness services, registers the provider and tools, attaches
an approval policy whose answerer routes questions over SSE, and serves the
built React client.

```
src/web/server.ts   HTTP server: REST + SSE + approval bridge
web/                React client (stateless, renders from the event stream)
web-dist/           Vite build output (gitignored, produced by npm run build:web)
```

## The client is stateless by design

The browser client holds **no model state of its own**. The transcript is
projected from the durable session events streamed over SSE — a fresh connection
first receives a **snapshot** of the whole log, then live `session/event`
frames. Approval questions arrive on the same stream as `approval` envelopes,
and answers go back over one POST. This is the "render from `session/event`"
principle: the log is the single source of truth, and any client can rebuild the
UI from it at any time.

## Starting it

```sh
npm run build:web   # build the React client into web-dist/ (one time)
npm run web         # serve at http://127.0.0.1:3082 (default port)
```

The web bin (`src/bins/web.ts`) accepts:

| Flag | Meaning | Default |
|---|---|---|
| `--port N` | HTTP port | `3082` |
| `--root DIR` | default workspace root | `process.cwd()` |
| `--yolo` | allow every tool call (no approval questions) | off |

The server always boots even with no provider configured, so the Settings panel
can add one. `DEEPSEEK_API_KEY` seeds a `deepseek` entry on first boot; a blank
or absent key prints a hint pointing at the Settings UI. The scripted mock
provider is gone — without a usable provider, chat requests answer `400` until
one is configured.

## Provider configuration

Providers are stored as plain JSON in `~/.mini-dsh/providers.json`
(override with the `configFile` option). Each entry is one OpenAI
chat-completions compatible endpoint:

```json
[{
  "id": "deepseek",
  "name": "deepseek",
  "baseUrl": "https://api.deepseek.com",
  "apiKey": "sk-…",
  "models": ["deepseek-chat", "deepseek-reasoner"],
  "defaultModel": "deepseek-chat",
  "enabled": true
}]
```

Every endpoint speaks the standard `POST {baseUrl}/chat/completions` SSE wire
format (tool-call fragment accumulation, `reasoning_content` → thinking
deltas); DeepSeek is simply one such endpoint. API keys are masked when
serialized to the client (`keyMasked`), never returned raw.

## REST API

### `GET /api/meta`

Active provider/model pair, the default workspace, and the safely masked
provider list for the Settings panel.

```json
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "folder": "/workspace",
  "models": ["deepseek-chat", "deepseek-reasoner"],
  "providers": [{ "id": "deepseek", "name": "deepseek", "enabled": true, "keyMasked": "••••abcd", "models": ["deepseek-chat"] }]
}
```

### `PUT /api/model`

Select the active provider and model. The model selector rides the
**`agent/request` seam**: every step's request is stamped with the selected
model before the provider sees it.

```json
// body
{ "model": "deepseek-reasoner" }
```

`400` when the name is not in the provider's offered models.

### `PUT /api/folder`

Re-scope the workspace the filesystem/bash tools are confined to. The tools are
registered with **live accessors** (`() => state.folder`), so this just flips a
variable — no re-registration, and the change applies to the next tool call.

```json
// body
{ "path": "/some/directory" }
```

`400` when the path is empty, missing, or not a directory.

### `GET /api/providers`

List configured providers with masked keys: `[{ id, name, baseUrl, enabled, keyMasked, models }]`.

### `POST /api/providers`

Create a provider. Body: `{ name, baseUrl, apiKey, models? }`. `name`/`baseUrl`/`apiKey`
are required; `baseUrl` must be http(s). `201 { id, … }`.

### `PATCH /api/providers/:id`

Update fields: `{ name?, baseUrl?, apiKey?, enabled?, models?, defaultModel? }`.
Omitting `apiKey` keeps the stored secret. `404` on an unknown id.

### `DELETE /api/providers/:id`

Remove a provider. Deleting or disabling the active provider repoints the
active pair to the first remaining usable one. `404` on an unknown id.

### `POST /api/providers/:id/test`

Fire one buffered completion ping. `200 { ok: true }` or `502 { ok: false, error }`.

### `POST /api/providers/:id/sync`

`GET {baseUrl}/models` and store the result as the provider's model list
(accepts OpenAI `{ data: [{ id }] }` and bare arrays). `200 { ok: true, models }`.

### `GET /api/sessions`

List sessions: `[{ id, title, eventCount, folder }]`. `folder` is the
session-scoped workspace or `null` when the session inherits the server default.

### `POST /api/sessions`

Create a session and bind an agent to it. Optional `{ folder }` sets a
session-scoped workspace (must exist and be a directory). `201 { id, folder? }`.

### `PUT /api/sessions/:id/folder`

Set this session's workspace; `{ path: "" }` resets it to inherit the server
default. Tools resolve their root through the **ambient agent scope**, so two
sessions can work in different folders concurrently without cross-talk.
`200 { folder }` / `{ folder: null }` on reset.

### `POST /api/sessions/:id/messages`

Queue a user message and fire the agent loop.

```json
// body
{ "content": "hello" }
```

Returns `202 { queued: true }` immediately — the reply (and any failure, which
closes the turn durably) reaches the client through the SSE stream. `400` on an
empty content, `404` on an unknown session.

### `DELETE /api/sessions/:id`

Delete a session: it leaves the listing, its SSE streams end themselves with an
`error` envelope (`session deleted`), and later requests answer `404`.

```json
// response
{ "deleted": true }
```

### `PATCH /api/sessions/:id`

Rename a session with a custom title; an empty title resets to the derived one
(truncated at 80 chars, trimmed).

```json
// body
{ "title": "my favorite chat" }
```

```json
// response
{ "id": "...", "title": "my favorite chat" }
```

`400` on a non-string title, `404` on an unknown session.

### `POST /api/sessions/:id/stop`

Ask the in-flight turn to stop. The agent's chunk loop notices the abort between
stream events and closes the turn durably with `turn/end: { reason: "stopped" }`
— a result, not a failure.

Returns `202 { stopped: true }`; a no-op while idle. `404` on an unknown session.

### `POST /api/approvals/:id`

Answer a pending approval question.

```json
// body
{ "allow": true }
```

`200 { answered: true }`, or `404` if the approval was already answered
(answered approvals are removed from the pending map).

## The SSE stream

### `GET /api/sessions/:id/events`

Streams `text/event-stream` frames. Each frame is a `data:` line holding one
`WebEnvelope`:

```ts
type WebEnvelope =
  | { kind: 'snapshot', events: SessionEvent[] }     // full log replay on connect
  | { kind: 'session',  event: SessionEvent }         // one live durable event
  | { kind: 'approval', approvalId: string, call: ToolCall }  // a pending question
```

- After the initial snapshot, live events are relayed until the client
  disconnects; a 25 s heartbeat keeps proxies from dropping idle connections.
- Listeners are disposed on `close`, so a dropped browser tab never leaks
  registrations.
- The browser client (`web/lib/api.ts`) uses `EventSource` and reconnects on its
  own; the UI derives the connection state (`connecting` / `open` / `reconnecting`).
- Thinking-capable models stream `assistant/chunk` frames marked
  `"thinking": true`; the client renders them in a collapsible thinking panel
  and they never enter model history.

## The approval bridge

Approval questions must reach the *right* human. `attachApproval`'s `askUser`
reads the **ambient agent scope** (`agentScope`, an `AsyncLocalStorage`) that
`Agent.run()` populates while a turn is in flight:

```ts
askUser: (call) => new Promise<boolean>((resolve) => {
  const scope = agentScope.getStore()
  if (scope === undefined) { resolve(false); return }   // fail closed
  const approvalId = `approval-${++approvalCounter}`
  pending.set(approvalId, { sessionId: scope.sessionId, resolve })
  kernel.ctx.emit('web/approval', { sessionId: scope.sessionId, approvalId, call })
})
```

Each session's SSE stream filters `web/approval` by its own id, so **concurrent
sessions share one policy listener without cross-talk**. The default policy
allows `read`/`glob`/`grep` and asks on `write`/`edit`/`bash`; `--yolo` makes the
default mode `allow`.

## Static serving

`GET` requests outside `/api/` are served from `staticDir` (default: the repo's
`web-dist/`). Unknown non-API paths fall back to `index.html` so client-side
state stands up; if the client is not built, a `404` suggests
`npm run build:web`. Path traversal outside `staticDir` is rejected.

## Shutdown

`server.close()` forces every connection down first (SSE connections never drain
on their own — a browser holds its `EventSource` open indefinitely), then closes
the listener and stops the kernel. The web bin maps the first `SIGINT` to a
graceful close and a second to an immediate exit.

## The React client (`web/`)

| Path | Purpose |
|---|---|
| `main.tsx` | entry; fonts, toast host, styles |
| `App.tsx` | workspace shell wiring; owns *no* model state |
| `components/layout` | TopBar (brand, folder popover, provider chip, toggles), Sidebar, EnvPanel |
| `components/ui` | primitives: Button, IconButton, Chip, CodeChip, Badge, Panel, Kbd, TextInput, Select — token-driven, reused by every zone |
| `components/session` | per-session rows (two-line titles, hover rename/delete actions) |
| `components/chat` | Transcript parts (tool breadcrumb rows, approval cards), thinking panel |
| `components/composer` | control-center composer with inline model picker |
| `components/common` | extended line-icon set, copy button, modal confirm, spinner, toasts |
| `hooks/` | SSE subscription, auto-scroll, hotkeys |
| `lib/api.ts` | REST calls + `EventSource` subscription |
| `lib/config.ts` | `SHOW_SLOTS` — dashed future-view placeholders (default off) |
| `lib/types.ts` | client-side mirror of the wire shapes |
| `lib/project.ts` | `projectItems()` + `isTurnRunning()` — the UI's own `deriveMessages()` |
| `lib/format.ts` | time / duration / argument summaries / `pathBasename` / `toolTarget` |
| `Markdown.tsx` | Markdown rendering + hljs syntax highlighting |

`projectItems(events)` projects render items from the session event stream:
streaming chunks accumulate into the in-flight assistant item (thinking chunks
fill a collapsible thinking panel), `assistant/message` finalizes it, each
`tool/result` answers the call its `callId` names (recording a duration), and
non-`completed` turn ends surface as status lines. `isTurnRunning(events)`
derives the activity state from the log — the Stop button and streaming spinner
read it. The app auto-creates a session on load, offers suggested first
messages, a model picker inside the composer (mirrored in the Environment
panel), a workspace-folder popover in the top bar, session
rename/delete/search, a stop button while a turn runs, and allow/deny cards
for pending approvals. Ctrl/Cmd+N creates a session; Ctrl/Cmd+K opens the
sidebar and focuses its search field. Below 1100px the sidebar becomes an
overlay drawer; below 1280px the Environment panel hides and reopens as an
overlay from its top-bar toggle.

## Reading further

- Full API behavior tests: `tests/web/server.spec.ts` (meta, model/folder
  switching, session lifecycle, rename and delete, stopping a running turn,
  thinking-chunk streaming, snapshot+live streaming, the approval round-trip,
  denial surfacing, duplicate-answer 404s, static fallback).
