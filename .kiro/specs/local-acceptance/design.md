# Design: local-acceptance (T15)

**Status:** Revision 2, approved 2026-11-15 (user, in chat). Revision 1 was approved by the user, with changes 1 to 6 applied in this revision (the user's review of 2026-11-15). No dependency is installed and no code is written in this phase.

**Root task:** T15. Requirements: [requirements.md](requirements.md).

## 1. Approach

T15 runs the whole local stack and records the result. It adds a Playwright harness, the test specs, a preflight, cleanup, and one evidence file. It changes no product behavior. The product code change is zero (section 6).

The stack under test is real:

- Flask on `127.0.0.1:5001`, native (`flask --app app:create_app run --port 5001`), per `docs/DEVELOPMENT.md`. A single process listens on the port.
- Next.js on `http://localhost:3000` (`npm run dev`). The browser origin must be `localhost`, because `APP_ORIGIN` is compared exactly.
- PostgreSQL test database named by `TEST_DATABASE_URL` (its name must end in `_test`), schema `revotask` (`backend/app/config.py:17`).
- Rate limits stay on (section 4).

Playwright only runs tests. It starts nothing.

## 2. Files

| Path | Purpose |
|---|---|
| `frontend/package.json` | Adds `@playwright/test` as an exact-pinned devDependency and a script `"e2e": "playwright test"`. Lockfile updated in the same change. |
| `frontend/playwright.config.ts` | Base URL from `E2E_BASE_URL` (default `http://localhost:3000`), `workers: 1`, `fullyParallel: false`, `globalSetup` and `globalTeardown`, HTML reporter to `playwright-report/`, trace and screenshot on failure only. Projects in section 5. |
| `frontend/e2e/preflight.ts` | Global setup. Runs the checks in section 3 in order. Nothing is written before section 3 passes. |
| `frontend/e2e/support/psql.ts` | Resolves the `psql` executable (section 3.1). Parses `TEST_DATABASE_URL` into libpq environment variables for the child process. Runs read-only and cleanup SQL. Never puts the URL or password in argv. |
| `frontend/e2e/support/run.ts` | Run tag, unique names and emails, password generator, typed API helpers, and the one-retry helper for `429` used only in setup (section 4). |
| `frontend/e2e/support/tokens.ts` | Reads the `jti` claim from a session cookie value by decoding the payload without verifying it. Writes only `jti` and `expires_at` to the run file. Never writes or prints the token. |
| `frontend/e2e/global-teardown.ts` | Runs cleanup (section 4) and the post-count. Fails the run if any row is left. |
| `frontend/e2e/auth.spec.ts` | LA-2, V09. |
| `frontend/e2e/boards-membership.spec.ts` | LA-3. |
| `frontend/e2e/kanban.spec.ts` | LA-4. Desktop project uses `dragTo()` and the Move button. Mobile-375 project uses the Move button only. |
| `frontend/e2e/kanban-rollback.spec.ts` | LA-6. The only file that uses `page.route`. |
| `frontend/e2e/comments.spec.ts` | LA-5. |
| `frontend/e2e/mobile.spec.ts` | LA-8 route and dialog matrix. |
| `frontend/e2e/timing.spec.ts` | LA-7. |
| `frontend/scripts/e2e-cleanup.ts` | Manual cleanup for one run tag, `npm run e2e:cleanup -- <runId>`. Uses the same SQL as teardown. |
| `playwright/.run/` | Run-local files (`<runId>.json`, `jti` and `expires_at` only). Added to `frontend/.gitignore`. |
| `evidence/local-acceptance-T15.md` | LA-10 record. |
| `evidence/local-acceptance-T15-timing.json` | Raw timings from LA-7. |
| `evidence/local-acceptance-T15-mobile.json` | Matrix results from LA-8, one row per route, dialog, project and width. |

`playwright/.auth/` and `playwright-report/` are already ignored. `test-results/` and `playwright/.run/` are added to `frontend/.gitignore` if not already ignored.

## 3. Preflight (read-only until section 3.6 passes)

Each step prints one line with its result. Nothing that writes or sends a mutating request runs before step 3.6 passes. Output never includes the URL, the password, a token or a cookie value.

1. **Resolve `psql`.** Use `PSQL` from the environment when it is set. It must be an absolute path to an executable file. Otherwise use `command -v psql` on `PATH`. If neither works, stop with `psql is required: set PSQL or add psql to PATH`. Record the path and `psql --version`.
2. **Parse the test database.** Read `TEST_DATABASE_URL` from the environment or `backend/.env`. Parse it into `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE`, set only in the child process environment. Stop unless `PGDATABASE` ends in `_test` and differs from the database name in `DATABASE_URL` in `backend/.env`. Record only the database name and host.
3. **Connectivity from the run shell.** Run `psql -X -w -tA -c 'select 1'` with those variables. It must print `1`. This is a read-only check.
4. **Services.** `GET http://127.0.0.1:5001/api/health` returns 200 with `{"data":{"status":"ok"}}`. `GET ${E2E_BASE_URL}/login` returns 200.
5. **One listener.** `lsof -nP -iTCP:5001 -sTCP:LISTEN -t` must return exactly one PID. Record the PID and the process name. If `lsof` is unavailable or the count is not 1, stop.
6. **Read-only proof that the running app uses the test database.**
   - Send one unauthenticated `GET /api/health`. It runs the app's bounded database query and opens or reuses a pooled connection.
   - `lsof -nP -a -p <pid> -iTCP -sTCP:ESTABLISHED -F n` lists the app's established TCP connections. Keep the local ports whose remote port is `PGPORT` and whose remote host is the `PGHOST` address.
   - `psql -X -tA -c "select pid, datname, client_port from pg_stat_activity where client_port in (<ports>)"` returns the backends that hold those connections. The query only reads.
   - Pass when at least one backend matches, every matched `datname` equals the test database name, and the backend list is not empty. Otherwise stop with `running Flask is not connected to the test database; nothing was written`.
   - If `pg_stat_activity` hides `client_port` or `datname` for the run role, the proof cannot be made and the run stops.
   - Docker Compose runs are not covered. A container's connection is not visible to `lsof` on the host. The run then stops and the native process is used instead.

The proof uses the app's own connection. It needs no product endpoint. It does not read the app's environment, so no secret is read or logged.

Evidence records the PID, the process name, the matched database name, the count of matched backends, and the local port numbers. It does not record the host, the user or the password.

Negative control (task 1.6): run Flask with `DATABASE_URL` pointing at a different, non-test database. The preflight must stop at step 6 and write nothing. Record the control in evidence.

## 4. Fixtures, budget, tokens and cleanup

**Run tag.** `runId = randomBytes(4).toString('hex')`. Every name and email carries it:

- Emails: `la-<runId>-<role>@acceptance.example.test`, where `role` is `owner`, `member` or `removed`.
- Titles: `LA <runId> <kind> <n>`.
- Passwords: generated per run, held in memory, never written.

**Rate-limit budget (approved).** The limits are on. Per run:

- Registrations: 2 (owner and member), within the register limit of 5 per minute.
- Owner logins: 3. Setup login through the Next login route (its cookie is saved to storage state), the LA-2a UI login, and the LA-2b wrong-password attempt. The limit is 5 per minute per email.
- Member logins: 1, in setup.
- Logins from the spike in task 2.3 are counted in the same window. Spike accounts use a separate run tag and are deleted with the run.

**One bounded retry, setup only.** An unexpected `429` on a setup request waits for `Retry-After` seconds when the header is present, or 60 seconds when it is not. The wait is capped at 70 seconds. The helper retries once and prints `rate limited on <endpoint>, retry after <n> s`. A second `429` stops the run. The helper is used only by `preflight.ts` and the seeding helpers, never inside a test body.

**Intentional rate-limit assertions.** No LA check asserts `429`. If a future check does, it reads the first response only and does not use the retry helper.

**Token tracking.** Every token the run receives is a session cookie value, whose payload carries the `jti` claim. `support/tokens.ts` decodes the payload segment (base64url JSON) and reads `jti` and `exp`. It does not verify the signature, and it writes only `jti` and `expires_at` to `playwright/.run/<runId>.json`. A raw token never reaches a file, a log or evidence. The run captures the `jti` of:

- the setup session of `owner` and of `member`;
- the owner's LA-2a session;
- the owner's session immediately before the LA-2d logout click (the session that the logout revokes).

**Cleanup order** (one `psql` transaction, run by `global-teardown.ts`, or by `npm run e2e:cleanup -- <runId>`; a second run is a no-op):

1. `notifications` where `recipient_id` or `actor_id` is a run user, or `board_id` is a run board.
2. `board_events` where `board_id` is a run board.
3. `card_comments` where `author_id` is a run user or the card is on a run board.
4. `cards` on a run board (joined through `board_columns`).
5. `board_columns` of run boards.
6. `board_members` of run boards.
7. `boards` owned by run users.
8. `users` whose email matches `la-<runId>-%@acceptance.example.test`.
9. `revotask.revoked_tokens` where `jti` is in the run file. Only these rows are removed.

Step 9 comes after step 8 on purpose. Users are removed first, so the token of a removed user must be refused by the app. Task 2.3 proves this before cleanup relies on it.

**Verification after cleanup.** The teardown counts, and prints, the rows that still carry the run tag (all tables in steps 1 to 8), and counts the run `jti` values still present in `revoked_tokens`. Each count must be 0. A non-zero count, or any `psql` error, is printed with the run tag and the counts. The run exits non-zero. LA-10 records `cleanup failed` with those counts.

**Ownership is exact.** Every record belongs to a run user or to a board owned by one, and every token is in the run file. So an isolated database is not needed, as long as task 2.3 passes. If task 2.3 fails, the design changes to an isolated disposable test database for each run, and this document is revised before tasks continue.

**Browser-created records.** The browser creates boards, columns, cards and comments as the run users. The tag covers them. The teardown does not depend on a spec's own bookkeeping, so an assertion failure cannot skip it.

## 5. Playwright projects, selectors and test mapping

| Project | Viewport | Browser | Input mode | Specs |
|---|---|---|---|---|
| `desktop` | 1280 × 800 | Chromium | Mouse and keyboard | auth, boards-membership, kanban (`dragTo()` and Move), kanban-rollback, comments, timing, mobile (1280 matrix) |
| `viewport-320` | 320 × 800 | Chromium | Touch emulation (`isMobile`, `hasTouch`) | mobile |
| `mobile-375` | 375 × 812 | Chromium | Touch emulation (`isMobile`, `hasTouch`) | kanban (Move button only, no drag), mobile |
| `viewport-768` | 768 × 1024 | Chromium | Touch emulation (`isMobile`, `hasTouch`) | mobile |

`workers: 1` in every project, so the shared database and the limit budget never race. Each evidence row records project, viewport, browser and input mode. The desktop drag journey is recorded separately from touch emulation. Real-device and on-screen-keyboard checks stay open for T16 (decision 5).

**Selectors (verified in the repository).**

| Target | Selector | Source |
|---|---|---|
| Card open control | `getByRole('button', { name: 'Open <title>' })` | `frontend/components/kanban/BoardCard.tsx`, `aria-label={`Open ${card.title}`}`. Exists, so no change. |
| Move control | `getByRole('button', { name: 'Move <title>' })` | `BoardCard.tsx`, `aria-label={`Move ${card.title}`}`. |
| Drop zones | `[data-testid="dropzone-<columnId>-end"]`, `[data-testid="dropzone-<columnId>-before-<cardId>"]` | `frontend/hooks/useDragAndDrop.ts:48`. |
| Card detail dialog | `getByRole('dialog', { name: 'Card details' })` | `CardDetailModal.tsx:82`. |
| Card element | Located by its title through the open control above. Unique titles make the locator stable. | No `card-<id>` hook is added (section 6). |

**Move route (verified).** The browser sends `PATCH /api/cards/<id>/position` to its own origin (`frontend/lib/apiClient.ts:44`, `frontend/hooks/useKanbanBoard.ts:266`). The Next Route Handler at `frontend/app/api/cards/[id]/position/route.ts` forwards it to Flask E20. Interception matches `**/api/cards/*/position` on `http://localhost:3000`. Task 7.2 confirms the match with a spike request before the interception tests run.

**Test mapping.**

| Requirement | Named test | Evidence |
|---|---|---|
| LA-2a V09 valid login | `auth › valid login opens the dashboard` | Result line in LA-10 |
| LA-2b V09 invalid login | `auth › invalid credentials show one generic message` (exact text) | As above |
| LA-2c V09 private route when signed out | `auth › unauthenticated visit to a private route redirects to login` | As above |
| LA-2d V09 private route after logout | `auth › private route after logout redirects to login, and the revoked token is refused` | As above |
| LA-3 membership journey | `boards-membership › create, open, add member, remove member, delete board` and `… unregistered email shows USER_NOT_FOUND` | As above |
| LA-4 V10 Kanban journey | `kanban › eight-step journey with dragTo and reload` (desktop) and `kanban › core flow with Move button` (mobile-375) | As above |
| LA-4 carried steps | `kanban › edit card and assign member` and `kanban › delete card`, inside the journey | As above |
| LA-5 comments journey | `comments › add, edit, delete, reload` and `comments › member cannot edit or delete author's comment` | As above |
| LA-6a stale version (real 409) | `kanban-rollback › stale version shows 409 and refetches` | Interception: none |
| LA-6b forced 500 | `kanban-rollback › forced 500 restores prior order` | Interception: `fulfill 500` |
| LA-6c uncertain outcome | `kanban-rollback › uncertain outcome refetches canonical board` | Interception: `forward then abort` |
| LA-7 timing | `timing › 30 sequential E07 requests, warm` | Raw JSON, p95 |
| LA-8 matrix | `mobile › route and dialog matrix` on each project | Matrix JSON |

**LA-6a detail.** The owner opens the board and then the member, in a second browser context, moves the same card through the UI. The owner's move then carries the old `expected_position_version`. The server returns 409, the UI shows the conflict message, and the board refetch shows the server order. No interception is used.

**LA-6b detail.** `page.route('**/api/cards/*/position', …)` fulfills the browser request with 500 and the standard error envelope, without forwarding. The server is unchanged. The test asserts the prior order is restored and feedback is shown.

**LA-6c detail.** `page.route('**/api/cards/*/position', …)` forwards with `route.fetch()`, so the server commits the move, then calls `route.abort('timedout')`. The browser sees a network failure. The test asserts the refetch shows the committed order and that the position version rose by exactly 1.

No other test uses `page.route`.

## 6. Product changes

None. The card open name already exists (`Open <title>`), so no accessible name is added. No `data-testid="card-<id>"` is added, because V10 is satisfied by the accessible card title and the existing drop-zone test IDs.

**Root wording (resolved 2026-11-15).** `specs/tasks.md` T15 now reads: stable selectors for the V10 card interactions, the card's accessible name for the open control, and the drag source scoped to the fixture card in its source column. The `card-<id>` test IDs are dropped. `BoardCard.tsx` stays as it is. Recorded in `evidence/spec-review.md`.

If a test shows a product defect, the test stays failing, T15 stays open, and the defect is recorded with its reason. The fix goes through its own change.

## 7. Timing (LA-7)

- Setup logs `member` in and reads the session cookie. `owner` creates a board with 3 columns and 100 cards through the API, under the run tag.
- Warm-up: 5 E07 requests, not counted.
- Measured: 30 sequential E07 requests from the test process to Flask. Each is timed with `performance.now()` around the `fetch`. Sort the 30 values. p95 is the 29th sorted value (nearest rank). Target: ≤ 800 ms.
- Evidence: machine, Node, Python, Flask and Playwright versions, fixture size, all 30 raw values, p95, and the statement `local, warm, Flask direct, not deployed`.

## 8. Mobile matrix (LA-8)

`mobile.spec.ts` visits each route and opens each dialog at the project's width. For each case it records:

- `scrollWidth` and `clientWidth` of `document.documentElement`. Pass when `scrollWidth ≤ clientWidth`. On `/boards/[id]`, the Kanban scroll container is the only element allowed to be wider than the viewport, and the page itself must not scroll sideways.
- Each visible interactive element (button, link, input, select, textarea, card open and Move controls): bounding box at least 44 × 44 px. Failures list the accessible name.
- Each text input: computed `font-size` at least 16 px.
- At 375 px on the board page: each card's Move control is reachable and opens the Move dialog.

Routes: `/login`, `/register`, `/` (signed in), `/boards/[id]`, `/my-tasks`, `/profile`. Dialogs: `Card details`, the board analytics dialog, the notification bell panel, the Move dialog.

Each evidence row records project, viewport, browser and input mode. Results are Chromium touch emulation, not a real device. Real phone and on-screen keyboard stay open for T16.

## 9. Security and privacy checks (LA-9)

1. `pytest` for the backend with `TEST_DATABASE_URL`, covering Origin handling and `no-store` on private responses.
2. `npm run test` (Vitest), covering the Next Route Handlers that enforce Origin.
3. Bundle scan: `npm run build`, then search `frontend/.next/static` for the sentinel set during the build. No match.
4. Repository scan: `git grep` for the values of `JWT_SECRET_KEY` and the database password from the local env files. No match.

If a command cannot run, LA-9 stays open with the reason.

## 10. Evidence and LA-10 record

`evidence/local-acceptance-T15.md`, filled from actual output:

1. Revision: `git rev-parse HEAD`, and whether the tree is clean. The existing change to `frontend/next-env.d.ts` is listed.
2. Environment: machine, Node, Python, Flask, Next.js, Playwright, Chromium and `psql` versions. Database name and host only.
3. Preflight: each step's result, the `psql` path, the PID and process name, the matched database name, the count of matched backends, and the negative-control result.
4. Rate-limit events: each retry, its endpoint and wait. No credential.
5. Token tracking: the count of run `jti` values and the count removed. No token value.
6. One row per check (LA-1 to LA-11): command, project, viewport, browser, input mode, result, and the reason for any fail or open item.
7. Interception table for LA-6.
8. Timing summary for LA-7.
9. Cleanup: counts before and after, for run tags and `jti` values. Any failure.
10. Readiness statement. T15 is checked only if every required check passed and cleanup verified zero rows. Otherwise T15 stays open, and the statement lists what remains.

The HTML report, traces and screenshots are reviewed for credentials and sensitive data (LA-11) before any part of them is committed. Only the Markdown record and the two JSON files are committed by default.

## 11. Order of implementation

The implementation runs in this order, so each step can be checked before the next:

1. Tooling and the read-only preflight (tasks group 1). No data is written.
2. Fixtures, token tracking, the blocking token spike and cleanup (group 2).
3. Global setup (group 3).
4. Auth, boards-membership, Kanban desktop and mobile-375, rollback, comments (groups 4 to 8).
5. Timing and mobile matrix (groups 9 and 10).
6. Integration suites and security checks (group 11).
7. Evidence, privacy, cleanup verification and documentation (group 12).

## 12. Open items

- Task 1.6 (read-only connection proof) must pass before any writing task starts. It depends on `lsof` and on `pg_stat_activity` visibility for the run role.
- Task 2.3 (deleted-user token spike) is blocking. If a token of a removed user is still accepted, the design changes to an isolated disposable test database.
- The `card-<id>` wording in root T15 is open for the user's decision (section 6).
- Docker Compose runs are not covered by the proof and stop the run.

## 13. Decisions and assumptions

| Topic | Decision |
|---|---|
| Dependency | `@playwright/test`, exact pin, at least two weeks old. No runtime dependency. Lockfile committed with the change. |
| Browser | Chromium only, in every project. |
| Servers | Started manually. Playwright starts none. |
| Database proof | Read-only: the running Flask process's established connections, matched in `pg_stat_activity`, must all be to the test database. No marker write. |
| `psql` | Resolved from `PSQL` or `PATH`. Connectivity checked in preflight. Credentials passed by environment, never in argv. |
| Rate limits | Left on. 2 registrations and 4 logins per run (owner 3, member 1). One bounded retry on unexpected 429 in setup only. |
| Token cleanup | Exact `jti` values tracked by the run and removed after users. Verified by a blocking spike (2.3). Isolated database is the fallback. |
| Interception | LA-6b and LA-6c only. LA-6a uses a real stale version from a second session. |
| Cleanup | Hard delete by run tag and tracked `jti` in one transaction, with post-counts of 0. |
| Product change | None. |
| Selectors | Accessible names and existing drop-zone test IDs. No `card-<id>` hook unless the user keeps the root wording. |
| Viewport coverage | Chromium only. Desktop mouse, and touch emulation at 320, 375 and 768 px. Recorded per project. |
| Real device and on-screen keyboard | Not in T15. Open for T16. |
| Timing | Local, warm, Flask direct. Not a deployment claim. |
