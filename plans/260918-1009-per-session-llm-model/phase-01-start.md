---
phase: 1
title: "Durable session model — session/model event, replay, fallback"
status: done
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Durable session model — session/model event, replay, fallback

## Overview
Thêm durable vocabulary `session/model` để mỗi session lưu model/provider/thinkingLevel riêng, replay được sau restart, và fallback về workspace default khi chưa có.

## Requirements
- Functional:
  - Thêm `SessionEvent` variant `session/model {provider, model, thinkingLevel}` (+ stamp).
  - `deriveSessionModel(events) -> {provider?, model?, thinkingLevel?}` helper: scan events, last-wins.
  - Legacy session chưa có event → fallback `undefined` (caller sẽ dùng workspace default).
  - `Session` / `SessionsService` không cần API mới, chỉ cần events mới durable như `session/title`.
- Non-functional: event nhỏ, append-only, không break `assertNever` branches.

## Architecture
- `src/harness/session/events.ts`: thêm type + export helper `deriveSessionModel` / hoặc `sessionModelOf(events)`.
- `deriveMessages` / `deriveTitle` không đụng; chỉ thêm event mới vào switch exhaustive với `break`.
- Không thêm `session/thinking` riêng — gộp vào `session/model` (3 fields optional, `null` để clear thinkingLevel).

## Related Code Files
- Modify: `src/harness/session/events.ts`
- Modify: `src/harness/session/session.ts` (nếu cần export helper, không bắt buộc)
- Modify: `tests/harness/session.spec.ts` (thêm case) hoặc tạo `tests/harness/session-model.spec.ts` nhỏ

## Implementation Steps
1. Thêm `SessionEvent` variant `session/model` với `provider: string | null`, `model: string | null`, `thinkingLevel: string | null` (null = clear, absent = unchanged — chọn 1 convention và document).
2. Viết `sessionModelOf(events)` / `deriveSessionModel` — last `session/model` wins.
3. Update `assertNever` exhaustive switches (`deriveMessages`, storage, etc.) thêm `case 'session/model': break`.
4. Thêm test: append `session/model`, replay, `deriveSessionModel` trả đúng; legacy events fallback undefined.

## Success Criteria
- [x] `npx tsc --noEmit -p tsconfig.json` pass
- [x] `vitest` session tests pass; new test chứng minh durable + fallback
- [x] Không break `deriveMessages` / `deriveTitle` / storage quarantine

Evidence (2026-09-18): `session/model` landed in `src/harness/session/events.ts` with `deriveSessionModel`/`sessionModelOf` (omitted = unchanged, `null` = explicit clear, `hasEvent` = legacy separator); `tests/harness/session-model.spec.ts` (6 tests) covers legacy fallback, null-vs-omitted, replay, `FileSessionStore`/`fileSessions` restart persistence, and `deriveMessages` skipping the event; both tsconfig typechecks pass.

## Risk Assessment
- Risk: chọn shape `null` vs `undefined` gây lẫn — Mitigation: document convention trong JSDoc, test cả 2.
- Risk: quên `assertNever` branch → compile fail — Signal: `tsc` báo missing case.
