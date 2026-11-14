# Acceptance Traceability

Every row is planned. E codes refer to the [API](../docs/API.md), T codes to [tasks](tasks.md), and V codes to the [test plan](../docs/TEST-PLAN.md). Add observed evidence paths or links after execution.

| AC                     | Design/API/UI mapping                                                                                                                                                                                           | Tasks                                     | Verification       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------ |
| AC01.1, AC01.2         | D2 · E02 · `/register`                                                                                                                                                                                          | T02, T03, T04                             | V01                |
| AC02.1, AC02.2, AC02.3 | D2 · E03–E04 · `/login`, protected shell                                                                                                                                                                        | T03, T04                                  | V02, V09           |
| AC03.1, AC03.2, AC03.3 | D2–D3, D5 · E05–E09 · `/`, `/boards/[id]`                                                                                                                                                                       | T05, T06                                  | V03, V10           |
| AC04.1, AC04.2         | D2–D3 · E10–E12 · Board members. AC04.2 assignment clearing is in E12 and fully covered in T05 (seeded cards on two boards). `USER_NOT_FOUND` enumeration risk accepted for v1; per-admin E11 rate limit in T16 | T05, T06                                  | V03                |
| AC05.1, AC05.2         | D3–D4 · E13–E16 · Kanban columns                                                                                                                                                                                | T07, T09                                  | V04, V10           |
| AC06.1                 | D3–D5 · E17–E19 · Kanban cards                                                                                                                                                                                  | T08, T09                                  | V04, V10           |
| AC06.2                 | D5–D6 · E21 · `/my-tasks`, AppHeader link (`.kiro/specs/my-tasks-search`)                                                                                                                                                                                       | T11                                       | V07                |
| AC07.1, AC07.2         | D4–D5 · E20 · Kanban move                                                                                                                                                                                       | T08, T09                                  | V04, V05, V10, V11 |
| AC08.1, AC08.2         | D2, D5 · E23–E26 · Card detail modal                                                                                                                                                                            | T10                                       | V06, V10           |
| AC09.1                 | D5–D6 · E22 · Board search (`.kiro/specs/my-tasks-search`)                                                                                                                                                                                      | T11                                       | V07, V11           |
| AC10.1, AC10.2         | D3, D6 · E17–E18, E24, E27–E28 · Notification bell                                                                                                                                                              | T13                                       | V08, V11           |
| AC11.1                 | D3, D6 · E29 · Analytics panel                                                                                                                                                                                  | T14                                       | V08                |
| AC12.1                 | D2, D5 · E30–E31 · `/profile`                                                                                                                                                                                   | T03 (E30 read), T04 (shell consumer), T12 | V07                |
| AC13.1                 | D5 · every page, dialog and control, and the Move control                                                                                                                                                       | T04, T06, T09–T14 (each UI task), T15     | V11                |
| AC13.2                 | D1, D6 · E07                                                                                                                                                                                                    | T15, T16                                  | V12                |
| AC13.3                 | D2, D6 · private pages and mutations                                                                                                                                                                            | T01, T03, T04, T15                        | V02, V13           |
| AC14.1                 | D1, D6 · E01–E03 and public API routing                                                                                                                                                                         | T02, T16                                  | V14                |
| AC14.2                 | D5–D6 · live web routes                                                                                                                                                                                         | T15, T16                                  | V09, V10, V11      |
| AC14.3                 | D1, D7 · public API and web documentation                                                                                                                                                                       | T17                                       | V15                |

## Endpoint and page implementation ownership

Use this map to verify that every route and page has a task. The acceptance matrix above shows the related design and test references.

| Endpoint or surface                      | Implementation task |
| ---------------------------------------- | ------------------- |
| E01 health                               | T02                 |
| E02–E04 Flask auth                       | T03                 |
| E02–E04 browser auth and protected shell | T04                 |
| E05–E12 Flask boards and membership      | T05                 |
| E05–E12 dashboard and board UI           | T06                 |
| E13–E16 Flask columns                    | T07                 |
| E17–E20 Flask card CRUD and positioning  | T08                 |
| E13–E20 Kanban UI                        | T09                 |
| E23–E26 comments and card detail modal   | T10                 |
| E21–E22 My Tasks and search              | T11                 |
| E30 GET current user                     | T03                 |
| E30 consumption by the protected shell   | T04                 |
| E31 profile update and profile UI        | T12 (done locally)  |
| E27–E28 notifications                    | T13                 |
| E29 analytics                            | T14                 |
| /register and /login                     | T04                 |
| / and /boards/[id]                       | T06, T09            |
| /my-tasks                                | T11                 |
| /profile                                 | T12 (done locally)  |

