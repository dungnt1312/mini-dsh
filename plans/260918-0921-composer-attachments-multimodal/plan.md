---
status: done
branch: feat/warm-studio-workbench
---

# Production composer: inline chips, attachments, multimodal

## Outcome
The composer becomes a real editor instead of a textarea:

- **Inline chips** inside the text (contenteditable), for `@` file mentions and for
  attachments, rendered where they were typed.
- **`+` button** attaching both project files and files uploaded from the machine.
- **Images** reach the model for real: pasted, dropped or attached screenshots travel
  end to end as image content parts, not as a promise.

## Decisions (user-accepted 2026-09-18)
- Full production scope, not an MVP: both attachment sources, inline chips, multimodal.
- Inline chips in a contenteditable, accepting the caret/selection/IME/paste cost.
- Multimodal lands in this effort, so `ModelMessage.content` becomes text-or-parts.

## Verified constraints (read before planning)
- `ModelMessage.content` is a bare `string` (`src/harness/llm/types.ts:18`) and
  `toWireMessages` sends it verbatim (`src/harness/llm/openai.ts:40`). DeepSeek is the
  same class, so one wire change covers both providers.
- The durable log carries strings: `user/message.content`, `input/queued.content`
  (`src/harness/session/events.ts:30,41`), and `deriveMessages` copies them straight
  into model messages.
- Only 23 `.content` reads exist across `src/`, and most read events, not messages.
- There is no upload route and no blob storage anywhere in the server.
- The budget is already an admitted estimate (chars/4, `src/harness/context/budget.ts`).

## Constraints / non-goals
- Bytes never live in the JSONL event log: events carry a content-addressed reference,
  the store owns the blob.
- Unsupported types are refused at upload with the reason, never silently accepted.
- Approvals, queueing, stop, draft-keeping and the SSE contract keep their semantics.
- No editor framework (Slate/Lexical/ProseMirror): one contenteditable we control.
- A project-file mention is a reference, not an upload: the agent still reads it with
  its own file tools under the same permission gates.

## Phases
| # | Phase | Status |
|---|---|---|
| 1 | Attachment store: content-addressed blobs per workspace, type allowlist, size caps | done |
| 2 | Multimodal vocabulary: content parts, wire format, budget accounting, text extractor | done |
| 3 | Durable path: events carry refs, `deriveMessages` builds parts, submission validates | done |
| 4 | Upload/serve routes + harness limits | done |
| 5 | Composer editor: contenteditable with inline chips, `+` menu, paste/drop, draft v2 | done |
| 6 | Transcript rendering, docs, end-to-end verification | done |

Each phase must typecheck and keep the suite green before the next one starts.

## Acceptance criteria
- Pasting a screenshot into the composer shows an inline image chip and the model
  receives it as an image part on the wire.
- `+` attaches a project file (reference chip) and an uploaded file (stored chip).
- A mention typed with `@` renders as a chip inline, where the caret was.
- Removing a chip removes exactly that reference; the rest of the draft survives.
- An oversized or unsupported upload is refused with a reason the user can act on.
- Attachments survive a reload in the draft and replay correctly in the transcript.
- A conversation with images still compacts, titles and budgets without crashing.
- `pnpm test` and `pnpm typecheck` pass.

## Verification
- `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.web.json`: pass (2026-09-18).
- `pnpm test`: 519/520 pass; 1 flake in `tests/capabilities/bash.spec.ts` (orphan-subshell marker, unrelated to this plan; rerun green).
- Attachment store: 6 tests (`tests/harness/attachments.spec.ts`), server attachments: 9 tests (`tests/web/server-attachments.spec.ts`).
- Composer mounted: 8 tests (`web/components/composer/composer.mounted.spec.tsx`); budget/wire: `IMAGE_TOKEN_ESTIMATE` 1200 per image part, `toWireContent` sends `image_url` data URLs.
- Docs: `docs/harness.md` (ContentPart, deriveMessages/attachments, limits) and `docs/web.md` (contenteditable, + menu, attachment routes) updated.
