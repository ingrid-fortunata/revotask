# Requirements · foundation (T01–T02)

**Status:** Revised after Requirements review. Ready for phase review together with `design.md` and `tasks.md`. Nothing here is implemented or verified. The repository holds specs only (`backend/` and `frontend/` contain `specs/` and `CHANGELOG.md`).
**Root tasks:** T01 (local scaffolds, pinned versions, env examples, lint/type/test commands) and T02 (SQLAlchemy models, first migration, bounded DB readiness).
**Baseline:** 0.4.0. Sources: `PROJECT-BRIEF.md`, `specs/FEATURE-QUEUE.md`, `specs/requirements.md`, `specs/design.md` (D1, D2, D3, D6), `specs/tasks.md`, `specs/traceability.md`, `docs/API.md` (E01), `docs/TEST-PLAN.md`, `docs/DEVELOPMENT.md`, `docs/DEPLOYMENT.md`, `backend/specs/*`, `frontend/specs/*`, `guidelines/*` (BE01–BE08, DB01–DB07, FE-C1, FE-S1, FE-A4).

## Introduction

Foundation gives later slices a runnable base. A developer can start a Flask API and a Next.js shell locally, create the `revotask` schema, apply one reviewed migration to a clean PostgreSQL database, and call `GET /api/health`. It adds no user-facing product behavior. Authentication (T03–T04) is the next slice and depends on everything here.

**Actors.** The actors are a developer or assessor running the project locally, and any anonymous HTTP client calling the public health route. No signed-in user, board member or board admin behavior exists in this slice. The only role boundary is that health is public and returns no private data.

## Scope

**In scope**

- Flask application factory, environment validation, request ID, shared JSON error envelope (404, 405, 500, 503), `GET /api/health` (E01).
- Next.js App Router scaffold with TypeScript, Tailwind CSS, daisyUI and a placeholder page.
- Pinned runtimes and dependencies, lint/type/test commands, committed lockfiles.
- SQLAlchemy models for all nine tables in `backend/specs/data-model.md`, a schema bootstrap command, and the first Alembic revision.
- Database-level constraints and indexes from the data model.
- pytest infrastructure against an isolated PostgreSQL test database.
- Checking and, where missing, creating the local `revotask` role and the `revotask_dev` and `revotask_test` databases.
- Documentation that T01/T02 require (`docs/DEVELOPMENT.md`, `docs/DEPLOYMENT.md` schema provisioning, README status, changelogs).

**Out of scope (owned elsewhere)**

- Register, login, logout, JWT guard, Argon2, rate limiting, Marshmallow feature schemas, domain exception classes other than those in this slice, and JSON handling of other framework 4xx errors such as malformed JSON, 413 or 415 (T03). No foundation route accepts a body.
- Next Route Handlers, server-only API client, `AuthContext`, protected shell, toasts (T04).
- Board, column, card, comment, notification, analytics and profile routes and UI (T05–T14).
- Playwright installation and suites, and performance measurement (T15, V12).
- Runtime versus migration database roles, TLS verification, Supabase provisioning, the live Render service, Vercel, CI and live deployment (T16). Revision 2 adds the Docker image and Compose service for local runs and pins Gunicorn (FND-R10).
- Seed or demo data.

## Requirements

Feature-local IDs use `FND-R<n>` and `FND-AC<n>.<m>`. Root IDs are unchanged. No new root IDs are proposed.

### FND-R1 · Backend scaffold (T01)

_As a developer, I can start the Flask API locally from a clean checkout._

- **FND-AC1.1** WHEN the required environment variables are valid, THEN `from app import create_app; create_app()` returns a Flask app, and `flask --app app:create_app run` serves requests on `http://127.0.0.1:5001`.
- **FND-AC1.2** `create_app()` raises a configuration error that names the offending variable, without printing any variable value, WHEN:
  - `DATABASE_URL` or `JWT_SECRET_KEY` is missing or empty.
  - `DATABASE_URL` does not use the `postgresql+psycopg://` scheme.
  - `APP_ENV` is not one of `development`, `test`, `production`.
  - `LOG_LEVEL` is not a standard logging level name.
  - `APP_ENV=production` and `JWT_SECRET_KEY` is shorter than 32 characters.

  (BE08)

