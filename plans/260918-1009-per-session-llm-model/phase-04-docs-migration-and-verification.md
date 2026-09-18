---
phase: 4
title: "Docs, migration and verification"
status: done
priority: P2
effort: "1h"
dependencies: [3]
---

# Phase 4: Docs, migration and verification

## Overview
Cập nhật docs, xử lý migration legacy sessions, và verification matrix.

## Requirements
- Functional:
  - `docs/harness.md`: Live controls — model/thinking là per-session (durable `session/model`), resolve per `agent/request`, fallback workspace default.
  - `docs/web.md`: REST API — thêm `PUT/GET /workspaces/:wid/sessions/:sid/model` (+ thinking), note `PUT /workspaces/:wid/model` là workspace default cho session mới.
  - Migration: legacy sessions chưa có `session/model` → fallback workspace default (không cần backfill event).
  - `docs/superpowers/plans/2026-09-15-warm-studio-workbench-redesign.md` nếu cần note.
- Non-functional: không hand-edit INDEX.md; plan file là source of truth.

## Architecture
- Docs edits nhỏ, không đổi plan scaffolding.
- Verification: targeted `vitest` per-session model suite + `tsc` + `build:web` (+ `test:browser` nếu có).

## Related Code Files
- Modify: `docs/harness.md`
- Modify: `docs/web.md`
- Verify: `tests/web/server*.spec.ts`, `tests/harness/session*.spec.ts`

## Implementation Steps
1. Sửa `docs/harness.md` § Live controls / Session log.
2. Sửa `docs/web.md` § REST API + Workspace-scoped routes table.
3. Chạy `ak plan validate` + `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.web.json && pnpm test` (targeted rồi full).
4. Record Verification trong `plan.md`.

## Success Criteria
- [x] `ak plan validate ./plans/260918-1009-per-session-llm-model` pass
- [ ] `tsc` + `pnpm test` pass — `tsc` passes; full `npx vitest run` is 547/548 with the single failure in `tests/capabilities/bash.spec.ts` (Windows process-tree kill, untouched by this feature); targeted per-session suites 22/22
- [ ] Manual: tạo 2 session cùng workspace, đổi model A, check B unchanged, restart vẫn giữ — not performed; the server-side equivalents (isolation, creation snapshot, restart replay) are automated in `tests/web/server-session-model.spec.ts`

Docs outcome (2026-09-18): `docs/harness.md` — `session/model` is durable and `deriveSessionModel` makes provider/model null an explicit non-sendable blank and thinking null the selected-model default; only legacy logs fall back to workspace. `docs/web.md` — route table splits per-conversation `GET/PUT …/sessions/:id/model` from workspace defaults; the per-conversation section documents omitted versus null, blank/partial/complete validation, durability fencing, and next-request semantics. `README.md` now states the same binding contract. `docs/superpowers/plans/2026-09-15-warm-studio-workbench-redesign.md` needed no change: its ModelMenu references cover styling parity, not model scoping.

## Risk Assessment
- Risk: quên update `docs/web.md` route table → doc/code drift — Mitigation: verify links/claims against source.
