# Analytics T14: implementation evidence

Feature spec: `.kiro/specs/analytics/`. Root task: T14. Implemented by Claude Code (`/revotask-feature implement analytics T14`, run scope: every task of `tasks.md`, 2026-11-14). The spec phases (requirements, design, tasks) were also produced by Claude Code (`/revotask-feature spec analytics T14`, 2026-11-14), with the user's approvals recorded in `evidence/spec-review.md`.

Local checks prove local behavior only. The browser run used Chrome device emulation (headless Chrome 157.0.8103.51 with touch emulation below 640 px), not a real phone and not an on-screen keyboard. The Playwright journey (V10) is delivered in T15.

## Summary

| Area | Result |
| --- | --- |
| Backend | `pytest` 2050 passed, 1 skipped (the deliberate E05 skip). `ruff check .` and `ruff format --check .` clean. 64 new tests in 8 new files plus one helper module (baseline 1986). |
| Frontend | `npm run lint` and `npm run typecheck` clean. `npm test` 2035 tests in 98 files passed (the T13 record: 1958 in 93). `npm run build` succeeded (rerun 2026-11-14 after the modal change) and lists `/api/boards/[id]/analytics`. New tests in 5 new files, plus extensions to `apiClient.test.ts` (2), `flask.test.ts` (1) and `BoardShell.test.tsx`. |
| Browser (V08, V11) | `evidence/analytics-mobile-measure.mjs` (rerun 2026-11-14 on the modal build): 153 checks at 320 (37), 375 (48), 768 (34) and 1280 px (34), including the scripted 375 px journey. 2 failed, both on the shared header brand link, not on analytics (see "Open"). Report: `evidence/analytics-mobile.json`. Screenshots: `evidence/analytics-screenshots/` (header button, dialog loading, figures, error, empty board, no columns, at the widths named in the file). |
| Timing (A10) | E29 on 100 cards with a week of events, 30 sequential requests: p95 6.2 ms, median 5.4 ms, max 7.4 ms (direct to Flask, test database, warm). Raw timings: `evidence/analytics-timing.json`. A measurement, not a gate. |
| Open | Brand link below 400 px is 28x44 CSS px (see "Open"). Playwright journey V10, real-device and on-screen-keyboard checks (T15), deployed timing and deployment (T16). |

## Commands and results

### Backend (tasks 1.1 to 2.10)

- Captured 2026-11-14, from `backend/`. `backend/.venv`. Database writes went to `TEST_DATABASE_URL` through `db_guard` and the `board_tracker` fixture. Its value is not recorded here.
- `.venv/bin/python -m pytest -q -p no:cacheprovider` gave 2050 passed, 1 skipped (baseline before this slice: 1986 passed, 1 skipped). The eight new files alone gave 64 passed: `_access` 15, `_activity` 10, `_aggregation` 2, `_cleanup` 1, `_columns` 9, `_completed` 9, `_readonly` 3, `_week` 15.
- `.venv/bin/ruff check .` gave "All checks passed". `.venv/bin/ruff format --check .` gave "169 files already formatted".
- New files: `app/blueprints/analytics/` (`__init__.py`, `routes.py`, `schema.py`, `service.py`), `tests/analytics_helpers.py` and the eight `tests/test_analytics_*.py` files. Existing files changed: `app/__init__.py` (registers `analytics_bp`) and `tests/test_factory.py` (lists `analytics.board_analytics_view`).
- Access (Properties 7 and 9): admin and member 200, 401 for none, malformed, expired and revoked tokens, one identical 404 envelope for a nonmember, a removed member, a missing and a soft-deleted board, 400 for a malformed ID and for each query shape (`?week=1`, `?x`, a repeat, `?board_id=<id>`, `?page=1`) with the standard message and no `fields`, the order (a malformed ID beats a missing board, a query parameter beats the 404), `Cache-Control: private, no-store` on every response, and no title, email or card ID in the body.
- Aggregates (Properties 1 to 4): empty column at 0, the Done column listed, the column ID as tie-break, a column whose only card is deleted still listed at 0, a deleted column omitted, another board's cards ignored, zero columns with the other figures present. Completed: created in Done, moved into Done, the same card entering Done twice (both by real E20 moves and by direct events) counts once, a card deleted, moved out of Done or in a column deleted later stays counted, a move within Done, an edit and a comment add nothing, other boards and other weeks do not count. Activity: each of the four kinds counts once, `entered_done` does not, creating in Done and moving into Done each add one, a removed member stays listed, an idle member does not, the current name shows after a rename, the order is count, lower-cased name, user ID (a tie between `Alice` and `alice`). A 5-column, 30-card board with 111 seeded events gives exact figures (6 per column, 7 completed, 50 and 40 activity), and a real flow through E13, E17, E20, E16 and E24 matches the events actually written.
- Week (Properties 5 and 6), with the clock fixed by replacing `app.blueprints.analytics.service.utcnow`: an event at `week_start` is inside, one microsecond before it is in the earlier week, one at `week_end` is outside, one microsecond before it is inside. Sunday 23:59:59 and the next Monday 00:00:00 give different windows. A year boundary (2027-01-01 gives 2026-12-28), a leap day (2028-02-29 gives 2028-02-28), and two non-UTC `now` values give the UTC week. The timestamps match `...Z` and span seven days. `week_bounds` for every weekday and at both edges.
- Read-only (Property 8): the event, notification, card, comment and `position_version` counts do not change over three reads, a second transaction that holds the board row lock does not block E29, and an injected `OperationalError` on the first aggregate gives the sanitized 500 (no `secret_table`, no connection text, no `data`) with `private, no-store`.
- Mutation checks, each applied to `service.py` and then restored: adding `entered_done` to `COUNTED_KINDS` made `test_entered_done_is_not_activity` fail. Moving the active-card test from the join condition to `WHERE` made `test_a_column_whose_only_card_is_deleted_is_still_listed_at_zero` fail (this test was added because the first attempt at this mutation passed all tests: an empty column survives a `WHERE Card.deleted_at IS NULL`, a column holding only deleted cards does not). A plain `count(card_id)` instead of `count(distinct card_id)` made `test_the_same_card_entering_done_twice_counts_once` fail. `occurred_at <= end` made `test_events_of_other_boards_and_other_weeks_do_not_count` fail.
- Cleanup (Requirement 8.6): `test_analytics_cleanup.py` creates tracked events, fails on purpose, and proves that the three tracked events were removed while the untracked sentinel board's event survived.