- **FND-AC1.3** The factory initializes SQLAlchemy, Flask-Migrate and Flask-JWT-Extended and registers the health route. It registers no auth or feature routes. (BE01, `backend/specs/architecture.md`)
- **FND-AC1.4** The backend targets CPython 3.14.5, recorded in a committed `backend/.python-version`. In a clean virtual environment on that interpreter, installing `requirements-dev.txt` succeeds and the models import. IF any pinned package fails to install or import, THEN implementation stops and reports the package, version and error before any other runtime is proposed. Render runtime configuration is not part of this feature.
- **FND-AC1.5** `backend/requirements.txt` lists runtime dependencies only. `backend/requirements-dev.txt` begins with `-r requirements.txt` and adds pytest, Ruff and python-dotenv. Direct dependencies use exact `==` pins.
- **FND-AC1.6** From `backend/`, the Ruff lint and format checks and `pytest -v` run and pass. (BE08)

### FND-R2 · Frontend scaffold (T01)

_As a developer, I can start the Next.js app locally from a clean checkout._

- **FND-AC2.1** After `npm ci`, `npm run dev` serves a placeholder page at `http://localhost:3000`, and `npm run build` succeeds with no routes beyond that page.
- **FND-AC2.2** The placeholder page uses Tailwind utilities and at least one daisyUI component class. The built CSS contains the daisyUI rule for that class. (FE-S1)
- **FND-AC2.3** `npm run lint`, `npm run typecheck` and `npm test` pass. `npm test` runs Vitest with jsdom and React Testing Library, and includes at least one test that asserts rendered content, not only a mount. (FE-A4)
- **FND-AC2.4** The page file is a synchronous Server Component with no `"use client"` boundary. (FE-C1)
- **FND-AC2.5** The scaffold has no Route Handlers, no API client and no fetch to Flask. The Node version is pinned in committed configuration, and `package-lock.json` is committed.

### FND-R3 · Configuration and secret hygiene (T01)

_As a developer, I can configure both apps from the provided examples without committing secrets._

- **FND-AC3.1** `backend/.env.example` and `frontend/.env.example` keep their current variable names and placeholders. `JWT_SECRET_KEY` stays blank.
- **FND-AC3.2** `git check-ignore` reports `backend/.env` and `frontend/.env.local` as ignored, and `git ls-files` lists no `.env*` file other than the two examples.
- **FND-AC3.3** No server-only variable (`API_BASE_URL`, `APP_ORIGIN`, any database or JWT value) reaches browser code. The scaffold uses no `NEXT_PUBLIC_` variable, and a search of the `.next/` build output for a sentinel secret set in the build environment finds nothing. (Root AC13.3, secrets part)

### FND-R4 · Data models (T02)

_As a later feature author, I can rely on SQLAlchemy models that match the approved data model._

- **FND-AC4.1** Models exist for `users`, `boards`, `board_members`, `board_columns`, `cards`, `card_comments`, `notifications`, `board_events` and `revoked_tokens`, with the column names, types, nullability and lengths in `backend/specs/data-model.md`. (DB01)
- **FND-AC4.2** All tables live in the `revotask` schema and foreign keys are schema-qualified. Primary keys are UUIDs generated with `uuid.uuid4` (`jti` for `revoked_tokens`). Timestamps are timezone-aware UTC. Soft-deletable models have required `created_at` and `updated_at` and nullable `deleted_at`. `updated_at` refreshes on update. (DB01, DB02)
- **FND-AC4.3** Relationships are declared on both sides with `back_populates`, including `Board`–`BoardColumn` and `BoardColumn`–`Card`. (DB03)
- **FND-AC4.4** `order` is `DOUBLE PRECISION` on `board_columns` and `cards`. (DB05)
- **FND-AC4.5** No code path creates application tables with `create_all`. The Alembic revision is the only schema source.

### FND-R5 · Schema bootstrap and first migration (T02)

_As a developer, I can build the schema from an empty database, inspect it, and reverse it._

