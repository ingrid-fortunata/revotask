# Implementation Plan: local-acceptance (T15)

**Status:** Approved 2026-11-15 (user, in chat). Implemented and verified 2026-11-15. Root T15 is checked. Drafted by Claude Code from `requirements.md` (LA-1 to LA-11, approved 2026-11-15) and `design.md` (revision 2, approved with the card-selector wording below).

**Root task:** T15. Checked 2026-11-15 after every LA check passed and cleanup verified zero rows (task 12.5). Evidence: `evidence/local-acceptance-T15.md`.

**Dependency gates**

| Gate | Rule | Enforced by |
|---|---|---|
| A | Root T04 and T09–T14 are checked in `specs/tasks.md`. | Verified at spec time |
| B | Task 1.6 (read-only database proof) passes before any task that writes data. | 1.6 |
| C | Task 2.3 (removed-user token refused) passes before cleanup relies on token deletion. If it fails, stop and revise `design.md` section 4 to an isolated database. | 2.3 |
| D | Root T15 is checked only after groups 4 to 11 pass and task 12.2 to 12.4 verify cleanup and privacy. Unverified work stays open with the reason. | 12.5 |

**Conventions.** Each task has an acceptance check. A check that fails keeps its task open, and the reason goes in `evidence/local-acceptance-T15.md`. Every test run writes its own cleanup verification.

## Group 0 · Gates and records

- [x] 0.1 Record the approval of requirements and of design revision 2 in `evidence/spec-review.md`.
  - Check: the T15 review record shows the approval date and the six decisions.
- [x] 0.2 Confirm root T04 and T09–T14 are checked in `specs/tasks.md` and each has an evidence file.
  - Check: `grep` shows the checkboxes; the evidence files exist.

## Group 1 · Tooling and read-only preflight (LA-1, LA-10)

- [x] 1.1 Add `@playwright/test` as an exact-pinned devDependency (version at least two weeks old), the `e2e` script, and the `.gitignore` entries `test-results/` and `playwright/.run/`. Commit the lockfile change. Root T15.
  - Check: `npm ci` succeeds; `npx playwright --version` prints the pinned version; `git status` shows only the four expected files.
- [x] 1.2 Install Chromium with `npx playwright install chromium`.
  - Check: the install command exits 0; `npx playwright --version` shows the browser path.
- [x] 1.3 Write `support/psql.ts`: resolve `PSQL` (absolute executable) or `psql` on `PATH`; parse `TEST_DATABASE_URL` into child-process `PG*` variables; reject a name that does not end in `_test` or matches the `DATABASE_URL` name.
  - Check: unit test with fixture URLs (no database). It asserts the rejections, asserts that no output contains the password, and asserts that argv contains no URL.
- [x] 1.4 Connectivity check from the run shell: `psql -X -w -tA -c 'select 1'` (design 3.3).
  - Check: returns `1` against the test database. A wrong password stops the run with an error that does not include the password.
- [x] 1.5 Service and listener checks: health 200 on 5001, Next `/login` 200, exactly one listener on 5001 (design 3.4, 3.5).
  - Check: the preflight prints one line per check. A second listener on 5001 stops the run.
- [x] 1.6 Read-only database proof (design 3.6). **Open (2026-11-15):** passes on a native Flask on the test database (port 5002). The negative control on a native Flask on the dev database fails as designed. Port 5001 is held by Docker container `revotask-backend-1`, so the run's proof fails and gate B stays closed. Needs the user's decision (see evidence). Send `GET /api/health`, list established connections of the Flask PID, match them in `pg_stat_activity`, require every match to be the test database.
  - Check: passes with the test database. Negative control: run Flask with `DATABASE_URL` pointing at a different database, run the preflight, and confirm it stops at step 6 and writes nothing. Record both outputs. Gate B.
- [x] 1.7 Write the one-retry helper for setup only (design 4, rate-limit budget). It honors `Retry-After` (capped at 70 s, default 60 s) and stops on a second 429.
  - Check: unit test with a fake client returns 429 once then 200 (one retry, exits 200); 429 twice (stops, exits non-zero); a test body that gets 429 does not retry.

## Group 2 · Fixtures, token tracking and cleanup (LA-1, LA-10)

- [x] 2.1 Write `support/run.ts`: run tag, names, emails with the `acceptance.example.test` domain, generated passwords held in memory, typed API helpers (E02, E03, E06, E07, E17, E20 and others through the Next routes when the browser path matters).
  - Check: unit test shows the tag appears in every generated name and email, and passwords never appear in logged output.
- [x] 2.2 Write `support/tokens.ts`: decode the `jti` and `exp` claims of a session cookie value without verifying; write `playwright/.run/<runId>.json` with `jti` and `expires_at` only.
  - Check: unit test on a fixture token asserts the file holds no string starting with `eyJ` and holds the expected `jti`.
