# Evidence: boards-membership (T05 and T06)

Log for the boards and membership slice. Entries are added as each task runs. Only observed results are recorded here.

## Task 1.1: Auth regression baseline before the validator move

- Captured: 2026-11-13T08:51:50Z (UTC), from `backend/`.
- Environment: Python 3.14.5, pytest 9.2.0, backend virtualenv `backend/.venv`. PostgreSQL at 127.0.0.1:5432 accepted connections (`pg_isready`). `TEST_DATABASE_URL` is defined in `backend/.env`; its value is not recorded here.
- No source code or test file was edited for this entry.

### Commands and results

1. Auth tests (registration, login, logout, password, guard and schema tests, including the modules that read `specs/fixtures/auth-field-cases.json` through `backend/tests/auth_cases.py`):

   ```
   .venv/bin/python -m pytest tests/test_auth_guard.py tests/test_auth_login.py tests/test_auth_logout.py tests/test_auth_passwords.py tests/test_auth_register.py tests/test_auth_schema.py -v -p no:cacheprovider
   ```

   Result: **202 passed**, 0 failed, 0 skipped, 0 errors (exit code 0).
   Modules that load `auth-field-cases.json` through `auth_cases.py`: `test_auth_login.py`, `test_auth_register.py`, `test_auth_schema.py`.

2. Full backend suite:

   ```
   .venv/bin/python -m pytest -q -rfEs -p no:cacheprovider
   ```

   Result: **431 passed**, 0 failed, 0 skipped, 0 errors (exit code 0).

### Notes

- The auth subset is part of the full suite (202 of 431).
- This is the baseline for tasks 1.2 and 1.3. The same two commands must be re-run after the validator move, with no test edited, and the counts compared.

## Task 1.3: Auth regression after the validator move

- Captured: 2026-11-13T08:56:26Z (UTC), from `backend/`, using the same interpreter and virtualenv as task 1.1 (`backend/.venv`, Python 3.14.5, pytest 9.2.0).
- No source code or test file was edited for this entry.

### Commands and results

1. Auth tests (same command as task 1.1):

   ```
   .venv/bin/python -m pytest tests/test_auth_guard.py tests/test_auth_login.py tests/test_auth_logout.py tests/test_auth_passwords.py tests/test_auth_register.py tests/test_auth_schema.py -v -p no:cacheprovider
   ```

   Result: **202 passed** in 6.03s, 0 failed, 0 skipped, 0 errors (exit code 0).

2. Full backend suite (same command as task 1.1):

   ```
   .venv/bin/python -m pytest -q -rfEs -p no:cacheprovider
   ```

   Result: **431 passed** in 10.82s, 0 failed, 0 skipped, 0 errors (exit code 0).

### Comparison with the baseline (task 1.1)

| Run         | Baseline (1.1) | After move (1.3) | Match |
| ----------- | -------------- | ---------------- | ----- |
| Auth subset | 202 passed     | 202 passed       | Yes   |
| Full suite  | 431 passed     | 431 passed       | Yes   |

No test failed, so no failure was investigated and nothing was fixed.

### Test files unchanged

- `git diff --stat HEAD -- backend/tests` produced no output, so no file under `backend/tests/` differs from the committed version.
- `git status --short -- backend` lists no untracked or modified file under `backend/tests/`.
- Files changed by the move: `backend/app/validation.py`, `backend/app/blueprints/auth/schema.py` and `backend/app/config.py` (the `EMAIL_MAX` constant moved to `validation.py`).

### Concurrent changes observed

- `backend/app/exceptions.py` has 36 added lines and the untracked directory `backend/app/blueprints/boards/` exists. These come from the concurrent tasks and were not reviewed or changed in this task. The auth tests and the full suite still passed with them present.

## Task 3: Backend checkpoint

- Captured: 2026-11-13T09:29:54Z (UTC), from `backend/`, using `backend/.venv` (Python 3.14.5, pytest 9.2.0, ruff 0.17.5).
- No source code or test file was edited for this entry. The test database is the one configured in `backend/.env`; its value is not recorded here.

