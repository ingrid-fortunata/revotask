# Implementation Plan: my-tasks-search (T11)

## Overview

This plan implements the My Tasks read (E21), the board card search (E22), the `/my-tasks` page, the board search control and the shared navigation change described in `design.md` (root T11). Order of work: the Flask query helper, schemas, services and routes, the backend tests and a backend checkpoint, the frontend foundation (types, parsers, live-resolution function, Next handler, allowlist), the search hook, the search component and its wiring, the My Tasks page, the AppHeader links, the measured mobile check with the journey and timing, the full verification checkpoint, and the documentation checkpoint.

**Status:** Done locally (2026-11-14). Requirements and design were approved (decisions S1–S11 and Q1–Q6), and the user's `implement my-tasks-search` invocation for all tasks approved this plan. Every group is verified; see `evidence/my-tasks-search-T11.md`. Open outside this plan: Playwright (V10), real-device checks (T15) and deployment (T16).

**Root task:** T11. Existing root IDs are preserved and no new root ID is proposed. Root T11 stays unchecked in `specs/tasks.md` until its checks pass.

**Inputs:** `requirements.md` (Requirements 1 to 8, S1–S11), `design.md` (DD1–DD12, Properties 1–12, WP-B1 to WP-D, C18–C22, Q1–Q6).

## Dependency gates

| Gate | Rule | Enforced by |
|---|---|---|
| A | Root T08, T09 and T10 are verified (checked in `specs/tasks.md`). No gate blocks the start. | Verified at spec time |
| B | The backend E21 and E22 checks pass before any frontend task that calls them. | 2.6 |
| C | The frontend and the full suites pass before the mobile record is final. | 9 |
| D | Root T11 is checked only after the backend, frontend, measured mobile check, journey and timing record pass. Unverified work stays open with the actual reason. | 10.5 |

## Test conventions (all groups)

