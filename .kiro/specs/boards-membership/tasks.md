# Implementation Plan: boards-membership (T05–T06)

## Overview

This plan implements the Flask boards and membership API (E05–E12, root T05) and the Next.js dashboard, board shell and membership controls (root T06) described in `design.md`. The validator move (WP-B0, group 1) comes first, then the backend (group 2), the frontend foundations and UI (groups 4 and 5), tests, the measured mobile check and the manual journey, and documentation. Implementation languages are the ones already in the repository: Python (Flask, SQLAlchemy, pytest) and TypeScript (Next.js App Router, Tailwind, daisyUI, Vitest).

**Status:** Not started. Spec phase output, updated to the approved decisions R1–R14 and DD1–DD16. Task 0.2 (contract and root spec sync) is done. No source code was changed.

**Root tasks:** T05 (native groups 0.2, 1 and 2) and T06 (native groups 4 to 7). Groups 0 and 9 cover both. Existing root IDs are preserved and no new root IDs are proposed. Root T05 and T06 stay unchecked in `specs/tasks.md` until every acceptance check passes, including AC04.2 assignment clearing (verified in this slice by tasks 2.10 and 2.18).

**Inputs:** `requirements.md` (Requirements 1 to 7), `design.md` (DD1–DD16, Properties 1–17, WP-B0 to WP-D, C1–C5, R1–R14).

## Review Decisions (all resolved)

R1–R14 and C1–C5 are approved as written in `design.md` ("Review Items and Decisions", "Contract and Document Impact"). No decision is open.

| ID          | Outcome                                                                                                                                                 | Task that applies it     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| R1          | E12 clears the removed user's active card assignments on that board in the same transaction (DD6). The T08 deferral and the marked comment are removed. | 2.4, 2.10, 2.18          |
| R2, C1      | Nonmembers and removed members get the same 404 as a missing board.                                                                                     | 2.1, 2.11                |
| R3          | A Member gets 403 on admin-only actions.                                                                                                                | 2.12                     |
| R4, R13, C4 | E11 unknown email: 404 `USER_NOT_FOUND`, plain envelope, only after the admin check. Enumeration risk accepted; per-admin E11 rate limit in T16.        | 2.1, 2.4, 2.9, 4.1, 5.4  |
| R5          | Authenticate, validate the body (400), then authorize.                                                                                                  | 2.3, 2.4, 2.13           |
| R6          | E10 order: admin, name, `user_id`.                                                                                                                      | 2.4, 2.9                 |
| R7          | Server helper for reads, Route Handlers for writes.                                                                                                     | 4.4, 4.5, 4.6            |
| R8          | No Hypothesis or fast-check. Properties are parameterized pytest and Vitest tests.                                                                      | 2.15–2.18, 6.1, 6.8, 6.9 |
| R9          | No Playwright in this slice. The automated journey is carried into T15.                                                                                 | 7.2, 9.2                 |
| R10         | Generic validators move to `backend/app/validation.py` (WP-B0).                                                                                         | 1.1–1.3                  |
| R11         | Name sorting uses the database collation. Tests use collation-neutral names.                                                                            | 2.7, 2.9                 |
| R12         | Duplicate board names are allowed.                                                                                                                      | 2.3, 2.7, 2.8, 2.18      |
| R14         | Members list refreshes after each local mutation. A later board-access 404 shows the access error and navigates to the boards list.                     | 5.3, 5.4, 6.6            |
| C2, C3, C5  | `docs/API.md` wording for E09 (`data: null`), E12 (clearing, 404, 409).                                                                                 | Done in 0.2              |

## Tasks

- [ ] 0. Record review outcomes and align contracts
  - [x] 0.1 Record the resolved decisions R1–R14 and C1–C5 in `evidence/spec-review.md`
    - Add one row per decision with the outcome from the table above and file references into `design.md`, `requirements.md` and this file.
    - Record that the user approved the changes and that no source code, test or README was changed in the spec phase.
    - _Requirements: 7.7, 7.8; Root: T05, T06_
  - [x] 0.2 Apply approved contract changes C1–C5 (spec review only; no tests run)
    - Updated `specs/design.md` D2, `specs/requirements.md` AC03.3 and AC04.1, `backend/specs/api-contract.md` (403 and 404 rows), `docs/API.md` (conventions, E09, E11, E12), `specs/traceability.md` (AC04.2 row) and `specs/tasks.md` (T05, T15, T16).
    - Added the `specs/CHANGELOG.md` entry with before, after, reason and verification. No endpoint path, method, request field or response shape changed.
    - _Requirements: 2.4, 4.5, 5.9, 7.7, 7.8; Root: T05_

