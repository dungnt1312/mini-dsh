# mini-dsh

A miniature TypeScript replica of the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) architecture, built for learning: the same plugin-runtime ideas — everything is a plugin, typed events with five dispatch modes, reversible effects, dependency-driven lifecycle — reimplemented from scratch on a kernel small enough to read in an afternoon.

The reference architecture lives in the DeepSeek Harness repository (`docs/architecture.md`, `docs/cordis-primer.md`, `docs/cordis-tutorial/`). This project rebuilds those ideas without importing them; the test suite reproduces the Cordis tutorial chapters against this kernel.

## Status

- **Phase 0–1 (done)** — mini-Cordis kernel: event bus with all five dispatch modes, fiber lifecycle with reverse-order effect disposal, service store with `inject` dependency tracking, and a YAML composition loader. 37 tests reproduce tutorial chapters 2–4 on this kernel.
- **Phase 2 (done)** — agent core: durable session log (event sourcing, `deriveMessages()`, fork), LLM streaming seam (`agent/request` + `llm/stream` waterfalls, mock + DeepSeek SSE providers), and the turn/step driver (inbox with `send`/`inject`, `agent/pre-step`, `agent/turn-stopping`). Headless CLI chats multi-turn.
- **Phase 3 (done)** — tool pipeline: `ToolsService` with the guarded `tools/pre-execute` → execute → `tools/post-execute` path, approval policy (allow/ask/deny riding pre-execute), filesystem tools (`read`/`write`/`edit`/`glob`/`grep`, root-confined) and `bash` (timeout, process-group kill); the loop spends another step while tools owe the model their results, with a max-steps guard. Verified end-to-end against the real DeepSeek API.
- **Phase 4 (done)** — web UI: `createWebServer` (REST + SSE) with the React client (`web/`, built by Vite). The client renders purely from the session event stream — snapshot replay plus live `session/event` frames — and approval questions ride the same stream, answered over `POST /api/approvals/:id`; routing to the right session goes through the ambient agent scope (`AsyncLocalStorage`), so concurrent sessions share one policy listener without cross-talk. A failed step closes its turn durably (`turn/end: failed`). 97 tests cover kernel, harness, capabilities, and the web API.
- Phase 5 — dynamic plugins: patch layers, hot (un)load, provider swap restarting dependents.
- Phase 6 — polish: SQLite persistence, compaction, an `architecture.md` for this project.

## Getting started

```sh
npm install
npm test         # vitest run
npm run typecheck
```

## Chat

```sh
npm run chat           # REPL; uses DeepSeek when DEEPSEEK_API_KEY is set
npm run chat:mock      # REPL with the scripted mock provider
npx tsx src/bins/headless.ts --mock --message "hello"   # one-shot
```

## Web

```sh
npm run build:web      # build the React client into web-dist/
npm run web            # serve it at http://127.0.0.1:3080 (--mock, --yolo, --root, --port)
```

The browser client is stateless by design: it holds no model state of its
own — the transcript is projected from the durable session events streamed
over SSE, approval questions arrive on the same stream, and answers go back
over one POST.

## The kernel

```
src/kernel/
├── events.ts    EventBus: emit / parallel / serial / bail / waterfall
├── fiber.ts     Plugin lifecycle states + reverse-order effect disposal
├── store.ts     Flat service store; additions wake pending plugins
├── context.ts   Fiber-owned context proxy; ctx.<name> reads the store
├── service.ts   Base class claiming a service name on construction
├── registry.ts  Kernel: mounts plugins, tracks inject dependencies
└── loader.ts    cordis.yml → plugin tree through dynamic import()
```

### Concepts (mapped to DeepSeek Harness)

| mini-dsh | DeepSeek Harness / Cordis |
|---|---|
| `Kernel` | Cordis app + Loader assembly |
| `Context` proxy over `ServiceStore` | `Context` + `ReflectService` |
| `Fiber` (`pending → loading → active → unloading → disposed`, `failed`) | `Fiber` state machine |
| `ctx.effect(() => disposer)` | `ctx.effect()` — registrations are effects |
| `inject: string[]` + pending wake | service dependencies, not load order |
| `declare module 'mini-dsh'` merging on `Events`/`Context` | declaration merging on Cordis interfaces |
| `bootFromFile(kernel, 'cordis.yml')` | profile/bundle composition (simplified) |

### Dispatch modes

| Mode | Await | Order | Returns |
|---|---|---|---|
| `emit` | no | registration | nothing |
| `parallel` | all together | concurrent | nothing (observer failures contained) |
| `serial` | in order | registration | first bail value stops the chain |
| `bail` | no | registration | synchronous first-bail |
| `waterfall` | chain | outermost→innermost | each listener wraps or vetoes via `next()` |

A waterfall listener that only observes must call `next()`; returning without it is a deliberate veto — the same standing rule as the upstream repository.

## The harness

```
src/harness/
├── session/   Durable log: SessionEvent union, deriveMessages(), fork
├── llm/       Seam: provider registry + agent-facing stream, mock + DeepSeek
├── agent/     Turn/step driver: inbox, pre-step admission, turn-stopping
├── tools/     Registry + guarded pipeline: pre-execute -> run -> post-execute
└── approval/  Policy riding tools/pre-execute: allow | ask | deny

src/capabilities/
├── fs/        read/write/edit/glob/grep tools, root-confined
└── shell/     bash tool: timeout, process-group kill, exit-code report
```

The turn flow, matching the upstream `Turn flow` map:

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

Three invariants carried over verbatim:

- **Model-visible means logged.** Every model request is `session.deriveMessages()` at that moment; a test asserts it with tools in the loop.
- **Raw `assistant/chunk` events preserve replay and UI fidelity** but never re-enter model history — only the assembled `assistant/message` projects.
- **A denied or failing tool is a result, not an exception.** The model sees the denial reason and the turn continues — policy never crashes the loop.

## License

MIT
