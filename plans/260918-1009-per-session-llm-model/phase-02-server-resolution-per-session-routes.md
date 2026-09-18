---
phase: 2
title: "Server resolution + per-session routes"
status: done
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Server resolution + per-session routes

## Overview
Đổi `agent/request` và `agent/context` resolve per-session trước, fallback workspace; thêm routes `PUT/GET /workspaces/:wid/sessions/:sid/model` (+ thinking) và copy default khi tạo session.

## Requirements
- Functional:
  - Helper `sessionModelOf(session.events)` → `{provider?, model?, thinkingLevel?}` (last `session/model` wins).
  - `agent/request`: `sessionModel ?? workspaceControls` cho `model/providerName/thinkingLevel`. Budget/context cũng resolve từ effective model.
  - `POST /workspaces/:wid/sessions`: sau khi tạo session, nếu workspace có default model thì append `session/model` snapshot (copy).
  - `PUT /workspaces/:wid/sessions/:sid/model` body `{provider?, model?, thinkingLevel?}` → append `session/model` + `await durable()`. Validate model thuộc provider.
  - `GET /workspaces/:wid/sessions/:sid/model` → effective (session override ?? workspace default) + source flag.
  - `GET /workspaces/:wid/meta` giữ nguyên (workspace default), không lẫn per-session.
  - `PUT /workspaces/:wid/model` (workspace default) không đụng session cũ — chỉ ảnh hưởng session mới.
- Non-functional: resolve synchronous trong `agent/request`; không abort stream đang chạy — request kế tiếp mới đổi.

## Architecture
- `src/web/server.ts`:
  - Import `sessionModelOf` từ `events.ts`.
  - `resolveEffectiveModel(session, wsId)` helper dùng chung cho `agent/request` và `agent/context`.
  - `agent/request` listener: `const sm = sessionModelOf(entry.session.events); const effectiveProvider = sm?.provider ?? state.activeProvider; effectiveModel = sm?.model ?? state.model;`
  - Routes: thêm `wsSessionModelMatch = /^\/api\/workspaces\/([^/]+)\/sessions\/([^/]+)\/model$/` (+ `/thinking` hoặc gộp).
  - Validate: reuse `setActiveFor` logic nhưng không mutate `controls` — chỉ validate provider/model tồn tại.
  - ThinkingLevel: có thể gộp vào `/model` hoặc riêng `/thinking` per-session — chọn gộp để atomic.
- `src/harness/session/events.ts`: export helper.

## Related Code Files
- Modify: `src/web/server.ts`
- Modify: `src/harness/session/events.ts`
- Modify: `tests/web/server.spec.ts` hoặc `server-g5.spec.ts` (thêm suite per-session model)

## Implementation Steps
1. Viết `sessionModelOf` + test.
2. Thêm resolve helper + sửa `agent/request` và `agent/context` budget.
3. Thêm `POST /sessions` copy default (append `session/model`).
4. Thêm `PUT/GET /workspaces/:wid/sessions/:sid/model` (và `/thinking` nếu tách).
5. Giữ `PUT /workspaces/:wid/model` là workspace default only — không loop qua sessions.
6. Viết test: A đổi không ảnh hưởng B, session mới copy, durable replay, mid-turn đổi có hiệu lực request kế tiếp.

## Success Criteria
- [x] `tsc` pass, web tests pass
- [x] `curl PUT /workspaces/:wid/sessions/:sid/model` → session B giữ nguyên
- [x] Session mới copy workspace default tại tạo
- [x] Restart (fileSessions) vẫn giữ per-session model

Evidence (2026-09-18): `resolveEffectiveModel` in `src/web/server.ts` resolves `agent/request` and `agent/context` per session (`hasEvent` boundary; explicit null never re-inherits workspace), `POST …/sessions` snapshots the workspace default, and `GET/PUT …/sessions/:sid/model` validates only a resulting non-null complete pair. `provider:null, model:null` is the accepted explicit blank and a partial pair is rejected; durability failure fences the session (503 until restart). `tests/web/server-session-model.spec.ts` proves A/B isolation, unchanged existing sessions, blank-snapshot stability, partial/blank validation, mid-turn next-request effect, legacy fallback, and restart replay.

## Risk Assessment
- Risk: `agent/request` resolve sai khi `scope.sessionId` missing — Mitigation: fallback workspace default rõ ràng, test cả 2 nhánh.
- Risk: validate model quên check `modelSettings` — Mitigation: reuse `setActiveFor` validation path.
