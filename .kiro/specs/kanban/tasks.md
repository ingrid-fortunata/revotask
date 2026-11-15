# Implementation Plan: kanban (T07–T09)

## Overview

This plan implements the ordered column API (E13–E16, root T07), the card API and position service (E17–E20, root T08) and the Kanban UI (root T09) described in `design.md`. Order of work: close T05 (including the E12 scope fix), shared backend foundation, columns, a T07 checkpoint, cards and moves, a T08 checkpoint, a gate on T06, then the frontend, the measured mobile check and journey, documentation. Languages are the ones already in the repository: Python (Flask, SQLAlchemy, Marshmallow, pytest) and TypeScript (Next.js App Router, Tailwind, daisyUI, Vitest).

**Status:** In progress. The plan, requirements and design are approved (decisions K1–K12, clarifications L1–L7, 2026-11-13). Groups 0 to 13 are done and verified locally (see `evidence/kanban-T07-T09.md`). Gates A, B and C were passed in order. Open outside this plan: Playwright, real-device checks and deployment (T15, T16).

**Root tasks:** T05 close-out (native group 1), T07 (groups 2 to 4), T08 (groups 5 and 6), T09 (groups 7 to 12). Groups 0 and 13 cover all. Existing root IDs are preserved and no new root IDs are proposed. Root T05 to T09 stay as they are in `specs/tasks.md` until their checks pass.

**Inputs:** `requirements.md` (Requirements 1 to 11, K1–K12, L1–L7), `design.md` (DD1–DD13, Properties 1–18, WP-B1 to WP-D, C6–C13).

## Dependency gates

| Gate | Rule | Enforced by |
|---|---|---|
| A | T05 is verified against its own backend acceptance checks, including the new E12 regression tests, before any T07 task starts. | 1.4 |
| B | T07 is verified before any T08 task starts. | 4.2 |
| C | T06 and T08 are verified before any T09 task starts. Root T06 closes only after boards-membership task 7.2 (the measured mobile check and the manual journey) passes. This plan never checks T06. | 6.1 |

A failed or blocked check keeps its task and the gate open, with the actual reason. If a gate is closed, stop and report. Do not mark a root task complete on partial evidence.

## Test conventions (all groups)