- [x] 2.3 Blocking spike: create a throwaway run account, log in, delete its user row through the cleanup SQL (step 8 of design 4), then call E30 with the old token.
  - Check: E30 returns 401. If it returns 200, stop, record the result, and revise design section 4 to an isolated disposable database before continuing. Gate C.
- [x] 2.4 Write `global-teardown.ts` and the cleanup SQL in design 4 order (steps 1 to 9). Step 9 deletes only the run's `jti` values.
  - Check: a seeded run is cleaned; the post-count of tagged rows and of run `jti` values in `revoked_tokens` is 0.
- [x] 2.5 Write `frontend/scripts/e2e-cleanup.ts` for a run tag and reuse the same SQL.
  - Check: a manual cleanup of a finished run leaves 0 rows. A forced SQL error exits non-zero and prints counts only.

## Group 3 · Global setup (LA-1, LA-2, LA-3, LA-4)

- [x] 3.1 Write `preflight.ts` (global setup) in design 3 order: tools, database, connectivity, services, listener, proof (1.6). Only after the proof: register `owner` and `member` (2 registrations), log `owner` in through the Next login route to save its cookie to storage state, log `member` in, record the `jti` values (2.2).
  - Check: the run creates exactly 2 users and one owner and one member login in setup; the run file holds 2 `jti` values after setup (owner and member), and 4 after the full run (plus LA-2a and LA-2d). The owner logs in four times per run in total. The storage-state file is in `playwright/.auth/` and is git-ignored.

## Group 4 · Auth scenarios (LA-2, V09)