## Foundation evidence status (T01–T02)

Local status only. The planned verification rows above stay the reference. This table records what foundation has produced. Evidence: `evidence/foundation-T01-T02.md`.

| AC                        | Foundation contribution                                                        | Status                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| AC01.2                    | Normalized-email database constraint and unique index (FND-AC6.1)              | Partial. Field validation and 400/409 responses are T03.                                              |
| AC05.1                    | One active Done column per board (FND-AC6.3)                                   | Partial. Column API is T07.                                                                           |
| AC13.3                    | Secrets excluded from source and bundle (FND-AC3.2, FND-AC3.3)                 | Partial. No-store and Origin checks are T03 and T04.                                                  |
| AC14.1                    | Local health (`GET /api/health` 200, 503 envelope) and migrations              | Partial. Live Render checks are T16. Local API runs on port 5001 because AirPlay Receiver keeps 5000. |
| V13 (fresh-database part) | Clean-database upgrade, downgrade, re-upgrade, constraint and index inspection | Passed locally. The prior-schema part waits for a second revision.                                    |
| V14 (local part)          | Local health and the 405 path                                                  | Passed on port 5001.                                                                                  |

## Foundation revision 2 status

| AC                        | Foundation contribution                                                              | Status                                                             |
| ------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| AC14.1                    | Local API on `127.0.0.1:5001` in Docker Compose, with health 200 and Alembic at head | Passed locally. Live Render checks are T16.                        |
| V14 (local part)          | Container health and 405 path on port 5001                                           | Passed locally.                                                    |
| FND-R10 (FND-AC10.1–10.7) | Dockerfile, `.dockerignore`, `compose.yaml`, Gunicorn pin, Render Docker procedure   | Passed locally (tasks 1.8 to 1.10). Live Render deployment is T16. |

## Authentication evidence status (T03–T04)

Local status only. The planned verification rows above stay the reference. Evidence: `evidence/authentication-T03-T04.md`. Rate-limit results are local behavior with in-memory counters.
| AC | Authentication contribution | Status |
|---|---|---|
| AC01.1, AC01.2 | E02 and `/register`: exact fields, shared field rules, 400 field errors, 409 including an 8-way simultaneous registration, redirect to `/login` signed out | Passed locally (V01 local part) |
| AC02.1 | E03 and `/login`: JWT, HttpOnly cookie, login opens the protected shell at `/` | Passed locally. Dashboard content arrives with T06 |
| AC02.2 | Identical 401 for a wrong password and an unknown email. Absent, expired, revoked and tampered sessions return 401 and redirect to `/login` | Passed locally (V02 local part) |
| AC02.3 | E04: revocation, token replay rejected, cookie cleared, idempotent browser logout, retry when Flask is down, Back after sign out | Passed locally in Chrome device emulation. The Playwright run (V09) is T15. The back-forward cache `pageshow` path has unit tests only |
| AC12.1 | E30 read and E31 (`PATCH /api/users/me`: partial update, no-op keeps `updated_at`, 409 rolls back the whole update, per-field last write wins, no password field, session stays valid after an email change, C23–C27), `/profile`, the AppHeader account link, the safe user context refresh | Passed locally (V07, V11): `evidence/profile-T12.md`. Playwright (V10) and real-device checks are T15. Reauthentication, new-address confirmation, an old-address notice and the E31 rate limit are tracked for public release in T16 |
| AC13.1 | AUTH-R13 for `/login`, `/register`, the shell and the error state at 320, 375, 768 and 1280 px | Passed locally in emulation. No real phone, no on-screen keyboard. The same check repeats in every later UI slice, in T15 and in T16 |
| AC13.3 | `no-store` on private responses, exact `Origin` check on the three auth handlers, secrets absent from the browser bundle | Partial. The same checks on later handlers, the full V13 run (T15) and the live cookie flags (T16) remain |
| AC14.1 | Local register and login | Partial. Live Render checks are T16 |
| V13 (auth part) | Missing, mismatched and valid `Origin`; `no-store`; sentinel bundle build; `server-only` negative control | Passed locally |
| NFR 3 (brief) | Absent, expired and revoked tokens rejected; private responses `no-store` | Passed locally for the auth surface. Board scoping arrives with T05 |
| Rate limits (design D2) | 429 with `Retry-After` on register and login | Local behavior only. Shared storage and trusted client address handling are open for T16 |