### Tooling found in the backend config

- Lint and format: Ruff, configured in `backend/pyproject.toml` (`[tool.ruff]`, rules E, W, F, I, B, BLE; line length 100). Ruff 0.17.5 is pinned in `backend/requirements-dev.txt`.
- Tests: pytest, configured in `backend/pyproject.toml` (`[tool.pytest.ini_options]`, `testpaths = ["tests"]`, `addopts = "-ra --strict-markers"`). pytest 9.2.0 is pinned in `backend/requirements-dev.txt`.
- Type checking: none. No mypy or pyright setting exists in `backend/pyproject.toml`, `backend/requirements-dev.txt`, or any other backend file. No Makefile, `setup.cfg`, `tox.ini` or CI workflow exists in the repository. No type-check command was run.

### Commands and results

1. Lint:

   ```
   .venv/bin/ruff check .
   ```

   Result: **All checks passed!** (exit code 0).

2. Format check:

   ```
   .venv/bin/ruff format --check .
   ```

   Result: **84 files already formatted** (exit code 0).

3. Full backend suite:

   ```
   .venv/bin/python -m pytest -q -rfEs -p no:cacheprovider
   ```

   Result: **1146 passed, 1 skipped**, 0 failed, 0 errors (exit code 0, 20.65s).

   Skipped test (declared in the test code, not an environment skip):
   - `tests/test_boards_properties_writes.py:671`: `E05 list` with the `error` outcome. The skip reason is "E05 has no error response for an authenticated caller (Property 12 auth test)". The case is excluded on purpose because E05 has no such error response.

4. Auth subset, for the baseline comparison:

   ```
   .venv/bin/python -m pytest tests/test_auth_guard.py tests/test_auth_login.py tests/test_auth_logout.py tests/test_auth_passwords.py tests/test_auth_register.py tests/test_auth_schema.py -q -rfEs -p no:cacheprovider
   ```

   Result: **202 passed**, 0 failed, 0 skipped, 0 errors (exit code 0, 4.08s).

### Comparison with the earlier baseline

| Run         | Baseline before boards slice (1.1) | Task 1.3 after validator move | Task 3 checkpoint      | Change vs. baseline     |
| ----------- | ---------------------------------- | ----------------------------- | ---------------------- | ----------------------- |
| Auth subset | 202 passed                         | 202 passed                    | 202 passed             | None                    |
| Full suite  | 431 passed                         | 431 passed                    | 1146 passed, 1 skipped | +715 passed, +1 skipped |

The auth subset is unchanged. The full-suite increase comes from the boards and membership tests listed below.

### Test files added or changed by the slice

Changed existing files:

- `backend/tests/conftest.py` (modified)
- `backend/tests/test_factory.py` (modified)

New files:

- `backend/tests/boards_helpers.py` (`BoardTracker` and shared helpers, task 2.5)
- `backend/tests/test_boards_cleanup.py` (task 2.5)
- `backend/tests/test_boards_schema.py` (task 2.6)
- `backend/tests/test_boards_create_list.py` (task 2.7)
- `backend/tests/test_boards_detail.py` (task 2.7)
- `backend/tests/test_boards_update_delete.py` (task 2.8)
- `backend/tests/test_board_members.py` (task 2.9)
- `backend/tests/test_board_members_assignments.py` (task 2.10)
- `backend/tests/test_boards_access.py` (task 2.11)
- `backend/tests/test_boards_roles.py` (task 2.12)
- `backend/tests/test_boards_request_order.py` (task 2.13)
- `backend/tests/test_boards_atomicity.py` (task 2.14)
- `backend/tests/test_boards_properties_rules.py` (task 2.15, Properties 1–3)
- `backend/tests/test_boards_properties_reads.py` (task 2.16, Properties 4–7)
- `backend/tests/test_boards_properties_writes.py` (task 2.17, Properties 8–12)
- `backend/tests/test_boards_properties_scoping.py` (task 2.18, Properties 15–17)

