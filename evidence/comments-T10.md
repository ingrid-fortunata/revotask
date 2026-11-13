# Comments T10: implementation evidence

Feature spec: `.kiro/specs/comments/`. Root task: T10. Implemented by Claude Code (`/revotask-feature implement comments T10`, run scope: every task of `tasks.md`, 2026-11-13). The spec phases were also produced by Claude Code (`evidence/spec-review.md`, "Comments review record").

Local checks prove local behavior only. The browser run used Chrome device emulation (headless Chrome 157.0.8103.51 with touch emulation below 640 px), not a real phone and not an on-screen keyboard. Playwright (V10), a real-device check and deployment stay open for T15 and T16. No secret, token, email or board ID is recorded in this file or in the JSON report.

## Summary

| Area | Result |
| --- | --- |
| Backend | `pytest` 1706 passed, 1 skipped (the deliberate E05 skip). `ruff check .` and `ruff format --check .` clean. 135 new comment tests in 9 files, plus the cleanup and factory tests extended. |
| Frontend | `npm run lint` and `npm run typecheck` clean. `npm test` 1571 tests in 75 files passed. `npm run build` succeeded and lists `/api/cards/[id]/comments` and `/api/comments/[id]`. |
| Browser (V05, V11) | `evidence/comments-mobile-measure.mjs`: 480 checks at 320, 375, 768 and 1280 px as the author and as a second user, 0 failed. Report: `evidence/comments-mobile.json`. Screenshots: `evidence/comments-screenshots/`. |
| Open | Playwright journey V10, real-device and on-screen-keyboard checks (T15), deployment (T16). |

## Commands and results

### Backend (task 3.1)

- Captured 2026-11-13, from `backend/`. Python 3.14.5, pytest 9.2.0, `backend/.venv`. Database writes went to `TEST_DATABASE_URL` through `db_guard` and `BoardTracker`. Its value is not recorded here.
- `.venv/bin/python -m pytest tests/test_comments_*.py tests/test_boards_cleanup.py -q -p no:cacheprovider` gave 140 passed.
- `.venv/bin/python -m pytest -q -p no:cacheprovider` gave 1706 passed, 1 skipped.
- `.venv/bin/ruff check .` gave "All checks passed". `.venv/bin/ruff format --check .` gave "128 files already formatted".
- Negative control (task 2.1): adding `deleted_at` to `CommentSchema` made `test_property_2_response_has_exactly_the_documented_fields` fail. The schema was restored and the file passes again.
- The three concurrency and atomicity files passed three times in a row (task 2.7).
- First full run failed one test, `test_factory.py::test_registered_routes_match_the_implemented_slices`, because it lists every registered endpoint. The four comment endpoints were added to its list.
- Teardown: the cleanup test creates comments through E24 on a tracked board, fails inside the harness, and checks that they and their events are gone while a comment on an untracked sentinel board survives (`test_boards_cleanup.py`).

### Frontend (task 10)

- Captured 2026-11-13, from `frontend/`. Gate B was open (backend verified).
- `npm run lint`: clean. `npm run typecheck`: clean. `npm test`: 75 files, 1571 tests passed (before this slice: 65 files, 1362 tests). `API_BASE_URL=http://127.0.0.1:5002 APP_ORIGIN=http://localhost:3101 npm run build`: succeeded.
- The lost-response regression (`CardDetailModal.test.tsx`, "keeps the draft and the list, refetches, blocks the retry ... then allows a manual retry"): a fake server saves the comment and the POST response is rejected. The draft and the current list stay visible while E23 is pending, Add comment is disabled, the refreshed list shows the comment once, exactly one POST was sent, Add comment is then enabled with the "may have been posted" message, and a manual click sends a second POST that creates a second comment. A second case fails the refetch and checks that Add comment stays disabled until Refresh comments succeeds.

### Browser and mobile check (tasks 9.1, 9.2)

