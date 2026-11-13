# Evidence: kanban (T07, T08 and T09)

Log for the kanban slice. Entries are added as each task group runs. Only observed results are recorded here. Implementation by Claude Code (`/revotask-feature implement kanban`), one group per run unless the user asks for more. No Kiro run is involved.

## T05 close-out (tasks 1.1 to 1.4, gate A)

- Captured: 2026-11-13, from `backend/`. Environment: Python 3.14.5, pytest 9.2.0, backend virtualenv `backend/.venv`. Database writes went to `TEST_DATABASE_URL` through `db_guard` and `BoardTracker`. Its value is not recorded here.
- Plan approval: the user approved `.kiro/specs/kanban/tasks.md` in chat before this run (recorded in `evidence/spec-review.md`). Run scope chosen by the user: group 1 only.

### Task 1.1: regression test written first

Added `test_e12_keeps_assignments_in_soft_deleted_columns_and_clears_active_columns` to `backend/tests/test_board_members_assignments.py`. Board 1 gets a second active column and a soft-deleted column with cards assigned to the removed member B, next to the existing soft-deleted card, an admin-assigned card and a board 2 card. After E12 on board 1 the active-column card is cleared. The card in the soft-deleted column, the soft-deleted card, the admin's card and the board 2 card are unchanged.

Before the fix: `pytest tests/test_board_members_assignments.py` gave 1 failed, 3 passed. The failure was the card in the soft-deleted column, cleared when it should keep B (`assert (None, None) == (UUID(...), None)`).

### Task 1.2: fix

`remove_member` in `backend/app/blueprints/boards/service.py` now limits the card update to columns of the board with `deleted_at IS NULL`. The docstring says so. No other behavior or message changed.

### Task 1.3: T05 acceptance checks after the fix

Commands, from `backend/` (all with `-p no:cacheprovider`):

| Command | Result |
|---|---|
| `.venv/bin/python -m pytest tests/test_board_members_assignments.py -q` | 4 passed |
| `.venv/bin/python -m pytest tests/test_boards_*.py tests/test_board_members*.py -q` | 716 passed, 1 skipped |
| auth subset: `tests/test_auth_guard.py test_auth_login.py test_auth_logout.py test_auth_passwords.py test_auth_register.py test_auth_schema.py` | 202 passed (same count as the boards-membership baseline) |
| `.venv/bin/python -m pytest -q -rfEs` (full suite) | 1147 passed, 1 skipped, 0 failed (the earlier full run was 1146 passed, 1 skipped) |
| `.venv/bin/ruff check .` | All checks passed |
| `.venv/bin/ruff format --check .` | 84 files already formatted |

The one skip is the deliberate one recorded earlier: E05 has no error response for an authenticated caller (`tests/test_boards_properties_writes.py:671`).

Acceptance read: AC03.1, AC03.2, AC03.3, AC04.1 and AC04.2 (with the L7 scope) pass in the backend tests, including role and parent scoping, the nonmember 404, and removal with assignment clearing in one transaction on two boards with rollback. Not checked in a browser: that is T06.

### Task 1.4: decision

Root `T05` is checked in `specs/tasks.md`: its scope is the backend boards and membership APIs, and the T05 checks above passed. Gate A is open. Root T06 is not changed by this slice.

Boards-membership task 7.2 status seen in the working tree: the measured mobile check is recorded as 180 checks, 0 failed, and the manual journey as user-confirmed (`evidence/boards-membership-T05-T06.md`). Root T06 is still unchecked in `specs/tasks.md`. Gate C (task 6.3) needs it checked before any frontend task. This run does not check it.

## Group 2: shared backend foundation (tasks 2.1 to 2.6)

- Captured: 2026-11-13, from `backend/`, Python 3.14.5, pytest 9.2.0, `backend/.venv`. Database writes went to `TEST_DATABASE_URL` through `BoardTracker`.
- Run scope: group 2 only, chosen as the next unfinished group after group 1. No endpoint was added.