- [x] 1. Move shared validators into `app/validation.py` (WP-B0, root T05)
  - [x] 1.1 Record the auth regression baseline before the move
    - From `backend/`, run the auth tests that cover registration, login and the shared cases (`test_auth*.py`, the schema tests that read `specs/fixtures/auth-field-cases.json`) and the full backend suite. Record the exact commands and real pass counts in `evidence/boards-membership-T05-T06.md`.
    - _Requirements: 7.11; Root: T05_
  - [x] 1.2 Move the generic validators
    - Move `TrimmedString`, `NormalizedString`, `normalize_email`, `EMAIL_PATTERN`, `EMAIL_MAX`, the messages `REQUIRED`, `NOT_TEXT`, `UNKNOWN`, `EMAIL_LENGTH`, `EMAIL_FORMAT` and the not-blank and email-format validator functions from `backend/app/blueprints/auth/schema.py` to `backend/app/validation.py` (DD14).
    - Update `auth/schema.py` to import them. Keep the auth-only items (name length rule, password rules, `RegisterSchema`, `LoginSchema`) in the auth blueprint. Do not change auth behavior or messages.
    - Follow `guidelines/backend.md` (BE02, BE03).
    - _Requirements: 7.11; Root: T05_
  - [x] 1.3 Re-run the auth regression after the move
    - Run the same commands as 1.1. The results must match the baseline with no test edited. Record the commands and real counts next to the baseline.
    - _Requirements: 7.11; Root: T05_

