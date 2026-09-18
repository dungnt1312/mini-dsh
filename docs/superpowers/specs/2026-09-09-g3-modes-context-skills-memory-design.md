# G3 — Modes, Context Assembly, Skills and Memory

Status: design approved by user on 2026-09-09. Design only; implementation not started.
Depends on: [G1 reliable harness](2026-09-09-g1-reliable-harness-design.md) and [G2 workspaces & isolation](2026-09-09-g2-workspace-isolation-design.md), including the queueing and three-live-controls amendments made with this approval.

## Outcome

Replace the single generic Agent preset with five bundled modes and one mode-driven context builder. The selected mode decides instructions, context sources, tool exposure and permission defaults for every request. Skills and memory are workspace/project-scoped Markdown resources assembled into context under the mode's settings, the shared budget and the compaction rules below.

Core decisions:

- One mode-driven context builder assembles every model request; there is no second assembly path.
- No steering: user messages sent while a Turn runs or waits for approval are durably queued for a later Turn (G1) and are never injected into the active Turn's context. G3 assembles a queued input's Turn only when that Turn starts, under the mode then current.
- Mode is a live control (third of three, amending G1/G2): it gates tool exposure and permission defaults at the next tool-start gate and reassembles context at the next model request. Mode is no longer pinned for the Turn. Workspace identity and project root remain fixed for the Turn.
- Mode definition file auto-hot-reload is out of scope: selecting an already validated mode is live; edits to a mode's definition file apply to future validation, not to an execution already underway.
- The current tool execution and current model request finish when any live control changes; no automatic kill, rollback or replay.

## Bundled modes

Five bundled modes replace the generic Agent preset:

- **Chat** — plain conversation: user input plus history, minimal instructions, no tools and no environment loaders.
- **Ask before changes** (default) — read tools allowed; write, delete and shell ask.
- **Edit automatically** — read/write/edit allowed; delete and shell ask; memory and skill writes ask.
- **Plan** — read tools only; no shell, write, delete or memory writes. The plan is delivered in conversation; there is no plan-file exception.
- **Full access** — allows exposed capabilities but never overrides host or workspace restrictions; shell has no OS sandbox.

A mode has exactly four fields: instructions, context sources, tool exposure, permission defaults.

- Defaults and hard restrictions are distinct. Mode permission defaults are defaults that workspace/host policy still constrains; tool exposure is a hard ceiling. An explicit session override cannot grant an unexposed capability. The UI shows custom permissions whenever the effective policy differs from the mode's defaults.
- Custom modes are file-first Markdown/frontmatter, workspace-owned. Bundled modes are read-only and are duplicated into the workspace to customize. No inheritance between modes and no executable pipelines in mode definitions.

## Live mode switching

- The next tool-start gate enforces the current mode's exposure and permission defaults, including unstarted calls remaining from a batch submitted under an older mode/model revision.
- Pending approvals are re-evaluated on mode switch: newly denied or newly unexposed calls cancel with a truthful outcome; newly allowed pending calls may proceed only after a serialized final gate confirms all host and workspace restrictions permit; calls still requiring ask remain pending.
- Previously denied or cancelled calls never resurrect; gate decisions serialize so nothing executes twice.
- History is never rewritten by a mode switch. Mode change does not cleanse historical project information or checkpoints; a fresh session gives a clean Chat context.

## Context assembly

Per request the builder: validates scope, resolves the current mode and model, then assembles system and mode instructions, workspace/project instructions, history (per the history setting), active skills, pinned/retrieved memory, tool results and tool schemas. Loaders whose sources the mode disables are skipped entirely. Lower-trust resource content — skills, memory, project files — cannot override system constraints, mode rules or host/workspace policy.

### Budget

Budget = context window minus output reserve and safety margin, including tool-schema overhead. Custom models carry configurable limits with honest estimates; unverified limits are labeled as estimates. Changing model recomputes the budget.

Trim order before compaction: optional sources first, then older output, then history. Never silently drop the current task, system constraints or tool-call/result validity. If the request still cannot fit, fail clearly rather than truncating silently.

### History settings

History modes are `none`, `recent` and `compact`. `none` excludes previous Turns from the prompt but retains the current Turn's tool loop.

### Compaction

Manual compaction plus automatic compaction when enabled, only at completed exchange boundaries. The original JSONL is immutable; checkpoints record the covered range and provenance. Summaries have no side effects and never promote automatically into memory. Attempts and error surfaces are bounded; failures surface instead of retrying indefinitely.

## Skills

