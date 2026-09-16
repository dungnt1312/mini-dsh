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

## Workspace interaction

- An empty workspace offers **New conversation**. Until a session is selected, its connection state is idle, not connecting.
- Project binding is fixed when creating a session. Project registration is in Workspace settings, reached through New Conversation → Manage projects. Unbound sessions explain that file/shell work needs a project-bound new session.
- Modes load with the initial workspace metadata and on workspace switches. Navigation generations and request tokens reject obsolete initial loads, mutation completions, lists and model/mode refreshes, including workspace A → B → A transitions.
- Drafts, pending-send flags and send errors are keyed by workspace/session in memory. A submitted draft clears only after the server accepts the POST and only if its edit revision is unchanged. Failures remain inline with details and provider guidance; automatic resend is deliberately avoided because a lost response does not prove the request was rejected.
- Approval questions are deduplicated and reconciled against durable request, decision, tool-result and turn-end events on replay, and removed after a successful answer.
- Model menus offer search for larger lists, provider grouping, keyboard navigation and full wrapping option labels. Popups portal into document.body with viewport-clamped positioning and scroll/resize updates; Escape belongs to the popup before a drawer or modal.
- Both rails honor their toggles on desktop; the sidebar starts open at widths above 1024px. Narrow-screen rails have scrims, close controls, Escape handling and keyboard focus boundaries that subscribe to media-query changes. Settings tabs use arrow/Home/End navigation, roving tabindex and linked tabpanels. Provider edits survive tab changes; close/provider changes request discard confirmation, including pending model text.
- Shared 12/13/14/16px typography tokens apply across shell, transcript, primitives and settings. Expanded tools show all arguments and output; transcript identities are explicit.

### Production task workflows

- **New conversation** and Ctrl/Cmd+N open a scope dialog; neither creates a session immediately. Choose an existing project or explicitly choose **Chat only**. Create stays disabled until a valid choice is made, locks during submission, and reports errors without silently falling back to an unbound session. Cancel leaves the existing conversation unchanged.
- The app bar owns workspace selection. The sidebar groups project filtering, conversation history and search. History filters only affect navigation, never a session's immutable execution project.
- The inspector starts closed at every viewport size. Context manifests load only while it is open. The main pane shows durable task lifecycle and separately explains event-stream connection loss. Queued/being-submitted inputs show preparing; open turns show running or waiting approval; terminal reasons remain visible. Partial assistant chunks stop appearing live at turn end.
- Composer context shows the fixed project path or an explicit no-project warning with a new-conversation CTA. “Chat-only” describes absence of a project, not an automatic switch to Chat mode or a promise to disable every tool. Model/mode controls apply to the workspace at the next request/tool gate. Expand scope details to inspect the reported policy; mode and server restrictions still apply.
- Approval review exposes tool name, target, full escaped JSON arguments, call ID and conversation project. **Allow once** and **Deny** answer only that pending request, not a remembered grant. Buttons lock while submitting; failed submissions remain visible. Durable decisions remain in transcript history, including expiry/invalidation. No UI option widens backend permission scope.
- Failed, cancelled, limited and interrupted work offers inspection-first recovery guidance. Unknown recovered tool results are explicitly called out. There is no automatic retry or replay control: inspect actual effects, then submit new instructions limited to remaining work.
- Settings distinguish global provider storage from workspace model activation and workspace services. Agent definitions are workspace-scoped; child listings are current-session-scoped. Saving configuration is not evidence of connectivity; provider connection checks use saved configuration rather than unsaved drafts.
- Automated workflow regressions cover scope validation, creation markup, durable lifecycle, stopped partial chunks, recovery guidance and approval arguments/decision rendering. Fixture-backed Chromium interactions, mobile layout, keyboard focus and all settings sections pass. Real-backend end-to-end workflows, native zoom and screen-reader acceptance remain separate gates.

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
serialized to the client (`keyMasked`), never returned raw. When the active
workspace carries a thinking level, the adapter adds the model's documented
reasoning control fields to the request body (see the model catalog section
below) — never a generic field for an undocumented model.

`apiKey` may be empty: local gateways often authenticate by other means, so a
keyless entry stays selectable and the `Authorization` header is omitted rather
than sent as an empty `Bearer`. Only `enabled: false` takes a provider out of
the picker.

## REST API

### Workspace-scoped routes (the primary surface)