### Frontend (tasks 3.1 to 5.3, 6.4)

- Captured 2026-11-14, from `frontend/`. `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` ran after the last code change.
- New files: `lib/analytics.ts`, `hooks/useBoardAnalytics.ts`, `components/analytics/AnalyticsFigures.tsx` and `AnalyticsPanel.tsx`, `app/api/boards/[id]/analytics/route.ts` and their tests: `lib/analytics.test.ts` (22), `app/api/analyticsRoute.test.ts` (8), `hooks/useBoardAnalytics.test.tsx` (14), `AnalyticsFigures.test.tsx` (6) and `AnalyticsPanel.test.tsx` (10). Existing files changed: `lib/types.ts`, `lib/server/flask.ts`, `lib/apiClient.ts`, `components/boards/BoardShell.tsx` and the three test files named in the summary.
- Hook (Properties 10 and 11): one read on mount, a version rise starts one read, an equal or lower version starts none, a rise during a read aborts it and starts one, Refresh reads, an earlier slow response cannot overwrite a later one, a board change drops the figures and ignores the earlier board's response, unmount aborts, a 404 calls `onAccessLost`, a 401 goes to the login redirect, a 5xx, a 400, a transport error and a malformed body set the error and keep the last figures, and a later good read clears it.
- Failure isolation (Property 12), `BoardShell.test.tsx`: with E29 failing at mount and on the read that follows a move, the panel shows its error and the board keeps working: the card moves, the Kanban gate stays idle, no error appears inside the Kanban region, the search sends its request, no toast is raised and there is no redirect. A failed move that rolls back does not start a read. A 404 from E29 shows the access toast and redirects.
- Parsers and handler: `parseAnalytics` copies only the five keys and rejects a missing key, a week bound without `Z`, a negative, fractional, string or unsafe count and an item with a missing field. The handler forwards the query unchanged and passes the Flask 400 and 404, clears the cookie on 401, answers a non-UUID ID with 400 before any upstream call, and never puts the token in a response. The client allowlist declares the E29 GET with no query string.

### Browser check (tasks 6.1 and 6.3), rerun on the modal build