- [x] 2. Implement the boards and membership API (root T05)
  - [x] 2.1 Add typed exceptions, `authorize_board` and `_commit` (WP-B1)
    - Add `NotFoundError` (404 `NOT_FOUND`), `UserNotFoundError` (404 `USER_NOT_FOUND`), `UnauthorizedBoardAccessError` (403 `FORBIDDEN`) and `StateConflictError` (409 `STATE_CONFLICT`) with fixed messages to `backend/app/exceptions.py`. Map them in the central handler in `backend/app/errors.py`. `UserNotFoundError` returns a plain envelope with no `fields`.
    - Create `backend/app/blueprints/boards/__init__.py` (`boards_bp`) and `service.py` with `authorize_board(board_id, user_id, *, role=None, lock=False)` using check, lock, recheck in separate statements (DD1, DD2). A missing board, a deleted board, a nonmember and a removed member all raise `NotFoundError`. Add `_commit()` with rollback on `SQLAlchemyError`.
    - Follow `guidelines/backend.md` (BE02, BE05, BE06) and `guidelines/database.md`.
    - _Requirements: 2.4, 2.5, 3.2, 3.3, 4.5, 4.7, 5.5, 7.1; Root: T05; AC03.3_
  - [x] 2.2 Add schemas, serializers and the shared field fixture (WP-B2)
    - Create `backend/app/blueprints/boards/schema.py` with `BoardCreateSchema`, `BoardUpdateSchema`, `MemberAddSchema`, `BoardSummarySchema`, `ColumnSchema`, `CardSchema` and `MembershipSchema`. Import the shared validators from `app.validation`, not from the auth blueprint (DD14). Use explicit `Meta.fields` and reject unknown fields (DD9).
    - Define the board name messages (`Required.`, `Must be text.`, `Must be 1 to 100 characters.`, `Unknown field.`) in the boards schema.
    - Create `specs/fixtures/board-field-cases.json` for board names and member emails.
    - _Requirements: 1.2, 3.4, 4.6, 4.8, 7.3, 7.11; Root: T05; AC03.1_
  - [x] 2.3 Implement board services and routes E05–E09 (WP-B3)
    - In `service.py` add `create_board` (board plus admin membership in one transaction, duplicate names allowed), `list_boards` (ordered by name in the database collation, then ID), `get_board_detail` (three constant queries, empty `columns` when none, DD10), `rename_board` and `delete_board` (board lock, role `admin`).
    - In `routes.py` add thin routes for E05–E09 with `token_required` and `parse_uuid`. Validate the body in the route before the service call (DD3). E09 returns `{"data": null}`.
    - API: E05, E06, E07, E08, E09 (`Cache-Control: private, no-store` is inherited from `response_headers.py`).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.9, 2.1, 2.2, 2.3, 2.6, 3.1, 3.2, 3.4, 3.5, 3.6, 7.2, 7.3, 7.9; Root: T05; AC03.1, AC03.2, AC03.3_
  - [x] 2.4 Implement member services and routes E10–E12, register the blueprint (WP-B4)
    - In `service.py` add `list_members` (admin first, then name in the database collation, then `user_id`), `add_member` (admin role check with lock, user lookup only after the role check, `UserNotFoundError` for an unregistered email, `StateConflictError` for an active member, reactivate the same row as `member`, `IntegrityError` backstop) and `remove_member`.
    - `remove_member`: lock, admin target gives `StateConflictError`, no active row gives `NotFoundError`, soft-delete the membership, then in the same transaction run `UPDATE cards SET assignee_id = NULL` for active cards assigned to the target whose `column_id` is in the columns of this board, then one `_commit()` (DD6). Leave no T08 comment.
    - Add routes E10–E12, validating the E11 body before the service call, and register `boards_bp` in `backend/app/__init__.py`.
    - API: E10, E11, E12.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.2, 5.3, 5.4, 5.5, 5.9, 7.1, 7.2, 7.9; Root: T05; AC04.1, AC04.2_
  - [x] 2.5 Add the `BoardTracker` fixture and the cleanup test (WP-B5, DD15)
    - Add `BoardTracker` in a boards helper module next to `backend/tests/auth_helpers.py`, extending the `Tracker` pattern. It records the IDs of users, boards, columns, cards and memberships created directly or through the API, including IDs read from E06 responses.
    - Add a pytest fixture on the app configured from `TEST_DATABASE_URL` (through the existing `db_guard`). Its finalizer runs when assertions fail and deletes only tracked data in foreign-key order: cards, columns of tracked boards, memberships of tracked boards and users, boards, users. No `TRUNCATE`, no name patterns.
    - Write `backend/tests/test_boards_cleanup.py`: create data, fail inside a harness, then check that the tracked rows (including related memberships and cards) are gone and that a pre-seeded untracked sentinel row remains. Also check that the guard refuses a URL equal to `DATABASE_URL`.
    - Run: `pytest backend/tests/test_boards_cleanup.py` and record the real output.
    - _Requirements: 7.12; Root: T05_
  - [x] 2.6 Write schema tests BT1 in `backend/tests/test_boards_schema.py`
    - Check board name and email rules against `board-field-cases.json`, unknown fields and the serializer allowlists.
    - _Requirements: 1.2, 3.4, 4.6, 4.8, 7.3, 7.5_
  - [x] 2.7 Write create, list and detail tests BT2 and BT3
    - `test_boards_create_list.py`: E06 201 and admin membership, 400 cases, duplicate names accepted, E05 filtering and collation-neutral order.
    - `test_boards_detail.py`: E07 shape, empty columns, ordering with directly seeded columns and cards, `assignee_name` join, soft-deleted children excluded.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.9, 2.1, 2.2, 2.3, 7.5_
  - [x] 2.8 Write update and delete tests BT4 in `backend/tests/test_boards_update_delete.py`
    - E08 and E09 as Admin, E09 body `{"data": null}`, 403 as Member with state unchanged, later 404s for E05 and E07–E12, duplicate names on rename.
    - _Requirements: 1.9, 3.1, 3.2, 3.4, 3.5, 3.6, 7.5_
  - [x] 2.9 Write member tests BT5 in `backend/tests/test_board_members.py`
    - E10 ordering: admin first, then name, then `user_id`, using collation-neutral names and equal names to exercise the `user_id` tie-break.
    - E11: 201, reactivation reusing the row ID with role `member`, 409 `STATE_CONFLICT`, 404 `USER_NOT_FOUND` with no `fields` for an Admin, 400 for a malformed email or unknown field. E12: 200 `{"data": null}`, 404 for a target without an active membership, 409 for the admin target. No email, hash or timestamp in any body.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 5.1, 5.3, 5.4, 7.5_
  - [x] 2.10 Write E12 assignment-clearing tests in `backend/tests/test_board_members_assignments.py`
    - Seed with `BoardTracker`: users A (admin of boards 1 and 2) and B (member of both), one column per board, cards on board 1 and board 2 assigned to B, one soft-deleted card assigned to B on board 1, and one card assigned to A.
    - After E12 on board 1, check that active board 1 cards assigned to B have `assignee_id` NULL, board 2 cards assigned to B are unchanged, the soft-deleted card and A's card are unchanged, and the membership is soft-deleted.
    - Rollback: inject a failure after the card update and before commit, then check the membership is still active and every assignment is unchanged.
    - _Requirements: 5.1, 5.5, 5.9, 7.5; Root: T05; AC04.2_
  - [x] 2.11 Write the nonmember 404 matrix in `backend/tests/test_boards_access.py`
    - For E07–E12 with an otherwise valid request, compare the 404 status, code `NOT_FOUND`, message and absence of `fields` across a nonexistent board, a soft-deleted board, a Nonmember and a removed member. Include an E12 user ID from another board, an invalid UUID (400), anonymous (401) and `Cache-Control: private, no-store` on success and error responses.
    - _Requirements: 2.4, 2.5, 2.6, 5.2, 7.1, 7.2, 7.5_
  - [x] 2.12 Write the Member 403 tests in `backend/tests/test_boards_roles.py`
    - A Member gets 403 `FORBIDDEN` on E08, E09, E11 and E12 with otherwise valid input. Check that the board name, `deleted_at`, the memberships and all card assignments are unchanged. An Admin gets success on the same requests.
    - _Requirements: 3.2, 3.3, 4.7, 7.5_
  - [x] 2.13 Write the validation-before-authorization tests in `backend/tests/test_boards_request_order.py`
    - For E08 and E11, over anonymous, Nonmember, Member and Admin callers and valid and invalid bodies: anonymous gets 401; any authenticated caller with an invalid body gets 400; with a valid body a Nonmember gets 404 `NOT_FOUND`, a Member gets 403 and an Admin with an unregistered email gets 404 `USER_NOT_FOUND`. `USER_NOT_FOUND` never appears for a Member or Nonmember.
    - _Requirements: 4.5, 4.6, 7.5, 7.9_
  - [x] 2.14 Write atomicity and concurrency tests BT7 in `backend/tests/test_boards_atomicity.py`
    - Inject a failure after the first insert on E06 and read the prior state (no board, no membership). Run a concurrent double E11 (one 201, one 409) and a concurrent E12 and E11 on the same user. Use `BoardTracker` for cleanup.
    - _Requirements: 1.1, 4.4, 5.5, 7.5_
  - [x] 2.15 Write parameterized tests for Properties 1–3 in `backend/tests/test_boards_properties_rules.py`
    - **Property 1: Board name rule**, **Property 2: Request schemas accept exactly their field set**, **Property 3: Member email rule and normalization**, over `board-field-cases.json` and `auth-field-cases.json`, including the check that auth and boards schemas give the same result through `app.validation`. Tag each test `Feature: boards-membership, Property N: <title>`.
    - **Validates: Requirements 1.1, 1.2, 3.1, 3.4, 4.2, 4.6, 7.10, 7.11**
  - [x] 2.16 Write parameterized tests for Properties 4–7 in `backend/tests/test_boards_properties_reads.py`
    - **Property 4: Board listing visibility and order**, **Property 5: Board detail filtering and order**, **Property 6: Inaccessible boards are indistinguishable**, **Property 7: Non-UUID identifiers are rejected before lookup**, over enumerated deterministic fixture matrices (roles, soft-deleted and removed states, `order` ties).
    - **Validates: Requirements 1.3, 1.4, 2.1, 2.2, 2.4, 2.5, 2.6, 3.6, 5.2, 7.1, 7.10**
  - [x] 2.17 Write parameterized tests for Properties 8–12 in `backend/tests/test_boards_properties_writes.py`
    - **Property 8: Role gate**, **Property 9: Membership model and admin invariant**, **Property 10: Response allowlist**, **Property 11: Failed writes leave no partial state**, **Property 12: Authentication and private caching on every board route**.
    - **Validates: Requirements 1.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.7, 4.8, 5.1, 5.3, 5.4, 5.5, 7.2, 7.3, 7.10**
  - [x] 2.18 Write parameterized tests for Properties 15–17 in `backend/tests/test_boards_properties_scoping.py`
    - **Property 15: Removal clears only this board's assignments**, **Property 16: Request order of authentication, validation and authorization**, **Property 17: Duplicate board names are accepted**.
    - **Validates: Requirements 1.9, 4.5, 4.6, 5.1, 5.9, 7.9, 7.10**

