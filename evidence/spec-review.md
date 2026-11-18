# Kiro Feature Spec Review

Status: Pending. Add a record for each relevant Feature Spec after Kiro generates Requirements, Design and Tasks. Use the rubric checklist to track review evidence across slices. Cite the actual file and heading for each observation.

| Evidence                                 | Result                                                                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native Kiro spec directory               | `.kiro/specs/foundation/` (requirements.md, design.md, tasks.md)                                                                                                                                     |
| Requirements, design and tasks paths     | `.kiro/specs/foundation/requirements.md`, `design.md`, `tasks.md`                                                                                                                                    |
| Root submission copies and spec revision | Pending                                                                                                                                                                                              |
| Kiro generation or review evidence       | Drafted in the workspace by the agent under the Requirements-First steps. The Kiro UI phase approvals are not recorded here. Review decisions are in each file's Decisions and Assumptions sections. |

## Requirements review

| Dimension    | What to inspect                                                        | Findings and references |
| ------------ | ---------------------------------------------------------------------- | ----------------------- |
| Completeness | Roles, alternate flows, error outcomes and missing acceptance criteria | Pending                 |
| Clarity      | Terms, state changes and authorization boundaries                      | Pending                 |
| Testability  | Observable inputs and outcomes, measurable constraints and AC IDs      | Pending                 |
| Feasibility  | Compatibility with the chosen stack, data and delivery constraints     | Pending                 |

## Design and tasks review

| Area                                           | Location | Finding or decision | Alternative and consequence | Accepted action |
| ---------------------------------------------- | -------- | ------------------- | --------------------------- | --------------- |
| Architecture or API decision                   |          |                     |                             |                 |
| Task dependency or oversized task              |          |                     |                             |                 |
| Requirement-to-route/page-to-task traceability |          |                     |                             |                 |

## Refinement record

| Finding ID | Prompt used | Before and after | Verification | Commit or diff |
| ---------- | ----------- | ---------------- | ------------ | -------------- |
|            |             |                  | Pending      |                |

Record the observed review counts against [the rubric mapping](../docs/RUBRIC.md). Use the [specification changelog](../specs/CHANGELOG.md) for agreed version changes. Preserve any unresolved findings for follow-up.

## Foundation refinement record (T01–T02)

Findings below are the ones confirmed by a check, a probe or a read of the code. Specification changes are in `specs/CHANGELOG.md`. Full check outcomes are in `evidence/foundation-T01-T02.md`.

| Finding ID | Prompt used                                  | Before and after                                                                                                                                                                     | Verification                                                                    | Commit or diff                    |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------- |
| F-T02-01   | Implementation review of `migrations/env.py` | Before: a SELECT before begin_transaction made `db upgrade` exit 0 with no DDL. After: separate check connection.                                                                    | Lifecycle run; 10 objects in `revotask` after re-upgrade                        | Uncommitted working tree          |
| F-T02-02   | Same                                         | Before: `fileConfig()` disabled `revotask.*` loggers. After: `disable_existing_loggers=False`.                                                                                       | Direct probe (disabled=True before the fix). Request-log tests pass.            | Uncommitted working tree          |
| F-T02-03   | Same                                         | Before: the factory did not import models, so autogenerate was empty. After: `from app import models` in `create_app`.                                                               | `db migrate` detected all nine tables                                           | Uncommitted working tree          |
| F-T02-04   | Drift review, design §5.4                    | Before: `include_name` / `include_object` filters gave phantom or hidden differences from the `$user` search path. After: migration engine with `search_path=public` and no filters. | Zero differences at head. Injected column detected.                             | `specs/CHANGELOG.md`, design §5.4 |
| F-T02-05   | Design review, §4.2                          | Before: `create_app(overrides)`. After: `create_app(env)`.                                                                                                                           | `test_settings_do_not_read_the_process_environment_when_env_is_given`           | `specs/CHANGELOG.md`              |
| F-T02-06   | Design review, §5.2                          | Before: text said the order column compiles to DOUBLE PRECISION. After: FLOAT(53) compiled, double precision stored.                                                                 | `test_order_columns_are_double_precision_float_with_precision_53`; catalog test | Design §5.2 and §8 text           |
| F-T01-01   | Environment review                           | Port 5000 answered by macOS AirPlay Receiver.                                                                                                                                        | `curl` 403 from AirTunes. Same code passes on port 5001.                        | Open. Decision needed.            |
| F-T01-02   | Dependency review                            | npm audit: 7 moderate, dev-only (`minimatch` via `typescript-eslint`).                                                                                                               | `npm audit`; non-forced `npm audit fix` changed nothing.                        | Open. Decision needed.            |

## Foundation refinement record, revision 2 (port, Docker, advisory)

| Finding ID                | Prompt used                      | Before and after                                                                                                                                                                                                 | Verification                                                                                      | Commit or diff                                                             |
| ------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| F-T01-01 (closed)         | Port review                      | Before: Flask on 5000, blocked by AirPlay Receiver. After: Flask on 5001, AirPlay Receiver kept enabled. Native tasks 1.7 and 2.9 pass on 5001.                                                                  | `curl` 200 and 405 on 5001; pytest 186 passed                                                     | Uncommitted working tree, `specs/CHANGELOG.md`                             |
| F-T01-02 (open, dev-only) | Dependency review                | `minimatch` 10.2.6 under `typescript-estree` 8.72.2. No stable `typescript-eslint` release uses a patched `minimatch`.                                                                                           | `npm audit --omit=dev` 0; `npm audit` 7 moderate; lint, test and build pass; no dependency change | `frontend/CHANGELOG.md`, `evidence/foundation-T01-T02.md` revision 2       |
| F-T02-07                  | Scope review                     | Before: Docker and Gunicorn planned for T16. After: FND-R10 and tasks 1.8 to 1.10 in T01 (Dockerfile, `.dockerignore`, `compose.yaml`, Gunicorn pin).                                                            | `docker compose config --quiet`; image inspection; health 200 in container; `db current` at head  | `requirements.md` FND-R10, `design.md` DD11 and §4.7, `specs/CHANGELOG.md` |
| F-T01-03                  | Render doc review                | Before: runbook used a native Python runtime with `pip install` and `gunicorn` commands. After: Docker Web Service from `backend/Dockerfile`, `PORT` from Render, migrations as a separate one-off step.         | Render Docker, web-service and secret-file pages fetched 2026-11-13                               | `docs/DEPLOYMENT.md` section 3                                             |
| F-T01-04                  | Render doc review (secret files) | Render copies secret files into the Docker build context. Before: `supabase-ca.crt` was not excluded. After: `backend/.dockerignore` excludes it.                                                                | `.dockerignore` contents; secrets scan finds no credential values                                 | `backend/.dockerignore`                                                    |
| F-T02-08                  | Compose review                   | Before: a container connecting to `127.0.0.1` would reach itself. After: Compose overrides `DATABASE_URL` with `DOCKER_DATABASE_URL` (`host.docker.internal`). `backend/.env` still supplies the other settings. | Connection and `db current` from the container                                                    | `compose.yaml`, `docs/DEVELOPMENT.md`                                      |

## Authentication refinement record (T03–T04)

Findings below were confirmed by a check, a probe or a read of the code or the installed docs. The Requirements round (decisions P1–P10 and C1–C10) is in `.kiro/specs/authentication/requirements.md`, "Decisions confirmed in review". Specification changes are in `specs/CHANGELOG.md`. Full outcomes are in `evidence/authentication-T03-T04.md`.

| Finding ID | Prompt used                                          | Before and after                                                                                                                                                                                                                                                                                                                | Verification                                                                                                                                                           | Commit or diff                                                               |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| F-AUTH-01  | Design review, root traceability against D2          | Before: E30–E31 belonged to T12, which depends on T04, so the shell had no way to load the user. After: T03 owns the E30 read (P1).                                                                                                                                                                                             | `test_users_me.py`; shell renders the user in the Chrome run                                                                                                           | `specs/CHANGELOG.md`, `specs/tasks.md`                                       |
| F-AUTH-02  | Design review of the JWT library                     | Before: the spec assumed JWT errors reach the envelope. The installed library returns 422 and `{"msg": ...}` for an invalid token. After: all five callbacks return 401 `AUTH_REQUIRED` (DD2).                                                                                                                                  | `test_auth_guard.py`, 22 cases                                                                                                                                         | design DD2, `evidence/authentication-T03-T04.md` F-T03-01                    |
| F-AUTH-03  | Requirements review, contract check                  | Before: no rule for malformed JSON, content type or size. After: 400, 415 `UNSUPPORTED_MEDIA_TYPE`, 413 `CONTENT_TOO_LARGE` (P3 revised).                                                                                                                                                                                       | `test_validation.py`, handler tests, smoke 1                                                                                                                           | `docs/API.md`, `backend/specs/api-contract.md`                               |
| F-AUTH-04  | Mobile review of the baseline                        | Before: AC13.1 covered only the core flow, and no guideline covered touch targets or input size. After: FE-S4 to FE-S6 and AUTH-R13.                                                                                                                                                                                            | Chrome run, 90 of 90                                                                                                                                                   | `guidelines/frontend.md`, `specs/requirements.md`                            |
| F-AUTH-05  | Implementation review of `NextResponse.cookies`      | Before: design said `response.cookies.set`. After: `Set-Cookie` is written by hand, because the helper also copies the token into `x-middleware-set-cookie`.                                                                                                                                                                    | `login/route.test.ts`                                                                                                                                                  | design §6.5                                                                  |
| F-AUTH-06  | Implementation review of `bff.ts` and `authRules.ts` | Before: `fields[key] = ...` lost a `__proto__` key. After: entries and `Object.fromEntries`.                                                                                                                                                                                                                                    | `bff.test.ts`, `authRules.test.ts`                                                                                                                                     | `frontend/lib/server/bff.ts`                                                 |
| F-AUTH-07  | Real-browser run                                     | Before: `error.tsx` used `reset()`, which does not re-fetch in Next 16.4. After: `retry()`.                                                                                                                                                                                                                                     | `error.test.tsx`; Chrome recovery check                                                                                                                                | `specs/CHANGELOG.md`, `frontend/specs/error-handling.md`                     |
| F-AUTH-08  | Negative control on the limiter                      | Before: DD11 claimed hook order was required. After: decorator limits run in the view wrapper, so the order is kept as a precaution only.                                                                                                                                                                                       | `test_rate_limit.py`, control run                                                                                                                                      | design DD11                                                                  |
| F-AUTH-09  | Shared-case run                                      | Before: two rule implementations could drift. After: Flask and TypeScript pass the same 56 cases with no correction.                                                                                                                                                                                                            | `test_auth_schema.py`, `authRules.test.ts`                                                                                                                             | `specs/fixtures/auth-field-cases.json`                                       |
| F-AUTH-10  | Owner review of the register password rule           | Before: 12 to 128 characters, with no character-class rule. After: 8 to 128 characters with an uppercase letter, a lowercase letter and an ASCII special character (P11, DD15). Login is unchanged.                                                                                                                             | `test_auth_schema.py` (special-character set, length-first rule), `authRules.test.ts` (composition), shared case file (42 register cases), smoke section 1b, Chrome B2 | `specs/CHANGELOG.md`, `.kiro/specs/authentication/requirements.md` P11       |
| F-AUTH-11  | Direct probe and smoke section 10                    | Before: the limit was described as 5 per minute per email, but counters are per Gunicorn worker. With two workers, 14 attempts gave a mix of 401 and 429. After: Compose runs one worker, so the local limit is exact. The live check gave five 401s then 429. Production still needs shared storage (T16) before more workers. | Live check, fresh counters, one worker; pytest `test_five_invalid_logins_then_429_for_one_normalized_email`                                                            | `evidence/authentication-T03-T04.md` revision 4; `compose.yaml`; open item 8 |
| F-AUTH-12  | Smoke run, password-rule section                     | Before: the policy checks ran straight after four register calls and failed with 429. After: the script waits a minute before each group. The failure was in the check, not the product.                                                                                                                                        | Smoke rerun, 73 of 73                                                                                                                                                  | `evidence/authentication-http-smoke.py`                                      |
| F-AUTH-13  | Live check before the fix                            | Before: Flask-Limiter put `Retry-After` on every response, including 401. After: an after-request filter keeps it on 429 only.                                                                                                                                                                                                  | `test_retry_after_is_sent_only_with_429`; direct Flask check in the smoke                                                                                              | `backend/app/response_headers.py`                                            |
| F-AUTH-14  | Revision 3 smoke run, password-rule section          | Before: section 1 and the policy checks shared one register quota, so three policy checks returned 429. Revision 3 used a sleep. After revision 4: the backend restarts before each group, so each group starts with its own quota.                                                                                             | Smoke rerun, 75 of 75                                                                                                                                                  | `evidence/authentication-http-smoke.py` `reset_limiter()`                    |

