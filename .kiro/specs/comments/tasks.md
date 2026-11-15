# Implementation Plan: comments (T10)

## Overview

This plan implements the comments API (E23–E26) and the card detail modal described in `design.md` (root T10). Order of work: the Flask comments blueprint and its tests, a backend checkpoint, the frontend foundation (types, parsers, Next handlers, allowlist), the two board-hook additions, the comments hook, the components, the board wiring, the measured mobile check and journey, the full verification checkpoint, and documentation.

**Status:** Done locally (2026-11-13). Requirements, design and this plan were approved (decisions M1–M13 and clarifications N1–N5). Every group is verified; see `evidence/comments-T10.md`. Open outside this plan: Playwright (V10), real-device checks (T15) and deployment (T16).

**Root task:** T10. Existing root IDs are preserved and no new root ID is proposed. Root T10 stays as it is in `specs/tasks.md` until its checks pass.

**Inputs:** `requirements.md` (Requirements 1 to 9, M1–M13, N1–N5), `design.md` (DD1–DD15, Properties 1–19, WP-B1 to WP-D, C14–C17).

## Dependency gates

| Gate | Rule | Enforced by |
|---|---|---|
| A | Root T08 and T09 are verified (they are checked in `specs/tasks.md`). No gate blocks the start. | Verified at spec time |
| B | The backend comments API passes its checks before any frontend task that calls it. | 3.2 |
| C | The frontend and the full suites pass before the mobile check is recorded as final. | 10 |

A failed or blocked check keeps its task open with the actual reason. Do not mark root T10 complete on partial evidence.

## Test conventions (all groups)