- [x] 3. Checkpoint - Backend complete
  - Run the backend lint, type and pytest commands from `backend/` and record the real output in `evidence/boards-membership-T05-T06.md`. Ensure all tests pass, ask the user if questions arise.

- [x] 4. Build the frontend foundations (root T06)
  - [x] 4.1 Add error codes, types and parsers (WP-F1)
    - Add `NOT_FOUND`, `USER_NOT_FOUND` and `STATE_CONFLICT` with fallback copy to `KnownErrorCode` in `frontend/lib/errors.ts`, so the server message is kept for those codes.
    - Add `BoardRole`, `BoardSummary`, `BoardDetail`, `Membership` to `frontend/lib/types.ts`. Create `frontend/lib/boards.ts` with allowlist parsers.
    - Follow `guidelines/frontend.md` (FE-A, FE-C).
    - _Requirements: 4.12, 4.14, 7.3; Root: T06_
  - [x] 4.2 Add `boardRules.ts` and `boardPermissions.ts` (WP-F1)
    - `boardRules.ts`: board name rule (1 to 100 code points after trim) and the email rule re-exported from `authRules.ts`, matching the shared fixture.
    - `boardPermissions.ts`: `boardControls(viewerRole)` and `canRemoveMember(viewerRole, row)`.
    - _Requirements: 1.8, 3.10, 4.10, 4.13, 5.8; Root: T06_
  - [x] 4.3 Extend the browser API client with `apiRequest` (WP-F1)
    - In `frontend/lib/apiClient.ts` add `isDeclaredApiRequest` and `apiRequest(method, path, body, signal)` with the declared method and path allowlist (UUID segments only). `apiPost` keeps its signature and behavior.
    - _Requirements: 7.4; Root: T06_
  - [x] 4.4 Extend the server Flask helper (WP-F2)
    - In `frontend/lib/server/flask.ts` add the four board routes, `PATCH` and `DELETE`, and UUID-only parameter substitution. Keep the origin check on the final URL (DD13).
    - _Requirements: 2.6, 7.4; Root: T06_
  - [x] 4.5 Add `privateRoute.ts` and server board reads (WP-F2)
    - Create `frontend/lib/server/privateRoute.ts` with `handlePrivateWrite` (environment, exact Origin 403, cookie 401, UUID 400, JSON checks, forward, pass through, 401 clears cookie, 503 envelope).
    - Create `frontend/lib/server/boards.ts` with `getBoards`, `getBoard`, `getBoardMembers`. A 404 or non-UUID id calls `notFound()`. No cookie redirects to `/login`.
    - _Requirements: 2.6, 2.8, 2.9, 7.4; Root: T06_
  - [x] 4.6 Add the four write Route Handlers (WP-F3)
    - Create `app/api/boards/route.ts` (POST E06), `app/api/boards/[id]/route.ts` (PATCH E08, DELETE E09), `app/api/boards/[id]/members/route.ts` (POST E11) and `app/api/boards/[id]/members/[userId]/route.ts` (DELETE E12) on top of `handlePrivateWrite`.
    - _Requirements: 7.4; Root: T06_

