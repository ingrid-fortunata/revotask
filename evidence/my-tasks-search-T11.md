# My Tasks and search T11: implementation evidence

Feature spec: `.kiro/specs/my-tasks-search/`. Root task: T11. Implemented by Claude Code (`/revotask-feature implement my-tasks-search`, run scope: every task of `tasks.md`, 2026-11-14). The spec phases were also produced by Claude Code; requirements, design and the Q1–Q6 clarifications were approved by the user in chat, and the user's `implement ... all the tasks` invocation was the approval of the task plan (see `evidence/spec-review.md`). No Kiro output is involved in this slice.

Local checks prove local behavior only. The browser run used Chrome device emulation (headless Chrome 157.0.8103.51 with touch emulation below 640 px), not a real phone and not an on-screen keyboard. The Playwright journey (V10), real-device checks and deployment stay open for T15 and T16.

## Summary

| Area | Result |
| --- | --- |
| Backend | `pytest` 1808 passed, 1 skipped (the deliberate E05 skip). `ruff check .` and `ruff format --check .` clean. 102 new tests in 4 new files (`test_search_query_validation.py`, `test_my_tasks.py`, `test_card_search.py`, `test_search_properties.py`) plus the cleanup test and the route registry test extended. |
| Frontend | `npm run lint` and `npm run typecheck` clean. `npm test` 1733 tests in 85 files passed. `npm run build` succeeded and lists `/my-tasks` and `/api/boards/[id]/cards/search`. |
| Browser (V07, V11) | `evidence/my-tasks-search-mobile-measure.mjs`: 359 checks at 320, 375, 768 and 1280 px as a member with assignments and as an admin with none, plus a scripted 375 px journey and four handler checks, 0 failed. Report: `evidence/my-tasks-search-mobile.json`. Screenshots: `evidence/my-tasks-search-screenshots/` (375, 768, 1280 px). |
| Timing | E22 p95 4.8 ms and E21 p95 5.8 ms on a board of 100 cards (30 sequential requests each, local, direct to Flask). Reference 800 ms (NFR 1). Raw timings: `evidence/my-tasks-search-timing.json`. |
| Open | Playwright journey V10, real-device and on-screen-keyboard checks (T15), deployment (T16). |

## Commands and results

### Backend (tasks 2.1 to 2.6)

- Captured 2026-11-14, from `backend/`. `backend/.venv`. Database writes went to `TEST_DATABASE_URL` through `db_guard` and `BoardTracker`. Its value is not recorded here.
- `.venv/bin/python -m pytest tests/test_search_query_validation.py tests/test_my_tasks.py tests/test_card_search.py tests/test_search_properties.py -q -p no:cacheprovider` gave 101 passed. With `tests/test_boards_cleanup.py` the group is 102 new or extended tests.
- `.venv/bin/python -m pytest -q -p no:cacheprovider` gave 1808 passed, 1 skipped (baseline before this slice: 1706 passed, 1 skipped).
- `.venv/bin/ruff check .` gave "All checks passed". `.venv/bin/ruff format --check .` gave "133 files already formatted".
- First full run failed one test, `test_factory.py::test_registered_routes_match_the_implemented_slices`, because it lists every registered endpoint. `cards.list_my_tasks_view` and `cards.search_cards_view` were added to its list.
- Teardown: `test_boards_cleanup.py` has a new case that makes a tracked board, runs E21 and E22, fails inside the harness, and checks that the tracked rows are gone while the untracked sentinel board, its membership, column, card and user survive.

### Frontend (tasks 3.1 to 7.1, 9.1)

- Captured 2026-11-14, from `frontend/`. `npm run lint` and `npm run typecheck`: clean. `npm test`: 85 files, 1733 tests passed (baseline: 75 files, 1571 tests). `npm run build`: succeeded.
- Mutation check of the late-response guard (task 4.2): removing the sequence check and the abort from `useCardSearch` made four hook tests fail (the clear-while-pending case, both out-of-order cases and the unmount case). The hook was restored and all 23 hook tests pass.
- A `role="status"` live region in `CardSearch` made two existing `KanbanBoard` tests ambiguous, because the board already has a status region. The search uses `aria-live="polite"` without a role (see "Deviations").

### Browser and mobile check (tasks 8.1, 8.2)

