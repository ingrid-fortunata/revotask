# Implementation Plan: analytics (T14)

## Overview

This plan implements the board analytics read (E29), the analytics panel on the board page and their tests described in `design.md` (root T14). Order of work: the schemas, service and route of the new blueprint, the backend tests and a backend checkpoint, the frontend foundation (types, parsers, the Next handler and the client allowlist), the polling-free read hook, the figures and panel components and the board wiring, the measured mobile check with the journey and timing, the full verification checkpoint, and the documentation checkpoint.

**Status:** Done locally (2026-11-14). Requirements and design were approved (decisions A1–A10, design items R1–R8), and the user's `implement analytics T14` invocation for all tasks approved this plan. Every group is verified; see `evidence/analytics-T14.md`. Open outside this plan: Playwright (V10), real-device checks (T15), deployed timing and deployment (T16). Requirements and design were approved (decisions A1–A10 on 2026-11-14, design items R1–R8 with the design approval). Root T14 stays unchecked in `specs/tasks.md` until its checks pass.

**Root task:** T14. Existing root IDs are preserved and no new root ID is proposed.

**Inputs:** `requirements.md` (Requirements 1 to 8, A1–A10), `design.md` (DD1–DD12, Properties 1–14, C34–C38, R1–R8).

## Dependency gates

| Gate | Rule | Enforced by |
|---|---|---|
| A | Root T08 and T10 are verified (checked in `specs/tasks.md`). No gate blocks the start. | Verified at spec time |
| B | The backend access, aggregate, week and read-only checks pass before any frontend task that calls E29. | 2.10 |
| C | The frontend and the full suites pass before the mobile record is final. | 6.4 |
| D | Root T14 is checked only after the backend, frontend, measured mobile check, journey, timing and documentation pass. Unverified work stays open with the actual reason. | 7.5 |

## Test conventions (all groups)