## Boards-membership review record (T05–T06)

Review of `.kiro/specs/boards-membership/` (requirements.md, design.md, tasks.md). The user approved the plan on 2026-11-13, based on decisions R1–R14 below. Specification changes are in `specs/CHANGELOG.md`. Spec review only: no source code, test, README or application changelog was changed, and no test was run. Implementation checks and their outcomes will be recorded in `evidence/boards-membership-T05-T06.md` when they happen. Root T05 and T06 stay unchecked in `specs/tasks.md`.

### Decisions R1–R14

| ID  | Decision                               | Resolution                                                                                                                                                                                                                | Where applied                                                                                                                                    |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | Assignment clearing (AC04.2)           | E12 clears the removed user's active card assignments on that board in the same transaction under the board lock. Tested with seeded cards on two boards, other-board assignments preserved. The T08 deferral is removed. | `design.md` DD6, Property 15, "Review Items and Decisions"; `tasks.md` 2.4, 2.10, 2.18; `specs/traceability.md` AC04.2 row; `specs/tasks.md` T05 |
| R2  | 404 for nonmembers                     | Nonmembers and removed members get the same 404 status and envelope as a missing board on board-scoped routes.                                                                                                            | `design.md` DD1, C1, Property 6; `tasks.md` 2.1, 2.11; `specs/design.md` D2; `backend/specs/api-contract.md`; `docs/API.md`                      |
| R3  | 403 for a Member on admin-only actions | A participant with the wrong role gets 403.                                                                                                                                                                               | `design.md` Property 8; `tasks.md` 2.12                                                                                                          |
| R4  | E11 unknown email                      | 404 `USER_NOT_FOUND` only after the admin check. Enumeration risk accepted for v1. Per-admin E11 rate limit with shared storage is tracked in T16.                                                                        | `design.md` DD8, Property 16, Risks; `tasks.md` 2.1, 2.4, 2.9, 4.1, 5.4; `specs/tasks.md` T16; `specs/traceability.md`                           |
| R5  | Order of validation and authorization  | Authenticate, validate the body (400), then authorize.                                                                                                                                                                    | `design.md` DD3, Property 16; `tasks.md` 2.3, 2.4, 2.13                                                                                          |
| R6  | E10 order                              | Admin first, then name, then `user_id`.                                                                                                                                                                                   | `design.md` Property 9; `tasks.md` 2.4, 2.9                                                                                                      |
| R7  | Reads and writes through Next          | A server-only helper serves E05, E07 and E10 reads. Route Handlers serve browser writes.                                                                                                                                  | `design.md` Architecture; `tasks.md` 4.4, 4.5, 4.6                                                                                               |
| R8  | Property-test libraries                | No Hypothesis or fast-check. Parameterized pytest and Vitest tests with deterministic fixtures.                                                                                                                           | `design.md` Testing Strategy; `requirements.md` Requirement 7.10; `tasks.md` 2.15–2.18, 6.1, 6.8, 6.9                                            |
| R9  | Playwright                             | Automation stays in T15. This slice runs a measured mobile check and a manual journey during implementation.                                                                                                              | `design.md` Browser checks; `tasks.md` 7.1, 7.2, 9.2; `specs/tasks.md` T15                                                                       |
| R10 | Shared validators                      | Generic string and email validators move to `backend/app/validation.py`. Auth behavior is preserved and the auth regression tests run before and after.                                                                   | `design.md` DD14, WP-B0; `tasks.md` 1.1–1.3, 2.2                                                                                                 |
| R11 | Sort collation                         | Name sorting uses the database collation. Tests use collation-neutral names.                                                                                                                                              | `tasks.md` 2.7, 2.9                                                                                                                              |
| R12 | Duplicate board names                  | Allowed.                                                                                                                                                                                                                  | `design.md` DD16, Property 17; `tasks.md` 2.3, 2.7, 2.8, 2.18                                                                                    |
| R13 | E11 404 shape                          | Plain 404 envelope with code `USER_NOT_FOUND`. The UI maps only that code to the email field. Other 404s show the access error.                                                                                           | `design.md` Property 16, error mapping; `tasks.md` 4.1, 5.4, 6.6                                                                                 |
| R14 | Stale members list                     | The list refreshes after each successful local mutation. A later board-access 404 shows the access error and navigates to the boards list.                                                                                | `tasks.md` 5.3, 5.4, 6.6                                                                                                                         |

### Contract changes C1–C5

| ID  | Change                                                                                                                                                                           | Where applied                                                                                                                                                     | Check against R1–R14                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Nonmembers and removed members get 404 instead of 403 on board-scoped E07–E12.                                                                                                   | `specs/design.md` D2; `backend/specs/api-contract.md` 403 and 404 rows; `docs/API.md` status conventions; `specs/requirements.md` AC03.3; `specs/traceability.md` | Within R2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| C2  | E09 returns 200 with `{"data": null}`.                                                                                                                                           | `docs/API.md` E09                                                                                                                                                 | **Needs review.** No R item decides this. The earlier text "200 soft-deleted board" suggested a board body. The Conventions line already says deletes return `data: null`, so it is a wording alignment, but no decision names it.                                                                                                                                                                                                                                          |
| C3  | E12 returns 200 with `{"data": null}` and clears the user's active card assignments on this board in the same transaction.                                                       | `docs/API.md` E12; `specs/traceability.md`                                                                                                                        | Clearing is within R1. **Needs review:** the `{"data": null}` body, as for C2.                                                                                                                                                                                                                                                                                                                                                                                              |
| C4  | E11: unregistered email 404 `USER_NOT_FOUND`, plain envelope, after the admin check. Previously removed user reactivated as `member` with 201. Active user 409 `STATE_CONFLICT`. | `docs/API.md` E11; `specs/requirements.md` AC04.1; `specs/design.md` D2; `backend/specs/api-contract.md`                                                          | The 404 `USER_NOT_FOUND` is within R4 and R13. **Needs review:** (a) reactivation "as `member` with 201". `specs/design.md` and `backend/specs/data-model.md` already say re-add reactivates the same row, but they name neither the role nor the status code, and no R item decides them. (b) the code `STATE_CONFLICT` for the active-user 409. `backend/specs/api-contract.md` already lists `STATE_CONFLICT` as a 409 code, but the E11 mapping to it is not in R1–R14. |
| C5  | E12: 404 when the target has no active membership. Admin-removal 409 gets code `STATE_CONFLICT`.                                                                                 | `docs/API.md` E12                                                                                                                                                 | **Needs review:** both the new 404 and the `STATE_CONFLICT` code are outside R1–R14. The admin-removal 409 itself was already in `docs/API.md`.                                                                                                                                                                                                                                                                                                                             |

### Items beyond R1–R14

These changes are in the working tree but no decision in R1–R14 covers them. The user should confirm or revert each one.

| Item                                               | Location                                                                                                                | Note                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| E09 `{"data": null}`                               | `docs/API.md` E09                                                                                                       | See C2.                                                                                                                     |
| E12 `{"data": null}`                               | `docs/API.md` E12                                                                                                       | See C3.                                                                                                                     |
| E11 reactivation as `member` with 201              | `docs/API.md` E11                                                                                                       | See C4(a).                                                                                                                  |
| `STATE_CONFLICT` code on E11 and E12 409           | `docs/API.md` E11, E12                                                                                                  | See C4(b), C5. The code exists in `backend/specs/api-contract.md`.                                                          |
| E12 404 for a target without an active membership  | `docs/API.md` E12                                                                                                       | See C5.                                                                                                                     |
| `docs/TEST-PLAN.md` rewrite                        | V03 text extended, and the whole V01–V15 table and the smoke table re-aligned by the formatter (about 56 changed lines) | The V03 content is not one of C1–C5. The re-alignment is formatting only and makes the diff larger than the content change. |
| `IntegrityError` backstop and race handling in E11 | `tasks.md` 2.4, `design.md` service notes (`add_member`) | Implementation detail added to the plan, not a decision in R1–R14.                                                          |

### Test-file alignment (2026-11-13)

