# The agent harness

The harness turns the kernel's mechanics into an agent runtime: a durable
session log, an LLM streaming seam, a turn/step driver, a guarded tool pipeline,
and an approval policy. Everything below is a plugin or a listener on the
kernel — the harness depends only on the kernel, never on the web host.

```
src/harness/
├── session/   Durable log: SessionEvent union, deriveMessages(), fork
├── llm/       Seam: provider registry + agent-facing stream, mock + DeepSeek
├── agent/     Turn/step driver: inbox, pre-step admission, turn-stopping
├── tools/     Registry + guarded pipeline: pre-execute -> run -> post-execute
└── approval/  Policy riding tools/pre-execute: allow | ask | deny
```

## Session log (`session/`)

### The durable vocabulary (`events.ts`)

A session is an **append-only log** of durable facts. The closed union of
events is the whole vocabulary — new durable facts extend this type, and every
switch over it ends in `assertNever`:

```
turn/start          opens a turn
user/message        a user input the model will see
step/start          opens one model request
assistant/chunk     a streamed delta (UI fidelity only — never model history)
assistant/message   the assembled assistant reply (+ optional toolCalls)
tool/call           the model requested a tool
tool/result         the tool answered (ok, output)
step/end            closes one model request
turn/end            closes the turn (reason: completed | rejected | empty | failed)
```

Every event is stamped with `seq` (monotonic, 1-based) and `timestamp`.

**`deriveMessages(events)`** projects model history from the log: `user/message`
→ user, `assistant/message` → assistant (with its tool calls), `tool/result` →
a tool message keyed by `callId`. Structural events and raw `assistant/chunk`
events are skipped. This function is the *only* way model context is built.

### `Session` (`session.ts`)

```ts
const session = kernel.ctx.sessions.create()
session.append({ type: 'user/message', turnId, content: 'hello' })
session.deriveMessages()        // ModelMessage[]
session.fork(boundarySeq?)      // child session with copied history, seq rebased
```

- `append()` is the **only** way state grows: it stamps the event, stores it,
  and broadcasts `session/event` (so observers/UI render from it).
- `fork()` copies events up to and including `boundarySeq` (all when omitted)
  into a new session with `seq` rebased from 1; copied history is not
  re-broadcast, the child's future appends are. This is the resume/experiment
  seam.

### `SessionsService` (`service.ts`)

Registers the `sessions` service: `create()`, `get(id)` (fails loud on an
unknown id), and `fork(source, boundarySeq?)`. Today the store is in memory;
persistence arrives in a later phase.

## LLM seam (`llm/`)

### Vocabulary (`types.ts`)

- `ModelMessage` — `system | user | assistant | tool`; assistant messages may
  carry `toolCalls`, tool messages carry `toolCallId`.
- `ToolCall` — `{ id, name, args }`; `args` is a JSON object validated at the
  model-JSON boundary.
- `ToolSchema` — the model-facing shape of one tool.
- `ModelRequest` — `{ model?, messages, tools? }`, projected from the log.
- `StreamEvent` — `{ type: 'delta', delta }` or `{ type: 'toolCalls', calls }`.

### The provider contract

```ts
interface LlmProvider {
  readonly name: string
  readonly models?: readonly string[]
  stream(request: ModelRequest): AsyncIterable<StreamEvent>
}
```

Providers are the only model-aware code. They never touch sessions or the loop —
the seam is the whole contract. Two providers ship:

- **`DeepSeekProvider`** (`deepseek.ts`) — streams `chat/completions` over SSE.
  Translates the internal vocabulary to the OpenAI-style wire format at the wire
  boundary, accumulates streamed `tool_calls` fragments into one `toolCalls`
  event, parses arguments as JSON, and skips `content: null` deltas emitted by
  reasoning-capable models while thinking.
- **`MockLlmProvider`** (`mock.ts`) — a deterministic scripted provider for tests
  and offline runs: each step is a text reply (streamed as word deltas) and/or a
  set of tool calls. The request is ignored; determinism is the point.

### `LlmService` (`service.ts`)

Registers the `llm` service:

- `register(provider)` — the registration is an **effect** (unwinds when the
  owning fiber unloads); the first provider becomes the active one.
- `use(name)` — switch providers; fails loud on an unknown name.
- `active()` — the active provider, or throws.
- `stream(request)` — the entry point. It dispatches the **`llm/stream`
  waterfall** whose default delegates to the active provider, so middleware can
  replace the request downstream or short-circuit with its own iterable. The
  chain result is normalized so consumers always receive an `AsyncIterable`.

## The turn/step driver (`agent/`)

### `Agent` (`agent.ts`)

One agent is bound to one durable session and runs the turn/step flow over an
inbox. A **step** is one model request plus the tools it calls; a **turn** is
zero or more steps — it opens before its first input is claimed and closes once
nothing is owed.

Input reaches the driver through one inbox:

- `send(content)` — queues a **user** message; wakes the driver.
- `inject(content)` — queues **injected context** that must reach the next
  admitted request *without* waking the driver; it waits until a user message
  arrives and is claimed alongside it.
