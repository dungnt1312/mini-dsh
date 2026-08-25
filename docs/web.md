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
| `--root DIR` | initial workspace root for the tools | `process.cwd()` |
| `--mock` | force the scripted mock provider | off |
| `--yolo` | allow every tool call (no approval questions) | off |

Without `--mock` and without `DEEPSEEK_API_KEY`, the mock provider is used and a
warning is printed. The bin always announces the active provider, so seeing
"mock" when a key was expected points at configuration, not at the API.

## REST API

### `GET /api/meta`

Server state: provider name, active model, workspace folder, and the models the
provider offers.

```json
{ "provider": "deepseek", "model": "deepseek-chat", "folder": "/workspace", "models": ["deepseek-chat"] }
```

### `PUT /api/model`

Switch the active model. The model selector rides the **`agent/request` seam**:
every step's request is stamped with the selected model before the provider sees
it.

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

### `GET /api/sessions`

List sessions: `[{ id, title, eventCount }]`. The title is derived from the
first user message (truncated at 48 chars), or `"new session"`.

### `POST /api/sessions`

Create a session and bind an agent to it. `201 { id }`.

### `POST /api/sessions/:id/messages`

Queue a user message and fire the agent loop.

```json
// body
{ "content": "hello" }
```

Returns `202 { queued: true }` immediately — the reply (and any failure, which
closes the turn durably) reaches the client through the SSE stream. `400` on an
empty content, `404` on an unknown session.

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
- The browser client (`web/api.ts`) uses `EventSource` and reconnects on its own;
  the UI derives the connection state (`connecting` / `open` / `reconnecting`).

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

| File | Purpose |
|---|---|
| `main.tsx` | entry; imports bundled fonts (no CDN dependency) |
| `App.tsx` | session sidebar + chat pane; holds *no* model state |
| `api.ts` | REST calls + `EventSource` subscription |
| `types.ts` | client-side mirror of the wire shapes |
| `project.ts` | `projectItems()` — the UI's own `deriveMessages()` |
| `Transcript.tsx` | transcript projection, tool cards, approval banner |
| `Markdown.tsx` | Markdown rendering for assistant replies |

`projectItems(events)` projects render items from the session event stream:
streaming chunks accumulate into the in-flight assistant item, `assistant/message`
finalizes it, each `tool/result` answers the call its `callId` names, and
non-`completed` turn ends surface as status lines. The app auto-creates a
session on load, offers suggested first messages, a model selector, a folder
switcher, and allow/deny buttons for pending approvals.

## Reading further

- Full API behavior tests: `tests/web/server.spec.ts` (meta, model/folder
  switching, session lifecycle, snapshot+live streaming, the approval round-trip,
  denial surfacing, duplicate-answer 404s, static fallback).