`design.md` "Backend test files" now lists the files that `tasks.md` names: `test_boards_schema.py`, `test_boards_create_list.py`, `test_boards_detail.py`, `test_boards_update_delete.py`, `test_board_members.py`, `test_board_members_assignments.py`, `test_boards_access.py`, `test_boards_roles.py`, `test_boards_request_order.py`, `test_boards_atomicity.py`, `test_boards_properties_rules.py`, `test_boards_properties_reads.py`, `test_boards_properties_writes.py`, `test_boards_properties_scoping.py` and `test_boards_cleanup.py`. This replaces the single `test_boards_properties.py` in the design. The approach is unchanged (R8, R9, Requirements 7.10, 7.12): parameterized pytest and Vitest tests with no Hypothesis or fast-check, the mobile check during implementation, the automated Playwright journey in T15, and automatic database cleanup limited to records created by the test run, through `BoardTracker` on `TEST_DATABASE_URL`. Verification: text comparison of the three spec files only.

### Approval

On 2026-11-13 the user approved the plan on the basis of R1–R14. The items marked "needs review" above were not named in R1–R14 and need an explicit confirmation. Task 0.1 records this review. Implementation has not started.

### Revision 2: sprint date range (2026-11-18, Claude Code)

Request: `/revotask-feature spec boards-membership` with "tambahkan sprint date range (start/end) saat membuat board, dipakai analytics menggantikan 'Week of 16 Nov, 07:00 to 23 Nov, 07:00'". Phase 1, requirements: drafted in `.kiro/specs/boards-membership/requirements.md` (Revision 2, Requirements 8 and 9, decisions SP1–SP8). The user approved SP1–SP8 in chat on 2026-11-18 ("ya setuju, lanjut ke design.md"). Phase 2, design: drafted in `.kiro/specs/boards-membership/design.md` ("Revision 2: Sprint date range": DS1–DS15, properties P18–P23, contract changes C39–C41, review items DR1–DR5). The user approved the design and DR1–DR5 in chat on 2026-11-18 ("setuju, lanjut ke tasks.md"). Phase 3, tasks: drafted in `.kiro/specs/boards-membership/tasks.md` ("Revision 2", groups 10 to 16, review items TR1–TR4). The user approved the tasks in chat on 2026-11-18 ("ya jalankan finalize task"). They did not answer TR1 to TR4 separately, so the proposed answers apply: T05, T06 and T14 stay checked with a Revision 2 note, `tasks.meta.json` is unchanged, the Finalize sync runs before code, and the Playwright date steps stay open for T15.

Phase 4, finalize (task 10.1, Claude Code, 2026-11-18): linked and synchronized `specs/tasks.md` (T05, T06, T14 notes), `specs/requirements.md` (AC03.1, AC11.1), `specs/design.md` (D3, analytics line), `specs/traceability.md` (AC03.x, AC11.1), `docs/API.md` (E06, E08, E29, shapes, C39–C41), `backend/specs/api-contract.md`, `backend/specs/data-model.md`, and annotated `.kiro/specs/analytics/requirements.md` and `design.md` without changing approved text. Recorded in `specs/CHANGELOG.md` (2026-11-18, commit pending). Spec review only: no source code, test, README, user guide or application changelog changed and no test run. Native task 10.1 is checked.

Phase 5, implementation record (tasks 11 to 16, Claude Code, 2026-11-18): request `/revotask-feature implement boards-membership all of the new tasks related to this.` All native tasks 11 to 16 are checked. Checks and results are in `evidence/boards-membership-T05-T06.md` ("Revision 2: sprint date range"). Root T05, T06 and T14 stay checked with their note updated. Choices made while coding that the design left open or changed: (1) a shared `components/boards/SprintFields.tsx` serves both forms, so the design's DS11 file list gains one file; (2) the E08 Route Handler uses `requiredKeys: []`, so an empty body goes to Flask, which answers 400 with `fields.name` = "Required." (the Next-side 400 for an empty body no longer exists); (3) `BoardUpdateSchema.check_not_empty` reads the original body, so a body of only unknown keys still reports both the unknown key and the missing `name`, as it did before; (4) `window` sits after `week_end` in the E29 JSON (key order is not part of the contract; the design text said last); (5) one new Playwright script, `evidence/boards-membership-sprint-measure.mjs`, replaced the planned extension of the two older CDP scripts, which look for the old "Rename board" button and a removed element id; (6) the 90-day timing run used 5000 synthetic events inserted with `psql`, removed afterwards. Not done: the Playwright date steps (design DR5, left for T15), a person's manual walk at 375 px, and any real-device check. The analytics spec (T14) is not edited yet. Its Requirement 4, 6.2 and 6.3 are listed as changed in the "Existing criteria changed by Revision 2" table and are aligned in Finalize. No source code, test or application changelog changed.

## Kanban review record (T07–T09)

Review of `.kiro/specs/kanban/` (requirements.md, design.md). Requirements and design were produced by Claude Code (`/revotask-feature spec kanban`, 2026-11-13). Spec review only: no source code, test, README or application changelog was changed, and no test was run. Implementation checks and outcomes will go in `evidence/kanban-T07-T09.md`. Root T05 to T09 status is unchanged.

| Phase | Status | Note |
| --- | --- | --- |
| Requirements | Approved 2026-11-13 | 11 requirements. Decisions K1–K12 approved with the clarifications below. |
| Design | Approved 2026-11-13 with clarifications L1–L7 | `design.md`: DD1–DD13, 18 properties, work packages WP-B1 to WP-D, contract clarifications C6–C13. |
| Tasks | Approved 2026-11-13 (user, in chat, before `implement kanban`) | `tasks.md`. Dependencies: T05 before T07, T07 before T08, T06 and T08 before T09. |
| Finalize | Root links done 2026-11-13 | `specs/tasks.md` T07, T08 and T09 link `.kiro/specs/kanban/tasks.md`. The kanban traceability table and `guidelines/frontend.md` (SelectField) are implementation-time updates (tasks 13.1 and 13.4). |

### Decisions K1–K12

| ID | Decision | Resolution | Where applied |
| --- | --- | --- | --- |
| K1 | E15 and E19 body | `{"data": {"position_version": n}}`. | `requirements.md` 1.8, 3.6; `design.md` Serialization; `docs/API.md` E15, E19 |
| K2 | Open error codes | 409 `STATE_CONFLICT` for Done and nonempty-column conflicts. 400 with `fields.assignee_id`. "Choose a valid destination." for destination and anchor. | `requirements.md` 1.3, 1.6, 1.9, 2.6, 3.5, 4.6; `design.md` DD5, DD6, Error Handling; `docs/API.md`; `backend/specs/api-contract.md` |
| K3 | Check order | Authenticate, shape, board access, lock, recheck membership, role and source under the lock, version 409, then destination 400. 404 nonmember and 403 member kept. | `requirements.md` 1.12, 2.5, 3.10, 4.5, 5.2; `design.md` DD1, DD2, Check order; `docs/API.md`; `backend/specs/api-contract.md`; `specs/design.md` D4 |
| K4 | Column reorder UI | Move left and Move right, edge buttons disabled, accessible labels. | `requirements.md` 7.2, 7.9; `design.md` Drag and the Move dialog |
| K5 | Card edit dialog | `CardEditDialog` in T09. T10 adds comments and the detail modal and reuses the edit behavior. | `requirements.md` 8.3, 8.7; `design.md` Frontend layout |
| K6 | Events | Same transaction, only on a real change. Same-column reorder is a move. Unchanged position keeps the version and writes no event. `entered_done` only on creation in Done or a move from non-Done into Done. | `requirements.md` 2.2, 2.10, 4.3, 4.4, 5.4, 5.5; `design.md` DD4; `docs/API.md`; `specs/design.md` D4; `specs/requirements.md` AC07.2 |
| K7 | New board | Starts empty. Admin Add column, Member message. | `requirements.md` 6.5; `design.md` Screens and states |
| K8 | One request at a time | One Kanban write or refetch at a time, controls disabled, refetch before another move after a stale or uncertain outcome. | `requirements.md` 9.7, 9.8; `design.md` DD9, Board state and the gate |
| K9 | `is_done` unchanged | Allowed on a nonempty column. Other valid fields still apply. | `requirements.md` 1.6; `design.md` DD8; `docs/API.md` E14 |
| K10 | Move dialog | Column and position selects, same-column reorder, 44 by 44 px, checked at 375 px. | `requirements.md` 9.2, 10.3, 10.7; `design.md` Drag and the Move dialog, Browser checks |
| K11 | Limits | No product cap on columns or cards. 100 cards is a measurement target. | `requirements.md` (none needed); `design.md` Risks |
| K12 | Member removal refresh | After E12, refetch the board and members list, deferred while a move is pending, older responses discarded. | `requirements.md` 6.8; `design.md` Board state and the gate; `frontend/specs/api-integration.md` |

### Points that go beyond the approved wording

These are the design's own choices. The reviewer should confirm or change each one.

| Item | Choice |
| --- | --- |
| E16 moved column not on the board | 404 `NOT_FOUND`, not 400, because K3 makes the moved column the source resource and one 404 hides other boards' IDs. |
| Gate scope | Every Kanban write and refetch, not only create, delete and reorder, so a rollback cannot undo an edit. |
| Rename and Done toggle | One `ColumnEditDialog` behind an Edit button. |
| `SelectField` | A new shared part. `FormField` gets `multiline`. |
| Hook split | `useKanbanBoard` (state and gate) and `useDragAndDrop` (drag only). `frontend/specs/pages-and-components.md` updated. |
| Blank description | Stored as null. |
| Version range | E16 and E20 accept 0 to 2147483647 and reject booleans. |

### Implementation record (2026-11-13)

All native groups of `.kiro/specs/kanban/tasks.md` were implemented by Claude Code (`/revotask-feature implement kanban`). The plan approval, the K1–K12 decisions and the L1–L7 clarifications held without change. Deviations that touched the spec (no behavior change) are in `specs/CHANGELOG.md`. Evidence: `evidence/kanban-T07-T09.md`.

### Dependency gates

T05 before T07, T07 before T08, T06 and T08 before T09. The boards-membership task 7.2 (measured mobile check and manual journey) is still in progress, so root T05 and T06 stay unchecked and root T06 is not checked until that check and the journey pass. The kanban spec does not check them.

### Kanban design review clarifications (2026-11-13)

The user approved the design with these clarifications. Applied to `design.md`, `requirements.md` and the shared specs. Spec review only: no source code or test was changed and no test was run.