## Kanban evidence status (T07–T09)

Local status only. The planned verification rows above stay the reference. Evidence: `evidence/kanban-T07-T09.md`. Local checks prove local behavior: no real phone, no on-screen keyboard, and the drag in the browser run used synthetic DOM events.

| AC | Kanban contribution | Status |
|---|---|---|
| AC05.1 | E13–E15, the Done rules, the add and edit column forms and the delete confirm | Passed locally: backend tests (including a concurrent Done race that leaves one Done column) and UI tests. Browser run passed |
| AC05.2 | E16 and the Move left and Move right buttons | Passed locally: order after reload, 409 on a stale version, anchor errors, rebalance. Browser run passed |
| AC06.1 | E17–E19 and the card dialogs. Assignees limited to active participants | Passed locally: backend and UI tests. The scripted journey added, edited, assigned and deleted a card |
| AC06.2 | E21 and `/my-tasks` | Passed locally (T11): see "My Tasks and search evidence status (T11)" |
| AC07.1 | E20, desktop drag and the Move dialog share one function | Passed locally: unit and UI tests show identical requests. Real pointer drag pending (Playwright, T15) |
| AC07.2 | Optimistic move, rollback, 409 refetch, unchanged place, cross-board destination refused | Passed locally: backend tests and hook tests. A forced 409 in Chrome showed the message and the refetched board |
| AC13.1 | Every new control and dialog at 375 px and wider | Passed locally in emulation at 320, 375, 768 and 1280 px: 418 checks, 0 failed. Real phone and on-screen keyboard open (T15, T16) |
| AC04.2 | E12 assignment clearing, narrowed to active cards in active columns (L7) | Passed locally: regression test and the E07 refresh test |
| V04 | Column and card pytest | Passed locally: 1570 backend tests passed, 1 skipped |
| V05 | Optimistic move, rollback, refetch, gate | Passed locally with Vitest. Playwright part pending (T15) |
| V10 | Playwright Kanban journey | Pending (T15). The test IDs for it are in `evidence/kanban-T07-T09.md` |

## Comments evidence status (T10)

Local status only. The planned verification rows above stay the reference. Evidence: `evidence/comments-T10.md`. Local checks prove local behavior: no real phone, no on-screen keyboard.

| AC | Comments contribution | Status |
|---|---|---|
| AC08.1 | E24 and the add form: valid content creates a comment (201), missing or blank content is 400, a nonmember is 404, no authentication is 401 | Passed locally: backend and UI tests, and the browser journey |
| AC08.2 | E25 and E26: only the author with current access may edit or delete (403 for a non-author including an admin, 404 for a removed author). A changed edit moves `updated_at`, the same text leaves it | Passed locally: backend tests (author matrix, unchanged timestamp), UI tests and the browser run |
| AC13.1 | The Card details dialog, the comment editor and the delete confirmation at 375 px and wider | Passed locally in emulation at 320, 375, 768 and 1280 px: 480 checks, 0 failed, including the wide dialog fitting 375 px. Real phone and on-screen keyboard open (T15, T16) |
| V05 | Card details modal states, uncertain add, 404 resolution | Passed locally with Vitest. Playwright part pending (T15) |
| V06 | E24 with 201, 400, 401, 404 and E25 and E26 with 403 for a non-author (admin included), `updated_at` rules, omission after delete, no `position_version` change, one `comment_created` event | Passed locally: 1706 backend tests passed, 1 skipped. The create-path status difference from the handbook (404 instead of 403 for a nonmember) is recorded in `docs/RUBRIC.md` |
| V11 | Mobile and accessibility of the new dialogs | Passed locally in emulation (see AC13.1) |
| V10 | Playwright comments steps | Pending (T15). The steps are in `evidence/comments-T10.md` |

