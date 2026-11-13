# Kiro Feature Spec Review

Status: Pending. Add a record for each relevant Feature Spec after Kiro generates Requirements, Design and Tasks. Use the rubric checklist to track review evidence across slices. Cite the actual file and heading for each observation.

| Evidence | Result |
|---|---|
| Native Kiro spec directory | `.kiro/specs/foundation/` (requirements.md, design.md, tasks.md) |
| Requirements, design and tasks paths | `.kiro/specs/foundation/requirements.md`, `design.md`, `tasks.md` |
| Root submission copies and spec revision | Pending |
| Kiro generation or review evidence | Drafted in the workspace by the agent under the Requirements-First steps. The Kiro UI phase approvals are not recorded here. Review decisions are in each file's Decisions and Assumptions sections. |

## Requirements review

| Dimension | What to inspect | Findings and references |
|---|---|---|
| Completeness | Roles, alternate flows, error outcomes and missing acceptance criteria | Pending |
| Clarity | Terms, state changes and authorization boundaries | Pending |
| Testability | Observable inputs and outcomes, measurable constraints and AC IDs | Pending |
| Feasibility | Compatibility with the chosen stack, data and delivery constraints | Pending |

## Design and tasks review

| Area | Location | Finding or decision | Alternative and consequence | Accepted action |
|---|---|---|---|---|
| Architecture or API decision | | | | |
| Task dependency or oversized task | | | | |
| Requirement-to-route/page-to-task traceability | | | | |

## Refinement record

| Finding ID | Prompt used | Before and after | Verification | Commit or diff |
|---|---|---|---|---|
| | | | Pending | |

Record the observed review counts against [the rubric mapping](../docs/RUBRIC.md). Use the [specification changelog](../specs/CHANGELOG.md) for agreed version changes. Preserve any unresolved findings for follow-up.

## Foundation refinement record (T01–T02)

Findings below are the ones confirmed by a check, a probe or a read of the code. Specification changes are in `specs/CHANGELOG.md`. Full check outcomes are in `evidence/foundation-T01-T02.md`.

| Finding ID | Prompt used | Before and after | Verification | Commit or diff |
|---|---|---|---|---|
| F-T02-01 | Implementation review of `migrations/env.py` | Before: a SELECT before begin_transaction made `db upgrade` exit 0 with no DDL. After: separate check connection. | Lifecycle run; 10 objects in `revotask` after re-upgrade | Uncommitted working tree |
| F-T02-02 | Same | Before: `fileConfig()` disabled `revotask.*` loggers. After: `disable_existing_loggers=False`. | Direct probe (disabled=True before the fix). Request-log tests pass. | Uncommitted working tree |
| F-T02-03 | Same | Before: the factory did not import models, so autogenerate was empty. After: `from app import models` in `create_app`. | `db migrate` detected all nine tables | Uncommitted working tree |
| F-T02-04 | Drift review, design §5.4 | Before: `include_name` / `include_object` filters gave phantom or hidden differences from the `$user` search path. After: migration engine with `search_path=public` and no filters. | Zero differences at head. Injected column detected. | `specs/CHANGELOG.md`, design §5.4 |
| F-T02-05 | Design review, §4.2 | Before: `create_app(overrides)`. After: `create_app(env)`. | `test_settings_do_not_read_the_process_environment_when_env_is_given` | `specs/CHANGELOG.md` |
| F-T02-06 | Design review, §5.2 | Before: text said the order column compiles to DOUBLE PRECISION. After: FLOAT(53) compiled, double precision stored. | `test_order_columns_are_double_precision_float_with_precision_53`; catalog test | Design §5.2 and §8 text |
| F-T01-01 | Environment review | Port 5000 answered by macOS AirPlay Receiver. | `curl` 403 from AirTunes. Same code passes on port 5001. | Open. Decision needed. |
| F-T01-02 | Dependency review | npm audit: 7 moderate, dev-only (`minimatch` via `typescript-eslint`). | `npm audit`; non-forced `npm audit fix` changed nothing. | Open. Decision needed. |

## Foundation refinement record, revision 2 (port, Docker, advisory)