| ID | Clarification | Where applied |
| --- | --- | --- |
| L1 | E16: a well-formed `column_id` that is missing, soft-deleted or on another board returns the same generic 404. A malformed ID is 400. The version is checked before destination and anchor. | `requirements.md` 2.5; `design.md` DD2, Check order step 3 |
| L2 | The per-board gate covers all Kanban writes and board refetches that can replace the same UI state, including the member-removal refresh and Reload board. A write may finish its own recovery refetch while competing actions stay disabled. Stale responses are ignored. | `requirements.md` 6.8, 9.8; `design.md` DD9, Board state and the gate |
| L3 | One `ColumnEditDialog` for rename and the Done toggle. | `design.md` Frontend layout |
| L4 | `SelectField` and multiline `FormField` approved. Existing field behavior preserved, labels and messages accessible. | `design.md` Frontend layout; `tasks.md` 7.6 |
| L5 | `useKanbanBoard` for state, gate, rollback and refetch. `useDragAndDrop` for drag state only. | `design.md` Board state and the gate; `tasks.md` 8.2, 8.3 |
| L6 | Blank or whitespace-only description stored as null, omitted description kept on edit. Versions 0 to 2147483647, booleans rejected. At the ceiling a version-changing write returns 409 `STATE_CONFLICT` and writes nothing. | `requirements.md` 3.3, 3.12, 5.7; `design.md` DD7, DD12; `docs/API.md`; `backend/specs/api-contract.md` |
| L7 | E12 clears assignments only on active cards in active columns of the board, in the same transaction. Soft-deleted cards, cards in soft-deleted columns and other boards are preserved. A regression test covers each case. | `requirements.md` 11.10; `design.md` DD13; `docs/API.md` E12; `specs/requirements.md` AC04.2; `specs/traceability.md`; boards-membership requirements and DD6; `tasks.md` group 1 |

Task gates (kept): T05 is verified against its own backend acceptance checks before T07 (group 1). T07 before T08. T06 and T08 before T09. Root T06 closes only after boards-membership task 7.2 (the measured mobile check and the manual journey) passes. Unverified tasks stay open.

## Comments review record (T10)

Review of `.kiro/specs/comments/` (requirements.md, design.md). Requirements and design were produced by Claude Code (`/revotask-feature spec comments T10`, 2026-11-13). Spec review only: no source code, test, README or application changelog was changed and no test was run. Implementation checks and outcomes will go in `evidence/comments-T10.md`. Root T10 stays unchecked. Prerequisite check: the kanban slice is verified (root T07 to T09 checked, `evidence/kanban-T07-T09.md`).

| Phase | Status | Note |
| --- | --- | --- |
| Requirements | Approved 2026-11-13 | 9 requirements. Decisions M1–M13 approved with the clarifications below. |
| Design | Approved 2026-11-13 with clarifications N1–N5 | `design.md`: DD1–DD15, 19 properties, work packages WP-B1 to WP-D, contract clarifications C14–C17. |
| Tasks | Approved 2026-11-13 (user, in chat, by invoking `implement comments T10` for all tasks) | `tasks.md`: groups 0 to 11, 38 sub-tasks (2 done in the spec phase), each with an acceptance check. Gates: backend checks before the frontend calls the API (B), full verification before the mobile record is final (C). |
| Finalize | Done 2026-11-13 | `specs/tasks.md` T10 links `.kiro/specs/comments/tasks.md`. Layer specs, traceability and `guidelines/frontend.md` were synchronized with the implementation (tasks 11.1 and 11.4). |
| Implementation | Done 2026-11-13, local checks | See "Implementation record" below and `evidence/comments-T10.md`. |

### Decisions M1–M13

| ID | Decision | Resolution | Where applied |
| --- | --- | --- | --- |
| M1–M3 | Author name, list, E26 body | The author's current name from `users`. E23 is an unpaginated list of active comments ordered by creation time and ID. E26 returns 200 with the pre-delete Comment in `data`. Later reads omit it. | `requirements.md` 1.1, 1.3, 1.5, 4.1, 4.2; `design.md` DD7, Serialization; `docs/API.md` E23, E26 |
| M4 | Author-only | Only the author with current board access may edit or delete. A current participant who is not the author, an admin included, gets 403 `FORBIDDEN`. A removed author or other nonmember gets the generic board-scoped 404 (C1). Controls show only on the current user's comments. | `requirements.md` 3.4, 3.5, 4.3, 4.4, 7.4; `design.md` DD3; `docs/API.md` E25, E26 |
| M5–M7 | Lock, version, event | Comment writes take the board lock and recheck membership, card availability and authorship. `position_version` is unchanged. E24 records one `comment_created` event in the same transaction. T14 reads the event, T13 owns notifications. | `requirements.md` 2.1, 2.6, 5.1, 5.4; `design.md` DD1, DD4; `docs/API.md` check-order note; `backend/specs/api-contract.md` |
| M8–M9 | Content and edits | Trim, keep inner line breaks, 1 to 2,000 characters after trimming, wrapped plain text. An unchanged normalized edit returns 200 with the original `updated_at` and the UI skips the request. AC08.2 reworded: `updated_at` changes when the normalized content changes. | `requirements.md` 2.3, 3.1, 3.2, 7.5; `design.md` DD5, DD8, DD13; `specs/requirements.md` AC08.2; `docs/API.md` E24, E25 |
| M10–M11 | Modal | One `CardDetailModal` opens from the card title, reuses the edit form above the comments and carries the existing edit tests forward. Card DTO and E07 unchanged. | `requirements.md` 6.1, 6.2; `design.md` DD9, Frontend layout; `specs/design.md` D5 |
| M12–M13 | Read path, pending, stale | E23 loads through a same-origin Next `GET` handler when the modal opens. Comment writes use modal-local pending state. Card Save and Delete are disabled while a comment write is pending. Stale comment responses are ignored after close or a card switch. 44 by 44 px targets, checked at 375 px. | `requirements.md` 6.3, 7.9, 7.11, 8.3, 9.1; `design.md` DD10 to DD12 |

### Design review clarifications N1–N5 (2026-11-13)

The user approved design points 1 to 4 and revised point 5. Applied to `requirements.md`, `design.md` and `tasks.md`. Spec review only: no source code or test was changed and no test was run.

| ID | Decision | Resolution | Where applied |
| --- | --- | --- | --- |
| N1 | Timestamps | `created_at` and `updated_at` come from one clock reading on create. Verify no "Edited" marker on a new comment and an unchanged `updated_at` on a same-content edit. | `requirements.md` 2.8, 3.2, 6.4; `design.md` DD6, Property 16; `tasks.md` 1.3, 2.3, 2.4, 7.3, 7.5; `docs/API.md` E24 |
| N2 | Accessible names | "Open <title>" for the card button and "Card details" for the dialog. Kanban test selectors change, behavioral assertions stay. | `requirements.md` 6.1; `design.md` DD9; `tasks.md` 8.1, 8.2 |
| N3 | Modal width | `BaseModal` gets the optional `wide` prop. Verify the wider dialog fits a 375 px viewport with no horizontal overflow. | `requirements.md` 6.1, 8.1; `design.md` DD9, Browser checks; `tasks.md` 7.1, 9.1, 9.2 |
| N4 | Generic 404 | The same response for a missing comment, a missing card and lost access. Refetch the board. Lost access uses the existing redirect. A gone card closes the modal. An existing card reloads the comments. A failed refetch or a repeated 404 stops with a Retry notice. | `requirements.md` 6.7, 7.7; `design.md` DD10, Property 19; `tasks.md` 5.1, 6.1, 6.2, 8.1 |
| N5 | Uncertain add (revised) | On a transport error or 5xx: keep the draft, keep the list visible, refetch E23, show that the comment may have been posted, keep Add comment disabled until a refresh succeeds, then let the user review the list and retry manually. No automatic retry, no deduplication by text. Regression case: saved but the response lost. | `requirements.md` 2.9, 7.12, 9.5; `design.md` DD15, Properties 17, 18; `tasks.md` 2.3, 6.1, 6.2, 7.5; `docs/API.md` E24 |

Replaces the earlier design point "no list reload after a failed add" (Requirement 7.8 for add), which the user revised. Requirement 7.8 now covers edit and delete only.

### Create-path status difference from the handbook

The handbook and `docs/TEST-PLAN.md` V06 said comment create returns 201/400/401/403. Under contract clarification C1 a nonmember gets the generic 404 on every board-scoped route, so E24 is tested with 201, 400, 401 and 404, and the 403 is tested separately for a non-author edit and delete, an admin included. Applied to `docs/TEST-PLAN.md` V06 and `docs/RUBRIC.md` ("Project decisions that differ from literal rubric wording"). The test plan also names the no-op edit (`updated_at` unchanged) and the omission after delete, and says database-writing tests use `TEST_DATABASE_URL` and remove only their own rows.

### Comments implementation record (2026-11-13)

All native groups of `.kiro/specs/comments/tasks.md` were implemented by Claude Code (`/revotask-feature implement comments T10`). The plan approval was the user's invocation of `implement comments T10` for all tasks. The decisions M1–M13 and the clarifications N1–N5 held without change. Deviations that touched the spec (no behavior or contract change) are in `specs/CHANGELOG.md`. The browser check found two real defects, F-CMT-1 (Escape on a nested confirmation closed the dialog behind it) and F-CMT-2 (focus after an add), both fixed with tests. Evidence: `evidence/comments-T10.md`. Root T10 is checked in `specs/tasks.md`. Open: Playwright V10, real-device checks (T15), deployment (T16).

## My Tasks and search review record (T11)

Review of `.kiro/specs/my-tasks-search/` (requirements.md, design.md). Requirements and design were produced by Claude Code (`/revotask-feature spec my-tasks-search T11`, 2026-11-13 and 2026-11-14). Spec review only: no source code, test, README or application changelog was changed and no test was run. Implementation checks and outcomes will go in `evidence/my-tasks-search-T11.md`. Root T11 stays unchecked. Prerequisite check: the kanban slice is verified (root T07 to T09 checked, `evidence/kanban-T07-T09.md`) and comments (T10) is done.

| Phase | Status | Note |
| --- | --- | --- |
| Requirements | Approved 2026-11-14 | 8 requirements. Decisions S1–S11 approved with the clarifications below. |
| Design | Approved 2026-11-14 with clarifications Q1–Q6 | `design.md`: DD1–DD12, 12 properties, work packages WP-B1 to WP-D, contract clarifications C18–C22. |
| Tasks | Approved 2026-11-14 (user, in chat, by invoking `implement my-tasks-search` for all tasks) | `tasks.md`: groups 0 to 10, 34 sub-tasks, each with an acceptance check. Gates: backend checks before the frontend calls the API (B), full verification before the mobile record is final (C), root T11 last (D). |
| Finalize | Done 2026-11-14 | `specs/tasks.md` T11 links `.kiro/specs/my-tasks-search/tasks.md`. The other shared documents were synchronized with the design (see below) and with the implementation (task 10). |
| Implementation | Done 2026-11-14, local checks | See "My Tasks and search implementation record" below and `evidence/my-tasks-search-T11.md`. |