- Backend database-writing tests run on `TEST_DATABASE_URL` through `db_guard` and `BoardTracker`. Rows created by a test, directly or through the API, are tracked. Teardown deletes only those rows and the rows that reference them, in foreign-key order, whether the test passes or fails. No `TRUNCATE`, no name patterns, never `DATABASE_URL`. An untracked sentinel board survives (task 2.5).
- Frontend tests use Vitest and React Testing Library, with fake timers where a debounce is involved. They assert rendered text, roles and the requests sent, not only that a component mounts.
- No Hypothesis or fast-check. Properties are parameterized tests over fixed tables.
- Every UI task meets Requirement 7: 44 by 44 CSS px controls (rendered box, `elementFromPoint` at the center), 16 px fields, no horizontal page scroll, checked at 375 px and recorded at 320, 375, 768 and 1280 px (FE-S4 to FE-S6, FE-D9). For UI work read FE-D1 to FE-D9 and `frontend/app/globals.css` first.
- Backend command (from `backend/`): `.venv/bin/python -m pytest <files> -v -p no:cacheprovider`. Frontend commands (from `frontend/`): `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Record the exact commands and real counts in `evidence/my-tasks-search-T11.md`.
- Do not write real passwords, tokens or connection strings into specs, evidence, logs or shell arguments.

## Tasks

- [x] 0. Record review outcomes and align contracts (spec phase)
  - [x] 0.1 Decisions S1–S11 and shared docs
    - Done with the design: `specs/requirements.md` AC06.2 and AC09.1, `specs/design.md` D5 and D6, `docs/API.md` (E21, E22 and the query rule), `backend/specs/api-contract.md`, `frontend/specs/api-integration.md`, `frontend/specs/pages-and-components.md`, `guidelines/frontend.md` FE-D2, `docs/TEST-PLAN.md` V07 and V11, `specs/traceability.md`, `specs/CHANGELOG.md` and `evidence/spec-review.md`.
    - _Requirements: 3.5, 8.9, 8.10; Root: T11_
  - [x] 0.2 Clarifications Q1–Q6
    - Done with the design approval: `design.md` ("Review Items and Decisions", Hook, Browser checks), `requirements.md` 5.6, 6.2, 8.6 and `evidence/spec-review.md`.
    - _Root: T11_
  - [x] 0.3 Finalize the spec after this plan is approved
    - Link root T11 in `specs/tasks.md` to `.kiro/specs/my-tasks-search/tasks.md` ("Native spec: ..."). Record the plan approval in `evidence/spec-review.md`. Do not check T11.
    - Acceptance: the link resolves, and `specs/tasks.md` shows T11 unchecked.
    - _Root: T11_

- [x] 1. Backend: query helper, schemas, services and routes (WP-B1)
  - [x] 1.1 Add `load_query_args` and the shared case fixture
    - In `backend/app/validation.py`, add `REPEATED = "Send one value."` and `load_query_args(schema)` as in `design.md` ("Query validation"): read `request.args.to_dict(flat=False)`, flag a repeated known key with "Send one value.", load the single-valued known keys through the schema, and raise `RequestValidationError(fields=errors or None)` when there is a field error or an unknown key. An unknown key adds no field entry.
    - Add `specs/fixtures/search-query-cases.json` with cases for `assignee` and `q`: missing, blank, whitespace only, 1 and 100 characters (valid), 101 characters, a decoded NUL (`%00`), a repeated key, `assignee` as `ME`, empty and `me ` (trailing space), an unknown key alone and beside a valid parameter.
    - Acceptance: `python -c` import works. The helper has no database access. The fixture parses as JSON and every case names its expected status, `fields` and message.
    - _Requirements: 1.7, 2.5, 3.1; Root: T11; Decisions: S3, Q4_
  - [x] 1.2 Add the schemas
    - In `backend/app/blueprints/cards/schema.py`: `MyTasksQuerySchema` (`assignee` required, exactly `me`, "Required." or "Must be me."), `CardSearchQuerySchema` (`q` required, trimmed with `TrimmedString`, blank "Required.", over 100 characters "Must be at most 100 characters.", a NUL character "Enter valid text."), `TaskItemSchema` (`id, column_id, title, description, assignee_id, assignee_name, order, board_id, board_name`) and `SearchResultSchema` (`id, title, column_id`). Allowlist dumps only.
    - Acceptance: the messages are fixed strings that never echo input. `SearchResultSchema` has no description, assignee or comment field.
    - _Requirements: 1.6, 2.5, 2.6; Root: T11; Decisions: S3, Q4_
  - [x] 1.3 Add `my_tasks` and the E21 route
    - In `backend/app/blueprints/cards/service.py`, add `my_tasks(user_id)` as in `design.md` ("Service sketch"): one statement that joins the card, its active column, its active board, the caller's active membership and the user, filters the caller's active cards, and sorts by `func.lower(Board.name)`, `Board.id`, `BoardColumn.order`, `Card.order` and `Card.id` last. In `routes.py`, add `GET /api/cards` with `@token_required`, the query through `load_query_args(MyTasksQuerySchema())`, and `TaskItemSchema(many=True)`.
    - Acceptance: no write, flush, event or lock. A Done card is returned. A card of a board the caller left is not. The response carries `Cache-Control: private, no-store` through the existing hook.
    - _Requirements: 1.1–1.8, 3.1, 3.3, 3.4; Root: T11; Decisions: S1, S2, S5, Q5_
  - [x] 1.4 Add `search_cards` and the E22 route
    - In `service.py`, add `search_cards(board_id, user_id, q)`: `authorize_board(board_id, user_id)` without a lock, then the title search with `Card.title.icontains(q, autoescape=True)`, active cards in active columns of the board, ordered by `BoardColumn.order`, `Card.order`, `Card.id`, `limit(SEARCH_LIMIT)` with `SEARCH_LIMIT = 20`. In `routes.py`, add `GET /api/boards/<board_id>/cards/search`: `token_required`, the path ID through `_path_id`, the query through `load_query_args(CardSearchQuerySchema())`, then the service and `SearchResultSchema(many=True)`.
    - Acceptance: the check order is 401, path ID 400, query 400, board access 404. A decoded NUL returns 400 `fields.q` and runs no query. No write, event or lock.
    - _Requirements: 2.1–2.7, 3.1–3.4; Root: T11; Decisions: S3, S4, S5, S11, Q4_

- [x] 2. Backend tests and checkpoint (WP-B2)
  - [x] 2.1 `test_search_query_validation.py`
    - Run every case of `search-query-cases.json` through both routes. Assert status, `fields` and message, that an unknown key never appears in `fields`, that a decoded NUL (`?q=%00`) returns 400 `fields.q`, that a bad token wins over a bad query (401), and that a 400 reads no card (a statement counter stays at zero).
    - Acceptance: every case passes. A case that expects the standard message for an unknown key has no `fields` key for it.
    - _Requirements: 1.7, 2.5, 3.1, 8.4, 8.5; Root: T11; Decisions: S3, Q4_
  - [x] 2.2 `test_my_tasks.py`
    - Seed two users and two boards with distinct and case-differing names, an equal-name pair, several columns and cards. Cover 200 shape and allowlist, the empty list, only the caller's cards, a Done card included, exclusion of a soft-deleted card, a card in a soft-deleted column, a card on a soft-deleted board, another user's card, an unassigned card and a card on a board where the caller has no active membership (a removed member whose card still names them). Assert the sort (case-insensitive board name, board ID, column order, card order, card ID, with a tie on card order to prove the card ID is last), that cards of one board are adjacent, that a removal hides the board's cards at once, `assignee_name` and `board_name` after a rename, no write, no event, `position_version` unchanged, `no-store` and 401.
    - Acceptance: each exclusion and the sort have their own parameterized case.
    - _Requirements: 1.1–1.8, 8.4; Root: T11; Decisions: S1, S2, S5, Q5_
  - [x] 2.3 `test_card_search.py`
    - Cover 200 shape and allowlist, no match as an empty list, case-insensitive matching, literal `%`, `_`, `\` and `/`, title-only matching (a description word and a comment word do not match), the trimmed `q`, the cap (21 matching cards return 20 in board order with the card ID breaking a tie), the order across columns and after a column reorder, soft-deleted card and column excluded, another board's card never returned, 404 for a nonmember, a removed member, a missing board and a soft-deleted board with one identical envelope, Admin and Member both allowed, no write, no event, `no-store`, 401 and the check order.
    - Acceptance: the 21-card case returns exactly 20 and the 21st is the last in board order.
    - _Requirements: 2.1–2.7, 3.1–3.4, 8.5; Root: T11; Decisions: S3, S4, S5, S11_
  - [x] 2.4 `test_search_properties.py`
    - Parameterized Properties 1 to 5 of `design.md` over fixed tables: task scope, task order, search scope and cap, literal wildcards, and read-only plus query strictness.
    - Acceptance: each property has a named table and fails if its rule is broken (checked once by flipping one rule locally).
    - _Requirements: 1.1–1.3, 2.1–2.3, 3.3; Root: T11_
  - [x] 2.5 Cleanup sentinel
    - Extend `test_boards_cleanup.py`: an untracked sentinel board with a column, a card assigned to a tracked user and a membership survives the cleanup of a T11 test, and the tracked rows are gone after a failing assertion.
    - Acceptance: the sentinel remains and every tracked row is removed, with the test passing and with a forced failure.
    - _Requirements: 8.7; Root: T11_
  - [x] 2.6 Backend checkpoint (gate B)
    - Run the new files, then the whole backend suite on `TEST_DATABASE_URL`. Run `ruff` if the repo configures it. Record the counts.
    - Acceptance: the new files pass and the full suite shows no new failure. If anything fails, stop and report the cause.
    - _Requirements: 8.4, 8.5, 8.7; Root: T11_

- [x] 3. Frontend foundation (WP-F1)
  - [x] 3.1 Types, parsers and live resolution
    - In `frontend/lib/types.ts`, add `TaskItem`, `TaskGroup`, `SearchResult` and `VisibleResult`. Create `frontend/lib/cardSearch.ts` with `SEARCH_DEBOUNCE_MS = 300`, `SEARCH_RESULT_LIMIT = 20`, `cardSearchPath`, `parseSearchResults`, `titleMatches` and `resolveSearchResults`. The resolver trusts a live title equal to the returned title, re-tests only a changed title, shows the live title and the live column name, and omits a card the live columns do not hold. It never mutates the held response. Add `frontend/lib/tasks.ts` with `parseTaskList` and `groupTasksByBoard`.
    - Tests: `lib/cardSearch.test.ts` (path encoding of `&`, `#`, `%` and a space, allowlist and error shape, `titleMatches`, and the table for an unchanged title, a rename that still matches, a rename that no longer matches, a move to another column, a delete, a rolled-back delete that restores the result, a card absent from the held response that never appears, an empty board) and `lib/tasks.test.ts` (allowlist, order preserved, first-appearance groups, empty list).
    - Acceptance: Properties 6 to 8 pass. A Unicode title that the server matched and that did not change stays visible.
    - _Requirements: 4.1, 5.9, 5.10, 8.3, 8.6; Root: T11; Decisions: S8, Q2_
  - [x] 3.2 Next plumbing, handler and client allowlist
    - In `frontend/lib/server/flask.ts` add the route keys `myTasks` (`/api/cards`) and `boardCardSearch` (`/api/boards/:boardId/cards/search`) and the optional `search` string on `flaskRequest` (empty or starting with `?`, set with `url.search`, origin check kept). Add `search` to `fetchPrivate` and `forwardQuery` to `PrivateReadSpec`, which passes `request.nextUrl.search` unchanged. Create `frontend/app/api/boards/[id]/cards/search/route.ts` (`GET`). Add the declared GET pattern to `lib/apiClient.ts`.
    - Tests: `lib/server/flask.test.ts` (extended: `search` applied, repeats and unknown keys kept in order, a value without `?` throws), `lib/apiClient` tests (extended: the pattern is declared, any other `/cards/search` path, a second parameter, a fragment or a non-UUID ID throws before `fetch`) and `app/api/cardSearchRoute.test.ts` (one `q`, a repeated `q`, an unknown key, a blank `q` and `q=%00` reach Flask exactly as sent, and the Flask 400 passes through with its body and status; a bad board ID is 400 without a call; no cookie is 401 and clears the cookie; the bearer comes from the cookie; `no-store`; no token in the response).
    - Acceptance: Property 11 passes. A `%00` query through the handler returns the Flask 400 `fields.q` unchanged.
    - _Requirements: 8.1, 8.2, 8.6; Root: T11; Decisions: S3, S11, Q4_
  - [x] 3.3 Server read helper and board chip
    - Create `frontend/lib/server/tasks.ts` with `getMyTasks()` (`fetchPrivate("myTasks", { method: "GET", search: "?assignee=me" })`, a non-200 throws `ApiError`, a malformed body throws). Move `chipClass` from `BoardList.tsx` to `frontend/lib/boardChip.ts` and import it in `BoardList`.
    - Tests: `lib/server/tasks.test.ts` (the request goes to the fixed route with `?assignee=me`, parse and error paths) and `lib/boardChip.test.ts` (same ID gives the same class, `BoardList` still renders its chip).
    - Acceptance: the `BoardList` tests still pass without a change to their assertions.
    - _Requirements: 4.1, 4.7, 7.3, 8.2; Root: T11; Decisions: S11_