Source files added or changed by the slice (from `git status`, not reviewed in this task): `backend/app/__init__.py`, `backend/app/blueprints/auth/schema.py`, `backend/app/config.py`, `backend/app/exceptions.py`, `backend/app/validation.py`, and the new directory `backend/app/blueprints/boards/`.

### Outcome

- Ruff lint: pass. Ruff format: pass. No type checker is configured, so no type check ran.
- pytest: 1146 passed, 0 failed, 1 skipped (a deliberate skip, see above). No failing test IDs, so nothing to triage.
- Auth regression: 202 passed, same as the baseline.
- Checkpoint status: the automated backend gates pass. Task 3 in `.kiro/specs/boards-membership/tasks.md` is still marked in progress. The orchestrator decides when to mark it complete.

## Task 8: Frontend checkpoint

- Captured at 16:47 local time (Vitest "Start at" 16:47:50), from `frontend/` unless noted. Node engine per `frontend/package.json`: `>=24.22.1 <25`.
- No source code or test file was edited for this entry. No dev server, backend or other long-running process was started.
- Script names come from `frontend/package.json`: `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), and `npx vitest run` (the `test` script runs the same command).

### Commands, exit codes and results

| #   | Command (cwd)                                                            | Exit code | Result                                                                                                    |
| --- | ------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------- |
| 1   | `npm run typecheck` (`frontend/`)                                        | 0         | `tsc --noEmit` completed with no diagnostics.                                                             |
| 2   | `npm run lint` (`frontend/`)                                             | 0         | `eslint .` printed no errors and no warnings.                                                             |
| 3   | `npx vitest run` (`frontend/`)                                           | 0         | Test Files **50 passed (50)**, Tests **950 passed (950)**, 0 failed, 0 skipped reported. Duration 10.57s. |
| 4   | `node --check evidence/boards-membership-mobile-measure.mjs` (repo root) | 0         | Syntax check passed, no output.                                                                           |

Each command ran alone in its own shell call, and the exit code was captured with `echo "EXIT=$?"`. Vitest output was also scanned for "failed" and "warn" and matched neither.

### Test file count

- 50 test files ran under Vitest (`Test Files 50`).

### Failures

- None. No failing file or test name to report.

### Warnings

- ESLint emitted no warnings, so there are no non-error lint warnings to report.

### Outcome

- Type check, lint, the full Vitest suite and the mobile script syntax check all pass with exit code 0.
- Checkpoint 8 gates pass on the automated checks. Browser and mobile verification remains task 7.2, which the user runs.

## Documentation status (tasks 9.1, 9.3 and 9.4)

Recorded at the documentation handoff. Earlier sections are unchanged. The commands for the results below are the ones in the Task 3 and Task 8 sections.

### Verified results used in the docs

- Backend: `ruff check` is clean. Full pytest: 1146 passed, 1 skipped. The skip is deliberate (see Task 3). Auth subset: 202 passed, the same as the baseline in Task 1.1. The validators moved to `backend/app/validation.py` and the auth regression is unchanged.
- Frontend: typecheck is clean, lint is clean, and Vitest runs 50 files and 950 tests, all passing.
- Container: the backend image was stale. It was rebuilt with `docker compose up -d --build backend`. The boards route now returns 401 without a token.

### AC04.2 status

AC04.2 (removal clears the removed user's active card assignments on that board only, in one transaction under the board lock) is verified only by these tests:

- `backend/tests/test_board_members_assignments.py` (3 tests, including the rollback test).
- `backend/tests/test_boards_properties_scoping.py`, Property 15.

It has not been checked in a browser.

### Pending verification

- Mobile measured check at 320, 375, 768 and 1280 px (script `evidence/boards-membership-mobile-measure.mjs`, task 7.1 and 7.2): not run.
- Browser checks of focus entry on Cancel, Tab containment, Escape without an API call and focus return on the confirmation dialogs (task 7.1): not run.
- Manual journey at 375 px (create board, open, add member, remove member, delete board): not run.
- Real-device checks: not performed.
- Reason: the frontend dev server could not start from the agent shell. No browser verification has run. The user runs the long-running commands for task 7.2.

### Risks and open questions

- Account enumeration: E11 returns `USER_NOT_FOUND` for an unregistered email, so a board Admin can learn whether an email is registered. Accepted for v1. Returned only after the Admin check. The per-admin E11 rate limit with shared storage is tracked in T16 before public release.
- Soft-deleted columns: E12 clears the removed user's assignments on cards whose column is on this board, even when that column is soft-deleted. The user has not decided this. It is an open question.
- Dashboard sort: new boards are sorted in JavaScript with `localeCompare`, while E05 uses database collation. The order may differ for mixed case or accents until refresh. Open, low risk.

### Not changed in this section

- Task checkboxes in `.kiro/specs/boards-membership/tasks.md` and root `specs/tasks.md`. Root T05 and T06 stay open until the pending checks pass.
- Contract and spec changes C1–C5, which are already recorded in `specs/CHANGELOG.md` and `docs/API.md`.

## Task 9.2: T15 handoff

Recorded from the spec and root task rows. No browser was run for this entry. The frontend dev server is not reachable from the agent shell, and the browser run is pending in task 7.2.

### Root task rows checked (`specs/tasks.md`)

- T15 row: includes the automated boards-membership journey (create board, open, add member, remove member, delete board), carried from T05 to T06. Present, so no edit was made.
- T16 row: includes the per-admin E11 rate limit on shared storage and the enumeration note for `USER_NOT_FOUND`. Present, so no edit was made.
- `specs/tasks.md` was not edited. No checkbox was changed. Root T05 and T06 stay open.

### T15 handoff: journey steps

Status: **steps not yet run in a browser**. Each step needs a result at 375 px or wider after task 7.2 runs.

| Step | Action                                              | Expected result                                                       | Result  |
| ---- | --------------------------------------------------- | --------------------------------------------------------------------- | ------- |
| 1    | Create board from the dashboard `/` (name, submit). | Board appears in the list, page opens `/boards/{id}`.                 | Not run |
| 2    | Open the board `/boards/{id}`.                      | Board name, Admin role badge, Members list with the creator as Admin. | Not run |
| 3    | Add member by registered email (Admin).             | Member row appears with role `member`, email field clears.            | Not run |
| 4    | Remove member (Admin, Confirm_Dialog).              | Member row removed after confirming.                                  | Not run |
| 5    | Delete board (Admin, Confirm_Dialog).               | Redirect to `/`, board gone from the list.                            | Not run |

Widths: 375 px and wider, per the T15 acceptance check. Real-device results are open.

### Carried notes

- Per-admin E11 rate limit: the E11 rate limit per admin, with shared storage, is tracked in T16 before public release. Local limiter checks do not prove shared storage behavior.
- Enumeration note: E11 returns `USER_NOT_FOUND` for an unregistered email. A board Admin can learn whether an email is registered. This is accepted for v1 (requirement 4.5, design DD8). It is returned only after the Admin check.

## Task 7.2: measured mobile check (run result)

Command: `node evidence/boards-membership-mobile-measure.mjs` with BASE_URL=http://localhost:3000 and the throwaway admin and member accounts. Report: `evidence/boards-membership-mobile.json`.

Result: 180 checks, 12 failed. Task 7.2 stays open.

All 12 failures are in the two Confirm_Dialog states (delete board, remove member):
- Tab keeps focus inside the dialog (6 presses): failed at 320, 375, 768 and 1280 px in both dialogs (the 375 px remove-member case is listed under elementFromPoint, see below). To confirm, the script focus-trap check needs a review: it may be a script assumption or a real focus escape.
- Box size under 44x44 CSS px: Cancel is 77.8x43.9 and the confirm buttons are 115.7 to 141.6 x 43.9 at 768 and 1280 px.
- elementFromPoint at the Remove member button center returns another element at 375 px.

Not yet run: the manual journey (create board, open, add member, remove member, delete board) at 375 px. It needs a browser walk-through.

## Task 7.2: manual journey at 375 px (user-confirmed)

Result: pass. The user walked the journey in a browser at 375 px and confirmed it passed.

Scope of the confirmation: the user reported a pass for the browser walk-through at 375 px. The step-by-step list (create, open, add member, remove member, delete) was not recorded individually in this log.

## Task 7.2 status

Still open. The measured mobile script reports 5 failures of 180 checks, all in the confirm dialog: tap-target height and hit-test measured during the open animation (see the section above). Awaiting a decision on the animation timing before the script can pass.

## Task 7.2: measured mobile check, final run (pass)

Change to the script: the fixed 200 ms wait after opening a confirm dialog is replaced by a bounded wait (at most 3 s). It waits until the dialog is open and the box and button geometry is identical across three samples 100 ms apart, with the box scale back to rest. The script still asserts the same 44 by 44 CSS px targets and the same hit test. Thresholds were not changed. Approved by the user.

Command: `node evidence/boards-membership-mobile-measure.mjs` with BASE_URL=http://localhost:3000, admin and member throwaway accounts.

Result: 180 checks, 0 failed, exit 0. Report: `evidence/boards-membership-mobile.json`.

Earlier runs, for the record: first run 12 failed (focus escape, 44 px and hit test). After the BaseModal Tab-wrap fix: 5 failed (all timing). After the settle-aware wait: 0 failed.

Manual journey at 375 px: pass (confirmed by the user in the browser, see the section above).

Task 7.2: complete.

## Revision 2: sprint date range (2026-11-18, Claude Code)

Implements Requirements 8 and 9 of `.kiro/specs/boards-membership/requirements.md` (native tasks 11 to 16). Spec review and approvals are in `evidence/spec-review.md`.

### Automated checks

| Check | Command (from `backend/` or `frontend/`) | Result |
| --- | --- | --- |
| Backend lint and format | `ruff check .` and `ruff format --check .` | Clean (175 files) |
| Backend suite | `python -m pytest -q -p no:cacheprovider` | 2173 passed, 1 skipped (2059 passed, 1 skipped on 2026-11-17). New: `test_boards_sprint.py` (48), `test_analytics_sprint.py` (15), `test_boards_migration_sprint.py` (11), the schema tests now run the sprint fixture rows (35 added), plus the updated key sets |
| Migration | `flask db upgrade` on the dev database, and `test_migration.py` and `test_boards_migration_sprint.py` on the test database | Single head `b7c1d4e9a203`. Upgrade, one-step downgrade and re-upgrade pass. Boards that exist before the upgrade keep both columns null. Half a range, an end before the start and 91 days fail on `ck_boards_sprint_range_valid`. One day and 90 days pass |
| Frontend lint, types | `npm run lint`, `npm run typecheck` | Clean |
| Frontend suite | `npx vitest run` | 2170 passed in 100 files (2039 in 98 on 2026-11-15; 2048 after the fixtures were updated and before the new tests) |
| Production build | `npm run build` | Succeeded |

The same fixture file, `specs/fixtures/board-field-cases.json` (`board_sprint_create` 24 cases, `board_sprint_update` 11), is read by the Flask schema and HTTP tests and by `lib/boardRules.test.ts`, so a difference between the client and server rules fails a test. A mutation check on `board_window` (the end without the extra day) failed 9 of the 15 analytics sprint tests, and the original code passed again.

### Browser and mobile check (task 15.1, 15.2)

- New script `evidence/boards-membership-sprint-measure.mjs`. Plan task 15.1 named the two earlier CDP scripts. Both still look for the old "Rename board" button, and the boards script looks for an element id (`members-heading`) that the board page no longer has, so they were left as records of their runs (design DR1) and one new Playwright script covers every Revision 2 screen. It is an emulator, not a real phone: Chromium 156.0.8078.4 through Playwright with device emulation (`isMobile`, touch) below 1024 px.
- Setup: my own Flask (127.0.0.1:5002) on `TEST_DATABASE_URL` with rate limiting off, and a production Next server (localhost:3101, `API_BASE_URL=http://127.0.0.1:5002`) built from the working tree. Your stack on 5001 and 3000 was not used. Both servers were stopped afterwards. The throwaway accounts and boards were removed from the test database with SQL after the run (7 users and 13 boards).
- Command: `BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 REPORT_FILE=evidence/boards-membership-sprint-mobile.json SHOT_DIR=evidence/boards-membership-sprint-screenshots node evidence/boards-membership-sprint-measure.mjs`.
- Result: **140 checks, 0 failed**, exit 0, at 320, 375, 768 and 1280 px (35 per width). An earlier run failed on all four widths because the script waited for the stale `members-heading` id. It was fixed in the script and rerun. The report holds no password, email, token or cookie. Screenshots at 375, 768 and 1280 px: `evidence/boards-membership-sprint-screenshots/` (create dialog, board with a sprint, edit form, analytics with a sprint, analytics without one).
- Per width the script checks: the create dialog has two labelled native date inputs; one date only and an end before the start show their errors and send no request; a valid pair creates a board that stores it; the board header shows "Sprint 16 Nov to 22 Nov" with no time; the edit form is prefilled and offers Clear dates; an invalid edit shows its error and keeps the stored sprint; new dates update the line without a reload and are stored; Clear dates then save removes the line and stores both nulls; the analytics dialog for a sprint board shows the sprint line, "this sprint" labels and the window `2026-11-16T00:00:00Z` to `2026-11-23T00:00:00Z`; a board without a sprint keeps "Week of … (local time)" and "this week"; a member sees the line and no edit control. On every measured screen: no horizontal page scroll, every control at least 44 by 44 CSS px (`elementFromPoint` at its center), every text and date input at 16 px or more.