- Setup: my own Flask (127.0.0.1:5002) on `TEST_DATABASE_URL` with rate limiting off, and a production Next server (localhost:3101, `API_BASE_URL=http://127.0.0.1:5002`). Your stack on 5001 and 3000 was not used. Both servers were stopped afterwards. Note: `next build` writes `frontend/.next`, so a `next dev` server that was running while the build ran may need a restart.
- Command: `BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 REPORT_FILE=evidence/my-tasks-search-mobile.json SHOT_DIR=evidence/my-tasks-search-screenshots node evidence/my-tasks-search-mobile-measure.mjs`. Result: 359 checks, 0 failed, exit 0. The script seeds two boards, 22 searchable cards, a Done card and a 148-character unbroken title through the API.
- Per width (320, 375, 768, 1280), as a member: `/` and `/my-tasks` and the board page with the search in its idle, loading (delayed), results, 20 results, no results and error states, each measured for no horizontal page scroll, every interactive box at least 44 by 44 CSS px, `elementFromPoint` at each control center, and 16 px text inputs. As an admin with no assignments: `/my-tasks` empty state.
- The AppHeader (Q6) was checked on every route at all four widths: Boards and My tasks both present, visible, inside the viewport and reachable at their center, each at least 44 by 44 px, no header overflow, `aria-current` on exactly the right link, and below 1024 px the sticky bar does not overlap the content (main starts at or below the bar). From 1024 px the sidebar does not overlap main. A control focused after a scroll is not hidden under the sticky bar.
- Journey at 375 px (all passed): open My tasks from the top bar link by touch, follow a board link, type a query, see the result with its column, open Card details from the result, Escape returns focus to the result, rename the card so it no longer matches and the result disappears with no new request, rename it so it still matches and the new title shows, delete a card and its result goes, clear the query and return to idle, a no-result query, and a late response (a 1.8 s delayed request of an earlier query) that does not overwrite the newer results.
- Handler checks through the real same-origin handler (cookie only): `?q=a&q=b` returned 400 with `fields.q` "Send one value."; `?q=a&foo=1` returned 400 with the standard message and no `fields`; `?q=` returned 400 with `fields.q` "Required."; `?q=%00` returned 400 with `fields.q` "Enter valid text."; each carried `Cache-Control: private, no-store`; a valid query returned 200.
- Screenshots were reviewed at 375 and 1280 px (My tasks and the 20-result search): the header rows, chips, clamped excerpt and wrapped long title match the design system.

### Timing (task 8.3)

- Local Flask dev server, one client, sequential requests direct to Flask (no Next.js), test database, 5 warm-up requests each. Fixture: 100 cards on 4 columns, 50 assigned to the caller, E22 query "card 0" (20 results, the cap).
- E22: p95 4.8 ms, max 5 ms. E21: p95 5.8 ms, max 6.4 ms. Nearest-rank p95 over 30 requests. Reference value 800 ms (NFR 1). This is a recorded measurement, not a gate. Raw timings: `evidence/my-tasks-search-timing.json`. Deployed timing is T16.

## Implementation notes by task group

| Group | Result |
| --- | --- |
| 1 Backend | `load_query_args` in `app/validation.py` (repeat and unknown-key rules, no database access). `MyTasksQuerySchema`, `CardSearchQuerySchema` (trim, 1 to 100, NUL rejected), `TaskItemSchema`, `SearchResultSchema`. `my_tasks` (one statement, membership join, `lower(board name)`, board ID, column order, card order, card ID) and `search_cards` (`icontains(autoescape=True)`, board order, limit 20). Routes `GET /api/cards` and `GET /api/boards/<id>/cards/search`. |
| 2 Backend tests | `search-query-cases.json` drives the validation tests of both routes. Properties 1 to 5 are parameterized tables. |
| 3 Frontend foundation | Types, `lib/cardSearch.ts` (`resolveSearchResults`), `lib/tasks.ts`, `lib/boardChip.ts` (moved from `BoardList`), `search` option on `flaskRequest`, `forwardQuery` on `handlePrivateRead`, the E22 handler, the declared GET pattern, `getMyTasks`. |
| 4 Hook | `useCardSearch`: 300 ms debounce, sequence number plus `AbortController`, blank clears at once, an unchanged trimmed text sends nothing, a changed one clears the held results. |
| 5 Component | `CardSearch` and its wiring in `KanbanBoard` (no gate). |
| 6 Page | `MyTasks`, `TaskGroup`, `/my-tasks`. |
| 7 Navigation | `AppHeader` shows Boards and My tasks at every width. |

### Deviations from the approved design (no change to behavior or contract)

- `CardSearch` announces through `aria-live="polite"` on a plain element and does not carry `role="status"`. The board already has one status region, and two would make the existing board tests and assistive technology ambiguous.
- `FormField` gained the `search` input type and an optional `maxLength` prop for the search field. It is a shared part, and its default behavior is unchanged.
- `KanbanBoard` gained a required `boardId` prop, which `BoardShell` passes. The search needs it for the request path.
- A request with an unknown key and a missing known key reports the known field ("Required.") beside the standard message. The fixture records this case.