- [x] 4. Search hook (WP-F2)
  - [x] 4.1 Implement `useCardSearch`
    - Create `frontend/hooks/useCardSearch.ts` as in `design.md` ("Hook"). `setQuery` clears the results, the loading state, the timer and the request at once for a blank trimmed value. When the trimmed text changes, it clears the held results, sets `loading` ("Searching…" for the debounce and the request) and starts the 300 ms timer. It sends nothing for an unchanged trimmed text. It takes a sequence number per request, aborts the previous request, drops a late or aborted response, handles 5xx and transport failure as `error` with the text kept, a 400 as `fieldError` without Retry, a 404 through `onAccessLost`, a 401 through `useErrorHandler`, offers `retry()` without a delay and cleans up on unmount.
    - Acceptance: the hook does not read or write the Kanban gate.
    - _Requirements: 5.2–5.4, 5.8, 5.11, 8.6; Root: T11; Decisions: S6, S8, Q3_
  - [x] 4.2 `useCardSearch.test.tsx`
    - With fake timers: a burst sends one request after 300 ms and none before, the trimmed text is sent, a blank value sends none and clears results and loading at once, clearing aborts the request and the timer, an identical trimmed text (for example a trailing space) sends nothing and clears nothing, a changed normalized query clears the previous results and shows loading during the debounce and the request, two deferred requests that resolve out of order leave the newest results, an abort is not an error, 5xx and a transport failure give the error state and keep the text, Retry sends one request without a delay, a 400 shows the field message and no Retry, a 404 calls `onAccessLost`, a 401 reaches the handler, and unmount aborts and clears the timer.
    - Acceptance: Properties 9 and 10 pass. The late-response case fails if the sequence guard is removed (checked once locally).
    - _Requirements: 5.2–5.4, 5.11, 8.6; Root: T11; Decisions: S6, Q3_