- Backend database-writing tests run on `TEST_DATABASE_URL` through `db_guard` and `BoardTracker`. Rows created by the test, directly or through the API, are tracked. Teardown deletes only those rows and the rows that reference them, in foreign-key order, whether the test passes or fails. No `TRUNCATE`, no name patterns, never `DATABASE_URL`.
- Frontend tests use Vitest and React Testing Library. They assert rendered text, roles and the requests sent, not only that a component mounts.
- No Hypothesis or fast-check. Properties are parameterized tests over fixed tables.
- Every UI task meets Requirement 10: 44 by 44 CSS px controls (rendered box, `elementFromPoint` at the center), 16 px inputs and selects, no horizontal page scroll outside the Kanban region, checked at 375 px and recorded at 320, 375, 768 and 1280 px (FE-S4 to FE-S6, FE-D9).
- Backend command (from `backend/`): `.venv/bin/python -m pytest <files> -v -p no:cacheprovider`. Frontend commands (from `frontend/`): `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Record the exact commands and real counts in `evidence/kanban-T07-T09.md`.
- Do not write real passwords, tokens or connection strings into specs, evidence, logs or shell arguments.

## Tasks

- [x] 0. Record review outcomes and align contracts
  - [x] 0.1 Record K1–K12 and L1–L7 in `evidence/spec-review.md`
    - Done in the spec phase. Spec review only, no tests run.
    - _Requirements: 11.9; Root: T07, T08, T09_
  - [x] 0.2 Apply contract clarifications C6–C13
    - Done in the spec phase: `docs/API.md`, `backend/specs/api-contract.md`, `specs/design.md` D4, `specs/requirements.md` AC04.2 and AC07.2, `docs/TEST-PLAN.md`, the frontend layer specs, the boards-membership requirements and DD6, `specs/traceability.md`, and `specs/CHANGELOG.md`.
    - _Requirements: 11.3, 11.10; Root: T05, T07, T08, T09_

- [x] 1. Close T05 (gate A, root T05)
  - [x] 1.1 Write the E12 regression tests first
    - In `backend/tests/test_board_members_assignments.py` add cases, seeded with `BoardTracker`: board 1 has an active column and a soft-deleted column; user B (member) is assigned to an active card in the active column, to an active card in the soft-deleted column, and to a soft-deleted card in the active column; board 2 has a card assigned to B. After E12 on board 1: the active-column active card has `assignee_id` NULL; the card in the soft-deleted column keeps B; the soft-deleted card keeps B; board 2 is unchanged; the membership is soft-deleted. Keep the existing rollback case.
    - Run the file and record that the soft-deleted-column case fails before the fix.
    - _Requirements: 11.10; Root: T05; AC04.2_
  - [x] 1.2 Narrow the E12 statement
    - In `remove_member` (`backend/app/blueprints/boards/service.py`) limit the card update to columns with `BoardColumn.deleted_at IS NULL` in addition to `board_id`. Update the docstring and the comment. Do not change any other behavior or message.
    - _Requirements: 11.10; Root: T05_
  - [x] 1.3 Verify T05 against its backend acceptance checks
    - Run `test_boards_*.py`, `test_board_members*.py`, the auth regression files and the full backend suite, then `ruff check` and `ruff format --check`. Record commands, environment and counts in `evidence/kanban-T07-T09.md` (group "T05 close-out").
    - Check AC03.1–AC03.3, AC04.1 and AC04.2 (with the L7 scope) against the passing tests. Update the `specs/traceability.md` AC04.2 status row from "pending" to the observed result.
    - _Requirements: 11.5, 11.10; Root: T05_
  - [x] 1.4 Decide root T05 and open gate A
    - Check root `T05` in `specs/tasks.md` only if the full T05 scope passed in 1.3. T05's browser-side checks belong to T06. If anything failed or is unverified, leave T05 open, record the reason and stop here.
    - Gate A opens only when 1.3 passed. Do not start group 2 before that.
    - _Root: T05_

- [x] 2. Shared backend foundation (WP-B1, root T07)
  - [x] 2.1 Add the typed exceptions
    - In `backend/app/exceptions.py` add `PositionConflictError` (409 `POSITION_CONFLICT`, "The board changed. Refresh and try again.") and `InvalidDestinationError` (400 `VALIDATION_ERROR`, "Choose a valid destination.", no `fields`). The central `ApiError` handler in `backend/app/errors.py` already converts subclasses; add a test for each envelope. Follow `guidelines/backend.md` (BE05).
    - _Requirements: 2.4, 2.6, 4.5, 4.6; Root: T07_
  - [x] 2.2 Add `backend/app/positions.py`
    - `allocate_order(siblings, index)`, `rebalanced_orders(count)`, `is_unchanged(current_ids, moved_id, anchor_id)`, `bump_position_version(board_id)` and `record_event(board_id, actor_id, kind, card_id=None)` as in the design sketch. `bump_position_version` updates `WHERE position_version < 2147483647` and raises `StateConflictError("This board has reached its change limit.")` when no row matches (DD12). No commit inside this module.
    - _Requirements: 2.1, 2.8, 4.1, 4.8, 5.1, 5.3, 5.7; Root: T07_
  - [x] 2.3 Extract `read_columns(board_id, column_ids=None)`
    - Move the column and card queries from `get_board_detail` into `read_columns` in `boards/service.py`. `get_board_detail` calls it with no filter. E07 output, order and query count do not change. Re-run the existing detail tests unchanged.
    - _Requirements: 3.7, 4.2; Root: T07_
  - [x] 2.4 Extend `BoardTracker` and its cleanup test
    - Add `record_column_from_response` and `record_card_from_response` to `backend/tests/boards_helpers.py`. Extend `test_boards_cleanup.py`: create columns, cards and events through the API on a tracked board and fail inside the harness, then check they are gone while an untracked sentinel board with a column, a card and a `board_events` row remains. The sentinel is removed by its own IDs after the assertions.
    - Run `pytest backend/tests/test_boards_cleanup.py` and record the real output.
    - Implementation note: E13 and E17 do not exist yet, so the harness creates the column, card and event rows directly (the event with a `BoardEvent` insert) and the `record_*_from_response` helpers are tested on stand-in responses. Groups 3 and 5 exercise them on real responses.
    - _Requirements: 11.7; Root: T07_
  - [x] 2.5 Create `specs/fixtures/kanban-field-cases.json`
    - Cases for column name (1–80, trim), card title (1–160), description (≤2,000, blank and whitespace to null, null), UUIDs, `before_*_id` presence and null, and versions (0, 2147483647, 2147483648, -1, 1.5, `true`, `"1"`). Backend and frontend tests read it.
    - _Requirements: 1.2, 2.7, 3.4, 3.12, 4.7; Root: T07_
  - [x] 2.6 Write `backend/tests/test_positions.py`
    - `allocate_order`: empty, prepend, midpoint, append, equal neighbors, `math.nextafter` neighbors, huge values, nonfinite and nonpositive candidates, rebalance output. `is_unchanged`: same column, anchor equal to the next sibling, null while last, and a real change. A case that proves a returned order is always strictly between its neighbors or `None`.
    - **Property 1: Order allocation.**
    - _Requirements: 2.1, 2.8, 4.8, 5.3_

- [x] 3. Columns API (WP-B2, root T07)
  - [x] 3.1 Create the `columns_bp` blueprint and schemas
    - `backend/app/blueprints/columns/{__init__,routes,schema,service}.py`, registered in `backend/app/__init__.py`. Schemas: `ColumnCreateSchema`, `ColumnUpdateSchema` (at least one field, an empty body gives a body-level 400), `ColumnReorderSchema`, `ColumnPlainSchema`. Add a strict integer field that rejects booleans and floats and accepts 0 to 2147483647. `before_column_id` is required and may be null. Unknown fields are rejected. Import validators from `app.validation`.
    - _Requirements: 1.2, 1.5, 2.6, 2.7, 5.7; Root: T07_
  - [x] 3.2 Implement E13 (create column)
    - Resolve the board, `authorize_board(role="admin", lock=True)`, Done conflict check (`STATE_CONFLICT`), append with `allocate_order`, bump the version, commit. The Done unique-index `IntegrityError` maps to `STATE_CONFLICT`. 201 `{column, position_version}`.
    - API: E13.
    - _Requirements: 1.1, 1.2, 1.3, 1.10, 1.12; Root: T07; AC05.1_
  - [x] 3.3 Implement E14 (rename, Done flag)
    - Resolve the column's board, authorize admin with lock, reload the column under the lock, then apply the submitted fields. A real `is_done` change on a column with active cards, or to true while another active Done column exists, raises `STATE_CONFLICT` and writes nothing, including the rename. An unchanged `is_done` is ignored and the other fields apply (K9). No version bump.
    - API: E14.
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.10, 1.11; Root: T07; AC05.1_
  - [x] 3.4 Implement E15 (delete column)
    - Admin, lock, reload, `STATE_CONFLICT` when the column has active cards, soft delete, bump, commit. 200 `{"position_version": n}`.
    - API: E15.
    - _Requirements: 1.8, 1.9, 1.10, 1.11; Root: T07; AC05.1_
  - [x] 3.5 Implement E16 (reorder columns)
    - Shape validation, resolve the URL board, admin with lock, reload the moved column under the lock (well-formed missing, deleted or other-board ID: `NotFoundError`, L1), compare the version (`PositionConflictError`), then validate the anchor (`InvalidDestinationError`: itself, deleted, other board). Unchanged position: 200, same version, no write, no event. Otherwise allocate or rebalance, bump, record `column_reordered`, commit. 200 `{columns, position_version}` with every active column in order.
    - API: E16.
    - _Requirements: 2.1–2.10, 5.4, 5.5; Root: T07; AC05.2_
  - [x] 3.6 Write `test_kanban_schema.py` for the column schemas
    - Field cases from `kanban-field-cases.json`, `true` and floats rejected, 2147483647 accepted and 2147483648 rejected, unknown fields, empty PATCH, serializer allowlists.
    - **Property 2: Request schemas accept exactly their field set; Property 11: Response allowlist (columns).**
    - _Requirements: 1.2, 1.5, 2.7, 11.5_
  - [x] 3.7 Write `test_columns_crud.py`
    - E13: append order and version +1, 201 shape, 400 cases, second Done 409. E14: rename, Done change on empty, on nonempty (409, rename in the same request not applied), unchanged `is_done` on a nonempty column with a rename (200, both applied), second Done 409, version unchanged. E15: empty column deleted with body `{"position_version": n}` and version +1, nonempty 409, a deleted Done column frees the Done slot.
    - **Property 3: Position versioning (columns); Property 9: Done column invariant.**
    - _Requirements: 1.1–1.9, 5.1, 11.5_
  - [x] 3.8 Write `test_columns_reorder.py`
    - Both directions, to the end, E07 order after, `column_reordered` event, same-column unchanged position (200, same version, no event), a rebalance with seeded `nextafter` orders, 409 stale version, 400 for a self anchor, a deleted anchor and an anchor on another board (no write), 404 for a well-formed moved column that is missing, deleted or on another board (identical envelopes), 400 for a malformed ID, a stale version with a deleted anchor returns 409.
    - **Property 4: Authoritative order; Property 6: Stale version wins over destination errors.**
    - _Requirements: 2.1–2.10, 5.4, 11.5_
  - [x] 3.9 Write the cross-cutting column tests (started here, extended in group 5)
    - `test_kanban_access.py`: anonymous 401, nonmember 404, removed member 404, deleted board 404, other-board column ID 404, identical 404 envelopes, `Cache-Control: private, no-store`, for E13–E16. `test_kanban_roles.py`: Member 403 on E13–E16 with state unchanged, Admin succeeds. `test_kanban_request_order.py`: 401, then 400, then 404 or 403, then 409, then 400 destination. `test_kanban_events.py`: only `column_reordered` on a real change, none on 409, 400, 403, 404 or unchanged. `test_kanban_atomicity.py`: injected failure after the order write for E13 and E16. `test_kanban_version_ceiling.py`: version set to 2147483647, E13, E15 and a changing E16 return 409 `STATE_CONFLICT` with nothing written, reads still work. `test_kanban_concurrency.py`: two E16 with one version (one 200, one 409), concurrent Done creation (at most one Done column), E16 racing a member removal.
    - Implementation note: the E16-racing-member-removal case is vacuous for columns, because only an admin can reorder and the admin cannot be removed. The concurrency file instead tests a reorder racing the removal of another member (both commit) and a create racing a reorder. The removal race that matters (E20 by a removed member) is in 5.9.
    - **Properties 3, 7, 8, 10, 12, 18 for columns.**
    - _Requirements: 1.10–1.12, 2.9, 5.2, 5.4–5.7, 11.1, 11.2, 11.5_

- [x] 4. Checkpoint: T07 verified (gate B, root T07)
  - [x] 4.1 Run the T07 acceptance checks
    - Run the column test files, the cross-cutting files so far, the full backend suite, `ruff check` and `ruff format --check`. Record commands and counts in `evidence/kanban-T07-T09.md`. Check AC05.1 and AC05.2 against the passing tests. Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 11.5; Root: T07_
  - [x] 4.2 Decide root T07 and open gate B
    - Check root `T07` in `specs/tasks.md` only if every T07 check passed (the column CRUD, reorder, Done constraints and stale version handling). Otherwise leave it open with the reason and stop. Gate B opens only when T07 is verified.
    - _Root: T07_

- [x] 5. Cards API (WP-B3, WP-B4, root T08)
  - [x] 5.1 Create the `cards_bp` blueprint and schemas
    - `backend/app/blueprints/cards/{__init__,routes,schema,service}.py`, registered in `backend/app/__init__.py`. Schemas: `CardCreateSchema`, `CardUpdateSchema` (at least one field), `CardPositionSchema`. Title trimmed 1–160. Description trimmed ≤2,000, null allowed, blank or whitespace stored as null, an omitted one is not in the loaded data. `assignee_id` UUID or null. Reuse `CardSchema` and `ColumnSchema`. Reuse the strict integer field from 3.1.
    - _Requirements: 3.4, 3.11, 3.12, 4.7; Root: T08_
  - [x] 5.2 Implement E17 (create card)
    - Resolve the column's board, participant with lock, reload the column under the lock, validate `assignee_id` as an active participant (400 with `fields.assignee_id`), append, bump, record `card_created`, and `entered_done` when the column is a Done column, commit. 201 `{card, position_version}`, with `assignee_name`.
    - API: E17.
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.8–3.10; Root: T08; AC06.1_
  - [x] 5.3 Implement E18 (edit card)
    - Resolve the card's board, participant with lock, reload the card, validate a non-null `assignee_id`, apply only submitted fields (explicit null clears, omitted keeps), no version change. 200 card.
    - API: E18.
    - _Requirements: 3.3, 3.4, 3.5, 3.7–3.9; Root: T08; AC06.1_
  - [x] 5.4 Implement E19 (delete card)
    - Participant with lock, reload, soft delete, bump, commit. 200 `{"position_version": n}`.
    - API: E19.
    - _Requirements: 3.6–3.9; Root: T08; AC06.1_
  - [x] 5.5 Implement E20 (move card)
    - Follow the design sketch: shape (400), resolve the card's board, participant with lock, reload the card under the lock (404), compare the version (409), validate the destination column and anchor (400 "Choose a valid destination."), detect an unchanged position (200, same version, the one affected list, no write, no event), allocate or rebalance, update `column_id` and `order`, bump, record `card_moved` and `entered_done` (non-Done into Done only), commit. Return `{card, columns, position_version}` with the affected lists from `read_columns`.
    - API: E20.
    - _Requirements: 4.1–4.11, 5.1–5.5; Root: T08; AC07.1, AC07.2_
  - [x] 5.6 Extend `test_kanban_schema.py` for the card schemas
    - Title, description (whitespace to null, null, omitted kept on E18), UUIDs, `before_card_id` presence, versions, unknown fields, empty PATCH, allowlists.
    - **Properties 2 and 11 for cards.**
    - _Requirements: 3.4, 3.11, 3.12, 4.7_
  - [x] 5.7 Write `test_cards_crud.py`
    - E17 append order and version +1, `card_created`, `entered_done` for a Done column and not for another, blank description to null, invalid assignee 400 with the field (nonmember, removed member, unknown user), E18 partial updates, explicit null clears assignee and description, omitted description kept, version unchanged, E19 soft delete and body, E07 shows the result of each.
    - _Requirements: 3.1–3.12, 5.1, 11.5_
  - [x] 5.8 Write `test_cards_move.py`
    - Within a column up and down, across columns, to the end, into an empty column, affected lists only (source and destination, or one), same-place move (200, same version, no event), a same-column reorder that changes place is a move, rebalance with `nextafter` neighbors and with equal orders, `card_moved` and `entered_done` rules (into Done, within Done, out of Done), invalid destination, self anchor, deleted anchor, anchor in another column and anchor on another board (400, no mutation), E07 after the move.
    - **Properties 4, 5, 10.**
    - _Requirements: 4.1–4.11, 11.5_
  - [x] 5.9 Extend the cross-cutting tests to E17–E20
    - `test_kanban_access.py` (nonmember, removed member, other-board card and column IDs, deleted board, identical 404), `test_kanban_roles.py` (Member succeeds on E17–E20), `test_kanban_request_order.py` (E20 stale version with an invalid anchor is 409), `test_kanban_events.py` (event rows per scenario, none for 409, 400, 403, 404, unchanged, and none after an injected failure), `test_kanban_atomicity.py` (injected failure for E17 and E20), `test_kanban_version_ceiling.py` (E17, E19, changing E20 at 2147483647), `test_kanban_concurrency.py` (two E20 with one version, a create racing a move, E20 racing a member removal returns 404 after the removal).
    - **Properties 3, 7, 8, 10, 12, 18 for cards.**
    - _Requirements: 3.8–3.10, 4.5, 4.9, 4.11, 5.2, 5.4–5.7, 11.1, 11.2, 11.5_
  - [x] 5.10 Write `test_kanban_assignment_refresh.py`
    - A card assigned to a member. After E12, E07 shows `assignee_id` and `assignee_name` as null and the version is unchanged. A card assigned to the same user on another board keeps its assignee.
    - _Requirements: 6.8, 11.5, 11.10_
  - [x] 5.11 Write the parameterized property files
    - `test_kanban_properties_rules.py` (1, 2, 11), `_reads.py` (4), `_writes.py` (3, 5, 6, 9, 10, 12, 18), `_scoping.py` (7, 8), each tagged `Feature: kanban, Property N: <title>`.
    - **Validates: Requirements 1 to 5, 11.8**

- [x] 6. Checkpoint: T08 verified and gate C (root T08)
  - [x] 6.1 Run the T08 acceptance checks
    - Run every `test_kanban_*`, `test_columns_*`, `test_cards_*` and `test_positions.py` file, the boards tests, the full backend suite, `ruff check` and `ruff format --check`. Record commands and counts in `evidence/kanban-T07-T09.md`. Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 11.5; Root: T08_
  - [x] 6.2 Decide root T08
    - Check root `T08` in `specs/tasks.md` only if card CRUD, assignment, the position service, both move directions, rebalance, concurrent moves and invalid targets all passed. Otherwise leave it open with the reason.
    - _Root: T08_
  - [x] 6.3 Verify gate C before any frontend task
    - Confirm root T08 is verified and root T06 is checked in `specs/tasks.md`. Root T06 closes only after boards-membership task 7.2 (measured mobile check and manual journey) passes. If T06 is open, stop here, report that group 7 is blocked, and do not mark T06 complete.
    - Outcome: task 7.2 passed (measured check 180 of 180, user-confirmed 375 px journey, `evidence/boards-membership-T05-T06.md`), and the frontend lint, typecheck and 960 tests pass, so root T06 was checked here at the user's request to run every task. See `evidence/kanban-T07-T09.md`.
    - _Root: T06, T08_

- [x] 7. Frontend foundation (WP-F1, root T09; starts only after gate C)
  - [x] 7.1 Type the board shapes and add parsers
    - Add `Card`, `Column`, `ColumnWithCards` and a typed `BoardDetail` to `frontend/lib/types.ts`. Add `frontend/lib/kanban.ts` with allowlist parsers for columns, cards, E13 `{column, position_version}`, E15 and E19 `{position_version}`, E16, E17 and E20 responses. Update `parseBoardDetail` in `lib/boards.ts` to return typed columns. Parsers throw `malformedApiError()` on any other shape. Tests in `lib/kanban.test.ts` and `lib/boards.test.ts`.
    - _Requirements: 6.7, 11.4; Root: T09_
  - [x] 7.2 Add `frontend/lib/kanbanRules.ts`
    - Column name, card title and description rules with the same messages as the backend. `lib/kanbanRules.test.ts` runs `kanban-field-cases.json`.
    - _Requirements: 1.2, 3.4, 3.12, 8.2, 8.4; Root: T09_
  - [x] 7.3 Add the Route Handlers and `handlePrivateRead`
    - Add `boardColumns`, `boardColumnsReorder`, `column`, `columnCards`, `card`, `cardPosition` to `FLASK_PATHS` and `columnId`, `cardId` to `FlaskParamName`. Add `handlePrivateRead` to `lib/server/privateRoute.ts` (no Origin check, cookie bearer, `no-store`, clears the cookie on 401). Add handlers: `app/api/boards/[id]/columns/route.ts`, `columns/reorder/route.ts`, `app/api/columns/[id]/route.ts`, `columns/[id]/cards/route.ts`, `app/api/cards/[id]/route.ts`, `cards/[id]/position/route.ts`, and `GET` on `app/api/boards/[id]/route.ts` and `members/route.ts`. Each write passes the exact `allowedKeys`. Route tests: Origin 403, 401 cookie clear, missing key 400, non-UUID 400, upstream status and `no-store` passed through.
    - _Requirements: 11.1, 11.4; Root: T09_
  - [x] 7.4 Extend the browser client allowlist
    - In `lib/apiClient.ts` add the declared method and path pairs, a `GET` allowlist for `/api/boards/UUID` and `/api/boards/UUID/members`, and `apiGet`. A pair outside the table throws before `fetch`. Extend `lib/apiClientProperties.test.ts` with the new pairs and the non-UUID table.
    - **Property 17: Browser client sends only declared requests.**
    - _Requirements: 11.4; Root: T09_
  - [x] 7.5 Add `kanbanErrors` helpers
    - `isPositionConflict`, `isStateConflict` and the Kanban toast messages in `lib/boardErrors.ts` or a new `lib/kanbanErrors.ts`, with tests. Reuse `isBoardAccessError` and `isForbiddenError`.
    - _Requirements: 7.7, 8.6, 9.6, 9.7, 9.11; Root: T09_
  - [x] 7.6 Add `SelectField` and multiline `FormField`
    - New `components/shared/SelectField.tsx` (label, select, hint, error, `aria-describedby`, `aria-invalid`, `min-h-11`, `text-base`). Add an optional `multiline` prop to `FormField` that renders a `textarea` with the same label, hint and error wiring. Existing props, markup and tests for `FormField` stay unchanged and pass. New tests for both: label association, error text, `aria-invalid`, 16 px class, 44 px class.
    - _Requirements: 8.3, 10.3, 10.4; Root: T09_

- [x] 8. Board state (WP-F2, root T09)
  - [x] 8.1 Add `frontend/lib/kanbanMove.ts`
    - Pure functions: `applyCardMove`, `applyColumnMove`, `mergeAffected`, `isCardUnchanged`, `isColumnUnchanged`, `moveAnnouncement`. Tests over fixed tables: within a column, across columns, to the end, to an empty column, unchanged place, the live-region text.
    - _Requirements: 9.1, 9.4, 9.5, 9.9, 9.12; Root: T09_
  - [x] 8.2 Add `frontend/hooks/useKanbanBoard.ts`
    - State seeded once from the server read. A synchronous gate covers every write and board refetch, including `requestRefresh()` and `reload()`. A write keeps the gate through its own recovery refetch. `moveCard` and `moveColumn` take a Snapshot, apply the optimistic change, send the current version and apply the authoritative response. Failure handling follows the table in the design. A refetch is applied only if its epoch is current. A refresh requested during a write runs after the gate is released. A failed refetch sets `stale`, keeps controls disabled and exposes `reload()`. No request for an unchanged place.
    - Tests in `hooks/useKanbanBoard.test.tsx`: optimistic placement, success, rollback on 500 with refetch, 409 restore then refetch, transport failure refetch, 400 destination restore and refetch, 403 restore without refetch, board 404 navigation, refetch failure then Reload, a second request ignored while the gate is held, no request for an unchanged place, an edit cannot be undone by a later rollback, `requestRefresh` deferred and run after release, a stale refetch response discarded.
    - **Properties 15 and 16.**
    - _Requirements: 6.8, 9.4–9.9, 9.11, 11.6; Root: T09_
  - [x] 8.3 Add `frontend/hooks/useDragAndDrop.ts`
    - Drag interaction state only: the dragged card ID, the current target, prop getters for a draggable card and for drop targets (before a card, end of a column), `effectAllowed = "move"` and `setData("text/plain", id)`. A drop calls the supplied `onDrop(cardId, columnId, beforeCardId)`. Disabled while the gate is held. No request logic. Test IDs `card-<id>`, `dropzone-<columnId>-before-<cardId>`, `dropzone-<columnId>-end`. Tests in `hooks/useDragAndDrop.test.tsx`.
    - _Requirements: 9.1, 9.8; Root: T09_

- [x] 9. Kanban components (WP-F3, root T09)
  - [x] 9.1 Add `ColumnHeader` and `BoardCard` (props-only)
    - `ColumnHeader`: name, card count, `Done` `BaseBadge` with text, an admin controls slot. `BoardCard`: title button "Edit <title>", assignee name or "Unassigned", Move button, wrapping text. Tests assert the rendered text and roles. Both are server-compatible (FE-C2).
    - _Requirements: 6.1–6.3, 10.3; Root: T09_
  - [x] 9.2 Add `AddColumnForm` and `AddCardForm`
    - `AddColumnForm` (admin): name and a "Done column" checkbox, disabled with a text hint while a Done column exists. `AddCardForm`: title and "Add card", clears on success, keeps focus in the form, shows a field error and keeps the title on a 400. 16 px inputs, 44 px buttons. Tests include the field-error path.
    - _Requirements: 7.1, 7.8, 8.1, 8.2, 10.3, 10.4; Root: T09_
  - [x] 9.3 Add `ColumnEditDialog`
    - One dialog on `BaseModal` for rename and the Done toggle (L3). Field errors inline, `STATE_CONFLICT` message beside the control with the input kept, focus return to the opener. Tests: rename success, Done conflict message, Escape without a request.
    - _Requirements: 7.2, 7.7, 10.5; Root: T09; AC05.1_
  - [x] 9.4 Add `CardEditDialog`
    - Title, description (multiline `FormField`), assignee `SelectField` ("Unassigned" and each active participant by name), Save, and Delete card through `ConfirmDialog` naming the card. A 400 keeps the dialog open with field errors and the entered values. Tests: save sends only changed fields, assignee options from `members`, delete confirm and cancel, Escape without a request.
    - _Requirements: 8.3–8.5, 8.7, 10.5; Root: T09; AC06.1_
  - [x] 9.5 Add `MoveCardDialog`
    - Destination column `SelectField` (default current column) and position `SelectField` ("At the end of the column", "Before <title>" for each other card there, default the card's present place). Confirm calls `moveCard`. Same-column reorder works. Tests: options for each case, Confirm calls the same function the drop uses, Escape without a request, keyboard-only operation.
    - **Property 14: One Move_Function.**
    - _Requirements: 9.2, 9.3, 10.3–10.5; Root: T09; AC07.1_
  - [x] 9.6 Add `KanbanColumn` and `KanbanBoard`
    - `KanbanBoard`: the region (`section`, `aria-label="Kanban columns"`, `tabIndex=0`, `overflow-x-auto`, `aria-busy` while the gate is held), the empty states for Admin and Member, lanes `w-72 shrink-0` as `.surface` panels, cards as tinted items, Move left and Move right with labels naming the column and disabled at the edges, the column Delete (explanation for a nonempty column, `ConfirmDialog` for an empty one), the polite live region, the Reload board button in the `stale` state, and busy handling that disables every competing control. Uses the design system parts only, no new color or font.
    - Tests: columns, order and counts, empty states, Done badge, role-based controls, edge buttons, delete flows, busy state, live region text, Reload board.
    - **Property 13: Role-based controls.**
    - _Requirements: 6.1–6.7, 7.1–7.9, 8.1, 9.8, 9.12, 10.1, 10.2, 11.6; Root: T09_

- [x] 10. Board page wiring (WP-F4, root T09)
  - [x] 10.1 Wire the page, shell and members panel
    - `app/(protected)/boards/[id]/page.tsx` passes the typed columns, the version and the members to `BoardShell`. `BoardShell` renders `KanbanBoard` in the main column and `useKanbanBoard` state, keeps the members panel in the side column (FE-D4) and passes `onMemberRemoved` to `MembersPanel`, which calls it after a successful E12 (the existing `router.refresh()` for the members list stays). Delete `ColumnsPlaceholder.tsx`. Update `page.test.tsx`, `BoardShell.test.tsx` and `MembersPanel.test.tsx`: `onMemberRemoved` fires after E12, the board refetch waits for a pending move and never replaces newer state, cleared assignees show "Unassigned".
    - _Requirements: 6.6, 6.7, 6.8, 11.6; Root: T09_
  - [x] 10.2 Confirm the mobile guard covers the new files
    - `lib/mobileGuard.test.ts` scans `app`, `components` and `hooks`. Run it and confirm it passes with the new files and that no new file needs an exception.
    - _Requirements: 10.1; Root: T09_

- [x] 11. Browser and mobile verification (root T09)
  - [x] 11.1 Write the measured script `evidence/kanban-mobile-measure.mjs`
    - In the style of `evidence/boards-membership-mobile-measure.mjs`. States: the board with columns and cards as Admin and as Member, the empty board for both roles, the Move dialog, the column edit dialog, the card edit dialog, the column and card delete dialogs. At 320, 375, 768 and 1280 px check: every interactive box at least 44 by 44 CSS px with `elementFromPoint` at its center (at 375 px as the agreed viewport), input and select font size at least 16 px, `scrollWidth <= innerWidth` for the page outside the region, region keyboard scroll, and in a real browser focus entry, Tab containment, Escape without an API call and focus return.
    - _Requirements: 10.1–10.6; Root: T09_
  - [x] 11.2 Run the checks and the manual journey, and record both
    - Start the local stack manually (backend, frontend and test database; the user runs the long-running commands). Run 11.1. Take screenshots at 375, 768 and 1280 px. Walk the journey at 375 px: add column, add card, edit and assign, desktop drag, Move dialog, reload, delete, and a second browser tab to force a 409. Check keyboard-only Move and touch Move.
    - Record in `evidence/kanban-T07-T09.md`: widths checked, emulator or real device, commands, journey steps with results, screenshot paths, and the real outcomes. Leave any real-device check not performed marked open. No Playwright is added in this slice.
    - Implementation note: the stack for this run was started by the agent on separate ports (Flask 5002 on the test database, Next 3101), not by the user, and the journey was scripted in `evidence/kanban-mobile-measure.mjs` (emulator, synthetic drag events). A human walk on a real phone is still open.
    - _Requirements: 10.6–10.8; Root: T09_

- [x] 12. Checkpoint: frontend and full verification
  - Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` from `frontend/`, and the full backend suite and ruff from `backend/`. Record the real output. Ensure all tests pass, ask the user if questions arise.