- Setup: my own Flask (127.0.0.1:5002) on `TEST_DATABASE_URL` and a production Next server (localhost:3101, `API_BASE_URL=http://127.0.0.1:5002`). Your stack on 5001 and 3000 was not touched. Both servers were stopped afterwards.
- Command: `BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 REPORT_FILE=evidence/comments-mobile.json SHOT_DIR=evidence/comments-screenshots node evidence/comments-mobile-measure.mjs`. Result: 480 checks, 0 failed, exit 0. The script seeds a board with two cards and four comments (one edited, one multi-line, one with a 220-character unbroken string) through the API.
- Per role (author, then a second user) and per width (320, 375, 768, 1280): no horizontal page scroll, every interactive box at least 44 by 44 CSS px with `elementFromPoint` at the center, fields at least 16 px, the card details dialog (with comments and with none), the comment editor and the delete confirmation. For each dialog: focus moves in, Tab stays inside over 8 presses, Cancel and Escape each close it without any non-GET request, and focus returns to the opener.
- The wide dialog (N3): the box is no wider than the viewport at every width, nothing inside scrolls sideways (the long comment wraps), the close control is reachable at the top, the comment field is reachable by scrolling inside the dialog, and pinch zoom stays enabled.
- Role checks: the author sees Edit and Delete on exactly their 3 comments, the second user (an admin) on exactly their own 1 and none on the member's comments. The edited comment shows the Edited text marker, a multi-line comment keeps its lines.
- Journey at 375 px (scripted, 15 checks): open a card, add a comment (it appears at the end, no Edited marker, the field is cleared and keeps focus), edit it (Edited marker shows), delete it after confirming (it is removed and focus moves to the comment field), reload (the four kept comments are shown, the deleted one is gone), the uncertain add, and the second user's view.
- Uncertain add against the real server (5 checks): the page's `fetch` waits for the real POST and then rejects that one response, so the server saves the comment while the browser sees a failure. The page showed "Your comment may have been posted", the refreshed list showed the comment exactly once, the draft was kept, Add comment was enabled again, and exactly one POST had been sent. A manual retry then created a second comment with the same text.
- Screenshots (FE-D9): `comments-<member|admin>-<375|768|1280>.png` (dialog top), `...-list.png` (scrolled to the comments) and `comments-uncertain-add-375.png`. They follow the design system: `BaseModal`, teal primary action, red delete controls, a divider and no nested panel, Figtree type.
- Cleanup: the throwaway accounts used emails of the form `cc-...@comments-check.example.test`. After the runs I deleted their rows by those emails with the test tracker's delete function: 12 users and 6 boards removed, 0 left.

## Findings from the browser check

The first two runs found two real defects that the unit tests had not caught. Both are fixed and covered by tests.

| Finding | Where | Cause and fix | Test |
| --- | --- | --- | --- |
| F-CMT-1: Escape on a nested confirmation closed the dialog behind it. Pressing Escape on the Delete comment confirmation (and, from the kanban slice, on the Delete card confirmation) left no dialog open. | `components/shared/BaseModal.tsx` | React bubbles `cancel` and key events through the component tree, so the outer dialog's handler also ran. `onCancel` now calls `stopPropagation`, and `keepTabInside` returns when focus is in a different (nested) dialog. | `BaseModal.test.tsx` ("nested in another BaseModal", 3 tests) and `CardDetailModal.test.tsx` ("Escape in the nested confirmation", 2 tests). Confirmed failing before the fix. |
| F-CMT-2: After adding a comment with the Add button, focus stayed on the button. Requirement 7.1 says the field keeps focus. | `components/kanban/CommentForm.tsx` | The form now focuses its field after a successful add. | `CommentForm.test.tsx` and `CardDetailModal.test.tsx` now assert focus. |

One harness bug was fixed in the script, not the app: the first editor check clicked the card form's Cancel instead of the comment editor's.

## Implementation notes by task group

| Group | Files |
| --- | --- |
| 1 Comments API | `specs/fixtures/comment-field-cases.json`; `backend/app/blueprints/comments/{__init__,routes,schema,service}.py`; `backend/app/__init__.py` |
| 2 Backend tests | `backend/tests/comments_helpers.py`; `test_comments_{schema,list,create,edit_delete,access,request_order,concurrency,atomicity,properties}.py`; `boards_helpers.py` and `test_boards_cleanup.py` (sentinel comment); `test_factory.py` |
| 4 Frontend foundation | `lib/types.ts`, `lib/comments.ts`, `lib/commentRules.ts`, `lib/server/flask.ts`, `lib/apiClient.ts`; `app/api/cards/[id]/comments/route.ts`, `app/api/comments/[id]/route.ts`; tests `comments.test.ts`, `commentRules.test.ts`, `commentsClient.test.ts`, `commentsRoutes.test.ts` |
| 5 Board hook | `hooks/useKanbanBoard.ts` (`refreshBoard`, `hasCard`, exported `FetchOutcome`) and its tests |
| 6 Comments hook | `hooks/useCardComments.ts`, `useCardComments.test.tsx` |
| 7 Components | `components/shared/BaseModal.tsx` (`wide`), `CardEditForm.tsx`, `CommentItem.tsx`, `CommentList.tsx`, `CommentForm.tsx`, `CardDetailModal.tsx` and their tests, `commentTestData.ts` |
| 8 Wiring | `BoardCard.tsx` ("Open <title>"), `KanbanColumn.tsx`, `KanbanBoard.tsx`; `CardEditDialog.tsx` deleted; selectors updated in `BoardCard`, `KanbanBoard`, `Dialogs`, `BoardShell` and the board page tests; `kanbanClient.test.ts` |
| 9 Browser | `evidence/comments-mobile-measure.mjs`; `evidence/kanban-mobile-measure.mjs` renamed its selectors to "Open <title>" so it still runs against the current UI (not re-run) |