- Backend database-writing tests run on `TEST_DATABASE_URL` through `db_guard` and the `board_tracker` fixture (`BoardTracker`, which extends `Tracker`). Every user, board, column and card a test creates, directly or through the API, is tracked, and events inserted by a helper use only tracked board, card and user IDs. Teardown deletes only those rows and the rows that reference them, in foreign-key order, whether the test passes or fails. No `TRUNCATE`, no name patterns, never `DATABASE_URL`. An untracked sentinel board with an event survives (task 2.9).
- A week test fixes the clock by replacing `app.blueprints.analytics.service.utcnow` (design DD2, R7). No test depends on the real date.
- Frontend tests use Vitest and React Testing Library, with fake timers and deferred requests where timing matters. They assert rendered text, roles and the requests sent, not only that a component mounts.
- No Hypothesis or fast-check. Properties are parameterized tests over fixed tables.
- Every UI task meets Requirement 7: 44 by 44 CSS px controls (rendered box, `elementFromPoint` at the center), a visible focus ring, no horizontal page scroll from 320 px, checked at 375 px and recorded at 320, 375, 768 and 1280 px (FE-S4 to FE-S6, FE-D9). For UI work read FE-D1 to FE-D9 in `guidelines/frontend.md` and `frontend/app/globals.css` first. Add no color, font, second accent or dependency.
- Backend command (from `backend/`): `.venv/bin/python -m pytest <files> -v -p no:cacheprovider`. Frontend commands (from `frontend/`): `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Record the exact commands and real counts in `evidence/analytics-T14.md`.
- The working tree holds an unrelated modified `frontend/next-env.d.ts`. Do not stage or edit it. Edit only the lines this plan names in shared files (`app/__init__.py`, `test_factory.py`, `flask.ts`, `apiClient.ts`, `types.ts`, `BoardShell.tsx`) and run the existing board, kanban and search tests with the new ones.
- Do not write real passwords, tokens or connection strings into specs, evidence, logs or shell arguments.

## Tasks

- [x] 0. Record review outcomes and align contracts (spec phase)
  - [x] 0.1 Decisions A1–A10 and shared docs
    - Done with the design: `docs/API.md` (E29, the data shapes and C34–C38), `specs/design.md` D6, `specs/requirements.md` AC11.1, `backend/specs/api-contract.md` (`analytics_bp`), `docs/TEST-PLAN.md` V08 and V11, `specs/CHANGELOG.md` and `evidence/spec-review.md`.
    - _Requirements: 3.2, 5.6, 8.9; Root: T14_
  - [x] 0.2 Finalize the spec after this plan is approved
    - Link root T14 in `specs/tasks.md` to `.kiro/specs/analytics/tasks.md` ("Native spec: ..."). Synchronize `specs/traceability.md` (AC11.1, the E29 row and the `/boards/[id]` analytics panel), `frontend/specs/pages-and-components.md` (the `/boards/[id]` row and the new hook), `frontend/specs/api-integration.md` (the E29 same-origin read and the version-rise re-read) and `guidelines/frontend.md` (the component table, with `AnalyticsPanel` and `AnalyticsFigures`) with the approved design. Record the plan approval in `evidence/spec-review.md` and the changes in `specs/CHANGELOG.md`. Do not check T14.
    - Acceptance: the link resolves, `specs/tasks.md` shows T14 unchecked, and the shared documents say the same as `design.md`.
    - _Root: T14_

- [x] 1. Backend: schema, service and route (WP-B1)
  - [x] 1.1 Add the schemas
    - Create `backend/app/blueprints/analytics/__init__.py` (`analytics_bp`, imports `routes`) and `schema.py`: an empty `AnalyticsQuerySchema` (so every query key is unknown), and dump-only allowlist schemas `ColumnCountSchema` (`column_id`, `name`, `count`), `ActivityCountSchema` (`user_id`, `name`, `count`) and `AnalyticsSchema` (`week_start`, `week_end` as strings, `cards_per_column`, `completed_cards`, `member_activity`). No event ID, card ID, comment text or email field exists in any schema.
    - Acceptance: `load_query_args(AnalyticsQuerySchema())` accepts an empty query and raises 400 with the standard message and no field entry for `?x=1`, a repeated key and `?board_id=...`. `AnalyticsSchema` dumps exactly the five documented keys.
    - _Requirements: 3.7, 5.2, 5.7; Root: T14; Decisions: A5; Design: DD1, DD8_
  - [x] 1.2 Add the service
    - Create `backend/app/blueprints/analytics/service.py` with `COUNTED_KINDS = ("card_created", "card_moved", "column_reordered", "comment_created")`, `week_bounds(now)` (UTC date of `now`, minus `weekday()` days, plus 7 days for the end) and `board_analytics(board_id, user_id)` as in `design.md` ("Service sketch"): `authorize_board` without `lock=True`, one `week_bounds(utcnow())` call with `utcnow` imported by name, the three separate statements (columns left join with the active-card test in the join condition, `count(distinct card_id)` of `entered_done`, counted events joined to `User` and grouped by `User.id` and `User.name` ordered by count descending, `func.lower(User.name)` and `User.id`), and the two bounds formatted with `strftime("%Y-%m-%dT%H:%M:%SZ")`, not `UtcDateTime`. No commit, no event, no notification. A short comment states why `entered_done` is not in `COUNTED_KINDS`. Add the `ponytail:` note on the `kind` filter after the range scan.
    - Acceptance: a direct service call returns the documented shape. The module imports without importing `cards.service` or `comments.service`.
    - _Requirements: 1.1–1.6, 2.1–2.6, 3.1–3.6, 4.1–4.5, 5.4; Root: T14; Decisions: A1–A4, A6; Design: DD2–DD7, R1, R2, R7_
  - [x] 1.3 Add the route and register the blueprint
    - Create `backend/app/blueprints/analytics/routes.py`: `GET /api/boards/<board_id>/analytics` (`@token_required`, `parse_uuid` then `RequestValidationError`, `load_query_args(AnalyticsQuerySchema())`, `service.board_analytics`, `AnalyticsSchema().dump`, view name `board_analytics_view`). Register `analytics_bp` in `backend/app/__init__.py`. Add `analytics.board_analytics_view` to the route list in `backend/tests/test_factory.py`.
    - Acceptance: the route answers through the app factory. A non-UUID ID and any query parameter are 400 without a database read. `test_factory.py` passes.
    - _Requirements: 5.1–5.3, 5.5; Root: T14; Decisions: A5–A7; Design: DD1, DD8, check order_

- [x] 2. Backend tests and checkpoint (WP-B2, V08)
  - [x] 2.1 Test helpers
    - Create `backend/tests/analytics_helpers.py`: `seed_events(app, board_id, rows)` (inserts `BoardEvent` rows with a chosen `occurred_at`, using tracked board, card and user IDs only), `freeze(monkeypatch, iso)` (replaces `app.blueprints.analytics.service.utcnow` with a fixed UTC clock), `get_analytics(client, tracker, user, board_id, query="")` and a reader that opens its own app context and removes the session afterwards. Boards, users, columns and cards come from `board_tracker` and `make_kanban`.
    - Acceptance: a helper-only smoke test seeds tracked rows and reads them back.
    - _Requirements: 4.5, 8.3, 8.6; Root: T14_
  - [x] 2.2 Access and check order
    - Create `backend/tests/test_analytics_access.py`. 200 for an admin and for a member. 401 for no, malformed, expired and revoked tokens. One identical 404 for a nonmember, a removed member, a missing board and a soft-deleted board. 400 for a malformed ID. 400 for any query parameter (`?week=1`, `?x`, a repeated key, `?board_id=<id>`) with the standard message and no `fields`. The order: a malformed ID beats a missing board, and a query parameter beats the 404 for a nonmember. `Cache-Control: private, no-store` on every response, success and error. The body holds only the five documented keys and the documented item fields.
    - Acceptance: every case asserts status, envelope and header. Properties 7 and 9 hold.
    - _Requirements: 5.1–5.3, 5.5, 5.7, 8.3; Root: T14; Decisions: A5–A7_
  - [x] 2.3 Cards per column
    - Create `backend/tests/test_analytics_columns.py`: an empty column at count 0, several cards, the Done column listed, board order with the column ID as tie-break, a soft-deleted card not counted, a soft-deleted column not listed with its cards, a card moved between columns, cards of another board not counted, and zero columns (an empty list with the other figures still returned).
    - Acceptance: each case asserts the exact list. Property 1 holds.
    - _Requirements: 1.1–1.6, 8.3; Root: T14_
  - [x] 2.4 Completed this week
    - Create `backend/tests/test_analytics_completed.py`: a card created in Done, a card moved into Done, the same card entering Done twice in the week (counted once, both by real E20 moves out and in and by direct events), a card soft-deleted after completing, a card moved out of Done after completing, a card whose column was soft-deleted afterwards, a move within Done, an edit, an assignment and a comment (no count), events of another board, of an earlier week and of a later week (not counted), and an empty week at 0.
    - Acceptance: each case asserts `completed_cards` exactly. Property 2 holds.
    - _Requirements: 2.1–2.6, 8.3; Root: T14; Decisions: A3_
  - [x] 2.5 Activity by member
    - Create `backend/tests/test_analytics_activity.py`: each of the four counted kinds counts once, `entered_done` does not count, creating a card in Done adds 1, moving a card into Done adds 1, a removed member (E12) who acted in the week still appears, an active member with no events does not, the current name shows after a profile rename, the order is count descending then lower-cased name then user ID (ties built with equal counts and names that differ by case), an empty week returns an empty list, and the items carry no email.
    - Acceptance: each case asserts the exact list and order. Property 3 holds.
    - _Requirements: 3.1–3.5, 3.7, 8.3; Root: T14; Decisions: A1, A4_
  - [x] 2.6 UTC week boundaries
    - Create `backend/tests/test_analytics_week.py`, with the clock fixed: an event at `week_start` is inside, one microsecond before it is in the earlier week, one at `week_end` is outside and one a microsecond before it is inside. A request at Sunday 23:59:59 and one at the next Monday 00:00:00 return different windows and the new week starts at 0. A week across a year boundary and across a leap day. `week_start` and `week_end` end in `Z`, and `week_end` is `week_start` plus seven days. A `now` with a non-UTC offset still gives the UTC week. `week_bounds` alone for every weekday and for a Monday at 00:00:00.
    - Acceptance: every boundary asserts the inclusive and exclusive rule on the returned counts and timestamps. Properties 5 and 6 hold.
    - _Requirements: 4.1–4.5, 8.4; Root: T14; Decisions: A2; Design: DD2, R1_
  - [x] 2.7 Aggregation and a real flow
    - Create `backend/tests/test_analytics_aggregation.py`: a board with many columns, many cards and many events where each figure is exact and none is a product of two tables (for example 5 columns of 6 cards with 40 events each give 30 cards, the real event counts and the real completed number). Then a real flow through the writers by two users: E13 and E17 (create in Done), E20 (moves), E16 (reorder) and E24 (comments), after which E29 matches the rows written.
    - Acceptance: both tests pass. Property 4 holds.
    - _Requirements: 1.5, 3.6, 8.3; Root: T14; Design: DD3_
  - [x] 2.8 Read-only and failure
    - Create `backend/tests/test_analytics_readonly.py`: E29 writes no row (events, notifications, cards and comments unchanged), records no event, changes no `position_version`, and does not wait for a board lock (a second transaction that holds the board row lock does not block the request, which returns 200). A failing read (an injected database error) returns the sanitized 500 envelope with no partial result and no query text.
    - Acceptance: the row counts and versions before and after match, and the lock test finishes without a timeout. Property 8 holds.
    - _Requirements: 5.4, 5.5, 8.3; Root: T14; Decisions: A6; Design: DD7_
  - [x] 2.9 Cleanup isolation
    - Create `backend/tests/test_analytics_cleanup.py`: create tracked users, a board, a column, cards and events, fail on purpose after the events exist, and prove that exactly the tracked rows were removed (events included) and an untracked sentinel board with an event survived. Remove the sentinel itself at the end.
    - Acceptance: the sentinel survives the tracker cleanup and is then removed by the test.
    - _Requirements: 8.6; Root: T14_
  - [x] 2.10 Backend checkpoint (gate B)
    - From `backend/` run the new analytics files, then the full suite, `ruff check .` and `ruff format --check .`. Run one mutation check: put `entered_done` into `COUNTED_KINDS`, and put the active-card test in the `WHERE` clause instead of the join condition, and confirm that tests fail for each. Record the commands and counts in `evidence/analytics-T14.md`.
    - Acceptance: all pass with no new skip, and each mutation makes a test fail, or any failure is recorded open with its reason.
    - _Requirements: 8.3, 8.4, 8.6; Root: T14_

- [x] 3. Frontend foundation (WP-F1)
  - [x] 3.1 Types and parsers
    - In `frontend/lib/types.ts`, add `ColumnCount`, `ActivityCount` and `BoardAnalytics`. Create `frontend/lib/analytics.ts` with `analyticsPath(boardId)`, `parseAnalytics` (copies the five documented keys, throws `malformedApiError()` for a non-object, a missing key, a `week_start` or `week_end` that is not a string ending in `Z`, an item without the exact fields, or a count that is not a non-negative safe integer), `formatWeekRange(weekStart, weekEnd)` (local fields of the viewer's zone and a fixed month list, `week_end` shown as is, for example `Week of 9 Nov, 07:00 to 16 Nov, 07:00 (local time)`) and `barPercent(count, max)`.
    - Tests: `frontend/lib/analytics.test.ts` as listed in `design.md` ("Frontend test files"): accept a valid and an empty result, reject each malformed shape and count, `formatWeekRange` inside a month, across a month and across a year, `barPercent` for 0, `max` 0, the maximum and a fraction, and `analyticsPath`.
    - Acceptance: the tests pass. `parseAnalytics` copies only the documented fields.
    - _Requirements: 6.2, 8.2; Root: T14; Design: lib/analytics.ts, DD11_
  - [x] 3.2 Next handler and client allowlist
    - In `frontend/lib/server/flask.ts`, add the route key `boardAnalytics: "/api/boards/:boardId/analytics"` to `FLASK_PATHS`. Create `frontend/app/api/boards/[id]/analytics/route.ts` (`GET`, `handlePrivateRead` with `route: "boardAnalytics"`, `params: { boardId: id }` and `forwardQuery: true`). In `frontend/lib/apiClient.ts`, add `^/api/boards/${UUID}/analytics$` to `DECLARED_GETS`.
    - Tests: `frontend/app/api/analyticsRoute.test.ts` (a valid request forwards to the E29 path with the bearer token and `private, no-store`, a query string reaches Flask unchanged and the Flask 400 is passed through, a non-UUID ID is 400 before any upstream call, a missing cookie is 401, a 401 clears the cookie, no token in the response, a Flask 404 is passed through), `lib/apiClient.test.ts` (the path is declared, the same path with a query string is not, a non-UUID segment throws before `fetch`) and `lib/server/flask.test.ts` (the route key fills `:boardId` with a UUID only).
    - Acceptance: the new and extended tests pass. No browser GET outside the declared list is possible.
    - _Requirements: 8.1, 8.2; Root: T14; Decisions: A6, A8; Design: Next handler and client allowlist_

- [x] 4. Read hook (WP-F2)
  - [x] 4.1 `useBoardAnalytics`
    - Create `frontend/hooks/useBoardAnalytics.ts` as in `design.md` ("useBoardAnalytics"): `({ boardId, version, onAccessLost }) → { data, status, busy, error, refresh }`. One `AbortController` and one sequence number per read, a response applies only when it is the latest and not aborted. An effect keyed on `boardId` resets the state, records `startedVersionRef` and reads, aborting on cleanup. An effect keyed on `version` reads only when `version` is greater than `startedVersionRef.current`. `refresh` reads again. A 404 (`isBoardAccessError`) calls `onAccessLost`, `AUTH_REQUIRED` calls `handleError`, anything else except an abort sets `error` ("Analytics could not be loaded.") and keeps `data`. A malformed body is such an error. The hook reads no Kanban gate, never throws, and holds `onAccessLost` and `handleError` in a ref. No polling.
    - Tests: `frontend/hooks/useBoardAnalytics.test.tsx` with deferred requests: a read on mount, a rise in `version` starts one read, an equal or lower `version` starts none, a rise while a read is in flight aborts it and starts one, `refresh` reads, an earlier slow response cannot overwrite a later one, a board change aborts and drops the figures and ignores the earlier board's response, unmount aborts and no state changes later, a 404 calls `onAccessLost`, a 401 calls `handleError`, a 5xx, a 400, a transport error and a malformed body set `error` and keep `data`, and while busy the held figures stay.
    - Acceptance: the hook tests pass. Properties 10 and 11 hold.
    - _Requirements: 6.4–6.8, 8.5; Root: T14; Decisions: A8; Design: DD9, DD11, R4, R8_

- [x] 5. Components and board wiring (WP-F3)
  - [x] 5.1 `AnalyticsFigures`
    - Create props-only `frontend/components/analytics/AnalyticsFigures.tsx` as in `design.md`: the week line (`text-sm text-base-content/70`), the completed figure (label and `tabular-nums` number, `0` when nothing was completed), and from 768 px two columns (`md:grid-cols-2`) with `h3` headings "Cards per column" and "Activity this week", each a `ul` with `divide-y divide-base-300` and rows (`min-w-0 break-words` name, `shrink-0 tabular-nums` count). Column rows add a decorative bar (`aria-hidden`, a `bg-base-200` track, a `bg-primary` fill from `barPercent`). Empty states "No columns yet." and "No activity this week." Names render as text. No panel inside the panel.
    - Tests: `AnalyticsFigures.test.tsx` (the week line, the completed figure including 0, the column rows in order with counts, the activity rows in order, both empty states, an empty board with zeros, markup in a name rendered as text, the wrap and `tabular-nums` classes, a bar that is `aria-hidden` while its number is text).
    - Acceptance: the tests pass. Property 13 holds.
    - _Requirements: 6.2, 6.3, 6.9, 7.1, 7.3, 7.4; Root: T14; Decisions: A9; Design: DD12_
  - [x] 5.2 `AnalyticsPanel`
    - Create client `frontend/components/analytics/AnalyticsPanel.tsx`: props `boardId`, `version`, `onAccessLost`. It owns the hook, a `section` with `.surface p-4 sm:p-5` and `aria-labelledby`, the `h2` "Analytics" (`text-lg font-semibold`) and a Refresh `BaseButton` in a wrapping header row, `aria-busy` while a read is in flight, the loading text "Loading analytics…", the error block (`role="alert"` text and a Retry `BaseButton`) with the last figures kept, `AnalyticsFigures` when figures are held, and a `<p aria-live="polite" aria-atomic="true" className="sr-only">` (not `role="status"`) with the loading, refreshed and error text.
    - Tests: `AnalyticsPanel.test.tsx` (loading, figures, an empty board, error with Retry and a Retry press that reads again, a busy refresh that keeps the figures and sets `aria-busy`, the Refresh name and its 44 px class, the live region text, a 404 outcome and a 401 outcome).
    - Acceptance: the tests pass. Property 14 holds at the class level.
    - _Requirements: 6.1, 6.3–6.5, 6.7, 6.8, 7.2–7.4; Root: T14; Decisions: A8, A9; Design: DD10–DD12, R5_
  - [x] 5.3 Wire the panel into the board
    - In `frontend/components/boards/BoardShell.tsx`, render `<AnalyticsPanel boardId={board.id} version={kanban.version} onAccessLost={handleAccessLost} />` after `KanbanBoard`, where `handleAccessLost` calls `notifyError(BOARD_ACCESS_MESSAGE)` and `router.push("/")` (the outcome `KanbanBoard` uses for the search). Show the panel to every participant. Do not change the Kanban gate or the existing props.
    - Tests: extend `BoardShell.test.tsx`: the panel is shown to an admin and to a member, it receives the Kanban `version`, and a card create, move and delete that raises the version triggers one more E29 read. With E29 failing at mount and on a later read, the board stays usable (a card still moves and is added, the search still works, the Kanban status stays idle, and no error boundary or board-level error appears). A 404 from E29 shows the access toast and redirects. Run the existing board, kanban and search tests unchanged.
    - Acceptance: the extended and existing tests pass. Property 12 holds.
    - _Requirements: 6.1, 6.4, 6.5, 6.8, 8.5; Root: T14; Decisions: A7, A8; Design: DD10, DD11, R3_

- [x] 6. Mobile check, journey, timing and full verification (WP-V)
  - [x] 6.1 Measured browser check
    - Create `evidence/analytics-mobile-measure.mjs` (Chrome with device emulation, modeled on the T11 to T13 scripts) and run it at 320, 375, 768 and 1280 px against the local app with seeded data: the board page with the panel loading, with figures, on an empty board (no columns, and columns with no activity) and with E29 failing (the error and Retry, the board still usable). Measure each control with `getBoundingClientRect` and `elementFromPoint` at its center, Tab through the panel for a visible focus ring, and confirm no horizontal page overflow outside the Kanban region and no overlap with the columns above it. Save screenshots under `evidence/analytics-screenshots/` and the report as `evidence/analytics-mobile.json`. Say in the record that the browser is an emulator.
    - Acceptance: every measured control is at least 44 by 44 CSS px, with no horizontal page scroll. A failure is fixed and rerun, or recorded open.
    - _Requirements: 7.1, 7.2, 7.5; Root: T14; Decisions: A9; Design: Mobile design, Browser checks_
  - [x] 6.2 E29 timing
    - Create `evidence/analytics-timing.mjs` and record 30 sequential E29 requests from one client on a local board of 100 cards with a week of events (distinct actors, all five kinds). Save the raw timings as `evidence/analytics-timing.json` with the conditions (warm or cold, machine, database, row counts) and the p95. The 800 ms brief target is the reference value, not a gate.
    - Acceptance: the raw timings and conditions are saved and the evidence states that it is a measurement.
    - _Requirements: 8.8; Root: T14; Decisions: A10_
  - [x] 6.3 Manual journey
    - With two users on a local board: open the board and read the figures, create a card in Done, complete and move a card, see the column counts and the completed figure change without a reload (the version rise), add a comment as the second user and press Refresh to see their activity, remove the second user from the board and press Refresh to confirm their activity remains under their name, and stop the API (or force a failing read) to confirm the panel shows its error and Retry while a card still moves. Record the real result.
    - Acceptance: each step matches the expectation, or the difference is recorded as open.
    - _Requirements: 6.4, 6.5, 6.8, 7.5, 3.3; Root: T14_
  - [x] 6.4 Full verification checkpoint (gate C)
    - From `backend/` run the full pytest suite. From `frontend/` run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. Record exact commands and counts in `evidence/analytics-T14.md`, with the review findings and what each changed.
    - Acceptance: all pass with no new skip, or any failure is recorded open with its reason.
    - _Requirements: 8.3–8.7; Root: T14_

- [x] 7. Documentation checkpoint and root task (WP-D)
  - [x] 7.1 Review the diff
    - Review the actual diff against the spec and the guideline IDs (FE-D1 to FE-D9, FE-S3 to FE-S6, FE-A1, FE-A2, BE01). Confirm no new color, font, accent or dependency, no migration, and that the earlier slices' changes are intact. Record findings and outcomes in `evidence/analytics-T14.md`.
    - Acceptance: every finding is fixed, or recorded open with its reason.
    - _Requirements: 7.3, 8.9; Root: T14_
  - [x] 7.2 Update the shared specs and guidelines
    - Update `guidelines/frontend.md` (the component table: `AnalyticsPanel`, `AnalyticsFigures`), `frontend/specs/pages-and-components.md` and `api-integration.md`, `backend/specs/data-model.md` (a note that `board_events` feeds analytics, if it changes the wording) and `specs/traceability.md` (AC11.1, the E29 row and the panel), and record any deviation from the approved design in `specs/CHANGELOG.md` with before, after, reason and verification.
    - Acceptance: the documents match the implementation, and each deviation has an entry.
    - _Requirements: 5.6, 8.9; Root: T14_
  - [x] 7.3 README, USER_GUIDE and changelogs
    - Update `README.md` (status, the analytics feature, verified facts), `docs/USER_GUIDE.md` (the analytics step, with the week in UTC and the Refresh button), and the `## YYYY-MM-DD` heading for the commit date, with a `### <short-sha> <subject>` entry in `CHANGELOG.md`, `backend/CHANGELOG.md` and `frontend/CHANGELOG.md`. Keep entries concise and without duplicates.
    - Acceptance: each file names only verified behavior, with Playwright, real-device checks and deployment left open.
    - _Requirements: 8.9; Root: T14_
  - [x] 7.4 Evidence record
    - Write `evidence/analytics-T14.md` (commands, counts, the measured table, the timing, the journey, findings, mutation checks) and add an implementation record to `evidence/spec-review.md`.
    - Acceptance: the record names the tool that produced each phase and states what stayed open.
    - _Requirements: 7.5, 8.8, 8.9; Root: T14_
  - [x] 7.5 Check root T14
    - Check T14 in `specs/tasks.md` only when 1 to 6 and 7.1 to 7.4 pass. Keep it open, with the reason, for any unverified or blocked item. Also tick the native boxes of every task that passed.
    - Acceptance: `specs/tasks.md` and the native checkboxes agree.
    - _Root: T14_

## Notes

- Test sub-tasks are not marked optional. Root completion in `specs/tasks.md` needs V08 and V11, so they are required here.
- Each backend test file covers one concern, as listed in `design.md` ("Backend test files").
- All database-writing tests clean up automatically through `BoardTracker` and run only on `TEST_DATABASE_URL` (tasks 2.1 to 2.9).
- Local checks prove local behavior only. Playwright (V10), real-device checks and deployment stay open for T15 and T16.
- Polling, history of earlier weeks, a week picker, charts, export, analytics across boards, new event kinds, backfilling events and caching are out of scope.
- Attach `guidelines/backend.md`, `guidelines/database.md` or `guidelines/frontend.md` when creating a file with no matching file context.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8"] },
    { "id": 5, "tasks": ["2.9"] },
    { "id": 6, "tasks": ["2.10"] },
    { "id": 7, "tasks": ["3.2", "5.1"] },
    { "id": 8, "tasks": ["4.1"] },
    { "id": 9, "tasks": ["5.2"] },
    { "id": 10, "tasks": ["5.3"] },
    { "id": 11, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 12, "tasks": ["6.4", "7.1"] },
    { "id": 13, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 14, "tasks": ["7.5"] }
  ]
}
```