- [x] 5. Build the dashboard, board shell, members controls and mobile UI (root T06)
  - [x] 5.1 Add shared components (WP-F4)
    - Create `BaseBadge.tsx`, `BaseModal.tsx` (native `<dialog>`, `showModal()`) and `ConfirmDialog.tsx` (focus on Cancel, Escape and Cancel never call the API, focus returns to the opener, pending state blocks closing). Make the `AppHeader` brand a link to `/`.
    - Stub `showModal` and `close` in the test setup for jsdom.
    - API/UI: Confirm_Dialog for E09 and E12.
    - _Requirements: 3.8, 5.6, 6.2, 6.4; Root: T06_
  - [x] 5.2 Build the dashboard (WP-F5)
    - Create `BoardList.tsx`, `CreateBoardForm.tsx`, `BoardsDashboard.tsx` and the Server Component `app/(protected)/page.tsx` that calls `getBoards()`.
    - Show name links with role badges, the empty state with the form, field errors that keep the typed name, and on E06 201 insert in name order then `router.push('/boards/{id}')`.
    - API/UI: E05, E06 at `/`.
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 2.9; Root: T06; AC03.1_
  - [x] 5.3 Build the board page and shell (WP-F6)
    - Create `app/(protected)/boards/[id]/page.tsx` (`Promise.all` of `getBoard` and `getBoardMembers`), `not-found.tsx` with a link to `/`, `BoardShell.tsx`, `BoardHeader.tsx` (name `h1`, role badge, Rename and Delete for Admin only), `RenameBoardForm.tsx` and `ColumnsPlaceholder.tsx`.
    - Delete uses `ConfirmDialog` naming the board, then E09 and `router.push('/')`. A 404 from E08 or E09 after the page loaded shows the access error toast and navigates to `/` (R14). Other error mapping follows `design.md` (400 inline, 403 toast then refresh, 5xx retry toast).
    - API/UI: E07, E08, E09 at `/boards/[id]`.
    - _Requirements: 2.7, 2.8, 2.9, 2.10, 3.6, 3.7, 3.8, 3.9, 3.10; Root: T06; AC03.2, AC03.3_
  - [x] 5.4 Build the Members_Panel (WP-F6)
    - Create `MembersPanel.tsx` and `AddMemberForm.tsx`. List name and role; Admin sees the add form and Remove on `member` rows only; Member sees the list only.
    - Add member: trim and lowercase, 201 appends the row, clears the field and calls `router.refresh()`. 400, 409 and 404 with code `USER_NOT_FOUND` show inline under the email field and keep the email. Only the code `USER_NOT_FOUND` maps to the email field; a 404 with any other code shows the access error and navigates to `/`.
    - Remove: `ConfirmDialog` naming the member, 200 removes the row and calls `router.refresh()`, 404 shows the access error and navigates to `/`, 409 or 403 toasts and keeps the row.
    - API/UI: E10, E11, E12.
    - _Requirements: 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 4.15, 5.6, 5.7, 5.8; Root: T06; AC04.1, AC04.2_
  - [x] 5.5 Build the mobile layout for all new surfaces (FE-S4–S6, AC13.1)
    - Apply the Mobile design table in `design.md` to every new page, form, list, header and dialog: `max-w-3xl p-4 sm:p-6` with no `min-h-screen`, stacked forms with full-width submit below 640 px, `min-w-0 break-words` names, `flex-wrap` rows, `modal-bottom sm:modal-middle` dialog with stacked buttons, `min-h-11 min-w-11` on every interactive control, `text-base` on every input.
    - Make the existing `frontend/lib/mobileGuard.test.ts` pass over the new files without editing it.
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.7; Root: T06; AC13.1_

