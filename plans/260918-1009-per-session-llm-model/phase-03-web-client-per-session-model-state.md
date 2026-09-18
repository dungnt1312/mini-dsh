---
phase: 3
title: "Web client per-session model state"
status: done
priority: P1
effort: "3h"
dependencies: [2]
---

# Phase 3: Web client per-session model state

## Overview
Đưa ModelMenu từ workspace-level xuống per-conversation: client fetch/store model theo `currentSessionId`, đổi ở session A không rerender/đổi B.

## Requirements
- Functional:
  - `web/lib/api.ts`: thêm `getSessionModel(wsId, sid)` và `setSessionModel(wsId, sid, {provider, model, thinkingLevel})`.
  - `web/lib/types.ts`: thêm `SessionModel {provider?, model?, thinkingLevel?, source: 'session'|'workspace'}` hoặc reuse `WorkspaceMeta` shape.
  - `web/App.tsx`: thay một `meta` workspace-level cho model bằng `sessionModel` map `Map<SessionId, SessionModel>` + `workspaceDefault` fallback. `selectModel` gọi per-session route với `currentSessionId`. Khi switch session, fetch/lấy cache per-session model.
  - `Composer`/`ModelMenu`: label đổi thành "Conversation model (next request)" khi source=session, "(workspace default)" khi fallback.
  - ThinkingLevel cũng per-session (nếu gộp vào /model thì cùng call).
- Non-functional: không fetch waterfall mỗi lần switch — cache trong `App.tsx` và invalidate sau `setSessionModel`.

## Architecture
- `web/lib/api.ts` → `GET/PUT /api/workspaces/:wid/sessions/:sid/model`.
- `web/App.tsx`: `const [sessionModels, setSessionModels] = useState<Map<string, SessionModel>>(new Map())` + `useEffect` khi `currentSessionId` đổi thì fetch. `modelValue = sessionModels.get(currentId)?.model ?? workspaceMeta?.model`.
- Giữ `GET /workspaces/:wid/meta` cho workspace default (dùng khi tạo session mới hoặc hiển thị fallback).
- Không đụng `useSessionStream` — model không nằm trong SSE events.

## Related Code Files
- Modify: `web/lib/api.ts`
- Modify: `web/lib/types.ts`
- Modify: `web/App.tsx`
- Modify: `web/components/composer/ModelMenu.tsx` (label)
- Modify: `web/components/composer/Composer.tsx` (prop drilling nếu cần)

## Implementation Steps
1. Thêm API helpers + type `SessionModel`.
2. Thêm state per-session trong `App.tsx`, fetch on session switch.
3. Đổi `selectModel`/`selectThinking` sang per-session routes.
4. Update label/fallback hiển thị.
5. Test: switch A→B→A giữ đúng model mỗi session.

## Success Criteria
- [x] Đổi model ở A, chuyển sang B vẫn thấy model cũ của B; quay lại A vẫn giữ model mới của A
- [x] `tsc -p tsconfig.web.json` pass
- [x] Không regression queue/stop/approval/drafts

Evidence (2026-09-18): `SessionModel` type + `get/setSessionModel` in `web/lib/`, per-workspace+session cache with a counted `SessionModelMutationQueue` and forced refetch on write failure in `web/App.tsx`; model/thinking controls and send stay disabled until the entire current-session mutation queue settles, preventing a message from overtaking delayed PUTs. Cached legacy `source:'workspace'` entries derive from current `WorkspaceMeta`; session-owned nulls remain explicit blanks. Labels distinguish conversation vs workspace-default scope, and loading/error states disable model/thinking/send with a Retry refetch instead of falling back to workspace defaults.

## Risk Assessment
- Risk: fetch per-session mỗi switch gây flicker — Mitigation: cache + optimistic update.