- [x] 5. Search component and board wiring (WP-F3, WP-F4)
  - [x] 5.1 Implement `CardSearch`
    - Create `frontend/components/kanban/CardSearch.tsx` with the labelled `FormField` "Search cards" (`type="search"`, `maxLength={100}`, `text-base`, 44 px), the states of `design.md` ("States and screens"): idle (no message), "Searching…" with `aria-busy`, the result list (title and live column name, accessible name "<title>, in <column>"), `No cards match "<query>".`, an error with Retry, and a field error without Retry. When the response held 20 results it shows "Showing N results." with N as the visible count, and when every result is hidden it shows the no-result state and no count line (Q1). One `role="status"` live region announces the count, the no-result text or the error. It resolves rows with `resolveSearchResults` on every render and calls `onOpenCard(cardId)`. Plain text only. `break-words`, `min-w-0`, daisyUI semantic colors only.
    - Acceptance: no new color, font or shared part. `lib/mobileGuard.test.ts` passes for the new file.
    - _Requirements: 5.1, 5.5, 5.6, 5.9, 5.12, 7.1–7.3; Root: T11; Decisions: S4, S8, Q1, Q2_
  - [x] 5.2 `CardSearch.test.tsx`
    - Cover the label, idle (no message), loading, results with title and column, no results with the query text, error with Retry, the field error, "Showing 20 results." when 20 were returned, "Showing 19 results." after one result is hidden, the empty state and no count line when all 20 are hidden, a rename that no longer matches (hidden), a rename that still matches (new title shown), a move (new column shown), a delete (hidden) and its rollback (restored), a new match absent until the next search, selecting a result calls `onOpenCard` with the card ID, the live region text, and markup in a title rendered as text.
    - Acceptance: Properties 6 to 8 pass at component level. Each assertion reads rendered text or roles.
    - _Requirements: 5.5, 5.6, 5.9, 5.10, 5.12, 8.6; Root: T11; Decisions: S8, Q1, Q2_
  - [x] 5.3 Wire `CardSearch` into `KanbanBoard`
    - Render `CardSearch` above the columns region with the live `columns`, `onOpenCard={(id) => setOpenCardId(id)}` and an `onAccessLost` that uses the existing board access toast and redirect. Do not use the gate. Results stay selectable while the board is busy.
    - Tests (`KanbanBoard.test.tsx`, extended): the search renders above the columns, selecting a result opens "Card details" for the current card and focus returns to the result on close, a pending search does not disable a move or an edit, and a pending move does not disable the search.
    - Acceptance: the existing Kanban tests pass unchanged. No second open path exists for the modal.
    - _Requirements: 5.7, 5.8, 8.6; Root: T11; Decisions: S7, S8_

