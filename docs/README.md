# mini-dsh — Documentation

**mini-dsh** is a miniature TypeScript replica of the
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) architecture,
built for learning. It reimplements the same plugin-runtime ideas — everything is
a plugin, typed events with five dispatch modes, reversible effects,
dependency-driven lifecycle — from scratch on a kernel small enough to read in an
afternoon, then layers an agent core (durable session log, LLM streaming seam,
turn/step driver), a guarded tool pipeline, and a web UI on top.

This documentation is organized so each layer can be read independently:

| Document | Covers |
|---|---|
| [architecture.md](architecture.md) | The big picture: layers, module map, core invariants |
| [kernel.md](kernel.md) | The mini-Cordis plugin kernel: event bus, fiber, service store, loader |
| [harness.md](harness.md) | The agent harness: session log, LLM seam, turn/step driver, tools, approval |
| [capabilities.md](capabilities.md) | The built-in tools: filesystem and bash |
| [web.md](web.md) | The web host: REST + SSE API and the React client |
| [guides.md](guides.md) | Getting started, configuration, CLI, plugin authoring, testing |

## Quick reference

```sh
npm install        # install dependencies
npm test           # run the vitest suite
npm run typecheck  # typecheck server (tsconfig.json) + web (tsconfig.web.json)

npm run chat       # headless REPL (DeepSeek when DEEPSEEK_API_KEY is set)
npm run chat:mock  # headless REPL with the scripted mock provider

npm run build:web  # build the React client into web-dist/
npm run web        # serve the web UI (default port 3082)
```

## Where things live

```
src/
├── index.ts            Public package entry: everything is re-exported here
├── kernel/             The mini-Cordis plugin kernel
│   ├── events.ts       EventBus — emit / parallel / serial / bail / waterfall
│   ├── fiber.ts        Plugin lifecycle + reverse-order effect disposal
│   ├── store.ts        Flat service store
│   ├── context.ts      Fiber-owned context proxy (ctx.<name> reads the store)
│   ├── service.ts      Base class that claims a service name
│   ├── registry.ts     Kernel: mounts plugins, tracks inject dependencies
│   └── loader.ts       cordis.yml → plugin tree via dynamic import()
├── harness/
│   ├── session/        Durable session log (event sourcing, fork)
│   ├── llm/            Provider registry + stream seam (mock + DeepSeek)
│   ├── agent/          Turn/step driver (inbox, pre-step, turn-stopping)
│   ├── tools/          Tool registry + guarded pre-execute → run → post-execute
│   └── approval/       Policy riding tools/pre-execute: allow | ask | deny
├── capabilities/
│   ├── fs/             read / write / edit / glob / grep, root-confined
│   └── shell/          bash tool: timeout, process-group kill
├── web/
│   └── server.ts       HTTP host: REST + SSE + approval bridge
├── bins/
│   ├── env.ts          .env loading + API key reading
│   ├── headless.ts     Headless CLI / REPL
│   └── web.ts          Web server bin
└── util/
    └── brand.ts        Branded SessionId / TurnId / StepId

web/                    React client (stateless, renders from the event stream)
web-dist/               Vite build output (gitignored)
tests/                  Vitest suite + composition fixtures
```

## Why this shape

The reference architecture lives in the DeepSeek Harness repository
(`docs/architecture.md`, `docs/cordis-primer.md`, `docs/cordis-tutorial/`).
mini-dsh rebuilds those ideas *without importing them*; the test suite
reproduces the Cordis tutorial chapters against this kernel. The three core
invariants, carried over verbatim from upstream, are:

1. **Model-visible means logged.** Every model request is
   `session.deriveMessages()` at that moment; a test asserts it with tools in
   the loop.
2. **Raw `assistant/chunk` events preserve replay and UI fidelity** but never
   re-enter model history — only the assembled `assistant/message` projects.
3. **A denied or failing tool is a result, not an exception.** The model sees
   the denial reason and the turn continues — policy never crashes the loop.