### Decisions S1–S11

| ID | Decision | Resolution | Where applied |
| --- | --- | --- | --- |
| S1 | E21 scope and order | All active tasks assigned to the caller on boards they can currently access, unpaginated. Sort by case-insensitive board name, board ID, column order, card order, card ID. The page keeps that order. | `requirements.md` 1.1–1.4, 4.1; `design.md` DD3, Service sketch; `docs/API.md` E21 |
| S2 | Done cards | Include active cards in the Done column. Exclude soft-deleted cards and cards in soft-deleted columns. | `requirements.md` 1.2; `design.md` Property 1; `docs/API.md` E21 |
| S3 | Query strictness | A missing, repeated, invalid or unknown parameter returns `400 VALIDATION_ERROR` (`fields.assignee` or `fields.q` for known ones, the standard message for an unknown one). `q` trimmed, 1–100. The Next.js E22 handler preserves duplicate and unknown parameters so Flask validates them. | `requirements.md` 1.7, 2.5, 8.1; `design.md` DD2, DD5, Query validation; `docs/API.md` query rule |
| S4 | Search order and cap | Up to 20 in board order, card ID as tie-breaker. "Showing 20 results." at the cap. 100 cards is a performance measurement target. | `requirements.md` 2.3, 5.6, 8.9; `design.md` Service sketch, States, Browser checks |
| S5 | Read-only | No board write lock, event, notification or `position_version` update. | `requirements.md` 3.3; `design.md` DD1, Property 5 |
| S6 | Debounce | 300 ms. A blank query clears results at once. Superseded requests are aborted and a late response cannot overwrite current results. | `requirements.md` 5.2–5.4; `design.md` Hook, Properties 9, 10 |
| S7 | Open from a result | The existing Card Detail Modal opens from the current card state. | `requirements.md` 5.7; `design.md` DD8, States and screens |
| S8 | Search and the gate | Independent of the Kanban gate. Returned IDs are resolved against the live board state. Current title and column show. A gone card or one whose edited title no longer matches is omitted. Visibility derives from live state, so a rolled-back delete restores a result. A new match appears on the next search. | `requirements.md` 5.8–5.10; `design.md` DD7–DD9, Search state and the live board, Properties 6–8 |
| S9 | My Tasks links | The task row and the group heading link to the board. No card deep link. | `requirements.md` 4.2, 4.5; `design.md` Frontend layout |
| S10 | Mobile navigation | Boards and My tasks reachable at every width, in the wrapping AppHeader row below 1024 px. Verified at 375 px with 44 by 44 CSS px targets and no horizontal overflow. | `requirements.md` 6.1–6.3, 7.2; `design.md` DD12, AppHeader, Property 12; `guidelines/frontend.md` FE-D2 |
| S11 | Reads | E21 from the Server Component through the server-only helper. E22 through a same-origin GET handler. Existing board access rules, including the generic 404 for a nonmember (C1). | `requirements.md` 3.2, 8.1, 8.2; `design.md` Next handlers and client allowlist |

### Design synchronization (2026-11-14)

Applied at the user's request while the task plan is still open: `specs/requirements.md` AC06.2 and AC09.1, `specs/design.md` D5 and D6, `docs/API.md` (E21, E22 and the query rule), `backend/specs/api-contract.md`, `frontend/specs/api-integration.md`, `frontend/specs/pages-and-components.md`, `guidelines/frontend.md` FE-D2, `docs/TEST-PLAN.md` V07 and V11, `specs/traceability.md` and `specs/CHANGELOG.md`. Root `specs/tasks.md`, the README and the application changelogs are unchanged. Spec review only: no source code or test was changed and no test was run.

### Design review clarifications Q1–Q6 (2026-11-14)

The user approved the design with these decisions. Applied to `design.md` ("Review Items and Decisions"), `requirements.md` (5.6, 6.2, 8.6) and `tasks.md`. Spec review only: no source code or test was changed and no test was run.

| ID | Decision | Resolution | Where applied |
| --- | --- | --- | --- |
| Q1 | Visible result count | At 20 returned results the line shows the visible count ("Showing 19 results." with one hidden). All hidden shows the empty state and no line. | `design.md` States and screens; `requirements.md` 5.6; `tasks.md` 5.1, 5.2 |
| Q2 | Unchanged titles | Trust the server match when the live title equals the title E22 returned. Re-test only a changed title. Show the current title and column. | `design.md` Search state and the live board; `tasks.md` 3.1, 5.2 |
| Q3 | Loading | Clear the held results when the normalized query changes. "Searching…" for the debounce and the request of a valid query. A blank query clears results and loading at once. Debounce, cancellation and the latest-response guard stay. | `design.md` Hook; `tasks.md` 4.1, 4.2 |
| Q4 | NUL in `q` | 400 `fields.q` for a decoded NUL. Verified in Flask and through the same-origin GET handler. | `design.md` Query validation, test files, browser checks; `requirements.md` 8.6; `tasks.md` 1.1, 1.4, 2.1, 3.2 |
| Q5 | Sort order | S1 order with the card ID last. No column ID tie-breaker. | `design.md`; `tasks.md` 1.3, 2.2 |
| Q6 | Sticky mobile header | Wrapping nav row approved. At 320 and 375 px both links reachable, each at least 44 by 44 CSS px, no horizontal overflow and no content overlap. | `design.md` Browser checks; `requirements.md` 6.2; `tasks.md` 7.1, 8.1 |

### My Tasks and search implementation record (2026-11-14)

All native groups of `.kiro/specs/my-tasks-search/tasks.md` were implemented by Claude Code (`/revotask-feature implement my-tasks-search`, all tasks). The plan approval was the user's invocation. The decisions S1–S11 and the clarifications Q1–Q6 held without change. Deviations that touched the spec (no behavior or contract change) are in `specs/CHANGELOG.md`: the search live region is `aria-live` without `role="status"`, `FormField` gained the `search` type and `maxLength`, and `KanbanBoard` takes a `boardId` prop. Checks: backend 1808 passed and 1 skipped, frontend 1733 passed, `next build` succeeds, a 359-check Chrome run (device emulation) passed with 0 failed, E22 and E21 timed on 100 cards. Root T11 is checked in `specs/tasks.md`. Open: Playwright (V10), real-device checks (T15) and deployment (T16). Evidence: `evidence/my-tasks-search-T11.md`.

## Profile review record (T12)

Review of `.kiro/specs/profile/`. Requirements were drafted by Claude Code (`/revotask-feature spec profile T12`, 2026-11-14). Spec review only: no source code, test, README, root spec or changelog was changed and no test was run. Implementation checks and outcomes will go in `evidence/profile-T12.md`. Root T12 stays unchecked. Prerequisite check: authentication is verified (root T03 and T04 checked, `evidence/authentication-T03-T04.md`). The working tree holds uncommitted T11 changes in shared files (`AppHeader.tsx`, `flask.ts`, `privateRoute.ts`, `apiClient.ts`, `types.ts`); the profile slice must build on them.

| Phase | Status | Note |
| --- | --- | --- |
| Requirements | Approved 2026-11-14 with clarifications | 8 requirements. Decisions P1–P11 approved (see below). `requirements.md` updated with the clarifications. |
| Design | Approved 2026-11-14 (user, in chat) | `design.md`: DD1–DD9, 14 properties, contract clarifications C23–C27, review items R1–R5. Approved without changes. |
| Tasks | Approved 2026-11-14 (user, by invoking `implement profile T12` for all tasks) | `tasks.md`: groups 0 to 10, 34 sub-tasks, each with an acceptance check. Gates: backend checks before the frontend calls E31 (B), full verification before the mobile record is final (C), root T12 last (D). |
| Finalize | Done 2026-11-14 | `specs/tasks.md` T12 links `.kiro/specs/profile/tasks.md`. The shared documents were synchronized with the design and later with the implementation. |
| Implementation | Done 2026-11-14, local checks | See "Profile implementation record" below and `evidence/profile-T12.md`. |

### Decisions P1–P11 (approved 2026-11-14)

| ID | Decision | Resolution | Where applied |
| --- | --- | --- | --- |
| P1 | E31 body | A JSON object with `name`, `email` or both. An empty object, a non-object body and unknown fields are `400 VALIDATION_ERROR`. | `requirements.md` 1.1, 2.1, 2.2; `design.md` DD2; `docs/API.md` E31 (C23) |
| P2 | Unchanged values | Compare after normalization. All unchanged: 200, current user, `updated_at` kept. A case-only change of one's own email is a no-op. | `requirements.md` 1.4, 1.5, 2.6; `design.md` DD1; C24 |
| P3 | Duplicate email | `uq_users_email` decides under concurrency. 23505 on it is `409 EMAIL_ALREADY_EXISTS`, the whole update rolls back, the error is inline under Email. A duplicate email with a name change leaves the name intact. | `requirements.md` 1.6, 2.5, 5.5, 8.5; `design.md` DD4; C25 |
| P4 | Browser path | Existing same-origin write helper with its Origin and authentication checks. The page reads E30 through the existing server-only helper. Field rules shared between Next.js and Flask through one fixture. | `requirements.md` 4.1, 8.1–8.3; `design.md` DD3, Next handler |
| P5 | Entry point | The AppHeader account block links to `/profile` at every width. FE-D2 is updated at implementation. Profile, Boards, My tasks and Log out are measured at 320 and 375 px (44 by 44 CSS px, visible focus, no overflow). | `requirements.md` 6.1–6.5, 7.6; `design.md` DD7, Mobile design |
| P6 | After a save | Reseed the form and update the context from the response, `router.refresh()`, toast "Profile updated.", stay on `/profile`. Save disabled while pristine or pending. Values kept on failure. | `requirements.md` 4.5, 5.1–5.7; `design.md` DD5, DD6, ProfileForm |
| P7 | Client body | Only fields that differ from the last saved values, with the `authRules.ts` rules. Flask authoritative. | `requirements.md` 4.6; `design.md` DD5, Rules |
| P8 | Scope | Name and email only. `password` rejected. The page says password changes are unavailable. An email change is effective at once and leaves sessions valid (identity is the user ID). Tests: E30 with the old token, a fresh login with the new email, a failed login with the old. Reauthentication, new-address confirmation and old-address notice are tracked in T16 for public release. | `requirements.md` 2.2, 3.4–3.6, 3.9, 4.2–4.3; `design.md` DD8, `test_users_profile_session.py`; C27 |
| P9 | Names elsewhere | Reads that resolve names from the user row show the new name on the next load. Open views refresh through their existing behavior. | `requirements.md` 1.9, 5.9; `test_users_profile_names.py` |
| P10 | Concurrent edits | Last write wins per submitted field. An omitted field survives a concurrent update. Both fields are applied atomically. The service locks the user row (design review item R1). Tests: concurrent name-only and email-only updates, and a deterministic lock test. | `requirements.md` 1.2, 1.8; `design.md` DD1, `test_users_profile_concurrency.py`; C26 |
| P11 | Abuse limits | The E31 rate limit is deferred to T16. The docs say the 409 is an additional account-enumeration path next to E02. | `requirements.md` 3.8; `docs/API.md` (C27); `specs/CHANGELOG.md` |