- Sources: workspace-local skills plus bundled read-only skills, enabled per workspace scope (G2).
- Format: `SKILL.md` plus resource files, file-native and editable by external editors; loading validates content and compares expected hashes.
- Mode setting: off or on-demand. The catalog is bounded and searchable; loading happens only through explicit user selection or a `Skill` tool call. No automatic classifier.
- A load pulls scoped instructions and resources on demand. Skill content grants no permissions and cannot bypass tool gates — there is no script escape hatch.
- Active skills are Turn-local, but a live mode switch that turns skills off immediately excludes active skill blocks at the next request. Skill files are not hot-reloaded mid-Turn; future loads read fresh content.
- No duplicate injection of the same skill content and no session-long pinning.

## Memory

- Markdown per fact/topic, workspace or project scoped, with stable IDs, title, timestamps and provenance.
- Pinned loading and on-demand retrieval are independent toggles. Retrieval is bounded keyword search within scope; no vector search or RAG.
- Agent create/update/forget default to ask unless the capability is exposed and the effective policy allows otherwise (Full access can allow). No autonomous extraction. Secrets never enter memory files. Scope checks and expected-hash conflict detection apply to writes.
- Forget excludes entries from future retrieval only; it never rewrites past requests or history. No resource auto hot reload.
- A mode that disables memory drops active memory injections at the next request without rewriting history.

## Isolation and privilege boundary

Application-level isolation only: file-tool gates and path containment are application controls, not an OS/container security sandbox. The shell and any future executable or subprocess code run with host process privileges; the builder treats skill/memory/file content as lower-trust input that cannot override system, mode or workspace/host policy.

## Inspector and manifest

Each request carries a context manifest recording mode and revision, model, source hashes, included ranges, budget and omission decisions. The inspector renders this truthfully. There is no default full secret-prompt dump and no byte-for-byte replay guarantee.

## UI scope

Minimal mode selector plus skills/memory CRUD and error surfaces. No mode visual builder.

## Tool gate integration

The gate enforces the current mode and effective permissions even for calls left over from an old model batch. Blocked calls produce truthful results that match the declared calls, so history never contains malformed tool-call/result pairs.

## Scope by goal and non-goals

G3 delivers bundled modes, custom mode files, the context builder, budgeting, history settings, compaction, skill loading and memory behavior. Non-goals: steering (mid-Turn message injection), general hot reload beyond the three live controls, mode definition file auto-hot-reload, automatic mode selection, marketplace, RAG/vector retrieval, cross-workspace context, automatic cross-session retrieval, multi-agent execution (G4), MCP & hooks implementation (G5; plugin marketplace deferred to G6).

## Acceptance criteria

1. The five bundled modes exist and replace the generic Agent preset; Chat sends no tool schemas and runs no environment loaders.
2. Switching mode mid-Turn while a batch is in flight: the current request/tool finishes; unstarted batch calls gate against the new mode; newly denied or newly unexposed pending calls cancel; earlier denials and cancellations never resurrect; concurrent gates cannot double-execute a call.
3. A newly allowed pending approval proceeds only through the serialized final gate with all host/workspace restrictions satisfied; calls still requiring ask remain pending; no control kills, rolls back or replays running work.
4. Loaders disabled by the current mode contribute nothing: no instructions, skills or memory from disabled sources appear in any request.
5. The budget accounts for schemas and output reserve; custom model limits are configurable and estimates are labeled as such; a model change recomputes the budget; trimming follows the documented order; unfit requests fail clearly.
6. `history: none` excludes previous Turns while the current Turn's tool loop continues to function.
7. Compaction runs only at completed exchange boundaries; the original JSONL stays byte-identical; checkpoints carry range and provenance; summaries cause no side effects and do not auto-promote into memory.
8. Externally edited skill, memory and mode files are validated and hash-compared; conflicting writes surface instead of clobbering; invalid content is never executed.
9. Switching to a mode without skills or memory removes active injections at the next request without rewriting history; forget excludes future retrieval only.
10. Every request has a manifest with mode/model revisions, source hashes, ranges, budget and omission decisions, and the inspector matches it.
11. The tool gate enforces the current mode and permissions against stale-batch calls; blocked results are truthful and history stays well-formed.
12. Input queued during an active Turn never enters that Turn's context; when its later Turn starts it is assembled under the mode then current.
13. Workspace/project scope checks hold for skill, memory and mode file access; lower-trust resource content cannot override system, mode or policy constraints.

## Implementation details to resolve

Exact mode/frontmatter and manifest schemas, budget constants, compaction trigger thresholds, keyword search implementation and selector/CRUD interaction details. These do not reopen the approved five-mode, single-context-builder direction.