- [x] 6. Write frontend tests (Vitest)
  - [x] 6.1 Test board and email rules FT1 in `frontend/lib/boardRules.test.ts`
    - Read `specs/fixtures/board-field-cases.json` and check client and server parity, as parameterized tests. This is the client half of Properties 1 and 3.
    - _Requirements: 1.8, 4.6, 7.5, 7.10_
  - [x] 6.2 Extend client and server helper tests FT2
    - Extend `lib/apiClient.test.ts` (allowlist, `data: null` unwrap, error mapping, existing `apiPost` tests unchanged), `lib/server/flask.test.ts` (UUID-only substitution rejects `..`, `/`, `?`, empty) and `lib/errors.test.ts` (`NOT_FOUND`, `USER_NOT_FOUND` and `STATE_CONFLICT` keep their copy).
    - _Requirements: 4.12, 7.4_
  - [x] 6.3 Test the Route Handlers FT3 in `app/api/boards/**/route.test.ts`
    - Cover Origin 403, missing cookie 401, bad UUID 400, key checks, 415 and 413, forwarded method, path and bearer, 401 clears the cookie, non-envelope upstream gives 503.
    - _Requirements: 7.4_
  - [x] 6.4 Test `BaseModal` and `ConfirmDialog` FT4
    - Cover initial focus, Tab containment, Escape without `onConfirm`, focus return, pending state, named target, and mobile classes.
    - _Requirements: 3.8, 5.6, 6.2, 6.4_
  - [x] 6.5 Test the dashboard FT5
    - `BoardsDashboard`, `BoardList`, `CreateBoardForm`: list, badges, links, empty state, create success and failure with the name kept, 44 px and `text-base` classes.
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 6.2, 6.3_
  - [x] 6.6 Test the board shell and members FT6
    - `BoardShell`, `BoardHeader`, `MembersPanel`, `AddMemberForm`: role-based controls, add, remove through the dialog, rename, delete. `router.refresh()` is called after a successful E11 or E12. `USER_NOT_FOUND` maps to the email field only. A 404 without `USER_NOT_FOUND` on E08, E09, E11 or E12 shows the access error and calls `router.push('/')`. 400 and 409 mapping. `min-h-11 min-w-11` and `text-base` classes on the new controls and inputs.
    - _Requirements: 2.10, 3.7, 3.9, 3.10, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 4.15, 5.7, 5.8, 6.2, 6.3_
  - [x] 6.7 Test the server pages FT7
    - `app/(protected)/page.test.tsx` and `app/(protected)/boards/[id]/page.test.tsx`: helpers called, redirect without a session, `notFound()` on 404 and non-UUID.
    - _Requirements: 2.6, 2.8, 2.9_
  - [x] 6.8 Write parameterized tests for Property 13 in `frontend/lib/boardPermissions.test.ts`
    - **Property 13: Role-based controls**, over both roles and a fixed list of membership rows, with the render assertion for `MembersPanel` and `BoardHeader` in the FT6 files.
    - **Validates: Requirements 3.10, 4.10, 4.13, 5.8, 7.10**
  - [x] 6.9 Write parameterized tests for Property 14 in `frontend/lib/apiClientProperties.test.ts`
    - **Property 14: Browser client sends only declared requests**, over a fixed table of UUID and non-UUID segments (including `..`, `/`, `?`, `#`). `apiRequest` throws before `fetch` for every non-UUID.
    - **Validates: Requirements 2.6, 7.4, 7.10**

