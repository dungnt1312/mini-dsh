# mini-dsh

A miniature TypeScript replica of the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) architecture, built for learning: the same plugin-runtime ideas — everything is a plugin, typed events with five dispatch modes, reversible effects, dependency-driven lifecycle — reimplemented from scratch on a kernel small enough to read in an afternoon.

The reference architecture lives in the DeepSeek Harness repository (`docs/architecture.md`, `docs/cordis-primer.md`, `docs/cordis-tutorial/`). This project rebuilds those ideas without importing them; the test suite reproduces the Cordis tutorial chapters against this kernel.

## Status

- **Phase 0–1 (done)** — mini-Cordis kernel: event bus with all five dispatch modes, fiber lifecycle with reverse-order effect disposal, service store with `inject` dependency tracking, and a YAML composition loader. 37 tests reproduce tutorial chapters 2–4 on this kernel.
- Phase 2 — agent core: session log (event sourcing), LLM streaming seam, agent loop without tools.
- Phase 3 — tool pipeline: registry, `tools/pre-execute` waterfall, approval gate, `bash`/`read`/`write`/`edit`/`glob`/`grep` tools.
- Phase 4 — web UI: HTTP server + React transcript, approval prompts, session list.
- Phase 5 — dynamic plugins: patch layers, hot (un)load, provider swap restarting dependents.
- Phase 6 — polish: SQLite persistence, compaction, an `architecture.md` for this project.

## Getting started

```sh
npm install
npm test         # vitest run
npm run typecheck
```

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

## License

MIT