- Backend database-writing tests run on `TEST_DATABASE_URL` through `db_guard` and `BoardTracker`. Rows created by the test, directly or through the API, are tracked. Teardown deletes only those rows and the rows that reference them, in foreign-key order, whether the test passes or fails. No `TRUNCATE`, no name patterns, never `DATABASE_URL`.
- Frontend tests use Vitest and React Testing Library. They assert rendered text, roles and the requests sent, not only that a component mounts.
- No Hypothesis or fast-check. Properties are parameterized tests over fixed tables.
- Every UI task meets Requirement 8: 44 by 44 CSS px controls (rendered box, `elementFromPoint` at the center), 16 px fields, no horizontal page scroll, the `wide` dialog box within the viewport, checked at 375 px and recorded at 320, 375, 768 and 1280 px (FE-S4 to FE-S6, FE-D9).
- Backend command (from `backend/`): `.venv/bin/python -m pytest <files> -v -p no:cacheprovider`. Frontend commands (from `frontend/`): `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Record the exact commands and real counts in `evidence/comments-T10.md`.
- Do not write real passwords, tokens or connection strings into specs, evidence, logs or shell arguments.

## Tasks

- [x] 0. Record review outcomes and align contracts (spec phase)
  - [x] 0.1 Decisions M1–M13 and shared docs
    - Done with the requirements approval: `specs/requirements.md` AC08.2, `docs/API.md` E23–E26 and the comment check-order note, `backend/specs/api-contract.md`, `docs/TEST-PLAN.md` V06, `docs/RUBRIC.md` (create-path difference), `specs/design.md` D5, `specs/CHANGELOG.md` and `evidence/spec-review.md`.
    - _Requirements: 5.7, 9.8; Root: T10_
  - [x] 0.2 Clarifications N1–N5
    - Done with the design review: requirements 2.8, 2.9, 6.1, 6.4, 6.7, 7.7, 7.8, 7.12, 8.1, 9.5, `design.md` DD6, DD9, DD10, DD12, DD15, Properties 16 to 19, and `evidence/spec-review.md`.
    - _Root: T10_

- [x] 1. Comments API (WP-B1, root T10)
  - [x] 1.1 Create `specs/fixtures/comment-field-cases.json`
    - Cases for `content`: empty, spaces only, 1 character, 2,000 characters, 2,001 characters, leading and trailing spaces (trimmed), inner line breaks kept, a number, `null`, a missing key, an unknown extra key. Same shape as `kanban-field-cases.json`, with the fixed messages. Backend and frontend tests read it.
    - **Acceptance check:** the file parses as JSON and `test_comments_schema.py` (2.1) and `lib/commentRules.test.ts` (4.3) both load it.
    - _Requirements: 2.2, 3.3; Root: T10; AC08.1_
  - [x] 1.2 Create the `comments_bp` blueprint and schemas
    - `backend/app/blueprints/comments/{__init__,routes,schema,service}.py`, registered in `backend/app/__init__.py`. `CommentContentSchema` (`content` required, `TrimmedString`, 1 to 2,000, fixed messages, `unknown = RAISE`) for E24 and E25. `CommentSchema` with `Meta.fields` and a `UtcDateTime` field that converts to UTC and formats ISO 8601. Import validators from `app.validation`.
    - **Acceptance check:** the app factory imports, `flask routes` lists the four comment routes, and `ruff check` passes on the new files.
    - _Requirements: 2.2, 5.6; Root: T10_
  - [x] 1.3 Implement the service (E23 to E26)
    - `board_of_comment`, `load_comment` (join through the card and column, all three `deleted_at` null, `populate_existing`), `_comment_rows` and `_comment_dict` (join `users.name` as `author_name`, order `(created_at, id)`). `list_comments`, `create_comment`, `update_comment` and `delete_comment` as in the design sketch: board access, lock for writes, reload under the lock, author check after the lock (`UnauthorizedBoardAccessError`), one clock reading for `created_at` and `updated_at` on create (DD6, N1), `comment_created` event on create only, same-content edit returns without a write (DD5), E26 returns the pre-delete DTO, `commit_or_rollback` once. Leave a one-line marker where T13 adds the notification. No `bump_position_version`.
    - **Acceptance check:** exercised by the tests in group 2, not by hand.
    - _Requirements: 1.1–1.6, 2.1–2.9, 3.1–3.6, 4.1–4.5, 5.1–5.5; Root: T10_
  - [x] 1.4 Implement the routes
    - `GET` and `POST /api/cards/<card_id>/comments`, `PATCH` and `DELETE /api/comments/<comment_id>`, each with `@token_required`, `parse_uuid` (400 before any query), `load_json_body` where a body exists, and the schema serializers. 200 for E23, E25 and E26, 201 for E24.
    - **Acceptance check:** a request with a bad path UUID returns 400 without a database query, and an authenticated request returns the documented status and shape (asserted in 2.3 and 2.4).
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 5.6; Root: T10_

- [x] 2. Backend tests (WP-B2, root T10)
  - [x] 2.1 Write `test_comments_schema.py`
    - Cases from `comment-field-cases.json`, non-text content, unknown fields, the `CommentSchema` allowlist, UTC ISO timestamps with the connection time zone set to a non-UTC value.
    - **Property 1: Content rule; Property 2: Response allowlist.**
    - **Acceptance check:** the file passes, and a deliberate extra field on the serializer makes it fail.
    - _Requirements: 1.5, 2.2, 2.3, 3.3_
  - [x] 2.2 Write `test_comments_list.py`
    - E23: order by creation time then ID, empty list, soft-deleted omission, author name from `users` and after a rename, a removed author's comments still listed to the remaining participants, no pagination.
    - **Property 8: List order and omission.**
    - **Acceptance check:** the file passes.
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 4.2_
  - [x] 2.3 Write `test_comments_create.py`
    - E24: 201 shape, trimming, inner line breaks kept and returned unchanged, the 400 cases, `created_at == updated_at` (N1), one `comment_created` event with the actor, board and card, `position_version` unchanged, Member and Admin both succeed, 404 for a missing or soft-deleted card, and two identical posts create two comments (N5, Property 18).
    - **Property 5: No position change; Property 6: Events (create); Property 7: Timestamps (create); Property 16 (backend part); Property 18.**
    - **Acceptance check:** the file passes.
    - _Requirements: 2.1–2.9_
  - [x] 2.4 Write `test_comments_edit_delete.py`
    - E25: a changed edit (200, `updated_at` later, `created_at`, `author_id`, `card_id` kept, no event), a same-content edit after trimming (200, `updated_at` unchanged, N1), the 400 cases, 403 for a non-author Member and for an Admin with the state unchanged. E26: the body equals the pre-delete DTO, omission from E23 afterward, a repeat returns 404, an edit after a delete returns 404, 403 for a non-author Member and an Admin, no event on edit or delete.
    - **Property 3: Author-only (server); Property 7: Timestamps (edit); Property 6: Events (edit, delete).**
    - **Acceptance check:** the file passes.
    - _Requirements: 3.1–3.6, 4.1–4.5_
  - [x] 2.5 Write `test_comments_access.py`
    - Matrix for E23 to E26: anonymous 401, nonmember 404, removed member 404, a removed author's E25 and E26 404, card and comment IDs from another board, a soft-deleted card, column and board 404, identical 404 envelopes, and `Cache-Control: private, no-store` on success and error.
    - **Property 4: Inaccessible resources are indistinguishable.**
    - **Acceptance check:** the file passes.
    - _Requirements: 1.4, 2.4, 3.5, 4.4, 5.2, 5.3, 5.6_
  - [x] 2.6 Write `test_comments_request_order.py`
    - 401, then 400, then 404, then 403, over valid and invalid bodies and each caller: an invalid body from a nonmember is 400, a valid body from a nonmember is 404, an invalid body from a non-author is 400, a valid body from a non-author is 403.
    - **Acceptance check:** the file passes.
    - _Requirements: 5.1_
  - [x] 2.7 Write `test_comments_concurrency.py`
    - E24 racing a member removal (404 after the removal, no comment, no event), E24 racing a card delete (404 after the delete), E25 racing E26 by the author (both end consistent, no 500). Use the thread helpers from `kanban_helpers.py`.
    - **Property 10: Writes serialize with board changes.**
    - **Acceptance check:** the file passes across three consecutive runs.
    - _Requirements: 5.4_
  - [x] 2.8 Write `test_comments_atomicity.py`
    - An injected failure after the flush and before the commit leaves no comment and no event (E24) and no changed content (E25), and E26 leaves the comment active.
    - **Property 9: Failed writes leave no partial state.**
    - **Acceptance check:** the file passes.
    - _Requirements: 2.7, 5.5_
  - [x] 2.9 Write `test_comments_properties.py` and extend the cleanup test
    - Parameterized properties 1 to 8 and 10 over fixed tables where they are not already covered by a named file. Extend `test_boards_cleanup.py`: create comments through the API on a tracked board, fail inside the harness, check they and their events are gone, while a comment on an untracked sentinel board remains. The sentinel is removed by its own IDs after the assertions.
    - **Acceptance check:** both files pass and the cleanup test shows the sentinel row survives.
    - _Requirements: 9.4, 9.6_

- [x] 3. Checkpoint: backend verified (gate B)
  - [x] 3.1 Run the backend checks
    - From `backend/`: `.venv/bin/python -m pytest tests/test_comments_*.py tests/test_boards_cleanup.py -v -p no:cacheprovider`, then the full backend suite, then `ruff check` and `ruff format --check`. Record the commands, environment and real counts in `evidence/comments-T10.md`. Confirm no test wrote outside `TEST_DATABASE_URL` and that the rows created by the run are gone.
    - **Acceptance check:** every command exits 0 and the counts are recorded.
    - _Requirements: 9.4, 9.6_
  - [x] 3.2 Decide gate B
    - Gate B opens only when 3.1 passed. If anything failed or is unverified, record the reason and stop here.
    - _Root: T10_

- [x] 4. Frontend foundation (WP-F1, root T10; starts only after gate B)
  - [x] 4.1 Add the type and the parsers
    - `Comment` in `frontend/lib/types.ts`. `frontend/lib/comments.ts` with `parseComment` and `parseCommentList` that copy only the seven declared fields, require strings, check that both timestamps parse, and throw `malformedApiError()` otherwise. `lib/comments.test.ts` covers valid payloads and each malformed shape (missing field, extra field, wrong type, bad date).
    - **Acceptance check:** `lib/comments.test.ts` passes.
    - _Requirements: 1.5, 9.3; Root: T10_
  - [x] 4.2 Add the Next handlers and path table
    - In `lib/server/flask.ts` add `cardComments: "/api/cards/:cardId/comments"` and `comment: "/api/comments/:commentId"` and `commentId` to `FlaskParamName` and `FLASK_PARAM_NAMES`. Add `app/api/cards/[id]/comments/route.ts` (`GET` through `handlePrivateRead`, `POST` through `handlePrivateWrite` with `allowedKeys: ["content"]`) and `app/api/comments/[id]/route.ts` (`PATCH` with `allowedKeys: ["content"]`, `DELETE` with no body). `app/api/commentsRoutes.test.ts` in the style of `kanbanRoutes.test.ts`: Origin 403 on writes, 401 and cookie clear, allowed keys, an extra key rejected, upstream status pass-through, `no-store`, `GET` without an Origin check.
    - **Acceptance check:** `app/api/commentsRoutes.test.ts` passes.
    - _Requirements: 9.1, 9.2, 5.6; Root: T10_
  - [x] 4.3 Add the client allowlist and the content rule
    - In `lib/apiClient.ts` add `POST /api/cards/UUID/comments`, `PATCH` and `DELETE /api/comments/UUID` to `DECLARED_BOARD_REQUESTS`, and `/api/cards/UUID/comments` to `DECLARED_GETS`. Add `lib/commentRules.ts` with `validateCommentContent` (trim, 1 to 2,000, the fixture's messages). `lib/commentsClient.test.ts` checks the declared pairs, that non-UUID segments throw before `fetch`, and the rules against `comment-field-cases.json`.
    - **Property 12: Client sends only declared requests.**
    - **Acceptance check:** `lib/commentsClient.test.ts` and `lib/commentRules.test.ts` pass.
    - _Requirements: 9.3, 2.2, 7.2; Root: T10_

- [x] 5. Board hook additions (root T10)
  - [x] 5.1 Add `refreshBoard()` and `hasCard()` to `useKanbanBoard`
    - `refreshBoard()` runs the gated refetch and resolves with the `FetchOutcome` (`applied`, `discarded`, `gone`, `failed`). While the gate is held it waits behind it and resolves with the queued refetch's outcome, as `requestRefresh()` queues. `hasCard(cardId)` reads `columnsRef`. `requestRefresh()` and the member-removal refresh keep their behavior. Extend `hooks/useKanbanBoard.test.tsx`: the outcome for each case, waiting behind a pending write, a stale response discarded, `hasCard` before and after a refetch that drops the card, and the existing tests unchanged.
    - **Acceptance check:** the extended `useKanbanBoard.test.tsx` passes with all earlier tests still green.
    - _Requirements: 6.7, 7.7; Root: T10_

- [x] 6. Comments hook (WP-F2, root T10)
  - [x] 6.1 Write `hooks/useCardComments.ts`
    - Load E23 on mount with an `AbortController`. `add`, `edit`, `remove` with one write at a time (a synchronous ref), `pending`, `announcement`, `notice`. Apply the response to the list (append, replace by ID, filter). Ignore every response after unmount (Requirement 7.11). Handle 400 field errors, 403 (notice and reload), 404 through `resolveNotFound` (DD10, no loop on a repeated 404), 5xx and transport failures for edit and delete (notice, list unchanged), and 401 through `useErrorHandler`. Implement the uncertain-add flow of DD15: `addState` `checking`, `review` and `refresh-failed`, the list kept visible, one E23 refetch, no automatic retry, no text comparison.
    - **Acceptance check:** exercised by 6.2.
    - _Requirements: 6.3, 6.6, 6.7, 7.1–7.3, 7.7, 7.8, 7.11, 7.12; Root: T10_
  - [x] 6.2 Write `hooks/useCardComments.test.tsx`
    - Load, error and Retry, add appends, edit replaces, remove filters, one write at a time, a response after unmount ignored, 403 paths, every `resolveNotFound` result (card present reloads, card gone, access lost, unknown, no loop). The uncertain-add states with the list visible, the draft kept in the caller, add blocked in `checking` and `refresh-failed`, enabled in `review`, and exactly one POST without a click.
    - **Property 13: Stale responses; Property 17 (hook part); Property 19.**
    - **Acceptance check:** the file passes.
    - _Requirements: 6.7, 7.7, 7.11, 7.12, 9.5_

- [x] 7. Components (WP-F3, root T10)
  - [x] 7.1 Add the `wide` prop to `BaseModal`
    - Optional `wide?: boolean`: the box is `max-w-2xl` when true and `max-w-md` otherwise, both with `w-full min-w-0`. Extend `BaseModal.test.tsx`: the default class is unchanged, `wide` changes only the width class.
    - **Acceptance check:** `BaseModal.test.tsx` passes. The width at 375 px is measured in 9.2.
    - _Requirements: 6.1, 8.1; Root: T10_
  - [x] 7.2 Extract `CardEditForm` from `CardEditDialog`
    - Move the form, its validation, field errors, Save, Cancel and Delete card with `ConfirmDialog` into `components/kanban/CardEditForm.tsx` without the `BaseModal` wrapper. Add `lockCard` (disables Save card, Delete card and the delete confirmation). Behavior is unchanged. `CardEditForm.test.tsx` carries forward the card cases of `Dialogs.test.tsx` and adds the `lockCard` case.
    - **Acceptance check:** the carried-forward cases pass against the new component.
    - _Requirements: 6.2, 7.9; Root: T10_
  - [x] 7.3 Write `CommentList`, `CommentItem` and `CommentForm`
    - `CommentList.tsx`: props-only, the heading with the count, the empty text "No comments yet.", the list. `CommentItem.tsx`: author name, a `<time dateTime>` with the local date and time, the "Edited" marker only when `updated_at > created_at`, the content as pre-wrapped plain text (`whitespace-pre-wrap break-words`), Edit and Delete only for the current user's comments with labels such as "Edit your comment from 12 Nov", the inline editor (unchanged Save sends nothing, Cancel restores and returns focus), and the delete `ConfirmDialog`. `CommentForm.tsx`: the multiline field "Add a comment", the "Add comment" button, validation through `validateCommentContent`, the draft kept on failure, the disabled state from `addState`. Tests: author name, content with line breaks, markup shown as literal text, no Edited marker for equal timestamps, author-only controls (not for another user, not for an Admin), editor and delete flows, the form's disabled and validation states.
    - **Property 11: Author-only controls; Property 15: Plain text; Property 16 (frontend part).**
    - **Acceptance check:** `CommentList.test.tsx`, `CommentItem.test.tsx` and `CommentForm.test.tsx` pass.
    - _Requirements: 6.4, 6.5, 6.8, 6.9, 7.1, 7.2, 7.4, 7.5, 7.6, 8.3, 8.4, 8.6; Root: T10_
  - [x] 7.4 Write `CardDetailModal`
    - `components/kanban/CardDetailModal.tsx`: `BaseModal wide` named "Card details", a body keyed by card ID that renders `CardEditForm`, the comments section (heading with count, `border-t`, no nested panel), `useCardComments`, the live region, the add-state messages of DD15, the inline notices and the Retry and Refresh comments buttons. `useAuth()` supplies the current user ID. Props: `card`, `members`, `onSave`, `onDelete`, `onClose`, `resolveNotFound`. Passes `pending` to `CardEditForm` as `lockCard`. After a successful delete the focus moves to the comment field in an effect.
    - **Acceptance check:** exercised by 7.5.
    - _Requirements: 6.1–6.9, 7.3, 7.9–7.12, 8.2, 8.5; Root: T10_
  - [x] 7.5 Write `CardDetailModal.test.tsx`
    - Carry forward the `CardEditDialog` behavioral tests with the new selectors (field errors keep values, unchanged Save closes, Delete confirmation, Escape without a request, focus return). Add: loading, empty, error and Retry, add flow with focus kept and no Edited marker on the new comment, pending disables card Save and Delete, live region text, a stale response after close or a card switch, and the 404 outcomes of Requirement 6.7. **Lost-response regression:** a fake server saves the comment and the POST response is rejected with a network error, then check that the draft and the list stay visible, Add comment is disabled while E23 is pending, the refreshed list shows the comment once, exactly one POST was sent, Add comment is then enabled with the "may have been posted" message, and a manual click sends a second POST that creates a second comment. A second case fails the refetch and checks that Add comment stays disabled until Refresh comments succeeds.
    - **Property 14: Card controls wait; Property 17; Property 19.**
    - **Acceptance check:** the file passes, including both uncertain-add cases.
    - _Requirements: 6.1–6.9, 7.1–7.12, 9.5_

- [x] 8. Board wiring (WP-F4, root T10)
  - [x] 8.1 Rename the card button and open the modal
    - `BoardCard.tsx`: the title button is named "Open <title>" (N2). `KanbanBoard.tsx`: open `CardDetailModal` for the selected card, pass `resolveNotFound` built from `kanban.refreshBoard()` and `kanban.hasCard()` (DD10), and close on `card-gone`. Delete `CardEditDialog.tsx`.
    - **Acceptance check:** `npm run typecheck` passes with no import of the deleted file.
    - _Requirements: 6.1, 6.7; Root: T10_
  - [x] 8.2 Update the Kanban tests to the new names
    - In `BoardCard.test.tsx`, `KanbanBoard.test.tsx`, `AddForms.test.tsx` and `Dialogs.test.tsx` change the selectors "Edit <title>" to "Open <title>" and "Edit card" to "Card details", keep every behavioral assertion, and remove only the card cases that moved to `CardEditForm.test.tsx` and `CardDetailModal.test.tsx`. Add cases: the modal opens from the card, `resolveNotFound` closes the modal for a gone card and keeps it for an existing card.
    - **Acceptance check:** the whole Kanban test folder passes and a search finds no remaining "Edit card" or "Edit <title>" selector for a card.
    - _Requirements: 6.1, 6.7, 9.5_

- [x] 9. Browser and mobile verification (root T10)
  - [x] 9.1 Write the measured script `evidence/comments-mobile-measure.mjs`
    - In the style of `evidence/kanban-mobile-measure.mjs`. States: the board with a card, the modal with no comments, the modal with comments (including a long unbroken string and a multi-line comment), the comment editor, the delete confirmation, as the author and as a second user, and the uncertain-add state (force a failed POST). At 320, 375, 768 and 1280 px check: every interactive box at least 44 by 44 CSS px with `elementFromPoint` at its center, field font size at least 16 px, no horizontal page scroll, the `wide` dialog box width no greater than `innerWidth` (N3), focus entry, Tab containment, Escape without an API call, focus return, the close control reachable when the content is taller than the viewport.
    - **Acceptance check:** the script runs and exits 0 on the local stack.
    - _Requirements: 8.1–8.7; Root: T10_
  - [x] 9.2 Run the checks and the manual journey, and record both
    - Start the local stack (backend on the test database, frontend). Run 9.1. Take screenshots at 375, 768 and 1280 px into `evidence/comments-screenshots/`. Walk the journey at 375 px: open a card, add a comment, edit it, delete it, reload, and a second user who sees the comment without controls. Record in `evidence/comments-T10.md`: widths checked, emulator or real device, commands, journey steps with results, screenshot paths and the real outcomes. Leave any real-device check not performed marked open. No Playwright is added in this slice.
    - **Acceptance check:** every measured check passes at 375 px and the record names emulator or real device.
    - _Requirements: 8.7, 8.8, 8.9; Root: T10_

- [x] 10. Checkpoint: frontend and full verification (gate C)
  - Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` from `frontend/`, and the full backend suite and ruff from `backend/`. Record the real output and counts. Ensure all tests pass, ask the user if questions arise.
  - **Acceptance check:** every command exits 0.
  - _Requirements: 9.4–9.7_