- **FND-AC5.1** `flask --app app:create_app bootstrap-schema` creates the `revotask` schema WHEN it is missing. WHEN the schema already exists, it exits 0 and changes nothing, including existing tables and data. It never drops or alters an existing schema.
- **FND-AC5.2** On a database with an empty `revotask` schema, `flask --app app:create_app db upgrade` creates the nine tables and `revotask.alembic_version`. `flask db current` reports the head revision. (DB06)
- **FND-AC5.3** WHEN `db upgrade` runs and the `revotask` schema does not exist, THEN it exits non-zero, creates nothing, and its message tells the developer to run `bootstrap-schema`. Migration environment code does not create the schema.
- **FND-AC5.4** Inspecting the upgraded database shows the column types, nullability, primary keys, unique constraints, check constraints and foreign keys from the data model, with `ON DELETE RESTRICT` on every foreign key.
- **FND-AC5.5** Inspection shows these indexes, limited to active rows (`deleted_at IS NULL`) where the model has `deleted_at`: memberships by `user_id`; columns by `(board_id, order, id)`; cards by `(column_id, order, id)`; cards by `assignee_id`; comments by `(card_id, created_at, id)`. Also notifications by `(recipient_id, created_at, id)` plus an unread lookup, `board_events` by `(board_id, occurred_at)`, and `revoked_tokens` by `expires_at`.
- **FND-AC5.6** Running `upgrade` a second time changes nothing. `downgrade base` removes every table the revision created and leaves the schema and an empty `alembic_version` table. A following `upgrade` succeeds.
- **FND-AC5.7** After `upgrade`, Alembic autogenerate against the models reports no differences. IF autogenerate cannot compare an object type (for example check constraints), THEN a catalog-level inspection test covers it and the gap is documented.
- **FND-AC5.8** WHEN the database is unreachable, THEN `bootstrap-schema` and `db upgrade` exit non-zero with a message that does not print the connection string.

### FND-R6 · Database-enforced invariants (T02)

_As a later feature author, I can rely on PostgreSQL rejecting data that breaks the baseline's invariants, even if application code is wrong._

- **FND-AC6.1** Inserting a second user whose email differs from an existing one only by case or surrounding whitespace is rejected. Inserting a user whose stored email is not trimmed and lowercase is rejected. (Root AC01.2, DB04)
- **FND-AC6.2** For `board_columns` and `cards`, an `order` of `0`, a negative number, `Infinity`, `-Infinity` or `NaN` is rejected. Positive finite values such as `0.5` and `1024` are accepted. (DB05, NFR 4)
- **FND-AC6.3** A second active Done column on the same board is rejected. It is accepted on a different board, and also after the first Done column is soft-deleted. (Root AC05.1, DB04)
- **FND-AC6.4** The following are rejected: a duplicate `(board_id, user_id)` membership, a role other than `admin` or `member`, a negative `position_version`, a notification kind other than `assigned` or `commented`, a board event kind outside the five in the data model, and a duplicate `revoked_tokens.jti`.
- **FND-AC6.5** Physically deleting a row that another row references is rejected. Soft deletion by setting `deleted_at` is the supported path.

### FND-R7 · API health and shared error envelope (T02, E01)

_As an operator or assessor, I can check that the API is up and can reach its database._

- **FND-AC7.1** WHEN the database answers within the bound, THEN `GET /api/health` without credentials returns 200 with `{"data": {"status": "ok"}}`.
- **FND-AC7.2** WHEN the database is unreachable, refuses the connection, or does not answer within the bound, THEN `GET /api/health` returns 503 with code `SERVICE_UNAVAILABLE`, a fixed safe message and `request_id`. The response contains no connection string, host, driver message or stack trace. The bound is a 2-second connection timeout plus a 1-second statement timeout, so the response arrives within 3 seconds plus a small margin.
- **FND-AC7.3** The health route performs no write and returns no user data.
- **FND-AC7.4** WHEN a request targets an unknown path, THEN the response is 404 with code `NOT_FOUND` in the standard envelope.
- **FND-AC7.5** WHEN a known path is called with an unsupported method (for example `POST /api/health`), THEN the response is 405 with code `METHOD_NOT_ALLOWED` in the standard envelope, and the `Allow` header lists the supported methods. (Approved contract change; see `specs/CHANGELOG.md`.)
- **FND-AC7.6** WHEN an unhandled exception occurs, THEN the response is 500 with code `INTERNAL_ERROR`, a fixed safe message and `request_id`, and the database session is rolled back.
- **FND-AC7.7** Every response carries a request ID in the `X-Request-ID` header. Error bodies carry the same value in `error.request_id`. A well-formed inbound `X-Request-ID` (1–64 characters of letters, digits, `-` and `_`) is reused. Otherwise one is generated.
- **FND-AC7.8** Each request logs request ID, route pattern, status and, for errors, the error code. Logs contain no secrets, tokens, connection strings or request bodies. (BE05)

