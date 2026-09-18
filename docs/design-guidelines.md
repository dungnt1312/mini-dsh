# Web client design guidelines

## Product contract

mini-dsh is an English developer chat client, not a terminal, file editor, diff viewer, or repository dashboard. Product-owned navigation, controls, errors, ARIA labels, lifecycle labels, and built-in copy are English. User and assistant text, names, identifiers, paths, commands, imported content, custom modes, and raw diagnostics stay verbatim. APIs keep the term `session`; the UI calls the durable thread a **Conversation**.

## Visual direction

The client follows a ChatGPT-style layout with a neutral palette in **light and dark** themes. Appearance is **System** by default and can be forced to Light or Dark from the sidebar Preferences menu (browser-local key `mini-dsh.theme`; a pre-paint script in `index.html` avoids a theme flash). Primary actions use the foreground color (black on light, near-white on dark); semantic ok/warn/bad colors are reserved for state. No gradients, glossy effects, copied branding, terminal chrome or decorative statistics.

UI text uses the system sans stack at 13–14px; assistant prose is 15px with a ~1.7 line height. JetBrains Mono is used for code, paths, IDs, commands and durations.

## Layout

- **Sidebar (left, 260px)**: brand + collapse, New conversation, conversation search, project-grouped history with Today/Yesterday/Earlier buckets, and a footer with the workspace switcher, Preferences (appearance + approval notifications) and Settings. It docks at **≥768px** (collapse persists in `mini-dsh.workbench.v1`) and is a modal drawer below that.
- **Main column**: a header (sidebar/new-chat buttons when the sidebar is hidden, model picker, connection state, Context toggle), the transcript, and the composer section. The reading column is `max-w-3xl` (768px) and the composer shares its width.
- **Empty state**: greeting, the composer and suggestions are centered vertically; the composer's scope chip picks the project for the first message.
- **Transcript**: one scroll container spanning the whole column. Opening a conversation lands at the latest row; new output follows only while the reader is within 80px of the bottom; otherwise a round "Jump to latest" button appears. Nothing is pinned over the transcript.
- **Composer section**: normal document flow below the transcript (never `position: fixed`), stacking the work status line, approval cards, send error and the composer.
- **Context sheet (right)**: Context and Artifacts tabs in a modal sheet, closed by default at every size; the selected tab is remembered.
- **Settings**: centered dialog (full screen below 640px) with grouped Global/Workspace tabs on the left, or a section select on narrow screens.
- Required widths **320, 375, 768, 1024, 1440, 1920px** have no document-level horizontal overflow.

## Conversation and safety hierarchy

The durable event log is the source of truth; `projectItems(events)` owns transcript projection. User messages are right-aligned bubbles; assistant answers are plain prose with a hover action row (copy, serving model, time). Tool calls, delegations and audit lines render as compact disclosure rows grouped into one tight activity block between messages; expanding shows exact arguments and recorded output. Running, succeeded, failed, cancelled and recovered/unknown outcomes stay distinct, each with an icon **and** text alternative. A normal `completed` turn end renders no marker; other terminal reasons render a quiet status line, and request failures render one retry card.

Connection loss is shown separately from durable running state. Reconnecting never invents a terminal outcome, automatically resends a draft, or replays a request. Queue and Stop use their existing endpoints; while a turn runs the send button becomes Queue (only when a draft exists) next to Stop. Drafts clear only after accepted requests with unchanged edit revisions.

Approvals appear above the composer, oldest first. **Allow once** and **Deny** apply to one request and keep synchronous duplicate-submit protection. **Always allow** is a separately confirmed workspace-policy write followed by one answer.

Context is read-only except for confirmed manual compaction. Its manifest request runs only while the sheet is open, Context is selected, a valid conversation is selected, and the turn is settled. Artifacts is a client-only projection of existing tool calls/results; paths are not proof of existence or content. Its exact empty state is **“No recorded artifacts for this conversation yet.”**

## Accessibility

- Axe (`wcag2a`, `wcag2aa`, `wcag21aa`) is clean in both themes for the shell, drawer, Context sheet, approvals and all eight Settings sections.
- Text tokens (`fg`, `fg-muted`, `fg-faint`) meet 4.5:1 on every neutral surface in both themes (`tests/web/product-copy.spec.ts`).
- Dialogs, drawers and sheets trap focus, close on Escape/scrim/close button and restore focus to the control that opened them; nested menus close one layer per Escape.
- Touch (`pointer: coarse`) targets are at least 44×44px.
- `prefers-reduced-motion: reduce` collapses animation while running state stays readable as text.
- Status is never conveyed by color alone; icon-only controls have accessible names.

## Verification

```sh
npm test
npm run typecheck
npm run build:web
npm run test:browser
```

Browser suites intercept `/api/**` with fixtures and never touch real settings. Screenshot evidence is written to `artifacts/product-ui/chat/` (light/dark shell) and `artifacts/product-ui/chat/matrix/` (state matrix); it is evidence, not an approved baseline.