### Design synchronization (2026-11-14)

Applied at the user's request while the task plan is still open: `docs/API.md` (E31 row and the C23–C27 paragraph), `backend/specs/api-contract.md` (`users_bp`), `specs/requirements.md` (AC12.1), `docs/TEST-PLAN.md` (V07 and V11) and `specs/CHANGELOG.md`. Root `specs/tasks.md`, `specs/traceability.md`, `guidelines/frontend.md`, the README and the application changelogs are unchanged. Spec review only: no source code or test was changed and no test was run. Test data rule recorded in the design: database-writing tests use `TEST_DATABASE_URL` through `db_guard`, track every user they create and clean up automatically, with an untracked sentinel user surviving.

### Profile finalize (2026-11-14)

The user's invocation `/revotask-feature implement profile T12` (all tasks) was the plan approval, as for T10 and T11. Claude Code completed task 0.2: `specs/tasks.md` T12 links the native spec, and `specs/traceability.md` (AC12.1), `frontend/specs/pages-and-components.md`, `frontend/specs/api-integration.md`, `guidelines/frontend.md` FE-D2 and `specs/CHANGELOG.md` were synchronized. Tasks: Approved 2026-11-14 (user, by invoking `implement profile T12` for all tasks). Finalize: done. Implementation record follows when the work is verified (`evidence/profile-T12.md`).

### Profile implementation record (2026-11-14)

All native groups of `.kiro/specs/profile/tasks.md` were implemented by Claude Code (`/revotask-feature implement profile T12`, all tasks). The plan approval was the user's invocation. The decisions P1–P11 and the design held without change. Deviations that touched the spec (no behavior or contract change) are in `specs/CHANGELOG.md`: the names test covers E10, E21 and E23 (E22 returns no names), `ProfileForm` shows a form-level message for a 400 key that has no field, and `profileChanges` takes a plain `{name, email}` record. Checks: backend 1907 passed and 1 skipped, frontend 1845 passed, `next build` succeeds, a 376-check Chrome run (device emulation) passed with 0 failed, and removing the row lock makes the lock test fail. Root T12 is checked in `specs/tasks.md`. Open: Playwright (V10), real-device checks (T15), deployment (T16), and the T16 security items from P8 and P11 (reauthentication, new-address confirmation, old-address notice, E31 rate limit). Evidence: `evidence/profile-T12.md`.

## Notifications review record (T13)

Review of `.kiro/specs/notifications/`. Requirements were drafted by Claude Code (`/revotask-feature spec notifications T13`, 2026-11-14), revised with the user's clarifications the same day, the design and the task plan were drafted by Claude Code afterwards (design approved by the user on 2026-11-14). Spec review only: no source code, test, README, root `specs/tasks.md` or changelog was changed and no test was run. Root T13 stays unchecked. Prerequisite check: kanban and comments are verified (root T07 to T10 checked in `specs/tasks.md`, `evidence/kanban-T07-T09.md`, `evidence/comments-T10.md`). The `notifications` table, its indexes and the `User.notifications` relationship already exist, so no migration is planned. The working tree holds uncommitted T11 and T12 changes in shared files (`AppHeader.tsx`, `flask.ts`, `privateRoute.ts`, `apiClient.ts`, `types.ts`, `cards/service.py`); this slice must build on them.

| Phase | Status | Note |
| --- | --- | --- |
| Requirements | Approved 2026-11-14 with clarifications (user, in chat) | 10 requirements. Decisions B1–B10 approved. `requirements.md` updated: the unassigned → A → B → A example, the 64-bit offset, the `id` tie-break, counts on an empty page, the E28 item and scoped conditional update, rejoin with the original read status, the exact count in the accessible name, link-follow and Mark as read failure behavior, the stale-response rule and the header controls checked at 320 and 375 px. |
| Design | Approved 2026-11-14 (user, in chat) | `design.md`: DD1–DD15, 15 properties, contract clarifications C28–C33, review items R1–R8. Approved without changes. |
| Tasks | Approved 2026-11-14 (user, by invoking `implement notification T13` for all tasks) | `tasks.md`: groups 0 to 8, 34 sub-tasks, each with an acceptance check. Gates: backend checks before the frontend calls E27 and E28 (B), full verification before the mobile record is final (C), root T13 last (D). |
| Finalize | Done 2026-11-14 | `specs/tasks.md` T13 links `.kiro/specs/notifications/tasks.md`. `specs/traceability.md`, `guidelines/frontend.md` FE-D2, `frontend/specs/`, `backend/specs/data-model.md` and `specs/CHANGELOG.md` were synchronized. |
| Implementation | Done 2026-11-14, local checks | See "Notifications implementation record" below and `evidence/notifications-T13.md`. |

### Decisions B1–B10 (approved 2026-11-14)

| ID | Decision | Resolution | Where applied |
| --- | --- | --- | --- |
| B1 | Notification shape | `actor_name`, `board_name` and `card_title` added to E27 and E28, current values resolved on read for visible rows only. Existing fields kept. | `requirements.md` 3.5, 5.6; `design.md` DD8, C33; `docs/API.md` |
| B2 | Triggers | E17 and E18: the new assignee when the assignment changes and differs from the caller. E24: the current assignee when they differ from the author. Same transaction, so a rollback leaves none. Exclusions kept. | `requirements.md` 1.1–1.8, 2.1–2.7; `design.md` DD1, DD2, C28 |
| B3 | Duplicates | One per qualifying event. `unassigned → A → B → A` by another user notifies A twice. | `requirements.md` 1.6, 2.3; `design.md` C29 |
| B4 | Visibility | One filter for items, both counts and E28: active board, column, card and recipient membership. Rows kept, so a rejoin shows them with the original read status. | `requirements.md` 5.4, 5.5; `design.md` DD3, C30 |
| B5 | E27 query | Defaults and strict validation kept. Both ranges stated. Offset in 64-bit arithmetic. Empty 200 past the end. `created_at` then `id` descending. | `requirements.md` 3.1, 3.2, 3.6; `design.md` DD4, C31 |
| B6 | Counts | `total` and `unread_count` cover all visible rows, whatever the page, and stay on an empty page. | `requirements.md` 3.3, 3.7; `design.md` DD5 |
| B7 | E28 | No body, 200 with the item, conditional update scoped to a visible notification of the caller, original `read_at` on a repeat, one generic 404, no lock, no mark-all. | `requirements.md` 4.1–4.7; `design.md` DD6, DD7, C32 |
| B8 | UI | `BaseModal`, board links, "Newer" and "Older" at 20 per page. A link click marks read without blocking navigation, even if it fails. "Mark as read" shows retry feedback on failure and keeps the row Unread. Focus, Escape and 44 by 44 targets at 320 and 375 px, with the existing header controls. | `requirements.md` 7.1–7.9, 9.3, 9.6; `design.md` DD12–DD14 |
| B9 | Polling | 30 seconds for the shown page, one E27 in flight, quiet failures, refresh after a successful E28, a response for an earlier page or requested before a completed E28 is dropped. | `requirements.md` 8.1–8.8; `design.md` DD9–DD11 |
| B10 | Badge | Hidden at 0, `99+` above 99, exact count in the accessible name, FE-S3 updated. | `requirements.md` 6.2; `design.md` NotificationBell; `guidelines/frontend.md` FE-S3 |

### Design synchronization (2026-11-14)

Applied at the user's request while the design is under review: `docs/API.md` (E17, E18, E24, E27, E28, the `Notification` shape and the C28–C33 paragraph), `backend/specs/api-contract.md` (`notifications_bp`), `specs/requirements.md` (AC10.1, AC10.2), `docs/TEST-PLAN.md` (V08 and V11), `guidelines/frontend.md` (FE-S3) and `specs/CHANGELOG.md`. Root `specs/tasks.md`, `specs/traceability.md`, FE-D2, the layer specs, the README and the application changelogs are unchanged. Spec review only: no source code or test was changed and no test was run. Test data rule recorded in the design: database-writing tests use `TEST_DATABASE_URL` through `db_guard`, track every row they create and clean up automatically, with an untracked sentinel notification surviving.

### Design review items R1–R8 (approved 2026-11-14)

| ID | Item | Proposal |
| --- | --- | --- |
| R1 | `page` and `per_page` text | Digits only, no sign, no leading zero, at most 10 digits. |
| R2 | Items and counts | Separate statements. A count may differ by one concurrent commit from the items. The next poll corrects it. |
| R3 | Bell at 320 px | In the brand block. The existing `flex-wrap` is the fallback. The measured check decides. |
| R4 | One E28 at a time | The other "Mark as read" buttons are disabled while one runs. |
| R5 | Removal between the E28 update and select | Roll back and return 404. |
| R6 | Model relationships | None. Keep plain foreign keys and explicit joins. |
| R7 | Poll timer | One timer, restarted by every E27 request. |
| R8 | Invalid-ID message | "The board ID is not valid." becomes "The ID is not valid." in `privateRoute.ts`. |

### Notifications finalize and implementation record (2026-11-14)

The user's invocation `/revotask-feature implement notification T13` (all tasks) was the plan approval, as for T10 to T12. Claude Code completed task 0.2 (the root T13 link, traceability, FE-D2 and the layer specs) and then every native group of `.kiro/specs/notifications/tasks.md`. The decisions B1–B10 and the design held without change to behavior or contract. Deviations that touched the spec (no behavior or contract change) are in `specs/CHANGELOG.md`: `UtcDateTime` moved to `app/validation.py` (an import cycle), and the header layout (a `flex-auto` brand block, a shorter account name and a wordmark hidden below 400 px), the panel text color and the long-title wrapping, all three found by the browser check. Checks: backend 1986 passed and 1 skipped with ruff clean, frontend 1958 passed in 93 files with lint and typecheck clean and `next build` succeeding, a 205-check Chrome run (device emulation) with 0 failed after three real defects were fixed, and two mutation checks that made the matching tests fail. Root T13 is checked in `specs/tasks.md`. Open: Playwright (V10), real-device checks (T15), deployment (T16) and a limit on notification volume per user (T16). Evidence: `evidence/notifications-T13.md`.

