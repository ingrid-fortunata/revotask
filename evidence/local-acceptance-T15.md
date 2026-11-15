# Evidence: local acceptance (T15)

Status: **Complete locally (2026-11-15). Root T15 is checked.** This is local, Chromium-emulation evidence only. It makes no deployment claim and no real-device claim. Spec: `.kiro/specs/local-acceptance/`. Review record: `evidence/spec-review.md`. Findings: `evidence/implementation-review.md`.

## Revision and environment

| Item | Value |
| --- | --- |
| Revision | `09833f8` on branch `t15-local-acceptance`, **working tree not clean**: this change is uncommitted. `frontend/next-env.d.ts` also differs and is not part of the slice |
| Machine | macOS (Darwin), local |
| Versions | Node v24.22.1, Python 3.14.5, Flask 3.1.3, SQLAlchemy 2.1.8, Next.js 16.4.6, Playwright 1.64.1, Chromium Headless Shell 156 (Playwright build), `psql` 16.14 |
| Database | `revotask_test` on the local host, schema `revotask`, Alembic at head (`a265fb5e7047`). The database name ends in `_test` |
| API | Native Flask (`flask --app app:create_app run --port 5001`) with `DATABASE_URL` set to the test database, rate limits on |
| Frontend | Next.js dev server at `http://localhost:3000` |
| Browser | Chromium only, device emulation. No real phone, no on-screen keyboard (open for T16) |

**Environment change.** Port 5001 was held by the Compose backend (`revotask-backend-1`, dev database). Option (a) of `evidence/spec-review.md` was taken for the run: the container was stopped (`docker compose stop backend`), native Flask ran on 5001 against the test database, and the container is started again after the run.

## Preflight (design 3)

| Step | Result |
| --- | --- |
| 1 `psql` | Pass, `/opt/homebrew/bin/psql` |
| 2 test database | Pass, `revotask_test`, differs from the app database |
| 3 connectivity | Pass, `select 1` returned 1 |
| 4 services | Pass, Flask health 200, Next `/login` 200 |
| 5 one listener | Pass, one listener on 5001 (native Python process) |
| 6 database proof | Pass, 2 backends of the Flask pid, all in `revotask_test` |
| Negative control | Pass (as designed): native Flask on the dev database (port 5003) stopped the proof and wrote nothing. Recorded 2026-11-15 in `evidence/spec-review.md` |
| Token spike (gate C, task 2.3) | Pass. E30 with the token of a deleted user returned 401 (`e2e/token-spike.live.unit.ts`) |

## Commands and results

| Check | Command | Result |
| --- | --- | --- |
| LA-1 backend | `cd backend && pytest -q` | 2058 passed, 1 skipped (the deliberate E05 skip), `ruff check .` and `ruff format --check .` clean |
| LA-1 frontend | `cd frontend && npx vitest run`; `npm run lint`; `npm run typecheck` | 98 files, 2039 passed; lint and typecheck clean |
| Harness unit tests | `npm run e2e:unit` | 17 passed, 4 skipped (the live-only checks run on request) |
| LA-2 to LA-8 | `cd frontend && npx playwright test` | **54 passed, 0 failed** in about 1 minute (23 desktop, 10 viewport-320, 11 mobile-375, 10 viewport-768) |
| LA-9 | See below | Pass |

## One row per check

