---
phase: 3
title: "Shell and responsive workspace"
status: pending
priority: P1
effort: 2d
dependencies: [2]
---

# Phase 3: Shell and responsive workspace

## Overview

Establish semantic tokens, mature shell geometry, single workspace ownership, responsive rails, and project management entry without changing execution scope.

## Requirements

- Functional: workspace control only in app bar; sidebar project filter/history; project registration reachable from New Conversation; inspector closed/read-only.
- Non-functional: exact responsive geometry, semantic tokens, keyboard/focus behavior, no unsupported chrome.

## Architecture

`App` retains navigation orchestration (`web/App.tsx:52-90`). App bar switches workspace. Sidebar filters already-loaded sessions without changing session project. Project manager calls existing project routes (`web/lib/api.ts:187-197`). Inspector consumes meta/manifest only and no longer writes model.

## Related Code Files

- Modify: `web/App.tsx`
- Modify: `web/components/layout/TopBar.tsx`
- Modify: `web/components/layout/Sidebar.tsx`
- Modify: `web/components/layout/EnvPanel.tsx`
- Modify: `web/components/session/NewConversation.tsx`
- Modify: `web/styles/tokens.css`
- Modify: `web/styles/shell.css`
- Modify: `web/styles/ui.css`
- Tests: `web/lib/interaction.spec.tsx`, mounted shell interaction specs

## Implementation Steps

1. Replace raw visual constants with semantic surface/text/border/intent/geometry tokens; restrict radii to 6/8/10.
2. Set app bar 48px, nav 264px, inspector 304px; dock inspector only at >=1360 and keep default closed.
3. Remove sidebar workspace selector; retain project filter, search, history, stream state.
4. Add workspace/project management surface reachable from New Conversation; use existing create project API and actual server errors.
5. Make inspector read-only: effective provider/model/mode/policy/manifest; remove `onModel` mutation path.
6. Preserve drawer scrim, Escape ownership, focus boundaries, and restoration.
7. Set desktop controls 32px and coarse targets >=44px.
8. Validate 320/375/768/1024/1440/1920 layouts and 200% zoom.

## Success Criteria

- [x] Exactly one workspace selector exists in rendered shell.
- [x] No permanent project path field remains in sidebar.
- [x] Creating/managing a project is reachable within two actions from New Conversation.
- [x] Project history filtering cannot mutate active conversation scope.
- [x] Inspector has no editable model/mode controls and makes manifest request only while open (`web/App.tsx:195-214`).
- [x] Numeric geometry and target-size contract passes computed-style tests.
- [x] Keyboard drawer/popover tests use mounted interactions, not markup helpers only.

## Regression Constraints

- Workspace switch must retain generation guards (`web/App.tsx:151-193`).
- Session project remains immutable after creation (`src/web/server.ts:1518-1568`).
- Archived workspace restrictions and running-turn ownership remain server-authoritative.

## Risk Assessment

- High: moving project registration makes onboarding unreachable. Mitigation: empty state and New Conversation both link to management; E2E from zero projects.
- High: duplicate workspace mutation survives hidden. Mitigation: rendered-role query asserts one owner.
- Medium: inspector docking crowds 1024/1280. Mitigation: overlay until 1360.

## Rollback

Revert shell components/tokens together. No data/API migration. Restore previous project entry only if new management route is unreachable.

## Implementation evidence (2026-09-11)

Implemented 48/264/304 shell, one workspace owner, project management, read-only lazy inspector, responsive overlays and focus handling. Playwright verifies geometry, onboarding, drawer Escape and workspace popover focus. Six viewport screenshots captured.

Acceptance remains evidence-based: unchecked gates are not silently waived. See `artifacts/product-ui/acceptance.json` and `docs/design-guidelines.md`.