## Requirement and property coverage

| Requirement | Evidence |
| --- | --- |
| 1 (E21) | `test_my_tasks.py`, Properties 1 and 2 |
| 2 (E22) | `test_card_search.py`, Properties 3 and 4 |
| 3 (access, order, read safety) | `test_search_query_validation.py`, `test_search_properties.py` (Property 5), `test_boards_cleanup.py` |
| 4 (My Tasks page) | `MyTasks.test.tsx`, `my-tasks/page.test.tsx`, browser check |
| 5 (search UI) | `cardSearch.test.ts`, `useCardSearch.test.tsx` (Properties 9, 10), `CardSearch.test.tsx` (Properties 6 to 8), `KanbanBoard.test.tsx`, browser journey |
| 6 (navigation) | `AppHeader.test.tsx` (Property 12), browser header checks |
| 7 (mobile) | `evidence/my-tasks-search-mobile.json`, screenshots |
| 8 (handlers, verification) | `cardSearchRoute.test.ts` (Property 11), `flask.test.ts`, `cardSearchClient.test.ts`, timing record |

## T15 handoff: steps for the Playwright journey

1. Sign in, open My tasks from the header link, check the groups and open a board from a group heading.
2. On the board, type a query, wait for the results (300 ms debounce), select one, check the "Card details" dialog for that card and close it.
3. Clear the query (results disappear at once), type a query with no match (the "No cards match" message), and type a query with 20 or more matches ("Showing 20 results.").
4. Rename a found card so it no longer matches and check that its result disappears. Delete it and check the same.
5. Check Boards and My tasks at a 375 px viewport.

## Open items

- Playwright journey V10, real-device and on-screen-keyboard checks (T15).
- Deployed timing and live verification (T16).
- No trigram index and no pagination: out of scope for v1 (S1, S4). Revisit if a board grows past the ~100-card target.

## Revision 2: task status badge and My Tasks search (2026-11-20)

Implemented by Claude Code (`/revotask-feature implement my-tasks-search`, all Revision 2 tasks, groups 11 to 16 of `.kiro/specs/my-tasks-search/tasks.md`). Requirements 9 and 10 (S12–S17) and `design.md` (DD13–DD21, C42, R1–R6 at their defaults) were approved in chat on 2026-11-20. No design change was needed. Scope: the E21 item gains `column_name` and `is_done`, each My Tasks row shows a status badge, and a local title search filters the loaded tasks.

### Commands and results

- Backend, from `backend/`: `.venv/bin/python -m pytest -p no:cacheprovider -q` → 2236 passed, 1 skipped (2234 before; the 2 new tests are in `test_my_tasks.py`, and the key-set assertion of `test_returns_the_documented_fields` was extended). `.venv/bin/ruff check .` clean and `ruff format --check app tests` clean after three line-length fixes. The new cases failed against the old service before the change (3 failed), then passed. Database writes went to `TEST_DATABASE_URL` through `BoardTracker`. Its value is not recorded here.
- Frontend, from `frontend/`: `npm run lint`, `npm run typecheck` and `npm run build` clean, `npm test` → 101 files, 2262 tests passed (2221 before; 2259 before the S18 refresh below). New or extended: `lib/tasks.test.ts` (parser keys, `filterTasks`), `lib/server/tasks.test.ts` (a missing `column_name` or `is_done` throws), `components/shared/BaseBadge.test.tsx` (new), `components/tasks/MyTasks.test.tsx` (badge and search), `app/(protected)/my-tasks/page.test.tsx` (fixtures and the new accessible name).
- Mutation check (task 13.6): replacing `filterTasks` with an identity function made 15 tests fail, and removing the badge from `TaskGroup` made 3 fail. Both were restored and the suites pass again.
- Not run: `npm run e2e` (Playwright). The only Playwright use of `/my-tasks` is `mobile.spec.ts`, which visits the route, so no journey reads a row name. The My Tasks Playwright steps stay open for T15.

### Browser and mobile check (tasks 14.1, 14.2)