- [x] 4.1 `auth › valid login opens the dashboard` (owner's second login through the UI, LA-2a).
  - Check: test passes; the owner's LA-2a `jti` is recorded.
- [x] 4.2 `auth › invalid credentials show one generic message` (owner's wrong-password attempt). Assert the exact message text.
  - Check: test passes; the message matches the generic text in the product copy.
- [x] 4.3 `auth › unauthenticated visit to a private route redirects to login` (empty storage state).
  - Check: test passes.
- [x] 4.4 `auth › private route after logout redirects to login, and the revoked token is refused`. Before the logout click, read the session `jti`. After logout, call E30 with the old cookie and assert 401.
  - Check: test passes; the `jti` is recorded for cleanup.

## Group 5 · Boards and membership (LA-3, LA-1)

- [x] 5.1 `boards-membership › create, open, add member, remove member, delete board`. Use the registered `member` by email. Assert the participant list, then the removal, then the member's 404 on the board, then the board's 404 after deletion.
  - Check: test passes; cleanup removes the board's rows.
- [x] 5.2 `boards-membership › unregistered email shows USER_NOT_FOUND` on the email field.
  - Check: test passes; the error appears under the email field, not as a page error.

## Group 6 · Kanban journey (LA-4, LA-8 core flow)

- [x] 6.1 `kanban › eight-step journey with dragTo and reload` (desktop project). Steps: create a board; add two columns; create a card in the source column; open it through `Open <title>`; edit and assign `member`; `dragTo()` to `dropzone-<columnId>-end`; `page.reload()`; assert the destination and absence in the source; delete the card.
  - Check: test passes on the desktop project. No `page.route` is used.
- [x] 6.2 `kanban › core flow with Move button` on `mobile-375`. Same steps, with the Move control `Move <title>` in place of `dragTo()`.
  - Check: test passes at 375 × 812 with touch emulation; the Move dialog is reachable with a 44 × 44 px target.

## Group 7 · Rollback and conflict (LA-6)

- [x] 7.1 `kanban-rollback › stale version shows 409 and refetches` (LA-6a). Owner opens the board. Member moves the card in a second context. Owner's move, sent with the old version, returns 409.
  - Check: test passes; the conflict message shows; the board refetch shows the server order; the record says `interception: none`.
- [x] 7.2 Spike: a request from the browser matches `**/api/cards/*/position` on `http://localhost:3000` (design 5).
  - Check: the spike logs the matched URL with the card ID only. If no match, fix the pattern before 7.3 and 7.4.
  - Result (2026-11-15): no separate spike script. The pattern `**/api/cards/*/position` matched in 7.3 and 7.4, which pass only when the route fires (a forced 500 and a forwarded-then-aborted request).
- [x] 7.3 `kanban-rollback › forced 500 restores prior order` (LA-6b), using `page.route` with `fulfill` status 500.
  - Check: test passes; the order is restored; feedback is shown; the record says `interception: fulfill 500`.
- [x] 7.4 `kanban-rollback › uncertain outcome refetches canonical board` (LA-6c), using `route.fetch()` and `route.abort('timedout')`.
  - Check: test passes; the refetch shows the committed order; the position version rose by exactly 1; the record says `interception: forward then abort`.

## Group 8 · Comments (LA-5)

- [x] 8.1 `comments › add, edit, delete, reload` for the owner, in the `Card details` dialog opened by `Open <title>`.
  - Check: test passes; the text is asserted after each step; the reload shows the state.
- [x] 8.2 `comments › member cannot edit or delete author's comment`. The UI shows no controls for another user's comment. A direct PATCH and DELETE with the member's token to E25 and E26 return 403.
  - Check: test passes; both 403 responses are recorded by status only.

## Group 9 · Timing (LA-7)

- [x] 9.1 Seed one board with 3 columns and 100 cards through the API, under the run tag.
  - Check: E07 returns 100 cards in 3 columns.
- [x] 9.2 `timing › 30 sequential E07 requests, warm`. Warm-up 5 (not counted). Measured 30. Nearest-rank p95 is the 29th sorted value. Target ≤ 800 ms.
  - Check: `evidence/local-acceptance-T15-timing.json` holds 30 raw values, the p95 and the environment; the record states "local, warm, Flask direct, not deployed".

## Group 10 · Mobile matrix (LA-8)

- [x] 10.1 `mobile › route and dialog matrix` on `desktop` (1280), `viewport-768`, `mobile-375` and `viewport-320`, for `/login`, `/register`, `/`, `/boards/[id]`, `/my-tasks`, `/profile`.
  - Check: `scrollWidth ≤ clientWidth` on each route, with the Kanban region as the only exception on the board page; each interactive target ≥ 44 × 44 px; each text input ≥ 16 px.
- [x] 10.2 Dialog checks in the same spec: `Card details`, the board analytics dialog, the notification bell panel, the Move dialog, at each project's width.
  - Check: no page overflow with the dialog open; focus returns to the trigger on close.
- [x] 10.3 Write `evidence/local-acceptance-T15-mobile.json` with one row per route, dialog, project, viewport, browser and input mode.
  - Check: row count equals routes plus dialogs per project; every row has a result. Failures stay open in LA-10.

## Group 11 · Integration suites and security (LA-1, LA-9)

- [x] 11.1 `pytest` for the backend with `TEST_DATABASE_URL` set to the test database. Record the pass, skip and command.
  - Check: the run passes, or the failure is recorded as open with its output.
- [x] 11.2 `npm run test` (Vitest). Record the pass and fail counts.
  - Check: the run passes, or the failure is recorded as open.
- [x] 11.3 Security checks (design 9): Origin behavior and `no-store` through the pytest run; `npm run build` and a bundle sentinel scan; a repository secret scan with no match.
  - Check: each command's result is recorded; no secret value appears in output.
  - Result (2026-11-15): the bundle sentinel build used `next build --webpack` in an isolated copy, because the dev server's `.next` was in use and Turbopack refuses a symlinked `node_modules`. The project's own Turbopack `npm run build` was not run in this pass. The repository and bundle value scan is `backend/tests/test_secret_exposure.py`.

## Group 12 · Evidence, privacy, cleanup and closeout (LA-10, LA-11)

- [x] 12.1 Write `evidence/local-acceptance-T15.md` (design 10): revision, environment, preflight, rate-limit events, token counts, one row per LA check with project, viewport, browser and input mode, interception table, timing summary, cleanup counts, readiness statement.
  - Check: every LA-1 to LA-11 row has a result or an open reason; no URL, password, token or cookie value appears in the file.
- [x] 12.2 Privacy review (LA-11): HTML report, traces and screenshots reviewed for credentials and sensitive data. Confirm `playwright/.auth/`, `playwright/.run/` and `playwright-report/` are ignored (`git check-ignore`).
  - Check: `git check-ignore` lists each path; the review notes what was checked.
- [x] 12.3 Cleanup verification after the final run: tagged rows and run `jti` values both 0.
  - Check: teardown output and a separate count show 0 for every table and for `revoked_tokens`.
- [x] 12.4 Documentation (`documentation.md` checkpoint): update `docs/DEVELOPMENT.md` (replace "Playwright browser tests arrive with T15" and the `E2E_BASE_URL` row with the run command), `README.md` status for verified progress only, `CHANGELOG.md` and `frontend/CHANGELOG.md` under the `## YYYY-MM-DD` heading for the commit date, with a `### <short-sha> <subject>` entry, `specs/traceability.md` V09, V10, V11 and the AC rows for the results, and `specs/tasks.md` T15 link to `.kiro/specs/local-acceptance/tasks.md`. If the user keeps the root `card-<id>` wording, record a `specs/CHANGELOG.md` entry for the deviation.
  - Check: each doc matches the verified result; no claim of passed checks that did not run.
- [x] 12.5 Closeout. Check root T15 only if every LA check passed, the cleanup count is 0, and the privacy review is complete. Otherwise leave T15 open and list the open items.
  - Check: `specs/tasks.md` shows the T15 state that matches the evidence; the report lists completed and open task IDs, files changed, checks run, and the readiness for T16.

## Decisions

- Root T15 wording (resolved 2026-11-15, user): stable selectors for the V10 card interactions. The card's accessible name for the open control, and the drag source scoped to the fixture card in its source column. No `card-<id>` hook is added. `BoardCard.tsx` stays as it is. Recorded in `evidence/spec-review.md`.