- [x] 11. Documentation sync and handoff (`documentation.md`)
  - [x] 11.1 Record status in traceability and evidence
    - Add a comments evidence status table to `specs/traceability.md` (AC08.1, AC08.2, AC13.1, V05, V06, V11) with observed results only, and the open items: Playwright V10 and real-device checks (T15). Record the same in `evidence/comments-T10.md` and add a row to the verification index in `evidence/README.md`.
    - _Requirements: 9.8_
  - [x] 11.2 Update the changelogs
    - Add concise entries under the `## YYYY-MM-DD` heading for the commit date, with a `### <short-sha> <subject>` entry to `CHANGELOG.md`, `backend/CHANGELOG.md` and `frontend/CHANGELOG.md` from verified results, grouping related items and avoiding duplicates. Mark verification still pending where it is.
    - _Requirements: 9.8_
  - [x] 11.3 Update README status
    - Update the status and feature sections using verified facts only, and link the changelog and evidence.
    - _Requirements: 9.8_
  - [x] 11.4 Update shared guideline and layer docs
    - `guidelines/frontend.md` component table: add `CardDetailModal`, `CardEditForm`, `CommentItem`, `CommentForm`, note `BaseModal wide`, remove `CardEditDialog`. Update `frontend/specs/pages-and-components.md` (the modal, `CommentList` and the new parts), `frontend/specs/api-integration.md` (C17) and `frontend/specs/error-handling.md` (comment 403, 404 and uncertain-add handling). Confirm `docs/USER_GUIDE.md` still matches the behavior.
    - _Requirements: 9.8_
  - [x] 11.5 Record the T15 handoff
    - Write the comments steps for the Playwright journey (open card, add, edit, delete, reload, second user) with the new accessible names "Open <title>" and "Card details" into `evidence/comments-T10.md`. Confirm the T15 row of `specs/tasks.md` still covers the comment journey, and add it if not.
    - _Requirements: 9.7, 9.8_
  - [x] 11.6 Synchronize task status
    - Check native tasks in this file only when their checks pass. Check root `T10` in `specs/tasks.md` only when its full scope is verified (V05, V06, V11, the measured mobile check including the wide dialog at 375 px, the manual journey, the lost-response regression). Add the native spec link `[comments](../.kiro/specs/comments/tasks.md)` to the T10 row. Confirm the link resolves. Report the open items.
    - _Requirements: 9.8; Root: T10_

