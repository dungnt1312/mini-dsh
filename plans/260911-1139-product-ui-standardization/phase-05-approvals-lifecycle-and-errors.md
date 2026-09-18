---
phase: 5
title: "Approvals, lifecycle, and errors"
status: pending
priority: P1
effort: 1.5d
dependencies: [4]
---

# Phase 5: Approvals, lifecycle, and errors

## Overview

Integrate safety-critical approvals, durable lifecycle, stream state, recovery, and errors into the calmer workbench without weakening semantics.

## Requirements

- Functional: every task phase, approval state, send failure, stream failure, and recovery state remains visible and actionable.
- Non-functional: compact hierarchy; known product guidance plus raw diagnostics; no hidden or broadened permission.

## Architecture

`taskPhase` remains event-derived and separate from connection state (`web/lib/project.ts:126-151`). Pending approval answers still POST one boolean to the capability ID (`web/lib/api.ts:61-67`). Durable decisions remain transcript facts. UI maps known backend errors to English guidance while preserving raw text in expandable detail.

## Related Code Files

- Modify: `web/components/chat/TaskStatus.tsx`
- Modify: `web/components/chat/ApprovalBar.tsx`
- Modify: `web/components/chat/MessageParts.tsx`
- Modify: `web/lib/project.ts` display projection only
- Create/Modify: product error-mapping module under `web/lib/`
- Modify: `web/styles/chat.css` coordinated after Phase 4
- Tests: `web/lib/workflow.spec.tsx`, `web/hooks/useSessionStream.spec.tsx`, mounted approval/status specs

## Implementation Steps

1. Define English labels for idle/preparing/running/waiting/completed/failed/interrupted/cancelled/rejected/empty/limit.
2. Keep connection state independent: reconnecting never claims work stopped.
3. Render approvals compactly with tool, target, project, call ID, exact JSON, one-request statement, submitting lock, and failure detail.
4. Preserve exact allow/deny semantics and no remembered grant (`web/components/chat/ApprovalBar.tsx:13-30`).
5. Map known UI-facing server errors such as no provider, archived workspace, running delete, stale approval, invalid project, and connection failure; unknown messages remain raw.
6. Keep send-uncertain warning and draft retention; do not offer blind resend.
7. Preserve recovered unknown-outcome guidance and inspection-first recovery.
8. Add mounted tests for pending/submitting/failure/resolution, every lifecycle reason, reconnecting, long JSON, and double-click lock.

## Success Criteria

- [x] Exact action labels communicate “Allow once” and “Deny”; no grant widening.
- [x] Every `TaskPhase` has rendered English state and test.
- [x] Stream disconnection never changes durable task outcome.
- [x] Known errors show actionable English summary and raw details.
- [x] Unknown errors remain inspectable verbatim.
- [x] Approval double submission is prevented in mounted interaction test.
- [x] Durable approval decisions remain visible in transcript.

## Regression Constraints

- Answered approvals may return 404 and must be explained as resolved/stale, not retried automatically (`docs/web.md:261-271`).
- Running session deletion remains blocked (`src/web/server.ts:1595-1599`).
- Stop cancels descendants before acknowledging root settlement (`src/web/server.ts:1635-1640`).

## Risk Assessment

- High: friendly mapping hides raw safety detail. Mitigation: every mapped error includes expandable raw response and status.
- High: visual compaction suggests persistent permission. Mitigation: “this request only” adjacent to actions and tested.

## Rollback

Revert approval/status/error presentation. Do not alter approval API, event types, or policies.

## Implementation evidence (2026-09-11)

English lifecycle and bounded approvals retained. Synchronous approval lock tested mounted and once-only request tested in browser. Known English error summaries retain expandable original diagnostics. Full durable lifecycle/API tests pass.

Acceptance remains evidence-based: unchecked gates are not silently waived. See `artifacts/product-ui/acceptance.json` and `docs/design-guidelines.md`.