- [x] 7. Browser and mobile verification (root T06)
  - [x] 7.1 Write the measured mobile script (BM1)
    - Create `evidence/boards-membership-mobile-measure.mjs` in the style of `evidence/authentication-mobile-measure.mjs`. For `/`, `/boards/[id]` as Admin and as Member, the rename form, both Confirm_Dialog states (delete board and remove member) and the not-found state, at 320, 375, 768 and 1280 px, check every interactive box is at least 44 by 44 with `elementFromPoint` at its center, input font size at least 16 px, and `scrollWidth <= innerWidth`. In a real browser also check focus entry on Cancel, Tab containment, Escape without an API call and focus return to the opener (jsdom stubs `<dialog>`).
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.6_
  - [x] 7.2 Run the mobile check and the manual journey, and record both
    - Start the local stack manually (backend, frontend and test database; the user runs the long-running commands). Run 7.1 at 320, 375, 768 and 1280 px. Walk the journey create board, open, add member, remove member, delete board at 375 px.
    - Record in `evidence/boards-membership-T05-T06.md`: widths checked, whether each pass used an emulator or a real device, the commands, the journey steps with results, and the real outcomes. Leave any real-device check not performed marked open. No Playwright is added in this slice.
    - _Requirements: 6.5, 6.6, 6.7, 7.6; AC13.1_

- [x] 8. Checkpoint - Frontend and browser checks complete
  - Run the frontend lint, type-check and Vitest commands from `frontend/` and record the real output. Ensure all tests pass, ask the user if questions arise.