### FND-R8 · Verification and handoff (T01, T02)

_As a reviewer, I can reproduce the checks and see accurate documentation._

- **FND-AC8.1** Backend tests run against `TEST_DATABASE_URL`. Test setup refuses to run WHEN `TEST_DATABASE_URL` equals `DATABASE_URL`, its database name does not end in `_test`, or its host is not local. (`docs/DEVELOPMENT.md`, "Environment contract")
- **FND-AC8.2** Test setup builds the schema by running `bootstrap-schema` and the migration, not `create_all`.
- **FND-AC8.3** `docs/DEVELOPMENT.md` gives the local install command (`pip install -r requirements-dev.txt`), the `bootstrap-schema` step before `db upgrade`, and commands verified against the real scaffold. `docs/DEPLOYMENT.md` keeps `pip install -r requirements.txt` for production and documents schema provisioning under the migration role as a release step. README status and the root, backend and frontend `[Unreleased]` changelog sections state only what was verified. The 405 change is recorded under `[Unreleased]` in the root and backend changelogs.
- **FND-AC8.4** Commands run and their actual outcomes are recorded in a sanitized `evidence/` file, with no connection strings, secrets or account data.

### FND-R9 · Local database provisioning (T02)

_As a developer, I can get the local role and databases without damaging existing ones._

- **FND-AC9.1** Implementation first checks whether the `revotask` role and the `revotask_dev` and `revotask_test` databases exist on the local PostgreSQL 16.14 instance.
- **FND-AC9.2** Only missing resources are created. An existing role, credential, database or its data is never altered, dropped or overwritten. The role is created without superuser or create-database rights and owns the two databases it creates.
- **FND-AC9.3** Development and test use separate URLs. A generated role password and `JWT_SECRET_KEY` are written only to untracked `.env` files, never printed, committed or passed on a command line. An existing `.env` is never overwritten.
- **FND-AC9.4** IF the current account lacks permission, an existing role's password is unknown, or an existing database is owned by another role without schema-creation rights, THEN implementation reports the specific issue and does not escalate or grant privileges on existing objects.

### FND-R10 · Docker image and local Compose (T01, revision 2)
*As a developer, I can run the Flask API in a container that matches the Render deployment, and keep the host PostgreSQL and host Next.js.*

- **FND-AC10.1** `backend/Dockerfile` builds from `python:3.14.5-slim` with the exact pins in `requirements.txt`. The image contains `app/` and `migrations/`. It contains no `.env` file, no `tests/`, no `.venv` and no `supabase-ca.crt`, which `backend/.dockerignore` excludes.
- **FND-AC10.2** The container runs as the non-root user `revotask`. Gunicorn binds `0.0.0.0:$PORT`. `PORT` defaults to 5001 in the image, and Render overrides it.
- **FND-AC10.3** Root `compose.yaml` defines service `backend`. It publishes `127.0.0.1:5001:5001`, sets `PORT=5001`, and sets `DATABASE_URL` from `DOCKER_DATABASE_URL` in the root `.env` at runtime. It fails validation when `DOCKER_DATABASE_URL` is unset. No credential is stored in `compose.yaml` or the image.
- **FND-AC10.4** With Docker running and PostgreSQL on the host, `GET http://127.0.0.1:5001/api/health` returns 200 with `{"data":{"status":"ok"}}`. The container reaches the host database through `host.docker.internal`. `flask db current` in the container reports the head revision.
- **FND-AC10.5** Migrations run only as explicit one-off commands (`docker compose run --rm --no-deps backend flask …`). The container `CMD` never runs `bootstrap-schema` or `db upgrade`. Stopping the container leaves the host database objects and revision unchanged.
- **FND-AC10.6** `docs/DEPLOYMENT.md` describes a Render Docker Web Service that uses `backend/Dockerfile`, Render's `PORT`, Supabase, and `/api/health`, with migrations run separately under the migration role. The live Render service is not created in this feature.
- **FND-AC10.7** Gunicorn is pinned in `requirements.txt` as `gunicorn==27.0.1`. This replaces the earlier plan in assumption A6 to add it with T03 and T16.