- Setup: my own Flask (gunicorn, one worker with four threads, `127.0.0.1:5002`) on `TEST_DATABASE_URL` with rate limiting off, and a production Next server (`localhost:3101`, `API_BASE_URL=http://127.0.0.1:5002`). Your stack on 5001 and 3000 was not used. Both servers were stopped afterwards.
- Command: `BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 REPORT_FILE=evidence/my-tasks-search-mobile-rev2.json SHOT_DIR=evidence/my-tasks-search-screenshots-rev2 node evidence/my-tasks-search-mobile-measure.mjs`. Result: **448 checks, 0 failed** (447 before S18, and the Back check was a recorded observation then), exit 0, headless Chrome 157 with device emulation, not a real phone. Screenshots at 375, 768 and 1280 px are in `evidence/my-tasks-search-screenshots-rev2/` (`my-tasks-*`, `my-tasks-search-match-*`, `my-tasks-search-nomatch-*`, `my-tasks-empty-*`). The Revision 1 files stay.
- New checks on `/my-tasks` at 320, 375, 768 and 1280 px: a Done-column row has a success badge, a check icon and the text "Done"; an open row has a ghost badge, no icon and "To do"; an 80-character unbroken column name stays inside its row, wraps and takes at most 45% of the row; every badge sits inside its row; no horizontal page scroll; a matching query shows "1 of 5 tasks on 1 board" and hides the other group; typing sends no request (0 requests); a non-matching query shows `No tasks match “zzzz”.` and "0 of 5 tasks", not the empty state; Clear search empties and focuses the field and restores the list; the field and Clear search are at least 44 by 44 CSS px with `elementFromPoint` at the center and a 16 px font; the empty state shows no field. The Revision 1 checks (header links, search states, journey, handler) all still pass.
- Seed change: the script now also seeds an 80-character column name, so the My tasks summary expects "5 tasks on 2 boards". `focusNotHidden` now focuses the last match of its selector (it took the first, a heading link far above the viewport on the taller page).
- Status journey at 375 px (manual steps scripted): the card shows an open badge, moves to Done through the API, and returning through the **My tasks link** shows the green done badge. The card then moves back to To do and the browser **Back button** shows **the stale "Done" badge**. A reload shows the current open badge. The first run showed **the stale "Done" badge** on Back, a reload showed the current one. The user asked for the fix (S18, below), and after it the same journey shows the current open badge on Back and a status changed while the tab was hidden appears when the tab becomes visible, both asserted.

### S18: refresh on mount and on visibility (group 17)

The user asked for a refresh ("A refresh when the page becomes visible would fix it. => you can do it."). `MyTasks` calls `router.refresh()` in an effect on mount and on `visibilitychange` to visible, and removes the listener on unmount (`components/tasks/MyTasks.tsx`, DD22). Visibility alone would not fix Back inside the app, because Back does not change visibility, so the mount refresh is the part that fixes it. `router.refresh()` keeps the typed query. Cost: one extra E21 read per visit, accepted (a render timestamp would avoid it but a client clock that differs from the server's could suppress a needed refresh). Tests: 3 added in `MyTasks.test.tsx` (once on mount, visible and hidden, after unmount, query kept). Checks after the change: `npm test` 2262 passed, lint and typecheck clean, `next build` clean, and the 448-check browser run above.

### Defects found and fixed

- None in the product code. Two harness issues: the focus check selector (above), and a Flask keep-alive reset. A first run failed at 375 px with "timed out waiting for board with search" and Next logged `flask_request_failed … outcome=transport`. It repeated on a second run. With gunicorn started with `--keep-alive 60` the run passed. The likely cause is Node reusing a connection that gunicorn's default 2 second keep-alive had closed, made visible by the longer waits in the new steps. It was not investigated further, so treat the cause as unverified. Render also runs gunicorn with the default keep-alive.

### Deviations from the approved design (no change to behavior or contract)

- The test that a response without `column_name` or `is_done` throws is in `lib/server/tasks.test.ts` (where the parser runs), not in `page.test.tsx`, which mocks `getMyTasks`.
- Summary numbers are wrapped in `tabular-nums` spans by splitting the sentence on digits, so the sentence reads the same as the Revision 1 one.

### Requirement coverage

| Requirement | Proof |
|---|---|
| 9.1, 9.6 (E21 fields, rename and Done flag move shown on the next read) | `test_my_tasks.py` (3 new or extended tests), Property 13 |
| 9.2 to 9.5 (badge, style, accessible name, no widening) | `MyTasks.test.tsx`, `BaseBadge.test.tsx`, browser check at four widths |
| 9.7 (no status change from My Tasks) | no handler added, the row stays a link (`MyTasks.test.tsx`) |
| 10.1 to 10.10 (search, states, live region, clear, mobile) | `MyTasks.test.tsx`, `tasks.test.ts` (Properties 14, 15), browser check |
| 8.3 (parser keys) | `lib/tasks.test.ts`, `lib/server/tasks.test.ts` |

### Still open

- The Playwright My Tasks steps and real-device checks (T15).
- Deployment in Flask-first order (T16, `docs/DEPLOYMENT.md` section 4). Vercel deploys every push to `main`, so push the backend change first.