- [x] 13. Documentation sync and handoff (`documentation.md`)
  - [x] 13.1 Record status in traceability and evidence
    - Add a kanban evidence status table to `specs/traceability.md` (AC05.1, AC05.2, AC06.1, AC07.1, AC07.2, AC13.1, V04, V05) with observed results only, and the open items: Playwright V10 and real-device checks (T15), and the open T06 gate if still open. Record the same in `evidence/kanban-T07-T09.md` and add a row to the verification index in `evidence/README.md`.
    - _Requirements: 11.9_
  - [x] 13.2 Update the changelogs
    - Add concise entries under the `## YYYY-MM-DD` heading for the commit date, with a `### <short-sha> <subject>` entry to `CHANGELOG.md`, `backend/CHANGELOG.md` and `frontend/CHANGELOG.md` from verified results, grouping related items and avoiding duplicates. Mark verification still pending where it is.
    - _Requirements: 11.9_
  - [x] 13.3 Update README status
    - Update the status and feature sections using verified facts only, and link the changelog and evidence.
    - _Requirements: 11.9_
  - [x] 13.4 Update shared guideline and layer docs
    - Add `SelectField` to the shared parts list in `guidelines/frontend.md` and note multiline `FormField`. Confirm `frontend/specs/pages-and-components.md` matches the built components and hooks.
    - _Requirements: 11.9_
  - [x] 13.5 Record the T15 handoff
    - Write the Playwright journey for T15 (the eight V10 steps with the test IDs from 8.3) and the E11 rate limit and real-device items still open into `evidence/kanban-T07-T09.md`. Confirm the T15 row of `specs/tasks.md` carries the kanban journey.
    - _Requirements: 11.8, 11.9_
  - [x] 13.6 Synchronize task status
    - Check native tasks in this file only when their checks pass. Root T07 and T08 were decided at their checkpoints. Check root `T09` only when its full scope is verified (V05, V11, the measured mobile check at 44 by 44 px and 375 px, the manual journey, keyboard and touch movement, assignment refresh). Root T06 is never checked by this plan. Confirm the native spec links on the T07, T08 and T09 rows resolve. Report changed files, completed IDs, checks run, open work and documentation updates.
    - _Requirements: 11.9; Root: T07, T08, T09_