| Check | Test or command | Project, viewport, input | Result |
| --- | --- | --- | --- |
| LA-1 | pytest, Vitest | not a browser run | Pass |
| LA-2a | `auth › valid login opens the dashboard` | desktop, 1280x800, mouse and keyboard | Pass |
| LA-2b | `auth › invalid credentials show one generic message` | desktop | Pass (one generic message, exact text asserted) |
| LA-2c | `auth › unauthenticated visit to a private route redirects to login` | desktop, empty storage state | Pass |
| LA-2d | `auth › private route after logout redirects to login, and the revoked token is refused` | desktop | Pass (E30 with the old token: 401) |
| LA-3 | `boards-membership › create, open, add member, remove member, delete board` | desktop | Pass. The removed member and the deleted board both show "Board not found" |
| LA-3 | `boards-membership › an unregistered email shows USER_NOT_FOUND to the admin` | desktop | Pass, the error is on the email field |
| LA-4 | `kanban › eight-step journey with dragTo and reload` | desktop | Pass, real `dragTo()` onto `dropzone-<columnId>-end`, `page.reload()`, no `page.route` |
| LA-4 | `kanban › core flow with Move button at 375 px` | mobile-375, 375x812, touch emulation | Pass, Move dialog, reload |
| LA-5 | `comments › add, edit, delete a comment, then reload (owner)` | desktop | Pass |
| LA-5 | `comments › a second user cannot edit or delete the author's comment` | desktop | Pass, no controls in the UI, PATCH and DELETE with the member's token both 403 |
| LA-6a | `kanban-rollback › stale version shows 409 and refetches` | desktop | Pass, interception none |
| LA-6b | `kanban-rollback › forced 500 restores prior order` | desktop | Pass, interception `fulfill 500` |
| LA-6c | `kanban-rollback › uncertain outcome refetches the canonical board` | desktop | Pass, interception `forward then abort`, position version rose by exactly 1 |
| LA-7 | `timing › 30 sequential E07 requests, warm` | desktop, Node client to Flask | Pass, p95 7.1 ms against 800 ms (see below) |
| LA-8 | `mobile › route and dialog matrix` | all four projects | Pass, 40 of 40 rows (see below) |
| LA-9 | see below | not a browser run | Pass |
| LA-10 | this file | | Written |
| LA-11 | privacy review, see below | | Pass |

## Interception table (LA-6)

| Test | Interception | Observed |
| --- | --- | --- |
| 6a stale version | none: a second browser context moved the card first and its 200 was awaited | The owner's PATCH returned 409 (asserted on the response), the conflict feedback showed, the refetch showed the server order |
| 6b forced 500 | `page.route('**/api/cards/*/position')` fulfills 500 with the standard envelope | Feedback shown, the card stayed in Source, the database order was unchanged |
| 6c uncertain outcome | same route: `route.fetch()` then `route.abort('timedout')` | The refetch placed the card in Destination, the database position version rose by 1 |

The route pattern matched in 6b and 6c (each test passes only if it matches). No other test uses `page.route`.

## Timing (LA-7)

Local, warm, Flask direct, not deployed. Fixture: 1 board, 3 columns, 100 cards. Warm-up 5, measured 30, sequential. Nearest-rank p95 is the 29th sorted value: **7.1 ms** (max 11 ms). Target 800 ms. All 30 raw values and the environment are in `evidence/local-acceptance-T15-timing.json`. A p95 this low reflects a loopback call on a small database with a warm process. It says nothing about a deployed service.

## Mobile matrix (LA-8)

`evidence/local-acceptance-T15-mobile.json`: 40 rows (10 per project), 40 pass. Per project: `/login`, `/register`, `/`, `/my-tasks`, `/profile`, `/boards/[id]` (with its Move control), and the dialogs Card details, Move card, board analytics and notification bell panel. Each row records `scrollWidth - clientWidth` (must be 0 or less), every interactive box under 44 x 44 CSS px, and every text input under 16 px. For a dialog, only the dialog is audited, after its open transition has finished. Each dialog closes with Escape and focus returns to its trigger. Projects: desktop 1280x800 (mouse and keyboard), 768x1024, 375x812 and 320x800 (Chromium touch emulation). The Kanban region is the only element allowed to scroll sideways on the board page. This is emulation, not a real device.

## Security and privacy (LA-9, LA-11)