Changes:

| Task | File | Change |
|---|---|---|
| 2.1 | `backend/app/exceptions.py`, `backend/tests/test_position_errors.py` | `PositionConflictError` (409 `POSITION_CONFLICT`) and `InvalidDestinationError` (400 `VALIDATION_ERROR`, fixed message, no `fields`). The existing `ApiError` handler already converts them. Two envelope tests. |
| 2.2 | `backend/app/positions.py` | `allocate_order`, `rebalanced_orders`, `is_unchanged`, `bump_position_version` (guarded at 2147483647, raises `StateConflictError`) and `record_event`. No commit inside the module. |
| 2.3 | `backend/app/blueprints/boards/service.py` | `read_columns(board_id, column_ids=None)` extracted from `get_board_detail`, which now calls it. |
| 2.4 | `backend/tests/boards_helpers.py`, `backend/tests/test_boards_cleanup.py` | `record_column_from_response`, `record_card_from_response`. The sentinel set gains a `board_events` row. The cleanup test now creates an event on the tracked board and checks it is removed while the sentinel event stays. |
| 2.5 | `specs/fixtures/kanban-field-cases.json`, `backend/tests/test_kanban_fixture.py` | Six forms (column create, update, reorder, card create, update, position) with the boundary cases. A structure test keeps the file well formed. |
| 2.6 | `backend/tests/test_positions.py` | Pure tests for ordering and `is_unchanged`, Property 1 over nine sibling lists, and database tests for the version bump, the ceiling and event commit and rollback. |

Deviation from the task text (2.4): E13 and E17 do not exist yet, so the cleanup test creates the column, card and event rows directly, and the two `record_*_from_response` helpers are tested on stand-in responses. They run on real responses in groups 3 and 5.

Commands and results (from `backend/`, all with `-p no:cacheprovider`):

| Command | Result |
|---|---|
| `.venv/bin/python -m pytest tests/test_boards_detail.py tests/test_boards_properties_reads.py -q` (E07 after the `read_columns` extraction, no test edited) | 80 passed |
| `.venv/bin/python -m pytest tests/test_positions.py tests/test_position_errors.py tests/test_boards_cleanup.py tests/test_kanban_fixture.py -q` | 58 passed |
| `.venv/bin/python -m pytest -q -rfEs` (full suite) | 1202 passed, 1 skipped, 0 failed (group 1 ended at 1147 passed, 1 skipped) |
| `.venv/bin/ruff check .` | All checks passed |
| `.venv/bin/ruff format --check .` | 88 files already formatted |

The one skip is the earlier deliberate one (`tests/test_boards_properties_writes.py:671`).

Acceptance read: Property 1 (order allocation) holds for every sibling list and index in the table. The version bump adds 1, works one below the ceiling and raises `StateConflictError` at 2147483647 with the version unchanged. An event is written only when the caller commits. E07 output and tests are unchanged after the extraction. Root T07 stays open: no column endpoint exists yet.

## Groups 3 and 4: columns API (T07) and checkpoint (gate B)

- Captured: 2026-11-13, from `backend/`, Python 3.14.5, pytest 9.2.0. Database writes went to `TEST_DATABASE_URL` through `BoardTracker`. Run scope: all remaining tasks, as the user asked.
- Boards-membership gate note: task 7.2 is `[x]` in its `tasks.md` and `evidence/boards-membership-T05-T06.md` records the measured check (180 checks, 0 failed) and the user-confirmed 375 px journey. This does not affect backend work.

Changes: `backend/app/blueprints/columns/` (`__init__`, `schema`, `service`, `routes`) registered in `backend/app/__init__.py`; `StrictBool` and `BoundedInt` in `backend/app/validation.py`; `commit_or_rollback` (renamed from the private `_commit`) in `boards/service.py`; `tests/kanban_helpers.py`; `tests/test_kanban_schema.py`, `test_columns_crud.py`, `test_columns_reorder.py`, `test_kanban_access.py`, `test_kanban_roles.py`, `test_kanban_request_order.py`, `test_kanban_events.py`, `test_kanban_atomicity.py`, `test_kanban_version_ceiling.py`, `test_kanban_concurrency.py`; `tests/test_factory.py` route list.