## Traceability

Root test IDs (V) cover the whole project. Foundation contributes only the parts noted. Native task numbers refer to `tasks.md`.

| Requirement | Acceptance criteria | API / UI surface                                   | Native tasks  | Verification                                                    | Root test (partial)       |
| ----------- | ------------------- | -------------------------------------------------- | ------------- | --------------------------------------------------------------- | ------------------------- |
| FND-R1      | 1.1–1.6             | Flask factory, `flask run`                         | 1.1, 1.2, 1.3 | FND-V1 config/factory tests; FND-V2 clean-venv and run evidence | none                      |
| FND-R2      | 2.1–2.5             | `/` placeholder                                    | 1.4, 1.5      | FND-V3 lint, typecheck, test, build                             | none                      |
| FND-R3      | 3.1–3.3             | `.env.example`, `.gitignore`, build output         | 1.6           | FND-V4 ignore and bundle checks                                 | V13 (secrets)             |
| FND-R4      | 4.1–4.5             | SQLAlchemy models                                  | 2.4 | FND-V5 metadata tests                                           | none                      |
| FND-R5      | 5.1–5.8             | `bootstrap-schema`, `db upgrade/downgrade/current` | 2.5, 2.6, 2.7 | FND-V5 migration, bootstrap and inspection tests                | V13 (fresh-database part) |
| FND-R6      | 6.1–6.5             | PostgreSQL constraints                             | 2.8 | FND-V6 constraint tests                                         | V01, V04 (DB-level parts) |
| FND-R7      | 7.1–7.8             | E01 `GET /api/health`, error envelope              | 2.1, 2.9 | FND-V7 route, error and request-ID tests                        | V14 (local part)          |
| FND-R8      | 8.1–8.4             | pytest fixtures, docs, `evidence/`                 | 2.3, 3.1, 3.2 | FND-V8 guard tests; FND-V9 documentation review                 | V15 (partial)             |
| FND-R9      | 9.1–9.4             | local PostgreSQL                                   | 2.2           | FND-V10 provisioning report                                     | none                      |
| FND-R10     | 10.1–10.7           | Dockerfile, `compose.yaml`, Render Docker Web Service (docs) | 1.8, 1.9, 1.10 | FND-V11 image and compose checks; FND-V12 runtime checks on port 5001 | none |

**Root acceptance criteria touched.** Foundation fully satisfies none of them.

| Root AC | Foundation contributes                                   | Stays open                                                              |
| ------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| AC01.2  | DB-level normalized-email uniqueness (FND-AC6.1)         | Field validation, 400/409 responses, concurrent-registration test (T03) |
| AC05.1  | One active Done column per board in the DB (FND-AC6.3)   | Column API and nonempty rules (T07)                                     |
| AC13.3  | Secrets excluded from source and bundle (FND-AC3.2, 3.3) | No-store headers, Origin checks (T03, T04)                              |
| AC14.1  | Local E01 behavior (FND-AC7.1, 7.2)                      | Live Render health, register and login (T16)                            |
| NFR 4   | Finite positive `order` enforced (FND-AC6.2)             | Versioned reorder and conflict handling (T08)                           |

## Decisions confirmed in review

| #   | Decision                                                                                                                                                                                                                                                       | Effect on this spec                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Target CPython 3.14.5. Verify dependencies in a clean venv. On failure, report package, version and error before proposing another runtime. Render runtime config waits for the release phase.                                                                 | FND-AC1.4                                                                                                       |
| 2   | Vitest with jsdom and React Testing Library for component tests. Playwright for browser flows and async Server Components.                                                                                                                                     | FND-AC2.3. Playwright installation stays with T15 (assumption A5).                                              |
| 3   | Bootstrap the `revotask` schema before Alembic runs, with an idempotent local command that preserves an existing schema. Document Supabase schema provisioning under the migration role in the release runbook.                                                | FND-AC5.1, 5.3, 8.3                                                                                             |
| 4   | Check for the local role and two databases. Create only what is missing, preserve everything else, use separate URLs, report permission issues.                                                                                                                | FND-R9                                                                                                          |
| 5   | `requirements-dev.txt` with `-r requirements.txt` for pytest and Ruff. Local install command in `docs/DEVELOPMENT.md`. Production install stays in the deployment runbook.                                                                                     | FND-AC1.5, 8.3                                                                                                  |
| 6   | Add `METHOD_NOT_ALLOWED` to the shared envelope, preserve `Allow`, test status, code and header. Update `docs/API.md`, `backend/specs/api-contract.md`, `specs/CHANGELOG.md`. Record under `[Unreleased]` in the root and backend changelogs when implemented. | FND-AC7.5. The three contract documents are already updated. The two changelog entries wait for implementation. |