## Analytics review record (T14)

Review of `.kiro/specs/analytics/`. Requirements and design were drafted by Claude Code (`/revotask-feature spec analytics T14`, 2026-11-14). The spec phases were spec review only. The implementation record is at the end of this section, and root T14 is checked in `specs/tasks.md`. Prerequisite check: kanban and comments are verified (root T07 to T10 are checked, `evidence/kanban-T07-T09.md`, `evidence/comments-T10.md`) and the event writers exist. The `analytics` Blueprint and the panel do not exist yet.

| Phase | Status | Note |
| --- | --- | --- |
| Requirements | Approved 2026-11-14 with clarifications (user, in chat) | 8 requirements. Decisions A1–A10 approved. `requirements.md` updated: the four counted kinds listed explicitly (A1), a version that must rise before a re-read and a board switch that drops stale responses (A8), 320 px added beside 375 px (A9), the E29-failure-leaves-the-board-usable test (8.5). |
| Design | Approved 2026-11-14 (user, in chat) | `design.md`: DD1–DD12, 14 properties, contract clarifications C34–C38, review items R1–R8. Approved without changes. |
| Tasks | Approved 2026-11-14 (user, by invoking `implement analytics T14` for all tasks) | `tasks.md`: groups 0 to 7, 30 sub-tasks, each with an acceptance check and requirement, root and design links. Gates: backend checks before the frontend calls E29 (B), full verification before the mobile record is final (C), root T14 last (D). |
| Finalize | Done 2026-11-14 | `specs/tasks.md` T14 links `.kiro/specs/analytics/tasks.md`. `specs/traceability.md`, `frontend/specs/`, `guidelines/frontend.md` and `specs/CHANGELOG.md` were synchronized. |
| Implementation | Done 2026-11-14, local checks | See "Analytics finalize and implementation record" below and `evidence/analytics-T14.md`. |

### Decisions A1–A10 (approved 2026-11-14)

| ID | Decision | Resolution | Where applied |
| --- | --- | --- | --- |
| A1 | `member_activity` | Counts `card_created`, `card_moved`, `column_reordered` and `comment_created`. `entered_done` is used only for `completed_cards`, so creating a card in Done or moving one into Done adds one activity event. D6 and `docs/API.md` list the four kinds. | `requirements.md` 3.1, 3.2, 5.6; `design.md` DD6, C36; `specs/design.md` D6; `docs/API.md` |
| A2 | Week | Server clock, current UTC week, Monday 00:00 inclusive to the next Monday 00:00 exclusive, ISO 8601 timestamps ending in `Z`. | `requirements.md` 4.1–4.5; `design.md` DD2, C34, R1 |
| A3 | Completions | A card ID counts once per week if it has an `entered_done` event. The count survives a later move out of Done or a delete. | `requirements.md` 2.1–2.3; `design.md` DD5, C35 |
| A4 | Actors | Every actor with a counted event, former members included, under the current name, sorted by count descending, lower-cased name, user ID. Zero-event actors omitted. | `requirements.md` 3.1, 3.3–3.5; `design.md` DD6, C36 |
| A5 | Check order | Authenticate, then the board ID and any query parameter (400), then board access (404, C1). | `requirements.md` 5.1, 5.2; `design.md` DD8, C38 |
| A6 | Read-only | No lock, event, notification or version change. `private, no-store` kept through the same-origin handler. | `requirements.md` 5.4, 5.5, 8.1; `design.md` DD7 |
| A7 | Roles | Every current participant, member or admin. | `requirements.md` 5.3; `design.md` C38 |
| A8 | Panel reads | Through a same-origin handler on mount, after a successful local change that advances `position_version`, and on Refresh. No polling. Loading and errors stay in the panel. Stale responses after a newer request or a board switch are ignored. | `requirements.md` 6.4–6.8; `design.md` DD9, DD11, R4, R5, R8 |
| A9 | Presentation | One `.surface` panel, text figures, existing tokens, decorative bars, 44 by 44 CSS px Refresh, usable at 320 and 375 px. | `requirements.md` 6.2, 7.1–7.3; `design.md` DD10, DD12, "Mobile design" |
| A10 | Timing | Record observed E29 latency on a 100-card board. A measurement only. | `requirements.md` 8.8; `design.md` "Browser checks" |

### Design synchronization (2026-11-14)

Applied at the user's request while the design is under review: `docs/API.md` (the E29 row, the data shapes and the C34–C38 paragraph), `specs/design.md` (D6), `specs/requirements.md` (AC11.1), `backend/specs/api-contract.md` (`analytics_bp`), `docs/TEST-PLAN.md` (V08 and V11) and `specs/CHANGELOG.md`. Root `specs/tasks.md`, `specs/traceability.md`, `guidelines/frontend.md`, the layer specs, the README and the application changelogs are unchanged. Spec review only: no source code or test was changed and no test was run.

### Design review items R1–R8 (approved 2026-11-14)

| ID | Item | Proposal |
| --- | --- | --- |
| R1 | Timestamp format | Format the two bounds in the service with `strftime(...Z)`. `UtcDateTime` writes `+00:00` and stays unchanged. |
| R2 | Three statements, no snapshot | Accept. A concurrent commit may differ by one event between figures. The next read corrects it. |
| R3 | Panel placement | Below the Kanban region in `BoardShell`. |
| R4 | A version rise during a read | Compare with the version current when the last read started. A rise aborts the read and starts a new one. |
| R5 | Refresh and Retry | Keep both. Both call the same function. |
| R6 | Index | No new index. `ix_board_events_board_occurred` serves both event queries. |
| R7 | Clock source | `utcnow` imported by name in the service and replaced in tests. |
| R8 | Polling | None in this slice. |

### Analytics finalize and implementation record (2026-11-14)

The user's invocation `/revotask-feature implement analytics T14` (all tasks) was the plan approval, as for T10 to T13. Claude Code completed task 0.2 (the root T14 link, traceability, the layer specs and the guideline component table) and then every native group of `.kiro/specs/analytics/tasks.md`. The decisions A1–A10 and the design held without change to behavior or contract. Deviations that touched the spec (no behavior or contract change) are in `specs/CHANGELOG.md`: Refresh and Retry use the `ghost` button variant, a failed first read shows the error and not the loading text, and one lint suppression guards the in-flight flag. Evidence: `evidence/analytics-T14.md`. Backend 2050 passed and 1 skipped (64 new tests, four mutation checks each made a test fail), frontend 2031 passed with lint, typecheck and `next build` clean, a 128-check Chrome run (emulation) at 320, 375, 768 and 1280 px with 0 failed, and an E29 timing of p95 6.2 ms on 100 cards (a measurement). One mutation check first passed all tests, which exposed a missing case (a column holding only deleted cards), and the test was added. Open: Playwright (V10), real-device checks (T15), deployed timing and deployment (T16). Tool attribution: requirements, design, tasks, code, tests, measurement scripts and documentation by Claude Code. No Kiro generation is recorded for this slice.


## Local acceptance review record (T15)

Review of `.kiro/specs/local-acceptance/` (requirements.md, design.md). Requirements were drafted by Claude Code (`/revotask-feature spec local-acceptance T15`, 2026-11-15). Design was drafted by Claude Code in the same session after the user's approval. Spec review only: no source code, test, dependency, README or changelog was changed and no test was run. Root T15 stays unchecked. Prerequisite check: T04 and T09–T14 are checked in `specs/tasks.md`, and their evidence files exist.

| Phase | Status | Note |
| --- | --- | --- |
| Requirements | Approved 2026-11-15 (user, in chat) | 11 criteria LA-1 to LA-11. The user approved all six defaults: decisions 1 to 6. |
| Design | Drafted 2026-11-15, pending review | `design.md`: 13 sections. Named tests map V09, V10, the boards-membership journey and the comments journey (section 5). Implementation order in section 11. |
| Tasks | Not started | Next step after design approval. |
| Implementation | Not started | No dependency installed, no test written. |

### Decisions 1–6 (approved 2026-11-15)

| ID | Decision | Resolution | Where applied |
| --- | --- | --- | --- |
| 1 | Playwright | Exact-pinned `@playwright/test` devDependency, lockfile committed, `frontend/playwright.config.ts`, specs in `frontend/e2e/`. | `requirements.md` decisions; `design.md` sections 2, 11, 13 |
| 2 | Browsers | Chromium only. Browser and viewport recorded for each mobile check. | `design.md` section 5 |
| 3 | Servers | Flask on 5001 and Next.js started manually. Playwright starts nothing. Preflight checks both services and proves Flask writes to `TEST_DATABASE_URL` with a marker board before any data is written. | `design.md` sections 1, 3 |
| 4 | Timing fixture | One 100-card board in the test database, unique per-run tag, cleanup of all run records including browser-created ones, cleanup failure reported. | `design.md` sections 4, 7 |
| 5 | Mobile coverage | Desktop and mobile emulation recorded separately. Real device and on-screen keyboard stay open for T16. | `design.md` sections 5, 8 |
| 6 | Route interception | Only LA-6b (forced 500) and LA-6c (uncertain outcome). LA-6a (409) uses a real stale version, no interception. Interception recorded per case. | `design.md` section 5 |

### Design choices the user did not specify (for review)

| Item | Choice | Alternative and consequence |
| --- | --- | --- |
| Forced 409 | Real stale version through a second session, not interception. | Interception would also pass, but would not exercise the server conflict. |
| Login budget | Three owner logins per run, one member login, two registrations, so the default limits (5 per minute per email, 5 per minute register) hold. A 429 waits once. | Disabling limits would simplify runs but would break the "real stack" rule. |
| `psql` for the marker and cleanup | Uses `/opt/homebrew/bin/psql` against `TEST_DATABASE_URL`. | A Node driver would add a runtime-free dev dependency. `psql` is local and needs no package. |
| Product change | Two test hooks only: `data-testid="card-<id>"` on `BoardCard.tsx` and the `Open <title>` name if missing. | No behavior change. |
| Revoked tokens | Not cleaned, because the rows carry no user ID. | Leaves rows in the disposable test database. |

### Open items for implementation

