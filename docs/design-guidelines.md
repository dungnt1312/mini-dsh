# Warm Studio design guidelines

## Product contract

mini-dsh is an English developer workbench, not a terminal, file editor, diff viewer, or repository dashboard. Product-owned navigation, controls, errors, ARIA labels, lifecycle labels, and built-in presentation copy are English. User and assistant text, names, identifiers, paths, commands, imported content, custom modes, and raw diagnostics remain verbatim. APIs retain the term `session`; the UI calls the durable thread a **Conversation**.

## Visual direction

Warm Studio uses a warm off-white canvas, cream surfaces, dark brown-charcoal ink, and restrained terracotta for actions and focus. Success, warning, and danger colors are semantic and subdued. Borders and controlled shadows convey depth. Do not add gradients, neon/gloss effects, copied branding, terminal chrome, decorative repository statistics, a fake file tree, or unsupported controls.

Instrument Sans is used for UI and prose. JetBrains Mono is used for code, paths, IDs, commands, durations, and diagnostics. Typical UI text is 13–14px; transcript prose is 15px with a 1.65–1.75 line height.

## Layout and ownership

- The global top bar spans the viewport and is the sole owner of workspace selection/management, navigation and inspector toggles, and Settings entry.
- The left navigation defaults to **280px**, clamps to **232–420px**, and docks at viewport widths **>=1024px**. Below 1024px it is a Radix Dialog drawer.
- The right Context/Artifacts panel defaults to **336px**, clamps to **280–520px**, and docks at viewport widths **>=1280px**. Below 1280px it is a Radix Dialog drawer.
- Both desktop panels resize independently, support pointer and keyboard operation, collapse independently, restore defaults, and persist browser-local preferences under `mini-dsh.workbench.v1`. Narrow drawers do not overwrite docked collapse preferences.
- The center is the primary reading axis: transcript content is approximately 760px wide and the elevated workbench can grow to 960px where space permits.
- The composer is fixed to the bottom of the center region, never underneath the side panels. Runtime measurement adds transcript clearance equal to the dock geometry so transcript rows, approvals, and send errors remain reachable.
- Required verification widths are **320, 375, 768, 1024, 1440, and 1920px**, with no document-level horizontal overflow.

## Conversation and safety hierarchy

The durable event log remains the source of truth. `projectItems(events)` owns transcript projection; the elevated workbench selects an existing projected tool/delegation item without replacing or mutating transcript history. Running, failed, completed, interrupted, and recovered/unknown outcomes remain distinct.

Connection loss is shown separately from durable running state. Reconnecting never invents a terminal outcome, automatically resends a draft, or replays a request. Queue and Stop continue to use their existing endpoints. Drafts clear only after accepted requests and unchanged edit revisions.

Approvals appear above the composer in oldest-first order. **Allow once** and **Deny** apply to one request and retain synchronous duplicate-submit protection. Persistent allow is a separately confirmed workspace-policy write followed by one approval answer.

Context is read-only except for confirmed manual compaction. Its manifest request runs only while the inspector is open, Context is selected, a valid conversation is selected, and the turn is settled. Artifacts is a client-only projection of existing tool calls/results and never causes an additional request.

Artifacts may present exact path/resource references, command records, and recorded tool output. A path is not proof of existence or file content; tool output is not a file preview. The UI does not infer diffs, MIME type, repository ownership, or rerun ability. Its exact empty state is: **“No recorded artifacts for this conversation yet.”**

## Styling boundary

Tailwind utilities own component geometry, spacing, typography, colors, borders, shadows, state, and responsive behavior. CVA owns reusable variants. Radix owns dialogs, popovers/menus, tabs, collapsibles, switches, and related keyboard/focus semantics.

Only these CSS files are shipped:

- `web/styles/app.css`: Tailwind theme, semantic Warm Studio tokens, root/reset rules, and consolidated component selector compatibility;
- `web/styles/markdown.css`: markdown structure and highlight.js token selectors;
- `web/styles/motion.css`: keyframes, scrollbar treatment, and reduced-motion overrides.

Dynamic inline values are limited to measured panel/dock/popup/textarea geometry, document selection suppression during pointer resize, and the Context budget percentage.

## Accessibility matrix

- Axe scans use `wcag2a`, `wcag2aa`, and `wcag21aa` tags for the shell, drawers, Context, Artifacts, approvals, and all eight Settings sections.
- Dialog drawers trap keyboard focus, close by Escape/scrim/close action, and restore focus to their opener. Nested overlays close one layer per Escape.
- Context/Artifacts and Settings tab navigation is keyboard-operable with linked panels.
- Resizers expose separator role/orientation and ARIA min/max/current values. Arrow changes by 8px, Shift+Arrow by 32px, Home/End use bounds, and double-click restores the default.
- Coarse-pointer controls provide at least 44×44 CSS-pixel targets.
- `prefers-reduced-motion: reduce` collapses nonessential animation/transition durations while running status remains understandable through visible text and static shapes.
- Status is never conveyed by color alone; icon-only controls have accessible names.

## Verification

Run:

```sh
npm test -- --maxWorkers=1 --no-file-parallelism
npm run typecheck
npm run build:web
npm run test:browser
```

Browser fixtures intercept `/api/**`, fail on unknown requests in redesign workflows, and never mutate real settings. Deterministic PNG evidence is written under `artifacts/product-ui/warm-studio/`; screenshots are evidence for later review, not approved baselines.