## Assumptions

These are routine choices taken from project references and steering. Each can be reversed in review.

| ID  | Assumption                                                                                                                                                                                                                                                                                | Why                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Health returns `{"data": {"status": "ok"}}`. The DB bound is a 2-second connection timeout plus a 1-second statement timeout, from named constants.                                                                                                                                       | `backend/specs/api-contract.md` is more specific than the API reference's "200 status". The baseline gives no number for "bounded".                                                                                         |
| A2  | The request ID header is `X-Request-ID`, with the validation in FND-AC7.7.                                                                                                                                                                                                                | `specs/design.md` D2 forwards "an application request ID" without a header name. Returning it is additive.                                                                                                                  |
| A3  | A `CHECK (email = lower(btrim(email)))` accompanies the unique email constraint. `CHECK`s list the allowed `role`, notification `kind` and event `kind` values. Adding a kind later needs a migration.                                                                                    | The data model requires unique normalized email and names the allowed values. The database should hold them even if an insert skips the application. The email `CHECK` is the one constraint not literally in the baseline. |
| A4  | `JWT_SECRET_KEY` must be non-empty everywhere and at least 32 characters when `APP_ENV=production`.                                                                                                                                                                                       | BE08 requires startup to fail clearly. The 32 is my number, not the baseline's.                                                                                                                                             |
| A5  | Playwright is not installed in foundation. The placeholder page is a synchronous Server Component, so Vitest covers it.                                                                                                                                                                   | T15 owns the Playwright suite. Browser tests start when there is a flow to test.                                                                                                                                            |
| A6  | Direct dependencies use exact pins. The full `pip freeze` from the verified venv goes in the evidence file. Marshmallow, Argon2 and a rate limiter arrive with T03. Gunicorn is pinned in T01 for the Docker image (FND-R10, revision 2). `react-hot-toast` arrives with T04.                                                                 | Avoids unused pins. Transitive versions are not locked beyond the evidence record.                                                                                                                                          |
| A7  | Node is pinned to the installed major version, with the exact version recorded. Tailwind CSS v4 with daisyUI 5 is used, per the daisyUI Next.js install guide.                                                                                                                            | Matches the local machine and the current documented setup. Verified again during implementation.                                                                                                                           |
| A8  | Health lives in `app/blueprints/health/`. It is the "Health route" in `backend/specs/api-contract.md`, not one of the eight feature Blueprints that AC14.1 counts.                                                                                                                        | Follows BE01 and keeps the route thin.                                                                                                                                                                                      |
| A9  | The scaffold's `/` is a neutral placeholder with no auth. T06 replaces it.                                                                                                                                                                                                                | D5 assigns the protected dashboard to T06.                                                                                                                                                                                  |
| A10 | Only ownership relationships are declared in T02 (`Board`→members/columns, `BoardColumn`→cards, `Card`→comments, `User`→boards/memberships/assigned cards/comments/notifications). Notification, event and token references stay plain foreign keys until T13 and T14 need relationships. | DB03 sets how relationships are declared, not that every reference needs one.                                                                                                                                               |

## Open items

No unresolved decision blocks design or tasks. Four items remain open and are tracked, not assumed away:

1. **Dependency support on CPython 3.14.5** is empirical. FND-AC1.4 sets the stop-and-report rule. I have not checked wheel availability for psycopg, SQLAlchemy or the others.
2. **The prior-schema migration test** (DB06, V13) needs a second revision, so it stays open for the first later migration.
3. **Runtime versus migration database roles** (DB07) stay open until T16. Locally everything uses the single `revotask` role.
4. **Other framework 4xx responses** (malformed JSON, 413, 415) keep Flask defaults until T03. No foundation route accepts a body.
