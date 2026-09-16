---
phase: 1
title: "Audit and inventory"
status: pending
priority: P1
effort: 1d
dependencies: []
---

# Phase 1: Audit and inventory

## Overview

Freeze the real UI surface, state, contract, copy, and file inventory before design work. This phase produces evidence, not production code.

## Requirements

- Functional: enumerate every rendered surface and state, including empty/loading/error/destructive/runtime variants.
- Non-functional: cite current source; preserve dirty work; distinguish product copy from user/external data.

## Architecture

Trace REST/SSE inputs through `web/lib/api.ts`, `useSessionStream`, `projectItems`, `taskPhase`, App ownership, and settings panels. Record what enters, transforms, and renders. Confirm server safety behavior before assigning visual changes.

## Related Code Files

- Reference: `plans/ux-ui-standardization.md`
- Reference: `docs/web.md`
- Reference: `web/App.tsx`
- Reference: `web/lib/api.ts`
- Reference: `web/lib/project.ts`
- Reference: `src/web/server.ts`
- Deliver: `plans/260911-1139-product-ui-standardization/design-contract.md`

## Implementation Steps

1. Capture complete shell/conversation/settings/dialog surface inventory.
2. Enumerate durable lifecycle, stream, approval, send, loading, and destructive states.
3. Inventory product-owned English/Vietnamese strings, ARIA, toasts, HTML locale, fallback titles, and known server errors.
4. Verify scope ownership: provider global; model/mode/policy/workspace services workspace-scoped; child listing current-conversation-scoped (`web/components/settings/SettingsModal.tsx:319-333`).
5. Verify timestamp availability: event/workspace/project timestamps exist; session-list timestamps absent (`web/lib/types.ts:9-13`, `web/lib/types.ts:45-59`).
6. Build operation parity matrix for providers, agents, MCP, hooks, secrets.
7. Record file ownership and dirty-tree exclusions.

## Success Criteria

- [ ] 100% of exported product surfaces appear in the inventory.
- [ ] Every async operation has loading/success/failure/cancel/stale-result behavior recorded.
- [ ] Every destructive or permission transition has current server precondition and UI confirmation recorded.
- [ ] Copy inventory classifies product-owned versus preserve-verbatim data.
- [ ] No timestamp or scope claim is unverified.

## Risk Assessment

- High: missing a rare safety state leads redesign to hide it. Signal: current test/event reason has no inventory row. Response: stop Phase 2 and extend inventory.
- Medium: dirty source changes during audit. Mitigation: cite current working tree and re-grep before implementation.

## Rollback

Documentation-only. Revert this plan artifact without touching app state.

## Implementation evidence (2026-09-11)

Source inventory captured across App, shell, transcript, composer, dialogs, providers and all management panels. Copy inventory: artifacts/product-ui/copy-inventory.json. Safety domain files preserved; only server list title/optional timestamps changed. Rare async/stale-result matrix has not been independently reviewed.

Acceptance remains evidence-based: unchecked gates are not silently waived. See `artifacts/product-ui/acceptance.json` and `docs/design-guidelines.md`.