## Notes

- Test sub-tasks are not marked optional. Root completion in `specs/tasks.md` needs V05, V06 and V11, so they are required here.
- Each backend test file covers one concern, as listed in `design.md` ("Backend test files").
- All database-writing tests clean up automatically through `BoardTracker` and run only on `TEST_DATABASE_URL` (task 2.9).
- Local checks prove local behavior only. Playwright (V10), real-device checks and deployment stay open for T15 and T16.
- Notifications (T13), analytics (T14), My Tasks and search (T11), and a comment count on the card are out of scope. T13 will extend the E24 transaction at the marker left in task 1.3.
- Attach `guidelines/backend.md`, `guidelines/database.md` or `guidelines/frontend.md` when creating a file with no matching file context. For UI work read FE-D1 to FE-D9 and `frontend/app/globals.css` first.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9"] },
    { "id": 4, "tasks": ["3.1"] },
    { "id": 5, "tasks": ["3.2"] },
    { "id": 6, "tasks": ["4.1", "4.2", "4.3", "5.1"] },
    { "id": 7, "tasks": ["6.1"] },
    { "id": 8, "tasks": ["6.2", "7.1", "7.2", "7.3"] },
    { "id": 9, "tasks": ["7.4"] },
    { "id": 10, "tasks": ["7.5", "8.1"] },
    { "id": 11, "tasks": ["8.2"] },
    { "id": 12, "tasks": ["9.1"] },
    { "id": 13, "tasks": ["9.2"] },
    { "id": 14, "tasks": ["10"] },
    { "id": 15, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 16, "tasks": ["11.6"] }
  ]
}
```
