# Warm Studio design system contract

This document defines the implemented client construction contract. Product geometry and accessibility requirements are summarized in `design-guidelines.md`.

## Foundation

### Tailwind

Tailwind utilities are the default authority for layout, responsive behavior, spacing, typography, surfaces, borders, shadows, and visible component states. Semantic colors originate in the `@theme` block in `web/styles/app.css`: canvas, surface, raised/muted surface, ink levels, border levels, terracotta accent, and semantic success/warning/danger.

### CVA

CVA defines reusable primitive variants such as Button, IconButton, Badge, Chip, Field, TextInput, Segmented, and Switch contracts. Variant props are stable presentation APIs; domain components continue to receive explicit data and callbacks.

### Radix

Radix primitives own interaction mechanics:

- Dialog: modal, confirmation, Settings, and responsive drawers;
- Popover/menu composition: workspace, model, mode, policy, and selection controls;
- Tabs: Context/Artifacts and desktop Settings navigation;
- Collapsible: project groups and disclosures;
- Switch: binary settings controls;
- Tooltip: explanations for icon-only or constrained controls.

Radix state does not own server data, routing, drafts, approvals, settings records, or event projection.

## CSS contract

The production entry imports exactly:

```ts
import './styles/app.css'
import './styles/markdown.css'
import './styles/motion.css'
```

`app.css` includes the semantic theme/root rules and the consolidated compatibility selector layer needed by existing component class contracts. `markdown.css` is restricted to markdown/highlight selectors. `motion.css` contains motion/scrollbar rules and the global reduced-motion collapse. Do not create another global or component stylesheet.

Static visual declarations do not belong in React style objects. Runtime custom properties are permitted for left/right widths, center dock geometry, textarea measured height, menu width where required, and budget percentage. Direct `userSelect` mutation is permitted only during active pointer resize and must restore the prior value.

## Shell and responsive panels

`WorkbenchShell` owns the top-bar row and body grid. The left panel defaults to 280px with a 232–420px range and docks at 1024px or wider. The right panel defaults to 336px with a 280–520px range and docks at 1280px or wider. Below each threshold the same child content is hosted in a Radix Dialog drawer; do not duplicate panel implementations.

Panel preferences use `mini-dsh.workbench.v1` and contain left/right width, left/right collapsed state, and `context | artifacts` inspector tab. Invalid fields fall back independently; widths clamp. Drawer state is transient.

### Resizer semantics

Each desktop resizer:

- uses `role="separator"` and vertical orientation;
- exposes `aria-valuemin`, `aria-valuemax`, and `aria-valuenow`;
- has a 1px visible rule inside a 12px hit area;
- uses Pointer Events and pointer capture;
- changes immediately while dragging and persists on release/cancel;
- suppresses text selection only during active drag and restores the prior value;
- uses Arrow = 8px, Shift+Arrow = 32px, Home/End = min/max;
- restores 280px/336px on double-click;
- does not animate direct resize feedback.

## Center conversation

`App` projects durable events once with `projectItems(events)`. `Transcript` renders that array. `latestWorkbenchItem` returns an original tool/delegation item reference using priority: newest running, then newest attention-required/unknown, then newest completed.

`WorkbenchSurface` is an elevated presentation of existing event-derived data. It may show exact arguments and recorded output disclosures, but it is not an execution environment and has no rerun, command input, file editing, terminal emulation, or progress percentage.

`ConversationDock` orders approval cards, send error, and Composer. It is fixed to the measured center-region bounds. Transcript bottom clearance is updated when the dock resizes or when a delayed transcript mounts.

Composer preserves IME handling, Shift+Enter newline, eligible Enter send, running Enter queue, Stop, scope immutability after creation, model/mode/thinking/policy controls, and reconnect draft editability. A missing model is the only reason the message input is disabled.

Approval actions retain one-request semantics and synchronous locks. Persistent allow requires explicit confirmation and writes workspace policy before answering the approval.

## Context and Artifacts

`InspectorPanel` uses controlled Radix Tabs and persisted `inspectorTab`.

Context presents conversation coordinates, stream state, effective controls, and the existing manifest. Manifest fetching is allowed only when the panel is open, Context is selected, workspace and conversation are valid, and the durable turn is settled. Compaction remains confirmed and disabled/guarded while running.

`projectArtifacts(events)` is pure and maps only existing `tool/call` and `tool/result` data:

| Input | Row |
|---|---|
| `args.path` or `args.file_path` non-empty string | File reference |
| Other conservative path-like non-empty string | Resource reference |
| Bash/Shell `args.command` | Command record |
| Qualifying result output without reference/command | Tool output |

Calls pair with results by call id, preserve first-call order, and deduplicate. No result is pending; `ok` maps to succeeded/failed; `recovery: true` always maps to unknown. Recorded output is labeled **Recorded tool output**. No artifact row infers file existence, file content, diff, MIME type, project ownership, or rerun capability.

## Settings

Settings is a full-height Radix Dialog. Desktop/tablet use grouped Radix Tabs; narrow mobile uses Radix Select. All eight sections remain reachable: Providers, Projects, Skills, Memory, Agents, MCP, Hooks, Secrets.

Provider draft seeding, dirty leave confirmation, blank stored-key omission, model activation, test/sync, and deletion retain their existing request contracts. Projects remain workspace-scoped. Skills and Memory 409 responses require explicit Reload or Overwrite; overwrite is never silent. Hooks raw JSON is treated as unknown, strictly validates the complete document and known keys, retains invalid drafts verbatim, and saves only one whole valid document. Workspace/root keyed panels discard stale async completions.

## Do-not list

- No backend or REST/SSE contract expansion for the redesign.
- No file tree, file editor, file-content claim, diff viewer, terminal, repository dashboard, attachments, or rerun action.
- No invented terminal outcome during reconnect and no automatic resend/replay.
- No duplicate transcript projection or mutation of durable events.
- No silent Settings conflict overwrite or provider draft loss.
- No copied branding, reference ornament, gradients, neon/gloss effects, or decorative repository statistics.
- No new stylesheet outside the three-file boundary.
- No status communicated only by color.