### Deviations from the approved design (no change to behavior or contract)

- `CommentList` renders the empty text or the list only. The "Comments (n)" heading and the section sit in `CardDetailModal`, so the heading can show before the list loads and next to the error and the notices.
- The modal header has a Close button, so the close control stays reachable while the box scrolls (Requirement 8.2). `CardEditForm` keeps its own Cancel button, which carried forward from the edit dialog.
- `CardEditForm` has the accessible name "Edit card" (a form), replacing the dialog name that was "Edit card".
- `CommentForm` has no form name, because its label would duplicate the field's label "Add a comment".
- `BaseModal` also stops `cancel` propagation and ignores Tab from a nested dialog (F-CMT-1).

## Requirement and property coverage

| Requirement | Verified by |
| --- | --- |
| 1 list | `test_comments_list.py`, `useCardComments.test.tsx`, `CardDetailModal.test.tsx` |
| 2 add (AC08.1) | `test_comments_create.py`, `test_comments_properties.py`, `CommentForm.test.tsx`, the browser journey |
| 3 edit (AC08.2) | `test_comments_edit_delete.py` (changed edit moves `updated_at`, same text leaves it), `CommentItem.test.tsx`, the browser journey |
| 4 delete | `test_comments_edit_delete.py`, `CommentItem.test.tsx`, the browser journey |
| 5 order, atomicity, contracts | `test_comments_access.py`, `test_comments_request_order.py`, `test_comments_concurrency.py`, `test_comments_atomicity.py`, `commentsRoutes.test.ts` |
| 6 modal and list | `CardDetailModal.test.tsx`, `KanbanBoard.test.tsx`, `BaseModal.test.tsx`, the browser run |
| 7 comment actions | `useCardComments.test.tsx` (including the uncertain-add states), `CardDetailModal.test.tsx` (the lost-response regression), the browser run |
| 8 mobile (AC13.1) | the 480-check browser run at 320, 375, 768 and 1280 px |
| 9 handlers and verification | `commentsRoutes.test.ts`, `commentsClient.test.ts`, the suites above |

## T15 handoff: comments steps for the Playwright journey

Use role and accessible-name locators (no `waitForTimeout`). Names after this slice: the card button is "Open <title>" and the dialog is "Card details".

1. As a member, open the board, click "Open <title>" and wait for the heading "Comments (n)" in the dialog "Card details".
2. Fill "Add a comment", click "Add comment", assert the new comment text, no "Edited" text beside it, and the field cleared and focused.
3. Click "Edit your comment from <day>", change the text, click "Save comment", assert the new text and "Edited".
4. Click "Delete your comment from <day>", click "Delete comment" in the dialog "Delete comment?", assert the comment is gone.
5. Reload, open the card again, assert the kept comments and the missing deleted one.
6. As a second user (an admin), open the card and assert that the member's comments have no Edit or Delete buttons.
7. Optional, uncertain add: `page.route` the POST to `**/api/cards/*/comments` to continue the real request and then abort the response, and assert the "may have been posted" message, one saved copy and the enabled Add comment.

## Open items

| Item | Status |
| --- | --- |
| Playwright journey (V10) | Pending, T15 |
| Real phone, on-screen keyboard | Not run. Pending T15 and T16 |
| Deployment | Pending, T16 |
| Comment notifications | T13 (the marker is in `create_comment`) |
| Comment events in analytics | T14 reads `comment_created` |
