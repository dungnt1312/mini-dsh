---
phase: 8
title: "Accessibility, validation, and rollout"
status: pending
priority: P1
effort: 2d
dependencies: [7]
---

# Phase 8: Accessibility, validation, and rollout

## Overview

Validate the standardized UI in a real browser, establish screenshot baselines, verify accessibility/performance, and roll out phase-by-phase without disturbing unrelated dirty work.

## Requirements

- Functional: browser E2E for primary and safety workflows; screenshot coverage; keyboard/focus; responsive settings.
- Non-functional: contrast, zoom, target size, reduced motion, measured performance; exact regression evidence.

## Architecture

Add a real browser runner because current package scripts expose Vitest/typecheck/build only (`package.json:10-18`). Keep unit/mounted/API/browser layers separate. Screenshot fixtures seed deterministic workspaces, projects, conversations, events, approvals, and settings states without changing production behavior.

## Related Code Files

- Modify: `package.json` and lockfile only to add approved test tooling
- Create: browser/E2E configuration and specs under repository test convention
- Create: deterministic UI fixture helpers under tests
- Create: screenshot baselines under test-owned assets
- Modify: existing web unit/mounted/API tests as needed
- Reference: all Phase 3-7 owned files for fixes found during validation

## Implementation Steps

1. Select a maintained real-browser runner with screenshot and accessibility support; document version and commands.
2. Add deterministic fixture setup for empty/onboarding, populated tools/thinking, approvals/errors, settings groups, custom names, and long content.
3. Run viewport screenshots at 320, 375, 768, 1024, 1440, 1920; include inspector closed/open and all settings groups.
4. Test 200% zoom, keyboard-only traversal, visible focus, tab/arrow/Home/End/Escape ownership, focus restoration, and no hidden focusable drawers.
5. Measure text/non-text contrast >=4.5/3 and coarse targets >=44px.
6. Run mounted interactions for controls/dialogs/settings and API integration for any timestamp/title fields.
7. Run English rendered-copy audit plus preserve-verbatim allowlist fixtures.
8. Record no-card-overload visual review and unsupported-chrome absence.
9. Measure long conversation/list performance before considering virtualization. Define threshold and evidence; if acceptable, do not add virtualization.
10. Execute existing test/typecheck/build only during implementation verification, never during this planning session.
11. Roll out in phase order, inspect phase-scoped diffs, and preserve unrelated dirty files.

## Success Criteria

- [ ] Browser E2E covers empty/onboarding, populated tools, approvals/errors, settings all groups, and mobile.
- [ ] Screenshots pass at six required widths.
- [ ] 200% zoom has no lost actions or page-level two-axis scrolling.
- [ ] Keyboard/focus tests pass for app bar, drawers, dialogs, composer, approvals, and settings.
- [ ] Contrast and target-size numeric checks pass.
- [ ] English copy audit and preservation allowlist pass.
- [ ] No-card-overload and no-fake-chrome visual gates are signed off.
- [ ] Existing unit/integration suites, typecheck, and web build pass during implementation verification.
- [ ] Virtualization is absent unless a measured failure and threshold justify it.

## Rollout

1. Approve screenshots in a review environment.
2. Release shell and conversation changes before settings only if all shared tokens are stable.
3. Release English migration atomically across product surfaces to avoid bilingual intermediate UI.
4. Monitor creation, send, approval, settings save/delete, and workspace switch errors.

## Risk Assessment

- High: screenshot tests bless incorrect safety behavior. Mitigation: pair screenshots with interaction assertions and server API integration.
- High: dirty tree contaminates release. Mitigation: phase file lists, diff allowlist, no reset/clean, reviewer checks unrelated paths.
- Medium: browser tooling adds weight. Mitigation: one runner, deterministic fixtures, no duplicate framework.
- Medium: performance optimization added prematurely. Mitigation: measurement gate; default decision is no virtualization.

## Rollback

Revert the latest phase presentation and its baselines. Keep previous approved phase. Remove test tooling only if it blocks repository workflows; test evidence remains in review records.

## Unresolved Questions

None for planning. Implementation remains blocked by visual approval and browser-runner selection gates already named in the plan.

## Implementation evidence (2026-09-11)

326 tests / 38 files pass sequentially; typecheck and production build pass; 8 Chromium browser tests pass. Axe reports zero violations in all six settings tabs. Six viewport screenshots, touch targets and keyboard/reflow evidence captured. Native 200% zoom, full screen-reader audit, long-history performance measurement, independent code review and human visual signoff remain pending.

Acceptance remains evidence-based: unchecked gates are not silently waived. See `artifacts/product-ui/acceptance.json` and `docs/design-guidelines.md`.

### Mobile visual audit follow-up

Replaced clipped mobile tabs with a scoped native section selector. Removed nested provider scroll ownership and old mobile height override; reserved safe-area footer padding and final-field scroll clearance. Scope summary is compact with details disclosure; host privilege warning remains visible. Section changes reset scroll position. Nine browser tests, 42 targeted tests, typecheck and build pass. Screenshots `320-settings-fixed-bottom.png`, `375-settings-fixed-top.png`, and `320-settings-fixed-hooks.png` were observed. Clipboard rejection recovery is accessible and mounted-tested. Independent review remains pending.

### Independent review blocker closure

Controller independent code/test/design review was performed. Mobile visual rereview passed. Keyless providers restored; all management scopes remount and invalidate stale async feedback; imported agent catalog/inspect/spawn/delete available; project removal refuses bound conversations with HTTP 409, never detaches. js-yaml upgraded only to 4.3.2. Final 331 tests in 39 files, 10 browser tests, typecheck/build pass. Initial marker-contaminated failure retained in review-fix-full-tests.log; unique-temp test isolation preserves original assertion. Final evidence: artifacts/product-ui/acceptance.json. Human visual approval remains separate.