### E29 timing with a 90-day sprint (task 15.3, decision DR4)

- Script `evidence/analytics-timing.mjs`, new modes `SPRINT_DAYS` and `EXTRA_EVENTS` (the earlier week run is unchanged). Command: `SPRINT_DAYS=90 EXTRA_EVENTS=5000 PSQL_URL=… API_URL=http://127.0.0.1:5002 REPORT_FILE=evidence/analytics-timing-sprint.json node evidence/analytics-timing.mjs`.
- Conditions: local Flask dev server, one client, 30 sequential requests after 5 warm-up requests, direct to Flask, test database. The board has 100 cards in 4 columns, the same 40 moves, 30 comments and 3 reorders as the week run, a 90-day sprint around today, and 5000 synthetic `card_moved` events inserted with `psql` and spread over the 90 days (the API can only stamp events "now"). The synthetic rows were removed afterwards. E29 answered `window: "sprint"`.
- Result: p95 **12.4 ms**, max 13 ms, median 10.9 ms (week run: p95 6.2 ms, max 7.4 ms). Raw timings in `evidence/analytics-timing-sprint.json`. The ratio is about 2 for roughly 50 times the events, so the `kind` index follow-up is not opened and the `ponytail:` note stays. This is a local reference, not an NFR 1 gate. Deployed timing is T16.

### Manual journey (task 15.2)

The journey of create with dates, header line, edit dates and clear dates ran at 320 to 1280 px as the automated script above. **Not done, left open:** a person walking the journey by hand at 375 px in a browser, the step "add a card to Done, open analytics, edit the dates and watch the figures change" in a browser (the backend tests `test_analytics_sprint.py` cover that behavior with a fixed clock), and any real phone or on-screen-keyboard check (T15 and T16).

### Open items

- ~~Playwright journey does not yet fill the sprint date fields (design DR5)~~ Done 2026-11-18: `boards-membership › sprint dates` passes on all four projects and the full suite is 58 passed (`evidence/local-acceptance-T15.md`, addendum 2026-11-18).
- Real-device and on-screen-keyboard checks: T15 and T16.
- Dev database: `flask db upgrade` was run on the development database to apply `b7c1d4e9a203`. A teammate pulling this change needs the same command (`docs/DEVELOPMENT.md`).