## Notes

- Test sub-tasks are not marked optional. Root completion in `specs/tasks.md` needs V04, V05 and V11, so they are required here.
- Group 3 creates the cross-cutting test files for columns, and group 5 extends the same files for cards. Each file stays one file per concern, as listed in `design.md` ("Backend test files").
- The E12 scope fix (group 1) is a T05 change. It is first so that gate A rests on the final T05 behavior.
- All database-writing tests clean up automatically through `BoardTracker` and run only on `TEST_DATABASE_URL` (task 2.4).
- Local checks prove local behavior only. Playwright (V10), real-device checks and deployment stay open for T15 and T16.
- GitHub, deployment, comments (T10), My Tasks and search (T11), notifications (T13) and analytics (T14) are out of scope. T13 will later extend the E17 and E18 transactions.
- Attach `guidelines/backend.md`, `guidelines/database.md` or `guidelines/frontend.md` when creating a file with no matching file context. For UI work read FE-D1 to FE-D9 and `frontend/app/globals.css` first.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4"] },
    { "id": 4, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 5, "tasks": ["2.6", "3.1"] },
    { "id": 6, "tasks": ["3.2", "3.3", "3.4", "3.5"] },
    { "id": 7, "tasks": ["3.6", "3.7", "3.8", "3.9"] },
    { "id": 8, "tasks": ["4.1"] },
    { "id": 9, "tasks": ["4.2"] },
    { "id": 10, "tasks": ["5.1"] },
    { "id": 11, "tasks": ["5.2", "5.3", "5.4", "5.5"] },
    { "id": 12, "tasks": ["5.6", "5.7", "5.8", "5.9", "5.10", "5.11"] },
    { "id": 13, "tasks": ["6.1"] },
    { "id": 14, "tasks": ["6.2", "6.3"] },
    { "id": 15, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6"] },
    { "id": 16, "tasks": ["8.1", "8.3"] },
    { "id": 17, "tasks": ["8.2"] },
    { "id": 18, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5"] },
    { "id": 19, "tasks": ["9.6"] },
    { "id": 20, "tasks": ["10.1", "10.2"] },
    { "id": 21, "tasks": ["11.1"] },
    { "id": 22, "tasks": ["11.2"] },
    { "id": 23, "tasks": ["12"] },
    { "id": 24, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5"] },
    { "id": 25, "tasks": ["13.6"] }
  ]
}
```
