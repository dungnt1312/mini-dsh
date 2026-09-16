---
phase: 2
title: "Design contract and visual gate"
status: pending
priority: P1
effort: 2d
dependencies: [1]
---

# Phase 2: Design contract and visual gate

## Overview

Create and review representative high-fidelity screens before feature migration. The reference screenshot informs hierarchy and density only.

## Requirements

- Functional: design empty/onboarding, populated tools, approvals/errors, all settings groups, desktop/tablet/mobile.
- Non-functional: annotated dimensions/tokens/states; no fake terminal/Git/marketplace/upload chrome; English product copy.

## Architecture

Use one workbench contract: app bar -> navigation -> centered transcript/composer -> optional read-only inspector. Settings is a full-height grouped surface. Every mockup maps visible elements to existing data/APIs or marks an approved additive contract.

## Related Code Files

- Reference: `plans/260911-1139-product-ui-standardization/design-contract.md`
- Reference: `web/styles/tokens.css`
- Reference: `web/styles/shell.css`
- Reference: `web/styles/chat.css`
- Reference: `web/styles/settings.css`
- Create during implementation: reviewed mockups under `assets/designs/product-ui-standardization/`

## Implementation Steps

1. Produce desktop 1440 empty/onboarding with inspector closed.
2. Produce desktop populated transcript with compact thinking/tool disclosures and inspector open.
3. Produce approval, failed, interrupted, send-uncertain, reconnecting variants.
4. Produce settings views for Providers, Agents, MCP, Hooks, Secrets, including global/workspace/session badges.
5. Produce 375 mobile and 768 tablet conversation/settings variants.
6. Annotate 48/264/304/760 geometry, 16/24 margins, 13px UI, 14px/22 prose, 32/44 controls, 6/8/10 radii.
7. Run visual review against explicit denylist and card-overload question.
8. Lock approved screenshots and textual interaction notes before Phase 3.

## Success Criteria

- [ ] All six required mockup sets in `design-contract.md` exist.
- [ ] Every interactive control maps to a real API/state owner.
- [ ] Human review approves control ownership, density, hierarchy, and safety semantics.
- [ ] Reviewer confirms no unsupported reference chrome and no decorative card stack.
- [ ] Long paths, arguments, errors, and custom names are represented.

## Risk Assessment

- High: implementation starts from unapproved wireframes. Mitigation: Phase 3 blocked until explicit visual approval.
- Medium: screenshot aesthetics copied without product fit. Signal: mockup contains unsupported feature. Response: remove it before review.

## Rollback

Discard unapproved mockups; keep audit and engineering baseline unchanged.

## Implementation evidence (2026-09-11)

Created representative.html and desktop/mobile/tablet/settings PNG references before production migration. Desktop reference inspected with image tooling. Human signoff is pending; autonomous implementation explicitly requested by user. Do not interpret these artifacts as approved baselines.

Acceptance remains evidence-based: unchecked gates are not silently waived. See `artifacts/product-ui/acceptance.json` and `docs/design-guidelines.md`.
