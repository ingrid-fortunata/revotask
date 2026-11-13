# Foundation evidence · T01–T02

**Revision 2:** This file has a revision 2 section at the end. Revision 2 supersedes the port 5000 blockers and the open items in the earlier sections.
**Scope:** Native spec `.kiro/specs/foundation/` (requirements, design, tasks). Root tasks T01 and T02.
**State:** Local implementation and verification. The change is uncommitted in the working tree. No GitHub, Render, Vercel or Supabase step was run. Live checks used `127.0.0.1` only.
**Environment:** macOS, zsh. Python 3.14.5 (venv in `backend/.venv`). Node.js 24.22.1 with npm 11.19.1. PostgreSQL 16.14 (Homebrew) on `127.0.0.1:5432`.

## Result summary

| Area | Result |
|---|---|
| Backend `pytest -v` (clean environment) | 186 passed |
| Backend `ruff check .` and `ruff format --check .` | Pass |
| Frontend `npm ci` (clean), lint, typecheck, test, build | Pass. Test: 1 passed. Build routes: `/`, `/_not-found` |
| Migrations on an empty schema | Upgrade, idempotent re-upgrade, `downgrade base`, re-upgrade all pass |
| Autogenerate drift | No changes at head. Negative control detected an injected column |
| Live API on `127.0.0.1:5001` | `GET /api/health` 200. `POST /api/health` 405 with `Allow: GET, HEAD, OPTIONS` |
| Live API on `127.0.0.1:5000` | **Blocked.** macOS AirPlay Receiver answers `403` (`Server: AirTunes/1005.13.5`). See Blockers |

## Pinned versions

Backend exact pins: `backend/requirements.txt` (direct) and `backend/requirements-dev.txt` (adds pytest, ruff, python-dotenv). Full freeze from the clean venv:

```text
alembic==1.20.1
blinker==1.9.0
click==8.5.1
Flask==3.1.3
Flask-JWT-Extended==4.7.4
Flask-Migrate==4.1.0
Flask-SQLAlchemy==3.1.1
iniconfig==2.3.1
itsdangerous==2.2.0
Jinja2==3.1.6
Mako==1.4.3
MarkupSafe==3.0.4
packaging==26.3
pluggy==1.7.0
psycopg==3.3.9
psycopg-binary==3.3.9
Pygments==2.21.0
PyJWT==2.15.1
pytest==9.2.0
python-dotenv==1.2.4
ruff==0.17.5
SQLAlchemy==2.1.8
typing_extensions==4.16.0
Werkzeug==3.1.9
```

Frontend exact pins in `frontend/package.json`, with `frontend/package-lock.json` committed. Direct versions: next 16.4.6, react 19.3.1, react-dom 19.3.1, typescript 5.9.3, tailwindcss 4.3.5, @tailwindcss/postcss 4.3.5, daisyui 5.8.0, vitest 4.1.12, @vitejs/plugin-react 5.2.0, jsdom 27.4.0, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, @testing-library/jest-dom 6.9.1, eslint 9.39.5, eslint-config-next 16.4.6, @types/node 24.19.2, @types/react 19.3.0, @types/react-dom 19.3.0.

Version choice: the install uses the 5, 4 and 9 lines of TypeScript, Vitest and ESLint, and jsdom 27, instead of the newest majors (TypeScript 7, Vitest 5, ESLint 10, jsdom 31). Those newer majors were not tested. The 5/4/9/27 lines are the ones this scaffold was verified on.

## Commands and outcomes

### Backend (`backend/`)

- `python3.14 -m venv .venv` then `pip install -r requirements-dev.txt`: exit 0. A second clean venv produced an identical `pip freeze`.
- Import check of the runtime packages: `flask 3.1.3`, `sqlalchemy 2.1.8`, `psycopg 3.3.9`, `flask_jwt_extended 4.7.4`. Pass.
- `flask --app app:create_app bootstrap-schema` on `revotask_dev`: first run `Created schema 'revotask'.`, second run `Schema 'revotask' already exists; nothing to do.` Both exit 0.
- `flask --app app:create_app db upgrade` on `revotask_dev`: `Running upgrade -> a265fb5e7047, initial schema`. `db current`: `a265fb5e7047 (head)`. Re-running upgrade runs 0 revisions.
- Schema listing of `revotask_dev` (`\d+ revotask.*`): `evidence/foundation-T01-T02-schema-dev.txt`. It lists nine tables and `alembic_version`. `public` holds no RevoTask objects.
- Failure paths:
  - `db upgrade` with no `revotask` schema: exit 1, `Error: Schema 'revotask' does not exist. Run: flask --app app:create_app bootstrap-schema`. No objects created.
  - `db upgrade` against `127.0.0.1:1`: exit 1, `Error: Cannot reach the database.` The URL and password do not appear in the output.
