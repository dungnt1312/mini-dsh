---
phase: 6
title: "Settings and management surfaces"
status: pending
priority: P1
effort: 2.5d
dependencies: [3]
---

# Phase 6: Settings and management surfaces

## Overview

Reframe settings as one full-height operational surface with explicit global/workspace/session groups while preserving every existing writable capability.

## Requirements

- Functional: provider CRUD/test/sync/activation; agent definitions/spawn/children/import; MCP CRUD/lifecycle/import; hooks edit/save/revert; secrets add/rotate/delete.
- Non-functional: clear scope, saved-vs-runtime distinction, responsive full-height layout, no generic card heap.

## Architecture

Settings navigation groups by scope. Providers are global storage; activation is workspace-scoped. Agents/MCP/hooks/secrets use current workspace. Child runtime uses current root conversation. Existing API calls in `web/lib/api.ts:92-123` and `web/lib/api.ts:310-439` remain canonical.

## Related Code Files

- Modify: `web/components/settings/SettingsModal.tsx`
- Modify: `web/components/settings/ManagementPanels.tsx`
- Modify: `web/styles/settings.css`
- Modify: `web/styles/settings-management.css`
- Modify: shared settings primitives only when needed
- Tests: `web/components/settings/management.spec.tsx`, new mounted settings interactions

## Implementation Steps

1. Convert modal to full-height settings surface with grouped navigation and sticky contextual header/actions.
2. Add visible scope badge and target name for every section: Global, Workspace, Current conversation.
3. Replace repeated card grids with lists, sections, definition rows, and editors using one hierarchy.
4. Preserve provider dirty-state discard confirmation, saved-config test semantics, model sync, activation, enable/delete.
5. Preserve agent role inspection, spawn packet, grants, children wait/cancel, Claude/Codex import and blocking reports.
6. Preserve MCP status/breaker, enable/disable/reconnect, stdio/HTTP editor, resource controls, and disabled imports.
7. Preserve raw hooks JSON editor, parse validation, save/revert, and isolation warning.
8. Preserve secret masked list, add/rotate/delete, and reconnect result.
9. Add mobile settings navigation and focus behavior at 320/375/768; no capability becomes read-only.
10. Add operation parity mounted tests for every button/form transition and destructive confirmation.

## Success Criteria

- [ ] Operation parity matrix is 100%; no existing operation removed or made read-only.
- [ ] Every view states correct global/workspace/current-conversation scope.
- [ ] Saved configuration and live connection/runtime state are visually distinct.
- [ ] Unsaved provider edits survive tab changes and require confirmation on destructive leave.
- [ ] All settings controls are usable at 320px and 200% zoom.
- [ ] Mounted tests cover all tabs and every destructive operation.

## Regression Constraints

- API keys remain masked and blank PATCH retains stored key (`web/components/settings/SettingsModal.tsx:65-69`, `web/components/settings/SettingsModal.tsx:203-208`).
- MCP/hook host privilege warning remains honest (`web/components/settings/ManagementPanels.tsx:42-51`).
- Imports do not auto-run/auto-enable.

## Risk Assessment

- High: redesign drops advanced fields. Mitigation: before/after operation and field parity checklist blocks completion.
- High: scope ambiguity applies action to wrong workspace. Mitigation: scope header includes active workspace and tests switch workspaces before action.
- Medium: full-height mobile becomes nested-scroll trap. Mitigation: one primary scroll container per view.

## Rollback

Revert settings components/styles as a unit. Configuration files and API contracts are untouched.

## Implementation evidence (2026-09-11)

Full-height settings preserves provider CRUD/test/sync/activation, agent spawn/wait/cancel/import, MCP lifecycle/import/editor, hooks validation/save/revert and secret rotation/deletion. Projects supports registration, rename and confirmed removal through existing scoped APIs. Browser tests cover representative writable operations; exhaustive failure/stale-result parity and every advanced field transition remain review gaps.

Acceptance remains evidence-based: unchecked gates are not silently waived. See `artifacts/product-ui/acceptance.json` and `docs/design-guidelines.md`.

### Mobile visual audit follow-up

Replaced clipped mobile tabs with a scoped native section selector. Removed nested provider scroll ownership and old mobile height override; reserved safe-area footer padding and final-field scroll clearance. Scope summary is compact with details disclosure; host privilege warning remains visible. Section changes reset scroll position. Nine browser tests, 42 targeted tests, typecheck and build pass. Screenshots `320-settings-fixed-bottom.png`, `375-settings-fixed-top.png`, and `320-settings-fixed-hooks.png` were observed. Clipboard rejection recovery is accessible and mounted-tested. Independent review remains pending.

### Independent review blocker closure

Controller independent code/test/design review was performed. Mobile visual rereview passed. Keyless providers restored; all management scopes remount and invalidate stale async feedback; imported agent catalog/inspect/spawn/delete available; project removal refuses bound conversations with HTTP 409, never detaches. js-yaml upgraded only to 4.3.2. Final 331 tests in 39 files, 10 browser tests, typecheck/build pass. Initial marker-contaminated failure retained in review-fix-full-tests.log; unique-temp test isolation preserves original assertion. Final evidence: artifacts/product-ui/acceptance.json. Human visual approval remains separate.