| Finding ID | Prompt used | Before and after | Verification | Commit or diff |
|---|---|---|---|---|
| F-T01-01 (closed) | Port review | Before: Flask on 5000, blocked by AirPlay Receiver. After: Flask on 5001, AirPlay Receiver kept enabled. Native tasks 1.7 and 2.9 pass on 5001. | `curl` 200 and 405 on 5001; pytest 186 passed | Uncommitted working tree, `specs/CHANGELOG.md` |
| F-T01-02 (open, dev-only) | Dependency review | `minimatch` 10.2.6 under `typescript-estree` 8.72.2. No stable `typescript-eslint` release uses a patched `minimatch`. | `npm audit --omit=dev` 0; `npm audit` 7 moderate; lint, test and build pass; no dependency change | `frontend/CHANGELOG.md`, `evidence/foundation-T01-T02.md` revision 2 |
| F-T02-07 | Scope review | Before: Docker and Gunicorn planned for T16. After: FND-R10 and tasks 1.8 to 1.10 in T01 (Dockerfile, `.dockerignore`, `compose.yaml`, Gunicorn pin). | `docker compose config --quiet`; image inspection; health 200 in container; `db current` at head | `requirements.md` FND-R10, `design.md` DD11 and §4.7, `specs/CHANGELOG.md` |
| F-T01-03 | Render doc review | Before: runbook used a native Python runtime with `pip install` and `gunicorn` commands. After: Docker Web Service from `backend/Dockerfile`, `PORT` from Render, migrations as a separate one-off step. | Render Docker, web-service and secret-file pages fetched 2026-11-13 | `docs/DEPLOYMENT.md` section 3 |
| F-T01-04 | Render doc review (secret files) | Render copies secret files into the Docker build context. Before: `supabase-ca.crt` was not excluded. After: `backend/.dockerignore` excludes it. | `.dockerignore` contents; secrets scan finds no credential values | `backend/.dockerignore` |
| F-T02-08 | Compose review | Before: a container connecting to `127.0.0.1` would reach itself. After: Compose overrides `DATABASE_URL` with `DOCKER_DATABASE_URL` (`host.docker.internal`). `backend/.env` still supplies the other settings. | Connection and `db current` from the container | `compose.yaml`, `docs/DEVELOPMENT.md` |

## Authentication refinement record (T03–T04)
Findings below were confirmed by a check, a probe or a read of the code or the installed docs. The Requirements round (decisions P1–P10 and C1–C10) is in `.kiro/specs/authentication/requirements.md`, "Decisions confirmed in review". Specification changes are in `specs/CHANGELOG.md`. Full outcomes are in `evidence/authentication-T03-T04.md`.

| Finding ID | Prompt used | Before and after | Verification | Commit or diff |
|---|---|---|---|---|
| F-AUTH-01 | Design review, root traceability against D2 | Before: E30–E31 belonged to T12, which depends on T04, so the shell had no way to load the user. After: T03 owns the E30 read (P1). | `test_users_me.py`; shell renders the user in the Chrome run | `specs/CHANGELOG.md`, `specs/tasks.md` |
| F-AUTH-02 | Design review of the JWT library | Before: the spec assumed JWT errors reach the envelope. The installed library returns 422 and `{"msg": ...}` for an invalid token. After: all five callbacks return 401 `AUTH_REQUIRED` (DD2). | `test_auth_guard.py`, 22 cases | design DD2, `evidence/authentication-T03-T04.md` F-T03-01 |
| F-AUTH-03 | Requirements review, contract check | Before: no rule for malformed JSON, content type or size. After: 400, 415 `UNSUPPORTED_MEDIA_TYPE`, 413 `CONTENT_TOO_LARGE` (P3 revised). | `test_validation.py`, handler tests, smoke 1 | `docs/API.md`, `backend/specs/api-contract.md` |
| F-AUTH-04 | Mobile review of the baseline | Before: AC13.1 covered only the core flow, and no guideline covered touch targets or input size. After: FE-S4 to FE-S6 and AUTH-R13. | Chrome run, 90 of 90 | `guidelines/frontend.md`, `specs/requirements.md` |
| F-AUTH-05 | Implementation review of `NextResponse.cookies` | Before: design said `response.cookies.set`. After: `Set-Cookie` is written by hand, because the helper also copies the token into `x-middleware-set-cookie`. | `login/route.test.ts` | design §6.5 |
| F-AUTH-06 | Implementation review of `bff.ts` and `authRules.ts` | Before: `fields[key] = ...` lost a `__proto__` key. After: entries and `Object.fromEntries`. | `bff.test.ts`, `authRules.test.ts` | `frontend/lib/server/bff.ts` |
| F-AUTH-07 | Real-browser run | Before: `error.tsx` used `reset()`, which does not re-fetch in Next 16.4. After: `retry()`. | `error.test.tsx`; Chrome recovery check | `specs/CHANGELOG.md`, `frontend/specs/error-handling.md` |
| F-AUTH-08 | Negative control on the limiter | Before: DD11 claimed hook order was required. After: decorator limits run in the view wrapper, so the order is kept as a precaution only. | `test_rate_limit.py`, control run | design DD11 |
| F-AUTH-09 | Shared-case run | Before: two rule implementations could drift. After: Flask and TypeScript pass the same 56 cases with no correction. | `test_auth_schema.py`, `authRules.test.ts` | `specs/fixtures/auth-field-cases.json` |