- `run()` — drives turns until the inbox drains (only a `user` item opens a
  turn), then goes idle. Re-entrant calls are a no-op while running.

### The turn flow

```
turn/start
  claim inbox (injected context waits for a user message to wake the driver)
  -> agent/pre-step (waterfall)      reject | enter(contents)
     reject, or a first enter rewritten empty -> close the turn with no step
     step/start
     append admitted input as user/message
     derive model history from the log (+ tool schemas)
     agent/request (waterfall) -> llm/stream (waterfall) -> assistant/chunk*
     assistant/message (+toolCalls)
     tool/call* -> tools/pre-execute -> execute -> tools/post-execute -> tool/result*
     step/end
     tools ran -> they owe the model their results -> next step
  -> agent/turn-stopping (serial)
turn/end
```

Details worth knowing:

- **Unbounded tool continuation.** The turn keeps spending steps while tools owe
  the model their results; there is no step bound — the model decides when it is
  done (`toolCalls.length === 0` ends the loop).
- **`agent/pre-step`** (waterfall) admits a claim. `enter(contents)` runs a step
  with the (possibly rewritten) contents; `reject` closes the turn with reason
  `rejected`. A first `enter` rewritten to empty closes it with reason `empty`.
- **`agent/request`** (waterfall) sits between the log projection and the
  provider — the web host uses it to stamp the selected model onto every
  request; middleware may prepend a system message, etc.
- **`agent/turn-stopping`** (serial) runs *before* `turn/end` is appended, so
  observers see a settled step and no closing turn yet.
- **Failure closes the turn durably.** If a step throws, `closeOpenTurn()`
  appends `turn/end: failed` for the newest still-open turn so the log never has
  a dangling `turn/start`; the error still propagates to the caller.
- **No tools service mounted?** The loop still runs; tool calls fail as unknown
  tools (`no tools service mounted`).

### `AgentsService` (`service.ts`)

Registers the `agents` service: `create(session?)` binds an `Agent` to a fresh
session when none is given. Cross-service reads happen lazily at call time, so
mount order never matters.

### `agentScope` (`scope.ts`)

`agentScope.run({ sessionId }, fn)` — an `AsyncLocalStorage` populated while a
turn is in flight. Tool pipeline listeners (like the web approval bridge) read
it to attribute a tool call to the right session; the store is absent outside
any run. This is the miniature counterpart of the upstream initiator scope.

## Tool pipeline (`tools/`)

### Vocabulary (`types.ts`)

- `ToolDefinition` — `{ name, description, parameters, execute(args) }`;
  `execute` returns a plain string (success), or throws to fail through
  `ToolResult`.
- `ToolResult` — `{ ok, output }`; what one tool run answers.
- `PreExecuteDecision` — `{ kind: 'allow', call }` (optionally rewritten) or
  `{ kind: 'deny', reason }`.

### `ToolsService` (`service.ts`)

Registers the `tools` service:

- `register(tool)` — registration is an **effect** (unwinds on unload, so the
  schema leaves request assembly too); duplicate names fail loud.
- `schemas()` — every registered tool's schema, joined into request assembly.
- `execute(call)` — the guarded pipeline:

```
tools/pre-execute (waterfall)   policy + rewriting, or deny
   → allow ? tool.execute(args) : (deny reason becomes a failed result)
tools/post-execute (waterfall)  transform the result the model sees
→ ToolResult
```

An unknown tool, a **denied** call, or a **throwing** tool body all become a
failed `ToolResult` the model can see — never an exception into the loop. The
durable `tool/call` and `tool/result` events belong to the agent loop; this
method only decides and executes.

## Approval (`approval/policy.ts`)

`attachApproval(ctx, options)` attaches one `tools/pre-execute` listener with a
per-tool policy:

```ts
type ApprovalMode = 'allow' | 'ask' | 'deny'

interface ApprovalOptions {
  policy?: Readonly<Record<string, ApprovalMode>>
  defaultMode?: ApprovalMode            // default 'ask'
  askUser?: (call: ToolCall) => Promise<boolean>
}
```

- `allow` → `next()` (let the call through).
- `deny` → `{ kind: 'deny', reason }`.
- `ask` → consult `askUser`; **without an answerer the policy fails closed**
  (denies with a reason the model sees). Returning `true` allows, `false` denies.
- The listener is **owned by the calling fiber** — unloading that fiber removes
  the policy, so several scoped policies can coexist.

The typical policy (used by both bins and the web host) allows reads/globs/greps
and asks on writes/edits/bash. The headless bin prompts on stderr; the web host
rides `agentScope` to route the question to the right session's SSE stream.

## Reading further

- Turn-flow tests: `tests/harness/agent-loop.spec.ts` (durable event order,
  inbox semantics, the model-visible-means-logged invariant, fork/resume).
- Tools + approval tests: `tests/harness/agent-tools.spec.ts`, `tools.spec.ts`.
- Provider tests: `tests/harness/llm.spec.ts`; session tests:
  `tests/harness/session.spec.ts`.