- Setup: my own Flask (127.0.0.1:5002) on `TEST_DATABASE_URL` with rate limiting off, and a production Next server (localhost:3101, `API_BASE_URL=http://127.0.0.1:5002`, rebuilt with `npm run build` first). Your stack on 5001 and 3000 was not used. Both servers were stopped afterwards. The throwaway accounts and their boards stay in the test database (users cannot be deleted through the API).
- Command: `BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 REPORT_FILE=evidence/analytics-mobile.json SHOT_DIR=evidence/analytics-screenshots node evidence/analytics-mobile-measure.mjs`. Result: 153 checks, 2 failed, exit 1. The report holds no password, email, token or cookie.
- Header (320, 375, 768, 1280 px): the Analytics button is in the board header, outside the title row, before Rename board, and right of the board name at 640 px and wider (stacked below it under 640 px). It passes the 44 by 44 CSS px and `elementFromPoint` checks.
- Dialog states at each width: loading (E29 held in the browser; exactly one read starts on open), figures, a refresh that keeps the figures and marks the dialog busy, a failed read (E29 answered 503 in the browser) with the error, Retry and the last figures kept, a board with columns and no cards (zeros and "No activity this week."), and a board with no columns ("No columns yet."). Each state: no horizontal page scroll, every control in the dialog at least 44 by 44 CSS px with `elementFromPoint` at its center. Refresh shows a visible focus ring.
- Keyboard (320 and 375 px): Enter on a focused Refresh reads E29 once more; Escape closes the dialog and focus returns to the Analytics button.
- Journey at 375 px: open the dialog and the figures match the stored E29 values; close it, complete a card with the Move button, reopen and see the completed count, the column counts and the admin's activity change with exactly one read on reopen; with the dialog open, a comment by the second user does not appear on its own (no polling) and appears after Refresh; after the member is removed their activity stays under their name; with E29 failing the dialog shows its error, and a move still succeeds afterwards and is stored.
- Browser: Chrome device emulation, not a real phone and not an on-screen keyboard.

### Behavior change recorded

With the modal, the hook mounts only while the dialog is open. A card or column change made while the dialog is closed sends no read at the time of the change. The next open reads fresh figures. A8 said the panel reads after a successful local change that advances `position_version`. The read now happens on the next open instead. This is recorded in `specs/CHANGELOG.md` as a deviation for review. It is not yet approved as a spec change.

## Findings and what each changed

| Source | Finding | Outcome |
| --- | --- | --- |
| Mutation check | Moving the active-card test into `WHERE` passed every test at first, because an empty column survives `Card.deleted_at IS NULL`. Only a column whose cards are all deleted is dropped. | Fixed in the tests: `test_a_column_whose_only_card_is_deleted_is_still_listed_at_zero` added. The mutation now fails it. |
| Lint (`react-hooks/set-state-in-effect`) | `useBoardAnalytics` flags the read in flight (`setBusy(true)`) from the mount effect, which the rule reports. | The mount effect carries one `eslint-disable-next-line` with its reason. The version effect did not need one. No behavior change. |
| Existing tests | The member-removal tests in `BoardShell.test.tsx` counted every `apiGet` call, and the panel now reads E29 through `apiGet` too. | The tests now count only non-analytics reads (`mockGets`, `otherGets`). No product change. |
| Design | `design.md` named a "secondary" Refresh and Retry button, but `BaseButton` has only `primary` and `ghost` variants. | Both use `variant="ghost"` with `border border-base-300`. No new variant, color or shared part (FE-D1). Recorded in `specs/CHANGELOG.md`. |
| Harness (first browser run) | 11 checks failed: the scripts parsed counts with a regex whose backslash was lost inside a template literal (`\s` became `s`), and Enter was sent without a `text` value so the button never clicked. | Fixed in `evidence/analytics-mobile-measure.mjs` and rerun: 128 checks, 0 failed. No product change. |
| Browser check (rerun) | The header brand link (`BrandMark` inside `AppHeader`) is 28 by 44 CSS px at 320 and 375 px, because its wordmark is visually hidden there. The 44 px rule (FE-S5) is not met. This shell element is not part of the analytics change, and the shell check did not cover the header before this run. | Recorded open. Not changed here. Fix: add `min-w-11` to the brand link, then rerun the check. |
| Journey harness (rerun) | Step 3 read the member's count after the comment was posted, so the expected values were wrong. | Fixed in the script: the count is read with the dialog open, then the comment is posted. No product change. |
| Diff review (FE-D1 to FE-D9, FE-S3 to FE-S6, FE-A1, FE-A2, BE01) | No new color, font, accent, dependency or migration. The error text uses `text-error` and a `role="alert"` block, as `NotificationPanel` does. The live region is a plain `aria-live` element, so the board keeps one `role="status"`. The panel reads no Kanban gate. The earlier slices' files are unchanged apart from the lines named in the plan. | No change needed. |

## Open

- Header brand link at 320 and 375 px below 44 by 44 CSS px (FE-S5): fix in the shared shell, then rerun the browser check.
- Playwright journey (V10), real-device and on-screen-keyboard checks: T15.
- Deployed timing, live verification and deployment: T16.
- Polling or live update of the figures is out of scope by decision A8. Comments and other users' changes appear on the next Refresh or the next open.
- Approval of the read-on-open behavior described above (A8 wording).

## Revision 2: sprint window (2026-11-18)

E29 now counts inside the board's sprint when it has one, and keeps the UTC week otherwise. It adds the key `window`. The checks, the browser result (140 checks, 0 failed) and the 90-day timing (p95 12.4 ms) are recorded in `evidence/boards-membership-T05-T06.md`, section "Revision 2: sprint date range". Everything above this heading describes the week window and stays as recorded on its date.