Since G2, sessions are born into a workspace, and every durable resource is
addressed under `/api/workspaces/:wid/...`. Unknown workspaces fail closed
(`404`); ownership is re-checked per request, so a foreign id never leaks
data, and a workspace switch never changes a running turn's ownership or
tool root. The families, at a glance:

| Route family | Purpose |
|---|---|
| `GET/POST /api/workspaces`, `PATCH/DELETE /api/workspaces/:wid` | workspace list (with running/approval badges), create, rename, archive/restore, delete (empty only) |
| `…/:wid/sessions`, `…/:wid/sessions/:id` (+ `/events` SSE, `/messages`, `/stop`) | session lifecycle, streaming, queued messages, stop |
| `…/:wid/sessions/:id/manifest`, `…/compact` | per-request context manifest; manual compaction into an immutable checkpoint |
| `PUT …/:wid/model`, `PUT …/:wid/thinking`, `PUT …/:wid/policy`, `PUT …/:wid/mode`, `GET …/:wid/meta` | the live controls (model, thinking level, policy, mode) and workspace meta, all workspace-local |
| `…/:wid/projects` (+ `/projects/:pid`) | project binding: working folder, ownership, overlap rejection |
| `…/:wid/agents/:name` (GET resolve / DELETE), `POST …/:wid/agents/:name` | agent definitions; POST spawns a bounded child with a task packet |
| `GET …/:wid/agents/children?root=…`, `GET/DELETE …/:wid/children/:childId` (+ `/cancel`) | child list / wait-result / cancel |
| `…/:wid/mcp` (+ `/:server`, `/:server/(enable\|disable\|reconnect)`, `/mcp/import`) | MCP server lifecycle and imports with provenance |
| `…/:wid/hooks`, `…/:wid/secrets(/:key)` | hook bindings; encrypted secret management (masked responses) |

Approval answering stays transport-global at `POST /api/approvals/:id`
(below) — approval ids are unguessable capabilities, not session-scoped
sequences.

### `GET /api/fs/dirs`