Behavior built: E13 appends and bumps the version, E14 renames and changes the Done flag atomically (K9) without a version change, E15 soft-deletes an empty column, E16 reorders under the board lock in the agreed order (access, lock, moved column 404, version 409, anchor 400, unchanged position no write, rebalance, event). `position_version` stops at 2147483647 with 409 `STATE_CONFLICT`.

Deviations from the task text: (3.9) the E16-racing-member-removal case is vacuous for columns, because only an admin can reorder and the admin cannot be removed. The concurrency file tests a reorder racing the removal of another member and a create racing a reorder instead. The removal race that matters (a removed member's E20) is in task 5.9. (3.6) `ColumnCreateSchema` has no `load_default` for `is_done`, so the schema output keys equal the body keys as the shared fixture requires, and the route defaults `is_done` to false.

One defect found by the tests while writing them: the first rebalance test was nondeterministic (two equal orders sort by ID, so the anchor could be first and no rebalance was needed). The test now picks the anchor with the larger ID.

| Command | Result |
|---|---|
| `.venv/bin/python -m pytest tests/test_kanban_schema.py tests/test_columns_crud.py tests/test_columns_reorder.py tests/test_kanban_access.py tests/test_kanban_roles.py tests/test_kanban_request_order.py tests/test_kanban_events.py tests/test_kanban_atomicity.py tests/test_kanban_version_ceiling.py tests/test_kanban_concurrency.py -q -p no:cacheprovider` | 142 passed |
| `.venv/bin/python -m pytest -q -rfEs -p no:cacheprovider` (full suite, run twice, the second to confirm the thread tests are stable) | 1344 passed, 1 skipped, 0 failed both times |
| `.venv/bin/ruff check .` and `.venv/bin/ruff format --check .` | All checks passed, 103 files already formatted |

The one skip is the earlier deliberate one (`tests/test_boards_properties_writes.py:671`).

Acceptance read: AC05.1 (add, rename, remove, nonempty and second-Done 409s, Done flag rules, concurrent Done race leaves one) and AC05.2 (reorder, new order after reload via E07, stale version 409, invalid anchors 400, unchanged position, rebalance with `nextafter` and equal orders) pass in the tests. Version rises only for E13, E15 and a changing E16. Events: one `column_reordered` per real E16, none otherwise. Role gate, 404 matrix and `no-store` pass for E13 to E16.

Gate B decision: root `T07` is checked in `specs/tasks.md`. Its scope (column CRUD and reorder, Done constraints, stale version handling) is backend only and every check passed. Gate B is open.

## Groups 5 and 6: cards API (T08) and checkpoint (gate C)

- Captured: 2026-11-13, from `backend/`, Python 3.14.5, pytest 9.2.0. Database writes went to `TEST_DATABASE_URL` through `BoardTracker`.

Changes: `backend/app/blueprints/cards/` (`__init__`, `schema`, `service`, `routes`) registered in `backend/app/__init__.py`; `board_of_column` and `load_column` made public in `columns/service.py` for reuse; card helpers in `tests/kanban_helpers.py`; new tests `test_cards_crud.py`, `test_cards_move.py`, `test_kanban_assignment_refresh.py`, `test_kanban_properties_rules.py`, `_reads.py`, `_writes.py`, `_scoping.py`; the schema, access, roles, request-order, events, atomicity, version-ceiling and concurrency files extended to E17 to E20; `tests/test_factory.py` route list.

Behavior built: E17 appends and bumps the version, records `card_created` (and `entered_done` in a Done column), checks the assignee is an active participant under the lock (400 with `fields.assignee_id`). E18 edits only submitted fields (explicit null clears, omitted description kept, blank to null), no version change. E19 soft-deletes and bumps. E20 follows access (404), lock, card under the lock (404), version (409), destination and anchor (400), unchanged position (200, no write, no event), allocate or rebalance, bump, `card_moved` and `entered_done` (non-Done into Done only), and returns only the affected lists.

| Command | Result |
|---|---|
| `.venv/bin/python -m pytest tests/test_kanban_*.py tests/test_columns_*.py tests/test_cards_*.py tests/test_positions.py tests/test_position_errors.py -q -p no:cacheprovider` | 422 passed |
| `.venv/bin/python -m pytest tests/test_boards_*.py tests/test_board_members*.py -q` | 717 passed, 1 skipped |
| auth subset (`test_auth_guard.py test_auth_login.py test_auth_logout.py test_auth_passwords.py test_auth_register.py test_auth_schema.py`) | 202 passed |
| `.venv/bin/python -m pytest -q -rfEs -p no:cacheprovider` (full suite, run three times to confirm the thread tests are stable) | 1570 passed, 1 skipped, 0 failed each time |
| `.venv/bin/ruff check .` and `.venv/bin/ruff format --check .` | All checks passed, 114 files already formatted |

The one skip is the earlier deliberate one (`tests/test_boards_properties_writes.py:671`).

Acceptance read (T08): card CRUD with assignee validation, the position service for both move directions (within and across columns), rebalance with `nextafter` neighbors and equal orders (with `updated_at` refreshed), concurrent moves (one 200, one 409), invalid targets (400, nothing written, nothing disclosed about another board), a removed member's move racing the removal (404 or serial success), events written only for real changes, rollback on an injected commit failure, the version ceiling (409, nothing written), and E07 showing cleared assignees after E12. AC06.1, AC07.1 and AC07.2 pass at the backend. The UI half is T09.

Gate decisions: root `T08` is checked in `specs/tasks.md`. Gate C: root T06 was open, so the task text said to stop. Boards-membership task 7.2 is complete (measured check 180 of 180 with 0 failed in `evidence/boards-membership-mobile.json`, and the 375 px journey confirmed by the user, both recorded in `evidence/boards-membership-T05-T06.md`), and the frontend suite passes (`npm run lint`, `npm run typecheck`, `npm test` 960 passed in 51 files, run this session before any change). Because the user asked to run every task, root `T06` is checked in `specs/tasks.md` on that evidence. The journey step list was not recorded individually in the boards evidence (it records the user's confirmation only).

## Groups 7 to 10: frontend (T09)

- Captured: 2026-11-13, from `frontend/`. Node and npm from the repository setup. Run scope: the user asked for every task. Gate C was open (root T06 checked, root T08 checked).

Changes: `lib/types.ts` (Card, Column, ColumnWithCards, typed BoardDetail), `lib/kanban.ts` (parsers), `lib/kanbanRules.ts`, `lib/kanbanMove.ts`, `lib/boardErrors.ts` (conflict helpers and fixed copy), `lib/apiClient.ts` (declared kanban pairs, GET allowlist, `apiGet`), `lib/server/flask.ts`, `lib/server/bff.ts` (`readJsonObject` takes `requiredKeys`, default all allowed keys), `lib/server/privateRoute.ts` (`requiredKeys`, `handlePrivateRead`), eight new Route Handlers plus `GET` on `app/api/boards/[id]` and `members`, `components/shared/SelectField.tsx`, `CheckboxField.tsx` and `FormField` `multiline`, `hooks/useKanbanBoard.ts`, `hooks/useDragAndDrop.ts`, `components/kanban/*` (ColumnHeader, BoardCard, AddCardForm, AddColumnForm, ColumnEditDialog, CardEditDialog, MoveCardDialog, KanbanColumn, KanbanBoard), `BoardShell` (owns the board hook, renders `MembersPanel` itself), `MembersPanel` (`onMemberRemoved`), the board page, and `ColumnsPlaceholder.tsx` deleted.

Deviations from the task text:
- 7.4: the kanban client tests are in a new file `lib/kanbanClient.test.ts` instead of extending `lib/apiClientProperties.test.ts`. Same coverage (Property 17).
- 7.3: all handler tests are one table-driven file, `app/api/kanbanRoutes.test.ts`.
- 7.5: the helpers are in `lib/boardErrors.ts` (with `lib/boardErrors.test.ts`).
- 9.x: a new shared part `CheckboxField` (the 44 px Done checkbox, used by the add-column form and the column edit dialog, two screens). It is listed in `guidelines/frontend.md`.
- 9.x: the dialog tests are in one file, `components/kanban/Dialogs.test.tsx`, and the add forms in `AddForms.test.tsx`.
- 10.1: `BoardShell` no longer takes a `membersPanel` prop. A server page cannot pass the `onMemberRemoved` function, so the shell renders `MembersPanel` itself. Its fallback ("N members") is gone.
- 8.2: the epoch guard against a stale refetch response is in the hook, but the single gate means two refetches never overlap, so the test for it covers the unmounted case (a late response after unmount is ignored, no warning). The gate itself is covered by the ignored-second-request and recovery-refetch tests.
- Root `specs/tasks.md` T15 now carries the kanban journey.

Commands and results (from `frontend/`):

| Command | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` (Vitest) | 1362 passed in 65 files (the run before this slice was 960 in 51 files) |
| `npm run build` (`next build`) | succeeded, with the new routes `/api/boards/[id]/columns`, `.../columns/reorder`, `/api/columns/[id]`, `/api/columns/[id]/cards`, `/api/cards/[id]` and `/api/cards/[id]/position` |
| `lib/mobileGuard.test.ts` (scans `app`, `components` and `hooks` for `h-screen`, `100vh`, zoom locks and wide fixed widths) | passes with the new files, no exception needed |

Acceptance read: Property 13 (role-based controls), 14 (drag and the Move dialog send the identical request), 15 (the gate disables the board and ignores a second request, and keeps the gate through the recovery refetch), 16 (a refresh requested during a write runs after it and the refreshed board is the final state) and 17 (declared requests only) are covered by `KanbanBoard.test.tsx`, `useKanbanBoard.test.tsx`, `BoardShell.test.tsx` and `kanbanClient.test.ts`.

## Groups 11 and 12: browser and mobile verification, full verification

Setup: my own Flask on 127.0.0.1:5002 against `TEST_DATABASE_URL`, and a production Next server (`next start`) on localhost:3101 with `API_BASE_URL=http://127.0.0.1:5002`. Your stack on 5001 and 3000 was not touched. Both were stopped afterwards. The script seeds two throwaway accounts, a board with three columns and four cards, and an empty board, through the API. After three runs I deleted the throwaway rows by their `kc-...@kanban-check.example.test` emails: 6 users and 6 boards removed, 0 left.

Script: `evidence/kanban-mobile-measure.mjs` (headless Chrome over the DevTools Protocol, no new dependency). Report: `evidence/kanban-mobile.json` (no password, email, board ID or token in it). Screenshots: `evidence/kanban-screenshots/kanban-{admin,member}-{375,768,1280}.png`.

Environment: headless Google Chrome with **device emulation, not a real phone**, touch emulation below 640 px. The drag check used **synthetic DOM drag events with a real `DataTransfer`**, not a pointer drag.

Command: `BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 SHOT_DIR=evidence/kanban-screenshots REPORT_FILE=evidence/kanban-mobile.json node evidence/kanban-mobile-measure.mjs`

Result of the final run: **418 checks, 0 failed**, exit 0. Checked at 320, 375, 768 and 1280 px, for Admin and Member:
- the board page, the empty board, and these dialogs: Move card, Edit card, Edit column, Delete column confirm, Delete card confirm (above the edit dialog): no horizontal page scroll, every interactive box at least 44 by 44 CSS px (also at 375 px, the agreed viewport), `elementFromPoint` at each control center returns the control, text inputs, selects and textareas compute to at least 16 px;
- the Kanban region is focusable, named, scrolls sideways only inside itself, the three lanes overflow it at 375 px and below, and ArrowRight scrolls it from the keyboard;
- Admin sees the column controls and Member does not, both see the card controls and the Move button;
- each dialog: focus moves inside, 8 Tab presses stay inside, Cancel and Escape close it without a request to `/api/`, and focus returns to the opener.

Journey at 375 px (scripted, emulator): add column, add card, edit and assign, Move dialog to another column with the live-region announcement, reload (position persisted), a forced 409 (the board changed through the API, then a move in the stale page showed "The board changed. It has been refreshed.", refetched and re-enabled), keyboard Enter on the Move button opens the dialog and Escape returns focus to it, delete the card. Desktop at 1280 px: a synthetic drag to the end of In progress, then reload (persisted). All passed.

Defects found by the first runs, all in the script and fixed there: a disabled button (`Move To do left`, `Move Done right`) failed the hit test because daisyUI gives disabled buttons `pointer-events: none` (the check now skips the hit test for disabled controls and still checks their size); the live-region selector matched react-hot-toast's `role=status` first; Enter sent through the DevTools Protocol needs its character to activate a button; and the live-region check ran before the server answered. No product defect was found. Runs: 6 failed, then 1 failed, then 0 failed.

Observed in the screenshots, not a defect: at 1280 px the 22 rem members column leaves room for two lanes, and the third scrolls inside the region (the risk recorded in the design). The card title text sits 4 px to the right of the assignee text. Left as is.

Still open: a human walk on a real phone with the on-screen keyboard, and a pointer drag (Playwright, T15). The root T09 scope in `specs/tasks.md` does not name them, so T09 is checked on the evidence above.

Group 12 final run (after all changes): `npm run lint` clean, `npm run typecheck` clean, `npm test` 1362 passed (65 files), `npm run build` succeeded; backend `pytest` 1570 passed and 1 skipped, `ruff check .` and `ruff format --check .` clean.

Note: `npm run build` replaced `frontend/.next`. A running `next start` server on port 3000 must be restarted to serve the new code, and the Docker backend on 5001 must be rebuilt (`docker compose up -d --build backend`) to get the column and card routes.

## Group 13: documentation and handoff

Updated: `specs/traceability.md` (Kanban evidence status), `README.md` (status, features, counts, evidence link), `CHANGELOG.md`, `backend/CHANGELOG.md` and `frontend/CHANGELOG.md` (`[Unreleased]`), `guidelines/frontend.md` (shared parts), `frontend/specs/pages-and-components.md`, `evidence/README.md`, `specs/CHANGELOG.md` and `evidence/spec-review.md` (implementation deviations), and the `specs/tasks.md` T15 row and tracker.

### T15 handoff: the Kanban Playwright journey

Use real endpoints locally and unique fixtures per run, with `baseURL`, accessible locators and these test IDs: `card-<cardId>` (the draggable card), `dropzone-<columnId>-before-<cardId>` (a drop before a card) and `dropzone-<columnId>-end` (the end of a column). Steps (V10): 1. create a uniquely named board; 2. add two columns; 3. add a card to the source column; 4. open its edit dialog; 5. edit and assign it (comments belong to T10); 6. move it to the other column with desktop `dragTo()` onto `dropzone-<columnId>-end`; 7. `page.reload()` and assert the card is in the destination column and absent from the source; 8. repeat the move with the Move button (keyboard and 375 px), then delete the card. Also intercept the move request in one local test to prove rollback on a 500, and force a 409 through a second context. Open for T15 and T16: pointer drag, real phone and on-screen keyboard, the E11 per-admin rate limit and its account-enumeration note (T16).

## Open

All native groups are done. Open outside this slice: Playwright (T15), real-device checks (T15, T16), deployment (T16). Next unfinished tasks overall: T10 (comments), T11 (My Tasks and search), T12 (profile), then T13 to T15.