- [x] 9. Documentation sync and handoff (`documentation.md`)
  - [x] 9.1 Record the AC04.2 verification and the risks in traceability and evidence
    - In `specs/traceability.md` add the boards-membership evidence status table. Record AC04.2 as verified only if tasks 2.10 and 2.18 passed (membership removal and assignment clearing in one transaction, other-board assignments preserved), the account-enumeration risk of `USER_NOT_FOUND`, and the per-admin E11 rate limit with shared storage tracked in T16. Repeat the notes in `evidence/boards-membership-T05-T06.md`.
    - _Requirements: 5.9, 7.7_
  - [x] 9.2 Record the T15 and T16 handoff
    - Confirm the T15 and T16 rows of `specs/tasks.md` carry the automated boards-membership Playwright journey and the per-admin E11 rate limit with the enumeration note. Write the journey steps (create board, open, add member, remove member, delete board, at 375 px and wider) into `evidence/boards-membership-T05-T06.md` as the T15 input.
    - _Requirements: 7.6, 7.7; Root: T05, T06_
  - [x] 9.3 Update the changelogs
    - Add concise `[Unreleased]` entries to `CHANGELOG.md`, `backend/CHANGELOG.md` and `frontend/CHANGELOG.md` from verified results, grouping related items and avoiding duplicates. Mark verification still pending where it is.
    - _Requirements: 7.7_
  - [x] 9.4 Update README status
    - Update the status and feature sections of `README.md` using verified facts only, and link the changelog and evidence.
    - _Requirements: 7.7_
  - [x] 9.5 Synchronize task status
    - Check native tasks in this file only when their Done checks pass. Keep root `T05` and `T06` unchecked in `specs/tasks.md` until their acceptance checks (V03, V11, the manual journey and AC04.2) pass; check each only when its full scope is verified. Confirm the native spec link on the T05 and T06 rows still resolves.
    - Report changed files, completed IDs, checks run, open work and documentation updates.
    - _Requirements: 7.7; Root: T05, T06_

## Notes

- Test sub-tasks are not marked optional with `*`. Root task completion in `specs/tasks.md` requires the V03, V10 and V11 checks, so they are required here.
- No property-testing library is added (R8, Requirements 7.10). Properties are parameterized pytest and Vitest tests over the shared JSON case tables and enumerated deterministic fixtures. Backend property tests use one file per task group (`test_boards_properties_rules.py`, `_reads.py`, `_writes.py`, `_scoping.py`) so tasks can run in parallel. The BT6 tests are split across `test_boards_access.py`, `test_boards_roles.py` and `test_boards_request_order.py`, and the E12 assignment-clearing tests (BT5, Property 15) are in `test_board_members_assignments.py`. `design.md` ("Backend test files") lists the same file names.
- All database-writing tests run on `TEST_DATABASE_URL` and clean up through `BoardTracker` (task 2.5).
- No Playwright is added in this slice. The automated journey (PW1) is delivered in T15 (R9). Local checks prove local behavior only. Real-device results and deployment stay open for T15 and T16.
- Do not write real passwords, tokens or connection strings into specs, evidence, logs or shell arguments.
- GitHub, deployment, columns (T07), cards (T08) and Kanban UI (T09) are out of scope.
- Attach `guidelines/backend.md`, `guidelines/database.md` or `guidelines/frontend.md` when creating a file with no matching file context.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0.1", "1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "4.1", "4.2", "4.3", "4.4", "5.1"] },
    {
      "id": 2,
      "tasks": ["1.3", "2.2", "2.5", "6.1", "6.2", "6.4", "6.8", "6.9"]
    },
    { "id": 3, "tasks": ["2.3", "2.6", "4.5"] },
    { "id": 4, "tasks": ["2.4", "2.7", "2.8", "4.6", "5.2"] },
    {
      "id": 5,
      "tasks": [
        "2.9",
        "2.10",
        "2.11",
        "2.12",
        "2.13",
        "2.14",
        "2.15",
        "2.16",
        "2.17",
        "2.18",
        "5.4",
        "6.3",
        "6.5"
      ]
    },
    { "id": 6, "tasks": ["5.3"] },
    { "id": 7, "tasks": ["5.5", "6.6", "6.7"] },
    { "id": 8, "tasks": ["7.1"] },
    { "id": 9, "tasks": ["7.2"] },
    { "id": 10, "tasks": ["9.1", "9.2", "9.3", "9.4"] },
    { "id": 11, "tasks": ["9.5"] }
  ]
}
```