Directory browser backing the client's folder picker. A browser never
reveals a chosen folder's absolute path, so the web host lists **directory
names only** (never file contents) and the picker navigates real folders:
`?path=` (default: the server user's home) returns the canonical path, its
parent (`null` at a filesystem root; on Windows a drive root also lists the
machine's other drives as rows), and the case-insensitively sorted child
directories — symlinked folders included, broken links skipped.
Non-directories and unreadable paths answer `400`.

The unscoped routes documented below (`/api/meta`, `/api/model`,
`/api/folder`, `/api/sessions…`) are **legacy**: they exist only for
memory-mode hosts without the workspace model and resolve through one
implicit workspace. New clients use the workspace-scoped families.

### Legacy: `GET /api/meta`

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

### Legacy: `PUT /api/model`

Select the active provider and model. The model selector rides the
**`agent/request` seam**: every step's request is stamped with the selected
model before the provider sees it.

```json
// body
{ "model": "deepseek-reasoner" }
```

`400` when the name is not in the provider's offered models.

### Legacy: `PUT /api/folder`

Re-scope the workspace the filesystem/bash tools are confined to. The tools are
registered with **live accessors** (`() => state.folder`), so this just flips a
variable — no re-registration, and the change applies to the next tool call.

```json
// body
{ "path": "/some/directory" }
```

`400` when the path is empty, missing, or not a directory.

### `GET /api/providers`

List configured providers with masked keys: `[{ id, name, baseUrl, enabled, keyMasked, models, defaultModel?, modelSettings? }]`.
`modelSettings` carries per-model operator overrides —
`{ [model]: { contextTokens?, vision?, thinkingLevel? } }` — as edited in the
Settings provider panel (legacy `contextLimits` files migrate into it on load).

### `POST /api/providers`

Create a provider. Body: `{ name, baseUrl, apiKey?, models?, modelSettings? }`. `name` and
`baseUrl` are required and `baseUrl` must be http(s); `apiKey` is optional
because local gateways often accept no credential (the `Authorization` header
is then omitted entirely rather than sent as an empty `Bearer`). `201 { id, … }`.

### `PATCH /api/providers/:id`

Update fields: `{ name?, baseUrl?, apiKey?, enabled?, models?, defaultModel?, modelSettings? }`.
Omitting `apiKey` keeps the stored secret. A present `modelSettings` **replaces
the whole map** (an empty object clears every override). `404` on an unknown id.

### `DELETE /api/providers/:id`

Remove a provider. Deleting or disabling the active provider repoints the
active pair to the first remaining usable one. `404` on an unknown id.

### `POST /api/providers/:id/test`

Fire one buffered completion ping. `200 { ok: true }` or `502 { ok: false, error }`.

### `POST /api/providers/:id/sync`

`GET {baseUrl}/models` and store the result as the provider's model list
(accepts OpenAI `{ data: [{ id }] }` and bare arrays). `200 { ok: true, models }`.

### Model catalog, context budget, and thinking level

The shared catalog (`src/harness/llm/model-catalog.ts`, bundled by the web
client too) holds verified capabilities for exact model IDs — context window,
vision, reasoning controls — plus narrowly-scoped family patterns for dated
variants and gateway namespaces (`openai/gpt-5.6`).

**Context budget** resolves per request: an operator `contextTokens` override
makes the budget *verified*; otherwise the catalog's documented window
(exact ID → known family → **256k default**) applies as a labeled estimate.
`GET …/:wid/meta` never guesses — unknown models fall back to the default.

**Thinking level** is a workspace live control (`PUT …/:wid/thinking`,
body `{ "level": "off|minimal|low|medium|high|xhigh|max" | null }`; `null`
returns to the model's configured default; a per-model `thinkingLevel`
default may be set in `modelSettings`). The level rides the request as
host-stamped metadata and the completions adapter translates it into the
model's **documented** fields only (`reasoning_effort`, `thinking:
{type}`, `enable_thinking`, extended-thinking `budget_tokens` for gateway
Claude aliases) — unsupported pairs send nothing rather than risk a 400.


### Legacy: `GET /api/sessions`

List sessions: `[{ id, title, eventCount, folder }]`. `folder` is the
session-scoped workspace or `null` when the session inherits the server default.

### Legacy: `POST /api/sessions`

Create a session and bind an agent to it. Optional `{ folder }` sets a
session-scoped workspace (must exist and be a directory). `201 { id, folder? }`.

### Legacy: `PUT /api/sessions/:id/folder`

Set this session's workspace; `{ path: "" }` resets it to inherit the server
default. Tools resolve their root through the **ambient agent scope**, so two
sessions can work in different folders concurrently without cross-talk.
`200 { folder }` / `{ folder: null }` on reset.

### Legacy: `POST /api/sessions/:id/messages`

Queue a user message and fire the agent loop.

```json
// body
{ "content": "hello" }
```

Returns `202 { queued: true }` immediately — the reply (and any failure, which
closes the turn durably) reaches the client through the SSE stream. `400` on an
empty content, `404` on an unknown session.

### Legacy: `DELETE /api/sessions/:id`

Delete a session: it leaves the listing, its SSE streams end themselves with an
`error` envelope (`session deleted`), and later requests answer `404`.

```json
// response
{ "deleted": true }
```

### Legacy: `PATCH /api/sessions/:id`

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

### Legacy: `POST /api/sessions/:id/stop`

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

### `GET /api/sessions/:id/events` (legacy scope; workspace hosts use `…/:wid/sessions/:id/events`)

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
  const approvalId = `approval-${randomUUID()}`          // unguessable capability
  pending.set(approvalId, { sessionId: scope.sessionId, call, resolve })
  kernel.ctx.emit('web/approval', { sessionId: scope.sessionId, approvalId, call })
})
```

Each session's SSE stream filters `web/approval` by its own id, so **concurrent
sessions share one policy listener without cross-talk**. The default policy
allows `Read`/`Glob`/`Grep` and asks on `Write`/`Edit`/`Bash` (canonical
identities); `--yolo` makes the default mode `allow`.

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
| `main.tsx` | entry, bundled fonts, providers, and the three production CSS imports |
| `App.tsx` | routing, server-backed state, durable projections, and shell composition |
| `components/layout` | `WorkbenchShell`, TopBar, Sidebar, `InspectorPanel`, and `ContextPanel` |
| `components/artifacts` | pure existing-event artifact projection and read-only Artifacts panel |
| `components/ui` | Tailwind/CVA primitives with Radix interaction mechanics |
| `components/session` | project-grouped and unbound conversation navigation |
| `components/chat` | durable Transcript, status/approval surfaces, and elevated workbench presentation |
| `components/composer` | fixed center-region composer dock and request controls |
| `components/settings` | full-height responsive Settings and workspace management panels |
| `components/common` | icons, copy, confirmation, error, spinner, and toast surfaces |
| `hooks/` | SSE subscription, drawers, local preferences, and panel resizing |
| `lib/api.ts` | unchanged REST calls plus `EventSource` subscription |
| `lib/types.ts` | client mirror of existing wire shapes |
| `lib/project.ts` | durable `projectItems()` and turn-state derivation |
| `styles/app.css` | Tailwind Warm Studio theme, root rules, and consolidated component selector authority |
| `styles/markdown.css` | Markdown and highlight.js selectors |
| `styles/motion.css` | keyframes, scrollbar styling, and reduced-motion behavior |

`projectItems(events)` remains the transcript contract and is computed once per
event-array revision. The elevated workbench selects an existing projected tool or
delegation item; it does not create another durable item. `projectArtifacts(events)`
is a separate pure projection over existing tool calls/results. It shows only exact
path/resource references, command records, and recorded tool output. It does not
fetch file details or claim file existence, file content, diffs, MIME type,
repository ownership, or rerun capability. Delegation file references are absent
from this MVP because the durable stream does not expose them.

The Warm Studio shell has a 280px left panel (232–420 range) docked at 1024px and
above, and a 336px right panel (280–520 range) docked at 1280px and above. Below
those thresholds the panels use focus-managed Radix Dialog drawers. Width,
collapse, and active inspector tab are browser-local preferences under
`mini-dsh.workbench.v1`; they are not server settings. The composer is fixed to
the measured center region and transcript clearance follows its height.

Context manifest loading is lazy and uses the existing endpoint only while the
right panel is open, Context is selected, a valid conversation exists, and the
turn is settled. Artifacts causes no request. Reconnect presentation remains
separate from durable running truth: drafts stay editable, Stop remains available,
and the client does not automatically resend or replay.

Settings remains a client for the existing provider/workspace APIs. Desktop uses
grouped tabs and narrow mobile uses a section selector; Providers, Projects,
Skills, Memory, Agents, MCP, Hooks, and Secrets remain reachable. Dirty provider
confirmation, blank-key omission, destructive confirmations, whole-document Hooks
validation/save, and explicit Skills/Memory conflict choices are retained.

Required client verification runs at 320, 375, 768, 1024, 1440, and 1920px:

```sh
npm test -- --maxWorkers=1 --no-file-parallelism
npm run typecheck
npm run build:web
npm run test:browser
```

Browser suites use intercepted, fail-closed fixtures and do not mutate real
settings. Deterministic visual evidence is written to
`artifacts/product-ui/warm-studio/`; it is not an approved visual baseline.


## Reading further

- Full API behavior tests: `tests/web/server.spec.ts` (meta, model/folder
  switching, session lifecycle, rename and delete, stopping a running turn,
  thinking-chunk streaming, snapshot+live streaming, the approval round-trip,
  denial surfacing, duplicate-answer 404s, static fallback).


## English workbench UI

The web client now uses an English workbench shell. Switch workspaces in the app bar; filter registered projects and conversation history in navigation. Start **New conversation**, select a project or **Chat only**, and use **Manage projects** to open workspace project registration. Project registration and rename use scoped server APIs. Confirmed removal never deletes the folder and returns HTTP 409 while any conversation is bound; it never detaches conversations.

Model and mode controls live in the composer. The optional Context inspector is read-only and closed by default. Settings is full-height and retains Providers, Agents, MCP, Hooks and Secrets, with explicit global/workspace/current-conversation scope. User text, names, paths, IDs, tool output and imported content are never translated.

Workspace session listings may include optional `createdAt`/`updatedAt` from existing event-backed summaries. Empty conversations omit these fields; clients must not invent dates. No existing request or approval wire format changed.

See [design guidelines](design-guidelines.md) for geometry, ownership and safety rules. Run `npm run test:browser` for fixture-backed Chromium interactions and screenshots. Visual signoff, native 200% zoom, screen-reader review and long-history performance acceptance remain pending; generated screenshots are not approved baselines.

Agent catalog: `GET /api/workspaces/:id/agents` returns bundled and workspace definitions using the existing definition service. Imported definitions can be selected, inspected, spawned and explicitly deleted. Bundled-role deletion remains prohibited. Management panels reset on workspace/root changes and invalidate stale async state feedback. New providers may omit API keys for keyless endpoints.
