---
phase: 7
title: "English migration and naming"
status: pending
priority: P1
effort: 1.5d
dependencies: [4, 5, 6]
---

# Phase 7: English migration and naming

## Overview

Complete an English migration with Vietnamese-specific static evidence for product-owned content and enforce the Conversation/Workspace/Project glossary without translating user or external data.

## Requirements

- Functional: labels, titles, ARIA, toasts, empty/loading/errors, locale, fallbacks, built-in display names, known errors.
- Non-functional: exhaustive scan with reviewed allowlist; IDs and wire contracts unchanged.

## Architecture

Centralize product copy, built-in display labels, date formatting, and error summaries where practical. Keep source data untouched. A classifier/test distinguishes product literals from preserve-verbatim values. Technical `session` API/type names remain for compatibility.

## Related Code Files

- Modify: all product-rendering files under `web/` identified by Phase 1 inventory
- Modify: `web/index.html`
- Modify/Create: copy/glossary/date/error modules under `web/lib/`
- Optional modify: `src/web/server.ts` only for English product fallback and additive session timestamps
- Modify: `web/lib/types.ts` and `web/lib/api.ts` only if optional timestamps approved
- Modify: `docs/web.md`, `README.md` product-facing web copy
- Tests: copy audit, locale/date tests, API integration tests if fields change

## Implementation Steps

1. Replace product-owned Vietnamese/bilingual literals across app, components, ARIA, titles, placeholders, toasts, loading, errors, and tests.
2. Set document language to English (`web/index.html:1-10`).
3. Enforce glossary: Conversation in UI; Workspace and Project remain distinct; Chat only is not Chat mode.
4. Map bundled mode IDs to English product labels without changing IDs; custom mode names pass through unchanged (`src/harness/modes/bundled.ts:8-71`).
5. Set explicit English date/time locale for verified timestamps. Never use current client time as a data substitute.
6. Change product-owned empty fallback “new session” to “New conversation” if server fallback remains visible; preserve derived titles from first user message (`src/web/server.ts:3114-3123`).
7. If approved, expose optional `createdAt`/`updatedAt` from existing summary in `listSessions`; update types and integration tests. Otherwise omit conversation-list timestamps.
8. Add known backend error mappings while retaining raw detail and preserving identifiers/content.
9. Run static and rendered copy audit. Maintain explicit allowlist for protocol names, IDs, imported/user/tool content, acronyms, and test fixtures.

## Success Criteria

- [x] Vietnamese-specific product-source scan returns zero; preservation fixtures cover reviewed external content.
- [x] Rendered accessibility tree contains English product labels.
- [x] User message, project/workspace/provider/model/tool/custom-mode fixtures are byte-for-byte unchanged.
- [x] UI uses Conversation consistently; no mixed Chat/Task/Session synonyms for the durable thread.
- [x] Built-in mode IDs and API routes are unchanged.
- [x] Dates use explicit English locale and only verified timestamps.
- [x] Optional timestamp contract, if selected, is additive and integration-tested.

## Backwards Compatibility

No stored content translation. No ID changes. Optional fields only. Old clients ignore fields; old records already contain summary timestamps. Resetting a custom title continues to derive from user content.

## Risk Assessment

- High: automated sweep translates external/user content. Mitigation: no runtime translation; only literals and presentation mapping; preservation fixtures.
- Medium: renaming Session in code causes broad API churn. Mitigation: rename product copy only; technical names remain.
- High: fake timestamp added for design parity. Mitigation: acceptance explicitly fails if field is absent and UI still renders time.

## Rollback

Revert presentation copy/mappings. If optional session fields were added, remove UI use first; server fields can remain harmless until separately reverted.

## Implementation evidence (2026-09-11)

Product source Vietnamese scan passes; English HTML/date/fallback labels in place. Custom content fixtures remain verbatim. Additive summary timestamps tested; empty conversations omit dates because underlying empty summaries use a current-time fallback. Copy inventory and design guidelines delivered.

Acceptance remains evidence-based: unchecked gates are not silently waived. See `artifacts/product-ui/acceptance.json` and `docs/design-guidelines.md`.

### Independent review blocker closure

Controller independent code/test/design review was performed. Mobile visual rereview passed. Keyless providers restored; all management scopes remount and invalidate stale async feedback; imported agent catalog/inspect/spawn/delete available; project removal refuses bound conversations with HTTP 409, never detaches. js-yaml upgraded only to 4.3.2. Final 331 tests in 39 files, 10 browser tests, typecheck/build pass. Initial marker-contaminated failure retained in review-fix-full-tests.log; unique-temp test isolation preserves original assertion. Final evidence: artifacts/product-ui/acceptance.json. Human visual approval remains separate.