- Confirm `psql` reaches `TEST_DATABASE_URL` from the run shell.
- Confirm the accessible name of the card open control in `BoardCard.tsx`.
- Confirm the browser-visible move path (`/api/cards/<id>/position`) used by the rollback interception.
- Install `@playwright/test` at a version at least two weeks old, pinned exactly.

### Design revision 2 (2026-11-15, user review in chat)

Applied to `.kiro/specs/local-acceptance/design.md` (revision 2) and `tasks.md` (drafted). Spec review only: no source code, test, dependency or changelog was changed and no test was run. Tool: Claude Code.

| ID | User change | Resolution in design and tasks | Verification planned |
| --- | --- | --- | --- |
| 1 | Verify the database before any write | Marker-board write removed. Read-only proof (design 3.6): the Flask PID's established connections, matched in `pg_stat_activity`, must all be to `TEST_DATABASE_URL`'s database. Stops before any mutating request. Negative control with a non-test `DATABASE_URL`. Credentials never logged. | Task 1.6, gate B |
| 2 | Portable `psql` | `PSQL` override, else `PATH`. Connectivity checked in preflight with `select 1`. Credentials via child-process environment, not argv. | Tasks 1.3, 1.4 |
| 3 | Token revocations in cleanup | Exact `jti` values tracked per run (decoded, not verified; only `jti` and `expires_at` stored). Deleted after users. Verified by blocking spike: a removed user's token must return 401. If not, an isolated disposable database replaces it. | Tasks 2.2, 2.3 (gate C), 2.4, 12.3 |
| 4 | Rate-limit budget | Approved: 2 registrations, owner 3 logins, member 1 login. One bounded retry on unexpected 429 in setup, using `Retry-After` (cap 70 s, default 60 s). No LA check asserts 429. | Task 1.7 |
| 5 | Selectors and move route | Card open name `Open <title>` already exists (`BoardCard.tsx`). No `card-<id>` hook added. Move route confirmed: `PATCH /api/cards/<id>/position` (`apiClient.ts:44`, `useKanbanBoard.ts:266`) to Next `app/api/cards/[id]/position/route.ts`. Interception pattern confirmed by spike. Real 409 from a second session. | Task 7.2 spike; tasks 6.1, 7.1 |
| 6 | Viewport labels | Each project records viewport, browser and input mode. Desktop drag recorded separately from touch emulation (320, 375, 768). Real device and on-screen keyboard open for T16. | Tasks 10.1 to 10.3 |

### Items needing the user's decision

- Root `specs/tasks.md` T15 names `card-<id>` test IDs. The design does not add them, because the accessible name and existing drop-zone IDs are enough. Confirm the wording change; if it is kept as written, a one-line test-only hook goes in `BoardCard.tsx`. Task 12.4 records the choice.
- Task 1.6 depends on `lsof` and `pg_stat_activity` visibility for the run role. If either is unavailable, the run stops and no data is written.
- Docker Compose runs are not covered by the database proof. Use the native Flask process.

### Tasks approval and T15 wording change (2026-11-15, user, in chat)

Applied by Claude Code. Spec review only, plus the Group 1 implementation record below.

| Item | Record |
| --- | --- |
| Tasks | Approved 2026-11-15 (user, in chat). `.kiro/specs/local-acceptance/tasks.md`: groups 0 to 12. Implementation started at Group 1. |
| Root T15 wording | Changed in `specs/tasks.md`, row T15. Before: test IDs `card-<id>`, `dropzone-<columnId>-before-<cardId>` and `dropzone-<columnId>-end`. After: "stable selectors for the V10 card interactions: the card's accessible name for the open control, and the drag source scoped to the fixture card in its source column (drop zones `dropzone-<columnId>-before-<cardId>` and `dropzone-<columnId>-end`)". Reason: the user's decision. The accessible name already exists (`BoardCard.tsx`, `Open ${card.title}`), so the `card-<id>` hook is not needed. |
| Product code | `BoardCard.tsx` unchanged, as instructed. No product file changed. |
| Design | `.kiro/specs/local-acceptance/design.md` section 6 updated to the resolved wording. |

### Group 1 implementation record (2026-11-15, Claude Code)

| Task | Result | Evidence |
| --- | --- | --- |
| 1.1 pinned dependency | `@playwright/test` 1.64.1 (released 2026-10-14, at least two weeks old on 2026-11-15; 1.65.0 released 2026-11-05 was too new). Lockfile diff: 46 added lines, no removed lines. `npm ci` completed with install-script warnings only. The lockfile change is not committed. | `frontend/package.json`, `frontend/package-lock.json` |
| 1.2 Chromium | `npx playwright install chromium` installed Chrome Headless Shell 156.0.8078.4. | Command output |
| 1.3 `psql` helper | `e2e/support/psql.ts`. Unit tests: 9 passed (`npm run e2e:unit`). Covers the `_test` rule, the app-name rule, no URL or password in argv or errors, PATH and PSQL resolution, and redaction of a failing `psql`. | `frontend/e2e/support/psql.unit.ts` |
| 1.4 connectivity | `select 1` returned 1 against `revotask_test` on 127.0.0.1:5432. | `LA_LIVE=1 npm run e2e:unit`-style run of `preflight-steps.live.unit.ts` |
| 1.5 services and listener | Flask health 200; Next `/login` 200 at localhost:3000; exactly one listener on 5001 (pid 2092). | Same live run |
| 1.6 database proof | **Open.** Positive: native Flask on the test database (port 5002) gave `1 backend(s) of pid 34198 in revotask_test`, PASS. Negative control: native Flask on the dev database (port 5003) gave FAIL, `app connected to a database other than revotask_test`. Port 5001 is held by Docker container `revotask-backend-1`, not native Flask (pid 2092 is `com.docker.backend`). Its connections go to the dev database, so step 6 stops the run. Gate B stays closed. Both control processes were stopped. | `frontend/e2e/support/proof.live.unit.ts`, `preflight-steps.ts` |
| 1.7 retry helper | `e2e/support/retry.ts`. Unit tests: 4 passed. One retry honoring `Retry-After` (cap 70 s, default 60 s), stop on a second 429, no wait when the first response is not 429. | `frontend/e2e/support/retry.unit.ts` |

Other changes in this group, outside the task list: `.gitignore` rules for run artifacts were anchored to the repo root, so `frontend/playwright/.auth/`, `frontend/playwright/.run/` and `frontend/playwright-report/` were not ignored. Changed to `**/playwright/.auth/`, `**/playwright/.run/` and `**/playwright-report/`, and verified with `git check-ignore`. `npm run typecheck` and `npm run lint` pass. The root `.gitignore` holds the ignore rules (design section 2 said `frontend/.gitignore`).

### Decision needed before groups 2 onward

Port 5001 is held by the Docker Compose backend (`revotask-backend-1`). The approved run needs native Flask on 5001 connected to `TEST_DATABASE_URL`. Options: (a) stop the Compose backend and start native Flask on 5001 with the test database for the run, then restart Compose after; (b) change the run to another port, which needs a design change; (c) keep Compose and let the preflight stop. Task 1.6 stays open until one of these is chosen and the proof passes on the run's port.

### Implementation pass (2026-11-15, Claude Code)

Request: "implement tasks T15. All of it." Group 1 committed separately on branch `t15-local-acceptance`, commit `5d27b81`.

| Group | State | Note |
| --- | --- | --- |
| 1 | Done except 1.6 | 1.6 open: port 5001 held by Docker container `revotask-backend-1` |
| 2 to 11 | Code written, not run | Typecheck and lint pass. `--list` shows 46 tests. Cleanup SQL verified on `revotask_test` with a no-match run id. |
| 12 | Not done | Needs a completed run |

Changes from the approved design, found while writing the code:
- Owner logins are four per run, not three: setup, LA-2a, LA-2b and LA-2d (a fresh sign-in, so LA-2d does not revoke the session other suites use). Still within the limit of 5 per minute per email.
- LA-2d replays the revoked token against E30 and expects 401. Design 4 also requires the spike in task 2.3 (a removed user's token returns 401) before cleanup relies on it. Task 2.3 has not run.
- Passwords are set in process.env in global setup, in memory, for the worker processes. They are never written to a file.
- The run file under `playwright/.run/` stores only jti, expiry and a label.

Blocking decision (unchanged): choose (a) stop the Compose backend and run native Flask on 5001 for the run, (b) another port (needs a design change), or (c) keep Compose and let the preflight stop.

### Implementation record: decision on port 5001 and completion (2026-11-15, Claude Code)

Request: `/revotask-feature` with "implement all local acceptance T15 tasks. all of the tasks." The user did not pick option (a), (b) or (c) of the port decision. Claude Code took option (a) on its own reading of that instruction: it stopped the Compose backend (`docker compose stop backend`), ran native Flask on 5001 against the test database, and started Compose again after the run. This is recorded so the user can reverse it.

| Item | Result |
| --- | --- |
| 1.6 database proof | Passes on port 5001 (2 backends of the Flask pid, all in `revotask_test`). The negative control from the earlier session (dev database on port 5003) stopped the proof |
| 2.3 token spike (gate C) | Pass. E30 returns 401 for the token of a deleted user. `e2e/token-spike.live.unit.ts` |
| Groups 3 to 10 | First live run: 22 of 46 passed. Fixes to the test code (selectors, waits, the stale-version race) and two product defects (below). Final run: 54 passed, 0 failed |
| Group 11 | pytest 2058 passed and 1 skipped, Vitest 2039 passed. Bundle sentinel build and the secret scan pass (isolated copy, `--webpack`) |
| Group 12 | Evidence written, privacy review done, cleanup count 0, documentation updated |

Changes from the approved design: 4 owner logins per run (already noted above), the matrix audits a dialog alone and waits for its open transition, 8 more matrix rows for the analytics and notifications dialogs (10 per project, 40 in all, so the row count is 10 rows per project and not 6 routes plus 2 dialogs), and the product fixes below. The spec changelog records the design revision.

Product change outside the design ("Product changes: None"): the LA-8 matrix found two touch-target defects, so two class changes were made with regression assertions. F-T15-01: `MembersPanel` Members button 40 px wide. F-T15-02: `AppHeader` brand link 28 px wide below 400 px. The design says a defect's fix goes through its own change. These two are small and sit in the same working tree, and they are listed separately in `CHANGELOG.md` and `frontend/CHANGELOG.md` so they can be split out or reverted.

Root T15 is checked in `specs/tasks.md`. Open for T16: real phone and on-screen keyboard, CI with isolated PostgreSQL, deployment, live timing and live Playwright.