- [x] 6. My Tasks page (WP-F3)
  - [x] 6.1 `MyTasks` and `TaskGroup`
    - Create props-only `frontend/components/tasks/MyTasks.tsx` and `TaskGroup.tsx`: a summary strip ("3 tasks on 2 boards", singular forms, `tabular-nums`), one `.surface` group per board in API order with the board chip from `boardChip`, the heading link and each row link to `/boards/<board_id>`, the card title, a `line-clamp-2` description excerpt, `break-words min-w-0`, rows at 44 px, and the empty state "No cards are assigned to you. Cards assigned to you on any board appear here." No card ID in any link.
    - Tests: `MyTasks.test.tsx` (groups in the given order, both links, the summary for one and several, the empty state, the wrap classes, no card ID in an `href`).
    - Acceptance: no nested `.surface` (FE-D3).
    - _Requirements: 4.1–4.5, 7.1–7.3; Root: T11; Decisions: S1, S9_
  - [x] 6.2 The `/my-tasks` page
    - Create `frontend/app/(protected)/my-tasks/page.tsx` as a Server Component: `getCurrentUser()`, `getMyTasks()`, `<main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">`, a title and `MyTasks`. No client request, no `loading.tsx`. A read failure reaches `app/error.tsx`.
    - Tests: `page.test.tsx` (session verified, E21 read with `?assignee=me`, groups rendered, a read failure throws, a missing session redirects) and an entry in `pages.guard.test.ts`.
    - Acceptance: the page sends no token to the browser.
    - _Requirements: 4.1, 4.6, 4.7; Root: T11; Decisions: S11_