- Lifecycle on `revotask_test` from an empty schema: `db upgrade` ran the revision. `db current` returned `a265fb5e7047`. A second upgrade ran nothing. `db check` and `db migrate` reported `No changes in schema detected.` with no file written. `downgrade base` left `alembic_version` empty and the schema in place. Re-upgrade restored 10 objects.
- Negative control: `ALTER TABLE revotask.users ADD COLUMN drift_probe integer` on the test database. `db migrate` logged `Detected removed column 'revotask.users.drift_probe'` and wrote a revision. The probe revision and column were removed afterwards.
- `ruff check .` and `ruff format --check .`: pass.
- `pytest -v` in a stripped environment (`env -i`): 186 passed.
- Factory `create_app()` with the three variables from the T01 done-when: `create_app ok development`.

### Live check (`127.0.0.1`, development database)

- `flask run --host 127.0.0.1 --port 5001` with `.env`:
  - `GET /api/health`: 200, body `{"data":{"status":"ok"}}`, `X-Request-ID` present.
  - `POST /api/health`: 405, body `{"error":{"code":"METHOD_NOT_ALLOWED","message":"Method not allowed.","request_id":"…"}}`, header `Allow: GET, HEAD, OPTIONS`.
- Server stopped after the check.

### Frontend (`frontend/`)