## My Tasks and search evidence status (T11)

Local status only. The planned verification rows above stay the reference. Evidence: `evidence/my-tasks-search-T11.md`. Local checks prove local behavior: no real phone, no on-screen keyboard, and the Playwright journey is pending (T15).

| AC | T11 contribution | Status |
|---|---|---|
| AC06.2 | E21 and `/my-tasks`: every active card assigned to the caller on boards they can access, Done cards included, case-insensitive board name order, grouped on the page, board links, empty state | Passed locally: backend tests (exclusions, sort, removal, read-only) and UI tests. A 359-check Chrome run and the 375 px journey passed |
| AC09.1 | E22 and the Search cards field: title match, 300 ms debounce, 20-result cap, literal wildcards, blank clears at once, late responses ignored, results follow rename, move and delete, query validation (repeated, unknown, blank, over-long, NUL) in Flask and through the Next handler | Passed locally: backend tests, hook and component tests, handler tests, the journey and four handler checks in Chrome |
| AC13.1 | `/my-tasks`, the search states and the Boards and My tasks header links at 375 px and wider | Passed locally in emulation at 320, 375, 768 and 1280 px (44 px targets, no horizontal scroll, no sticky-bar overlap). No real phone |
| V07 | E21 and E22 pytest and the UI tests; E31 pytest (99 tests) and the profile UI tests | Passed locally (T11, T12) |
| V11 | Mobile and accessibility of the new screens, search debounce | Passed locally in emulation. Playwright part pending (T15) |
| NFR 1 (reference) | E22 and E21 on 100 cards | Recorded locally: E22 p95 4.8 ms, E21 p95 5.8 ms (direct to Flask). Not a T11 gate. Deployed timing is T16 |

## Boards-membership evidence status (T05–T06)

Local status only. The planned verification rows above stay the reference. Evidence: `evidence/boards-membership-T05-T06.md`. The browser and mobile checks have not run.

| AC                     | Boards and membership contribution                                                                                    | Status                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC03.1, AC03.2, AC03.3 | E05–E09, the dashboard and the board page. Role gate, 404 and 403 rules, validation before authorization              | Partial. Backend and frontend tests pass locally. Browser and mobile check at 320, 375, 768 and 1280 px pending (task 7.2)                                                                          |
| AC04.1                 | E10–E12 and the members panel. Add, reactivation and list order                                                       | Partial. Backend and frontend tests pass locally. Browser check and manual journey pending (task 7.2)                                                                                               |
| AC04.2                 | Removal clears the removed user's assignments on active cards in active columns of that board only, in one transaction under the board lock. Soft-deleted cards and cards in soft-deleted columns are preserved (kanban review L7) | Verified by tests only: `backend/tests/test_board_members_assignments.py` (including rollback) and `backend/tests/test_boards_properties_scoping.py` Property 15. The narrowed scope (L7) is covered by `test_e12_keeps_assignments_in_soft_deleted_columns_and_clears_active_columns` (4 tests in the file, 1147 passed in the full suite). Not checked in a browser |
| AC13.1                 | Mobile classes on the new pages, dialogs and controls                                                                 | Partial. Classes applied. Measured check at 320, 375, 768 and 1280 px not run (task 7.2)                                                                                                            |

### Open risks and questions

| Item                                                                                                                                                                      | Status                                               | Plan or owner                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Account enumeration: E11 returns `USER_NOT_FOUND` for an unregistered email, so a board Admin can learn whether an email is registered                                    | Accepted for v1. Returned only after the Admin check | Per-admin E11 rate limit with shared storage, tracked in T16 before public release |
| E11 rate limit                                                                                                                                                            | Not implemented                                      | T16                                                                                |
| Soft-deleted columns: E12 currently clears the removed user's assignments on cards whose column is on this board, even when that column is soft-deleted                   | Resolved 2026-11-13 (L7): E12 clears only active cards in active columns. Fixed and covered by a regression test (kanban task 1.1–1.3) | None |
| Dashboard sort: new boards are sorted in JavaScript with `localeCompare`, while E05 uses database collation. The order may differ for mixed case or accents until refresh | Open, low risk                                       | No plan recorded                                                                   |
