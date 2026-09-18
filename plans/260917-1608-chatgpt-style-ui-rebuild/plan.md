---
status: done
branch: feat/warm-studio-workbench
---

# ChatGPT-style web UI rebuild

## Outcome
Replace the Warm Studio presentation layer of `web/` with a ChatGPT-like client:
left conversation sidebar, single centered chat column, composer in normal flow at the
bottom (centered on the empty state), inline compact tool rows, right slide-over sheet for
Context/Artifacts, centered Settings dialog. Light + dark neutral theme following the system
with a manual System/Light/Dark override.

## Decisions (user-accepted 2026-09-17)
- Visual: neutral Light + Dark (drop cream/terracotta).
- Layout: ChatGPT. Context/Artifacts = right sheet, closed by default, no docking/resizing.
- Scope: whole client, phased; work on current branch.
- Tests: keep logic specs (lib, hooks, projectors); rewrite markup/e2e specs for the new UI.

## Constraints / non-goals
- No REST/SSE contract change. Keep `lib/api.ts`, `lib/types.ts`, `lib/project.ts`,
  `lib/interaction.ts`, `lib/route.ts`, `lib/providers.ts`, `lib/model-info.ts`,
  `useSessionStream`, and App state/navigation-generation logic unchanged in behavior.
- Keep product safety rules: approvals one-request semantics + confirmed always-allow,
  draft kept until accepted, no auto resend, recovered outcome called out, status never
  color-only, Settings dirty-draft confirm, Hooks/Skills/Memory conflict rules.
- Three CSS files only (`app.css`, `markdown.css`, `motion.css`); geometry via Tailwind.
- No fixed-position composer / measured dock hacks; no pinned workbench surface.

## Phases
| # | Phase | Status |
|---|---|---|
| 1 | Tokens + theme, AppShell (sidebar docked/drawer, main column), header w/ model picker, transcript (auto-scroll), message parts, thinking, status, approvals, composer, empty state | done |
| 2 | Context/Artifacts right sheet; delete WorkbenchSurface, resizer, old shell/topbar | done |
| 3 | Settings dialog + provider editor + management panels + folder picker + confirm/toast restyle | done |
| 4 | Tests rewrite (vitest markup specs, Playwright e2e + axe + 320/375/768/1024/1440/1920 screenshots), docs update | done |

## Verification (2026-09-17)
- `npm run typecheck` 0 errors (also fixed pre-existing DOM-lib errors in browser e2e files).
- `npx vitest run` 457/457.
- `npm run build:web` ok.
- `npx playwright test` 58 tests: full run 57 pass + 1 cold-start failure on the first test (vite dev server warm-up); `chat-shell` repeated 3× = 27/27.
- Screenshots: `artifacts/product-ui/chat/` (light/dark × 6 widths) and `artifacts/product-ui/chat/matrix/`.

## Open items
- `docs/ux-ui-standardization-checklist.md` (untracked) describes the replaced Warm Studio work; keep or delete is the owner's call.
- `@fontsource/instrument-sans` is no longer imported; dependency removal left for a separate change.
- Real-backend manual QA (live provider) not done.

## Acceptance
- Opening a long conversation lands at the bottom; user can scroll freely; new output
  follows only when pinned to bottom; "jump to latest" button otherwise.
- No element pinned over the transcript except header/composer.
- Both themes readable (AA), no horizontal overflow at 320–1920px.
- `npm run typecheck`, `npm test`, `npm run build:web`, `npm run test:browser` green.