- `rm -rf node_modules .next && npm ci`: exit 0.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`: all exit 0. Test: `1 passed`.
- Dev server (`npx next dev -p 3000`): `GET /` returned 200 with the placeholder text and `class="card …"`. Server stopped.
- Built CSS contains `.card{`, `.card-body`, `.card-title`, `.bg-base-200` and `.bg-base-100`.
- Secret check: `JWT_SECRET_KEY`, `DATABASE_URL` and `API_BASE_URL` set to sentinels during `npm run build`. Search of `.next/` found 0 files. Positive control: a planted sentinel in a temporary file was found (1 file), so the search method works. The check is a regression guard, because no frontend code reads these variables yet.
- `grep -rn NEXT_PUBLIC_` over `app/`, `next.config.ts` and `postcss.config.mjs`: no matches.

### Dependency audit

- `npm audit`: 7 moderate findings, all in development-only lint tooling: `typescript-eslint` → `minimatch` (ReDoS advisory, affected range `>=7.0.0 <11.0.1`). The only patched `minimatch` is 11.x, a major upgrade that `typescript-eslint` 8.72.2 does not use. `npm audit fix` (not forced) changed nothing. Not forced, because the forced path would replace the lint toolchain. Open, for review.

## Local PostgreSQL provisioning (task 2.2)

Inspection before writes: role `revotask` and databases `revotask_dev` and `revotask_test` did not exist. The executing account is a superuser with CREATEDB and CREATEROLE.

Created: role `revotask` (LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE). Databases `revotask_dev` and `revotask_test`, both owned by `revotask`. The password was generated and sent through psql stdin. It is not recorded here.

Left untouched: roles `postgres`, `ingrid.fortunata`, `hara`. Databases `exercise`, `hara`, `postgres`, `revoshop_db`, `shanghai`, `template0`, `template1`.

Written: `backend/.env` (mode 600, gitignored) with `DATABASE_URL`, `TEST_DATABASE_URL` and a generated `JWT_SECRET_KEY`. The file was not present before.

Verified: each URL connected as `revotask` and reported the expected database name.

## Review corrections found and fixed

Each item came from a failing check, a negative control, or a read of the generated code. Items 1–4 changed behavior in a way the tests would not have caught without the checks.

1. **Silent no-op upgrade.** `require_schema()` ran a `SELECT` on the migration connection, which autobegins a transaction. Alembic then skipped its own commit. `db upgrade` exited 0 and created nothing. Fix: the schema check uses a separate connection (`migrations/env.py`).
2. **Application loggers disabled.** Alembic's `fileConfig()` disables existing loggers by default, which silenced `revotask.request`. Verified with a direct test (`disabled=True` after `fileConfig`). Fix: `disable_existing_loggers=False`.
3. **Metadata not registered.** `create_app` did not import `app.models`, so autogenerate reported no changes. The first attempt, `import app.models` inside the factory, rebound the local name `app` and returned the module instead of the Flask object. Fix: `from app import models`.
4. **Phantom and hidden drift from the default search path.** The role is named `revotask`, so the `"$user"` search path entry resolves to a schema named `revotask`. Alembic reflected each table twice. The filter attempts were:
   - `include_name` excluding `None`: every table reported as missing.
   - `include_object` restricted to `revotask`: 15 foreign-key differences, and an injected column was not detected.
   - Final fix: the migration engine uses `search_path=public`. Comparison with no filters: 0 differences. The negative control then detected the injected column.
   The design and the spec changelog record this change.
5. **Batch index operations.** Autogenerated index creation used `batch_alter_table(..., schema=None)`. I changed these to explicit schema-qualified `op.create_index` and `op.drop_index` calls. The batch form did not fail in the test run, so this is review hygiene, not a bug fix.
6. **Wrong test expectations** (corrected, not app defects): IPv6 URL needs brackets, PostgreSQL renders `(0)::double precision` in the order check, the constraint name for the membership role check is `ck_board_members_role`, and the FK count is 15. The FK query now reads the schema from `pg_namespace`, because `regclass` text omits the schema when it matches the search path.
7. **Stored type of `order`.** SQLAlchemy compiles `Float(precision=53)` as `FLOAT(53)`. The catalog test confirms PostgreSQL stores `double precision`. The design text said `DOUBLE PRECISION` at compile time. The stored type is correct.
8. **Shell environment leak.** A `DATABASE_URL` exported in an earlier command reached a test run. The database guard refused it because the URLs matched. The shell variables were unset. The guard worked as intended.

## Known limitations (carried forward)

- 405 responses log `route=<unmatched>`, because Flask sets no URL rule when the method fails. The response itself is correct.
- Other framework 4xx responses (400, 413, 415) keep Flask's HTML default until T03 (requirements open item 4).
- Next.js generates an internal `/_not-found` route in the build, in addition to `/`. No custom not-found page exists.
- The prior-schema migration test (DB06, V13) needs a second revision.
- Runtime and migration database roles (DB07) are deferred to T16. Locally everything runs as `revotask`.
- Future autogenerated revisions can render `batch_alter_table(..., schema=None)` for schema-qualified tables. Under `search_path=public`, that resolves to the wrong schema. Review each generated operation for explicit `schema='revotask'` before applying it.
- Playwright is not installed. It arrives with T15.
- The `npm audit` advisory above is open.
- `npm ci` prints an `install-scripts` warning for the optional macOS `fsevents` package. It is harmless here.

## Blockers

1. **Port 5000 is answered by macOS AirPlay Receiver.** `curl http://127.0.0.1:5000/` returns `403` from `AirTunes`. Flask runs on that port, but requests do not reach it. Affects requirement FND-AC1.1, FND-AC7.1, and the T01 `flask run` check and the T02 `curl` check. **Decision needed:** either disable AirPlay Receiver in System Settings → General → AirDrop & Handoff, or move the documented API port (`docs/DEVELOPMENT.md`, frontend `API_BASE_URL` example, native design). Both checks pass on port 5001 with the same code, so only the port differs.
2. **npm audit (dev-only, moderate).** Needs a decision: accept until `typescript-eslint` publishes a release that uses a patched `minimatch`, or force a major toolchain change.

## Open tasks

- Native 1.7 (T01 acceptance run): open. Its done-when uses the documented port-5000 commands. The port blocker applies.
- Native 2.9 (health route): open. Its done-when includes `curl` on port 5000. Tests pass, and the live check passed on port 5001.
- Native 3.2 (evidence and root sync): done by this file and the tracker updates. T01 and T02 remain open in the root tracker.
- T16–T17: not started. Deployment and GitHub are out of scope for this phase.

## Files changed in this slice

Backend (new): `.python-version`, `requirements.txt`, `requirements-dev.txt`, `pyproject.toml`, `app/` (factory, config, extensions, errors, request context, exceptions, CLI, health blueprint, nine models), `migrations/` (`env.py`, `alembic.ini`, `script.py.mako`, `README`, revision `a265fb5e7047`), `tests/` (14 Python files: 11 test modules, plus `conftest.py`, `db_guard.py` and `probe_routes.py`). Local only, ignored: `.env`, `.venv/`.

Frontend (new): `package.json`, `package-lock.json`, `.nvmrc`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `next-env.d.ts` (generated by Next), `eslint.config.mjs`, `vitest.config.mts`, `vitest.setup.ts`, `app/layout.tsx`, `app/page.tsx`, `app/page.test.tsx`, `app/globals.css`.

Documentation and specs (modified): `docs/API.md`, `docs/DEVELOPMENT.md` (rewritten), `docs/DEPLOYMENT.md` (bootstrap step), `backend/specs/api-contract.md`, `specs/CHANGELOG.md`, `specs/tasks.md` (T01/T02 links), `.kiro/specs/foundation/design.md` (three corrections), `README.md`, `CHANGELOG.md`, `backend/CHANGELOG.md`, `frontend/CHANGELOG.md`, `.gitignore` (`*.tsbuildinfo`).

Evidence (new): `evidence/foundation-T01-T02.md` (this file), `evidence/foundation-T01-T02-schema-dev.txt`.

---

## Revision 2 · local port 5001, Docker runtime, npm advisory

This run changed the local API port to 5001 with AirPlay Receiver left enabled, added a Docker image and Compose service for the backend, and investigated the npm advisories. Each row below was run in this run, and the outcome is the one shown.

### Summary

| Check | Result |
|---|---|
| Native Flask on `127.0.0.1:5001`, `GET /api/health` | 200, `{"data":{"status":"ok"}}` |
| Native `POST /api/health` | 405, `Allow: GET, HEAD, OPTIONS` |
| Backend `pytest -v` (fresh venv, stripped environment) | 186 passed |
| Backend `ruff check .` and `ruff format --check .` | Pass |
| Frontend `npm run lint`, `typecheck`, `test`, `build` with `API_BASE_URL=http://127.0.0.1:5001` | Pass (test: 1 passed; build routes `/` and `/_not-found`) |
| Next.js dev server `GET /` on port 3000 | 200 |
| Node fetch of `API_BASE_URL/api/health` from `.env.local` (Next.js runtime) | 200, `{"data":{"status":"ok"}}` |
| `npm audit --omit=dev` | 0 findings |
| `npm audit` | 7 moderate, development-only (`minimatch` path below). No stable fix exists. |
| Docker image build (`docker compose build backend`) | Pass |
| Docker container health on `127.0.0.1:5001` | 200, `{"data":{"status":"ok"}}` |
| Container to host PostgreSQL, `db current` | Connected as `revotask` to `revotask_dev`. Head `a265fb5e7047`. |
| `docker compose down`, then `up` | Host database unchanged (10 objects, same head). Health 200 after restart. |

### Native port 5001 (tasks 1.7 and 2.9)

- The native venv was rebuilt in a stripped environment with `pip install -r requirements-dev.txt`. Gunicorn 27.0.1 was pinned in `requirements.txt` for the image. The fresh install reported `Python 3.14.5` and imports `gunicorn`, `flask`, `sqlalchemy` and `psycopg`.
- `ruff check .` passed, `ruff format --check .` reported 42 files formatted, and `pytest -v` reported 186 passed.
- `flask --app app:create_app run --port 5001` started with the backend `.env`. `curl http://127.0.0.1:5001/api/health` returned 200 `{"data":{"status":"ok"}}` with `X-Request-ID`. `POST` returned 405 with `Allow: GET, HEAD, OPTIONS`. The server was stopped, and port 5001 was free before Docker started.
- Port 5000 is no longer used. AirPlay Receiver stays enabled.

### Frontend and Next.js reachability

- `frontend/.env.local` was created from `.env.example`. It holds `API_BASE_URL=http://127.0.0.1:5001` and is git-ignored.
- `npm run lint`, `npm run typecheck`, `npm test` (1 passed) and `npm run build` passed in a stripped environment.
- The Next dev server on port 3000 returned 200 for `/`.
- A temporary Node script read `API_BASE_URL` from `.env.local` and fetched `${API_BASE_URL}/api/health` with `cache: "no-store"`. It returned 200 with body `{"data":{"status":"ok"}}`, first against the native server and then against the container. The script was deleted afterwards.
- Scope note: foundation has no Route Handler or server-side call to Flask (FND-AC2.5). This check exercises the URL and the runtime that Next.js uses. The real call is added in T04.

### npm advisory investigation (task 3)

- `npm audit --omit=dev`: 0 vulnerabilities, exit 0. No production dependency is affected.
- `npm audit`: 7 moderate. All are one advisory, GHSA-g3hv-75wg-m249 (`minimatch` globparts amplification, range `>=7.0.0 <11.0.1`).
- Dependency path: `eslint-config-next` 16.4.6 → `typescript-eslint` 8.72.2 → `@typescript-eslint/typescript-estree` 8.72.2 → `node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch` 10.2.6.
- Published versions checked with `npm view`:
  - `typescript-eslint` dist-tags: `latest` 8.72.2, `canary` 8.72.3-alpha.8.
  - Stable `typescript-estree` 8.72.2 depends on `minimatch ^10.2.2`, which resolves to the vulnerable 10.x line.
  - Prerelease `@typescript-eslint/typescript-estree` 8.72.3-alpha.3 through alpha.8 depend on `minimatch ^11.0.1`.
- Decision: no stable compatible fix exists. `npm audit fix` without `--force` changed nothing. `npm audit fix --force` was not used. A `package.json` override that forces `minimatch` 11 into the lint toolchain would be a major-version change, which the brief excludes, so it was not applied or tested.
- Follow-up: upgrade `typescript-eslint` when a stable release depends on `minimatch` 11.0.1 or later, then rerun `npm audit`. Recorded in `frontend/CHANGELOG.md`.
- Assessment: the affected code runs at lint time on glob patterns from the repository's own config. It is not in the production bundle.

### Docker runtime (tasks 1.8, 1.9, 1.10)

- Docker Desktop was not running at the start of this run. `open -a Docker` started it, and the daemon answered after about 6 seconds (server 29.9.2). Compose is v5.6.1.
- Base image: `python:3.14.5-slim` pulled. Architecture `arm64`, `PYTHON_VERSION=3.14.5`, digest `sha256:c845af93…`.
- Host PostgreSQL: `listen_addresses = localhost`, port 5432. A container opened a TCP connection to `host.docker.internal:5432` without any change to the server. The database login succeeded through that path, so no PostgreSQL configuration was changed.
- Root `.env` created with mode 600 and git-ignored. It holds `DOCKER_DATABASE_URL`, the same role, password and database as `backend/.env`, with the host `host.docker.internal`. The tracked `.env.example` holds a placeholder.
- `docker compose config --quiet`: exit 0 with the root `.env`. With `--env-file /dev/null` it exits 1 and reports `required variable DOCKER_DATABASE_URL is missing a value`.
- `docker compose build backend`: exit 0. The image `revotask-backend:local` is 281 MB.
- Image inspection:
  - `python --version`: `Python 3.14.5`. `gunicorn --version`: `27.0.1`.
  - Runtime user `uid=999(revotask)`. `/app` holds `app/`, `migrations/` and `requirements.txt`. No `.env` file and no `tests/`.
  - `pip check`: no broken requirements. 18 packages, all at the pinned versions.
- One-off commands in the container:
  - `flask --app app:create_app bootstrap-schema`: `Schema 'revotask' already exists; nothing to do.` Exit 0.
  - `flask --app app:create_app db current`: `a265fb5e7047 (head)`.
  - `flask --app app:create_app db upgrade`: exit 0 (no revisions to run).
  - Direct psycopg check with the container's `DATABASE_URL`: connected as `revotask` to `revotask_dev` on PostgreSQL 16.14, with 10 `revotask` objects.
- `docker compose up -d backend`: container `revotask-backend-1` up, published as `127.0.0.1:5001->5001/tcp`. The first probe ran while the container was still starting and returned no response. The next poll returned 200.
- Gunicorn log: `Starting gunicorn 27.0.1`, `Listening at: http://0.0.0.0:5001 (1)`, workers 7 and 8 booted. Master (pid 1) and workers run as uid 999.
- `GET http://127.0.0.1:5001/api/health`: 200, `{"data":{"status":"ok"}}`, `X-Request-ID` present. `POST`: 405 with `Allow: GET, HEAD, OPTIONS`.
- `PORT` check: a second, unpublished container started with `-e PORT=8055` logged `Listening at: http://0.0.0.0:8055`. Its `/api/health` returned 503, as expected for an unreachable test URL. That confirms the error path is served by the containerised app. The container was removed.
- `docker compose down` removed the container and the Compose network. The host database still held 10 `revotask` objects at head `a265fb5e7047`. The repository uses no Docker volume, because the database lives on the host. `docker compose up -d backend` then returned 200 on the second poll.

### Render procedure (documentation only)

- `docs/DEPLOYMENT.md` section 3 describes a Render Docker Web Service with Language Docker, Root Directory `backend`, Dockerfile Path `./Dockerfile`, Render's `PORT`, health check `/api/health`, Supabase URL with `sslmode=verify-full`, and the CA file at `/etc/secrets/supabase-ca.crt`.
- Render pages checked on 2026-11-13: [Docker deploys](https://render.com/docs/docker) (Language Docker, Dockerfile Path, `.dockerignore` controls the build context, secret files are copied into the build context unless excluded); [web services](https://render.com/docs/web-services) (bind `0.0.0.0` on `PORT`, default 10000); [environment variables and secret files](https://render.com/docs/configure-environment-variables) (Docker services read secret files at `/etc/secrets/<filename>`).
- Action taken from the Render docs: `supabase-ca.crt` was added to `backend/.dockerignore`.
- The live Render service, GitHub connection and migration against Supabase are not run. They belong to T16.

### Secrets scan (revision 2)

- 113 non-ignored files were scanned for the generated backend password, the Docker database password and the JWT secret. No hits. The git-ignored `.env`, `backend/.env` and `frontend/.env.local` are the only files holding secret values.

### Blockers and open items

- **Resolved:** the port 5000 blocker from revision 1. Native checks and the Docker runtime use port 5001.
- **Open, dev-only:** the 7 moderate `minimatch` findings, with the follow-up above.
- **Open, release phase (T16):** the live Render service, Supabase migration, live Playwright, and the public URL check.
- **Open, later tasks:** Playwright (T15), the prior-schema migration test (needs a second revision), runtime and migration database roles (DB07).
- **Known limitation:** a 405 log line reports `route=<unmatched>`. The response is correct.
- **Note:** `docker compose up` on this machine binds `127.0.0.1:5001` to the container. Native Flask must not use 5001 while the container runs.

### Files changed in revision 2

- Backend: `requirements.txt` (Gunicorn 27.0.1), `Dockerfile` (new), `.dockerignore` (new), `CHANGELOG.md`.
- Root: `compose.yaml` (new), `.env.example` (new, tracked), `.gitignore` (`*.tsbuildinfo`, from revision 1), `CHANGELOG.md`, `README.md`, `specs/CHANGELOG.md`, `specs/design.md` (D1), `specs/tasks.md` (T01, T16 rows; T01 and T02 checked).
- Docs: `docs/DEVELOPMENT.md` (port 5001, Docker section, environment rows), `docs/DEPLOYMENT.md` (section 3 rewritten).
- Frontend: `.env.example` (port 5001), `CHANGELOG.md`. Local-only: `.env.local`.
- Native spec: `.kiro/specs/foundation/requirements.md` (FND-R10, A6, port), `design.md` (DD11, §4.7, layout, §10, port), `tasks.md` (1.7 and 2.9 checked, tasks 1.8 to 1.10 added and checked).
- Evidence: this file (revision 2), `evidence/spec-review.md` and `evidence/README.md` (refinement records and index), `specs/traceability.md` (port and FND-R10 status).

