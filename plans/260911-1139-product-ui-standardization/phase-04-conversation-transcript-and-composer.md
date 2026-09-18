---
phase: 4
title: "Conversation transcript and composer"
status: pending
priority: P1
effort: 2.5d
dependencies: [3]
---

# Phase 4: Conversation transcript and composer

## Overview

Make prose primary, align transcript/composer at 760px, compact technical disclosures, and keep model/mode editing solely in composer.

## Requirements

- Functional: empty/onboarding, transcript, thinking, tools, markdown, composer controls, stop/send, project scope disclosure.
- Non-functional: readable 14px/22 prose, compact 13px UI, long-content containment, no card overload.

## Architecture

Durable events remain the only transcript source (`web/lib/project.ts:36-119`). `projectItems` output maps to prose, compact status separators, thinking disclosure, and tool disclosure. Composer continues to post with stable request ID and revision-safe draft clearing (`web/App.tsx:229-247`).

## Related Code Files

- Modify: `web/components/chat/Transcript.tsx`
- Modify: `web/components/chat/MessageParts.tsx`
- Modify: `web/components/chat/ThinkingPanel.tsx`
- Modify: `web/components/composer/Composer.tsx`
- Modify: `web/App.tsx` only for agreed component wiring
- Modify: `web/styles/chat.css`
- Modify: `web/Markdown.tsx` if semantic markup requires it
- Tests: mounted transcript/composer specs and `web/lib/workflow.spec.tsx`

## Implementation Steps

1. Set transcript/composer shared 760px width with 24px tablet and 16px mobile margins.
2. Keep user messages visually distinct but reduce bubble/card dominance; assistant prose uses canvas directly.
3. Convert thinking/tool output to compact disclosure rows with accessible expanded state, exact arguments/output, result, duration, and long-content handling.
4. Compress persistent scope explanation into a concise line plus on-demand details.
5. Keep editable mode/model selectors in composer only; clarify they are workspace controls applied at verified gates (`web/lib/api.ts:204-210`, `web/lib/api.ts:267-277`).
6. Preserve stop/send disable rules, IME behavior, retained draft on uncertain failure, and no automatic resend.
7. Design empty project-bound/chat-only/no-provider/no-conversation states in English.
8. Add mounted tests for typing, Enter/Shift+Enter/IME, selector changes, stop/send, disclosure toggles, long output, and preserved external content.

## Success Criteria

- [x] Transcript and composer computed max width are 760px.
- [x] Body copy computes to 14px/22px; product UI to 13px.
- [x] Tool/thinking details remain available but collapsed technical chrome does not dominate prose.
- [x] Exact arguments/output and recovery markers are preserved.
- [x] Only composer exposes editable model/mode in the main workbench.
- [x] No automatic retry/replay control exists.
- [x] Mounted interaction tests cover keyboard submission and disclosures.

## Regression Constraints

- Chunks never become model history and must stop appearing live at turn end (`web/lib/project.ts:46-79`, `web/lib/project.ts:108-112`).
- User content, tool output, model/provider IDs, paths, and custom names remain verbatim.

## Risk Assessment

- High: compact tools hide failures/arguments. Mitigation: summary always shows state/name/target; one action reveals exact payload and output.
- High: composer simplification obscures scope. Mitigation: fixed project/chat-only line always visible; details explain workspace controls.
- Medium: 760px harms wide tables/code. Mitigation: contained horizontal scroll inside code/table only.

## Rollback

Revert presentation components/CSS while retaining Phase 3 shell. Event projection and API remain unchanged.

## Implementation evidence (2026-09-11)

Implemented prose-first 760px transcript/composer, compact disclosures, concise scope, retained IME/send/draft controls and verbatim content. Mounted tests verify Enter/Shift+Enter/IME and exact disclosure payloads. Production browser screenshot inspected.

Acceptance remains evidence-based: unchecked gates are not silently waived. See `artifacts/product-ui/acceptance.json` and `docs/design-guidelines.md`.
