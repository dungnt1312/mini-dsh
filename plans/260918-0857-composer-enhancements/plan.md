---
status: done
branch: feat/warm-studio-workbench
---

# Composer enhancements (group 1)

## Outcome
The chat composer gains four capabilities the client already has data for:

1. `@` file mention — typeahead over the conversation's project, inserts a root-relative path.
2. `/` skill command — typeahead over the workspace skill catalog at the start of a draft.
3. `ArrowUp` on an empty draft recalls the newest own user message for editing.
4. Drafts survive a reload (per workspace+session, localStorage).

## Decisions (user-accepted 2026-09-18)
- Bundle 1–4 in one pass; they share one completion popup (DRY).
- Correction to the original proposal: `/files` lists **one directory**, so `@` typeahead
  needs a small bounded, read-only **search** endpoint. Same containment rules as listing.
- `@` inserts the path only (the agent reads it with fs tools). No content inlining, no upload.
- `/` triggers only at draft position 0, so `/usr/bin` style text never opens the menu.

## Constraints / non-goals
- No change to send/queue semantics, approvals, or the SSE contract.
- Search is read-only, bounded (entry budget + result cap), and never leaves the project root.
- No multimodal/paste-image (the LLM layer has no image part) and no queue chip — later groups.
- Storage failures must never break the composer.

## Files
| Area | File |
|---|---|
| search core | `src/web/project-files.ts` |
| route | `src/web/server.ts` (`(files\|file\|search)`) |
| client api | `web/lib/api.ts` |
| completion logic | `web/lib/composer-completion.ts` (+ spec) |
| draft storage | `web/lib/composer-drafts.ts` (+ spec) |
| popup | `web/components/composer/CompletionPopover.tsx` |
| composer | `web/components/composer/Composer.tsx` (+ mounted spec) |
| wiring | `web/App.tsx` |
| docs | `docs/web.md` |

## Phases
| # | Phase | Status |
|---|---|---|
| 1 | Bounded project search (server + route + tests) | done |
| 2 | Completion logic + draft storage libs (+ specs) | done |
| 3 | CompletionPopover + Composer keyboard/aria | done |
| 4 | App wiring (file search, skills, recall, persisted drafts) | done |
| 5 | Verify (vitest, typecheck) + docs | done |

## Acceptance criteria
- Typing `@re` in a project conversation lists matching files; Enter/Tab inserts the path.
- Typing `/` at draft start lists skills; picking one inserts its invocation text.
- ArrowUp in an empty composer loads the last user message; ArrowUp with text moves the caret.
- Reload keeps the unsent draft of each workspace/session.
- Search refuses traversal and foreign roots exactly like listing/reading.
- `pnpm test` and `pnpm typecheck` pass.

## Verification (2026-09-18)
- `npx tsc --noEmit` on both `tsconfig.json` and `tsconfig.web.json` — 0 errors.
- `npx vitest run web tests/web` — 26 files, 274 passed.
- `npx vitest run` (whole suite) — 499 passed, 1 failed:
  `tests/capabilities/bash.spec.ts > the timeout kills the whole tree`. It passes on its
  own (12/12) and touches no file in this change; it is a load-sensitive Windows
  process-tree timing flake, left as it was found.
- Playwright (`pnpm test:browser`) not run: the branch's e2e files are mid-rewrite.

## Follow-ups (proposal groups 2–3, not built)
Queue chip, paste/drop of text files, context-budget indicator, prompt templates,
multimodal images.