| Check | Command or source | Result |
| --- | --- | --- |
| Origin: valid, cross-origin, absent | `frontend/lib/server/origin.test.ts` and the Route Handler tests in the Vitest run | Pass (absent, `null`, empty and every mismatch are refused) |
| `no-store` on private responses | `backend/tests/test_response_headers.py`, `test_kanban_access.py` and the other access tests in the pytest run | Pass |
| Bundle sentinel | `next build --webpack` in an isolated copy of `frontend/` (so the running dev server's `.next` was untouched), with `API_BASE_URL` and `APP_ORIGIN` set to a random sentinel | Sentinel found in 0 files under `.next/static` and in 0 files under all of `.next`. Control: known page text ("Create board") found in 1 file of `.next/static` |
| Repository and bundle secret scan | `backend/tests/test_secret_exposure.py` (3 tests) | Pass: the real JWT key and database passwords are in no tracked file and no file of the existing `frontend/.next/static`. Only the three `.env.example` files are tracked |
| Artifact hygiene | `git check-ignore -v` | `frontend/playwright/.auth/`, `frontend/playwright/.run/`, `frontend/playwright-report/` and `frontend/test-results/` are ignored |
| Report review (LA-11) | Search of `frontend/playwright-report/` (1 file, 548 KB) | No JWT-shaped string, no `Bearer` value, no run password, no real secret. The report holds no screenshot or trace because no test failed. The two evidence JSON files and this file hold no real secret |

The build ran with Turbopack disabled (`--webpack`) because Turbopack refuses a symlinked `node_modules` in the copy. The bundle result is for the webpack build. The project's own `npm run build` (Turbopack) was not run in this pass.

## Rate-limit events and tokens

No `429` occurred in any run, so the setup retry never fired. Each full run registers 2 accounts and logs the owner in four times (setup, LA-2a, LA-2b, LA-2d) and the member once, within the limit of 5 per minute per email. The run file holds 4 `jti` values per run (owner setup, member setup, LA-2a, LA-2d). No token value is written to any file.

## Cleanup (tasks 2.4, 2.5, 12.3)

Each run's teardown deletes its rows and counts what is left. The final full run (`eefd26f5`) printed 0 for `users`, `boards`, `board_columns`, `cards`, `card_comments`, `board_members`, `board_events`, `notifications` and `revoked_tokens`. A separate count afterwards found 0 rows in every one of those tables of `revotask_test`.

One run (`5942ff91`) was killed by a command timeout during development and left 2 users and 12 boards. It was found by the separate sweep and removed with `LA_CLEANUP_RUN=5942ff91 npm run e2e:cleanup`, which verified 0. A forced `psql` failure (`PSQL=/usr/bin/false`) exits non-zero with a redacted message.

## Defects found while running

| ID | Where | Result |
| --- | --- | --- |
| F-T15-01 | `MembersPanel` "Members (n)" button, 40 x 44 px at every width | Fixed: `min-w-11 justify-center`. RTL regression test added |
| F-T15-02 | `AppHeader` brand link, 28 x 44 px at 400 px and below, where only the glyph shows | Fixed: `min-w-11`. RTL assertion added |

Both came from the LA-8 audit and are recorded in `evidence/implementation-review.md`. The first live run also found several faults in the test code itself (the create-board dialog, the members dialog, an ambiguous "Save" name, the member list read before the member was added, an assertion that ran before the move, a stale-version test that did not wait for the first move to commit, and an audit that read a box during the dialog's open transition). They were fixed in the specs, not the product.

## Open items and limits

- Real phone and on-screen keyboard: not done, open for T16.
- Chromium only. WebKit and Firefox are out of scope (decision 2).
- The Playwright suite runs against the dev server (`next dev`). The production build was checked for secrets only.
- Live deployment, the deployed timing sample, live Playwright and the sanitized public report belong to T16.

## Readiness statement

Local acceptance T15 passed: LA-1 to LA-11 each have a recorded result, the cleanup count is 0, and the privacy review is complete. The local app is ready for the publishing steps in T16. No deployment, live-service or real-device claim is made.