- [x] 7. Navigation (WP-F5)
  - [x] 7.1 AppHeader links at every width
    - In `frontend/components/shared/AppHeader.tsx`, always render the `<nav aria-label="Main">`. Below 1024 px it is a second row (`order-last basis-full`) of two text links, and from 1024 px the sidebar list with icons (`hidden lg:block`). Add "My tasks" with a matching icon. `aria-current="page"` on Boards for `/` and `/boards/*`, and on My tasks for `/my-tasks`. Each link `min-h-11 min-w-11` with a visible focus ring.
    - Tests: `AppHeader.test.tsx` (extended: both links, the `aria-current` cases for `/`, `/boards/x` and `/my-tasks`, `min-h-11` on both, the nav has no `hidden` class and carries `order-last` and `basis-full`).
    - Acceptance: Property 12 passes. The existing AppHeader tests pass unchanged. Pixel checks at 320 and 375 px are in 8.1.
    - _Requirements: 6.1–6.4; Root: T11; Decisions: S10, Q6_

- [x] 8. Measured mobile check, journey and timing (WP-V)
  - [x] 8.1 Measured mobile check
    - Create `evidence/my-tasks-search-mobile-measure.mjs` in the style of `evidence/comments-mobile-measure.mjs`. Cover `/my-tasks` (tasks on two boards, and none), the board page with the search in idle, loading (a delayed request), results, 20 results, no results and error, and the header on every route, at 320, 375, 768 and 1280 px. Check `scrollWidth <= innerWidth` for the page (the Kanban region may scroll), every interactive box at least 44 by 44 CSS px with `elementFromPoint` at its center (the field, Retry, a result, a task row and both AppHeader links), a 16 px field font, and at both 320 and 375 px: Boards and My tasks reachable, each link at least 44 by 44, no horizontal overflow from the header, and no overlap of the sticky bar over the content (the first content element starts at or below the bar's bottom, and a focus jump is not hidden under it). Save screenshots at 375, 768 and 1280 px, record emulator or real device, and write `evidence/my-tasks-search-mobile.json`.
    - Acceptance: 0 failed checks. A failed check keeps the task open with its reason.
    - _Requirements: 6.2, 6.3, 7.1–7.3, 7.6; Root: T11; Decisions: S10, Q6_
  - [x] 8.2 Manual journey and handler checks
    - At 375 px: open My tasks from the top bar, follow a board link, type a query, see results, open a card from a result, clear the query, try a no-result query, rename the card and see the result follow it, delete a card and see its result go. Delay one request and confirm that an older response does not replace newer results. Against the dev server with `curl` and a test account, send a repeated `q`, an unknown key, a blank `q` and `q=%00` through the Next handler and record the status and body of each.
    - Acceptance: every step has a recorded outcome. The four handler requests return the Flask 400 with `fields.q` for a known parameter and the standard message for an unknown one. No token appears in the record.
    - _Requirements: 7.4–7.6, 8.1, 8.9; Root: T11; Decisions: S3, Q4_
  - [x] 8.3 Timing on a board of 100 cards
    - Seed a disposable board of 100 cards on the local database (cleaned up after the run), warm up, then time 30 sequential E22 requests and 30 sequential E21 requests from one client. Record the environment, the fixture size, the raw timings and the nearest-rank p95 beside the 800 ms reference of NFR 1. This is a recorded measurement and not a new pass-or-fail gate (S4).
    - Acceptance: the raw timings and conditions are in the evidence record.
    - _Requirements: 8.9; Root: T11; Decisions: S4_

- [x] 9. Full verification checkpoint (gate C)
  - [x] 9.1 Run the full suites
    - From `backend/`, run the full pytest suite on `TEST_DATABASE_URL`. From `frontend/`, run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. Compare with the baselines in `evidence/comments-T10.md` (backend 1706 passed and 1 skipped, frontend 1571 passed) and report any drop.
    - Acceptance: no failure and no skipped test that was not skipped before. Real counts go in the evidence record.
    - _Requirements: 8.4–8.8; Root: T11_
  - [x] 9.2 Review the diff against the spec
    - Review the actual diff against `requirements.md`, `design.md` and FE-D1 to FE-D9. Confirm: no new color, font or dependency, no `docs/API.md` path or field change, E21 and E22 write nothing, the handler never parses `q`, and there is no new gate use in the search.
    - Acceptance: each finding is fixed with a test or recorded as open.
    - _Root: T11_

- [x] 10. Documentation checkpoint and root status
  - [x] 10.1 Evidence record
    - Write `evidence/my-tasks-search-T11.md`: commands run and counts, the measured mobile result and screenshots (emulator or real device), the manual journey, the handler checks, the timing, defects found and fixed, and what stayed open (Playwright V10, real-device checks, deployment). Attribute each step to the tool that ran it. Update `evidence/spec-review.md` with the implementation record.
    - _Requirements: 7.6, 8.9, 8.10; Root: T11_
  - [x] 10.2 Changelogs
    - Add concise entries under the `## YYYY-MM-DD` heading for the commit date, with a `### <short-sha> <subject>` entry in `CHANGELOG.md`, `backend/CHANGELOG.md` and `frontend/CHANGELOG.md`. Record any deviation from the approved design in `specs/CHANGELOG.md` with before, after, reason and verification.
    - _Root: T11_
  - [x] 10.3 README and layer docs
    - Update the `README.md` status, feature and setup facts that changed, with verified results only. Check `backend/specs/` and `frontend/specs/` still match the code. Update the `specs/traceability.md` status rows for AC06.2 and AC09.1 (line "Not part of this slice (T11)") with the observed results, and mention `my-tasks-search-T11.md`.
    - _Root: T11_
  - [x] 10.4 Standards check
    - Confirm `guidelines/frontend.md` lists `CardSearch`, `useCardSearch`, `MyTasks` and `TaskGroup` in its component table, and that FE-D2 matches the shipped header.
    - _Root: T11_
  - [x] 10.5 Root task status (gate D)
    - Check T11 in `specs/tasks.md` only when 1 to 9 pass. Otherwise leave it open with the real reason in the evidence record.
    - Acceptance: the checkbox matches the evidence.
    - _Root: T11_

## Notes

- Test sub-tasks are not marked optional. Root completion in `specs/tasks.md` needs V07 and V11, so they are required here.
- Each backend test file covers one concern, as listed in `design.md` ("Backend test files").
- All database-writing tests clean up automatically through `BoardTracker` and run only on `TEST_DATABASE_URL` (tasks 2.2, 2.3, 2.5).
- Local checks prove local behavior only. Playwright (V10), real-device checks and deployment stay open for T15 and T16.
- Notifications (T13), analytics (T14), profile (T12), pagination, a card deep link, fuzzy search and a trigram index are out of scope.
- Attach `guidelines/backend.md`, `guidelines/database.md` or `guidelines/frontend.md` when creating a file with no matching file context.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "7.1"] },
    { "id": 3, "tasks": ["2.6"] },
    { "id": 4, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 5, "tasks": ["4.1"] },
    { "id": 6, "tasks": ["4.2", "5.1", "6.1"] },
    { "id": 7, "tasks": ["5.2", "5.3", "6.2"] },
    { "id": 8, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 9, "tasks": ["9.1", "9.2"] },
    { "id": 10, "tasks": ["10.1", "10.2", "10.3", "10.4"] },
    { "id": 11, "tasks": ["10.5"] }
  ]
}
```
