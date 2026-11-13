# RevoTask Development Guide

These commands are verified for the foundation (T01–T02) and authentication (T03–T04) slices on macOS with PostgreSQL 16.14, Python 3.14.5 and Node.js 24.22.1. Run each command from the directory shown. Boards and Kanban routes arrive in later feature slices.

## Prerequisites

- Python 3.14.5. The pin is in `backend/.python-version`.
- Node.js 24.22.1. The pin is in `frontend/.nvmrc`. npm comes with Node.
- A local PostgreSQL server with a role and two databases. Foundation can create missing ones (see below). The commands use a placeholder password. Replace it with your own and never commit the value.

```sql
CREATE ROLE revotask WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '<choose-a-password>';
CREATE DATABASE revotask_dev OWNER revotask;
CREATE DATABASE revotask_test OWNER revotask;
```

## Backend (Flask)

```bash
cd backend
python3.14 -m venv .venv          # use the Python 3.14.5 interpreter
source .venv/bin/activate
pip install -r requirements-dev.txt   # runtime packages plus pytest and Ruff
cp .env.example .env              # set DATABASE_URL, TEST_DATABASE_URL and JWT_SECRET_KEY
flask --app app:create_app bootstrap-schema   # creates the revotask schema when missing
flask --app app:create_app db upgrade         # applies the migrations
flask --app app:create_app run --port 5001
```

Run `bootstrap-schema` before `db upgrade`. The migrations never create the schema. Both commands are safe to repeat.

Check the server in a second terminal:

```bash
curl -s http://127.0.0.1:5001/api/health
# {"data":{"status":"ok"}}
```

The local API uses port 5001. macOS AirPlay Receiver keeps port 5000 and answers `403 Forbidden` with an `AirTunes` server header, so Flask cannot use that port. Leave AirPlay Receiver on. Use 5001 for `flask run` and for `API_BASE_URL` in `frontend/.env.local`.

### Backend checks

```bash
cd backend
ruff check . && ruff format --check .
pytest -v
```

The tests include real Argon2 hashing and a simultaneous-registration race, so the suite takes a few seconds. Login and register rate limits are on by default. The test configuration sets `RATE_LIMIT_ENABLED=false`, and `tests/test_rate_limit.py` builds its own app with them on. `TEST_DATABASE_URL` must point to a local database whose name ends in `_test`. Test setup refuses to run if the test URL matches `DATABASE_URL`, names another database, or uses a remote host. The migration tests drop and rebuild the `revotask` schema on that test database.

## Docker (Flask container)

The same `backend/Dockerfile` serves local development and the Render Docker Web Service (see the [deployment runbook](DEPLOYMENT.md)). Start Docker Desktop first. Native Flask (above) and the container both use port 5001, so stop one before starting the other.

```bash
cp .env.example .env                         # repository root; set DOCKER_DATABASE_URL (below)
docker compose build backend
docker compose run --rm --no-deps backend flask --app app:create_app bootstrap-schema
docker compose run --rm --no-deps backend flask --app app:create_app db upgrade
docker compose run --rm --no-deps backend flask --app app:create_app db current
docker compose up -d backend
curl -s http://127.0.0.1:5001/api/health    # {"data":{"status":"ok"}}
docker compose logs -f backend              # Ctrl-C stops following
docker compose down                         # stops the container and keeps the database
```

- The root `.env` (git-ignored) holds `DOCKER_DATABASE_URL`, the same role, password and database as `backend/.env`, with the host `host.docker.internal`. Compose passes `backend/.env` to the container for `JWT_SECRET_KEY` and the other settings. Compose overrides `DATABASE_URL` with `DOCKER_DATABASE_URL`, because `127.0.0.1` inside a container is the container itself. Credentials are supplied at runtime and never copied into the image.
- `host.docker.internal` reaches the PostgreSQL server on the Mac. Verified with Docker Desktop 29.9.2 and PostgreSQL 16.14 listening on `localhost` only. No PostgreSQL configuration change was needed. If another Docker runtime cannot connect, review the listen and `pg_hba.conf` settings before changing them.
- Migrations run only as the one-off `run --rm` commands above. Gunicorn does not migrate. The database must already be running on the host.
- Gunicorn binds `0.0.0.0:$PORT`. Compose sets `PORT=5001` and publishes `127.0.0.1:5001:5001`. Compose sets `GUNICORN_WORKERS=1` for local runs. The login and register rate-limit counters live in each worker process, so one worker keeps the local limits exact (5 invalid logins per minute per email, then 429). The image default stays 2 for Render until shared limiter storage is in place (T16). Do not raise the worker count locally without shared storage.
- Next.js still runs on the host with `npm run dev`, and reaches the container at `API_BASE_URL=http://127.0.0.1:5001`.

## Frontend (Next.js)

```bash
cd frontend
npm ci
cp .env.example .env.local        # server-only settings; the browser never receives them
npm run dev                       # http://localhost:3000
```

```bash
npm run lint
npm run typecheck
npm test                          # Vitest: jsdom for components, node for Route Handlers and server modules
npm run build
```

Playwright browser tests arrive with the local acceptance task (T15).

### Sign in locally and run the smoke checks

Start Flask first (native on port 5001, or `docker compose up -d backend`). Then, from `frontend/`:

```bash
npm run build
npm run start                     # http://localhost:3000, or `npx next start -p 3100`
```

- **Use `localhost`, not `127.0.0.1`, in the browser.** Next accepts a browser `POST` only when its `Origin` header equals `APP_ORIGIN` exactly. A page opened on a different host or port gets a 403 on register, login and logout. When you start Next on another port, set `APP_ORIGIN` to match, for example `APP_ORIGIN=http://localhost:3100 npx next start -p 3100`.
- **`APP_ORIGIN` must be an https origin, or an http origin on `localhost`, `127.0.0.1` or `[::1]`.** Any other value makes the auth handlers answer 500 and log which variable is wrong, without its value. The session cookie is `Secure` only when `APP_ORIGIN` is https.
- **Two scripts in `evidence/` repeat the checks against the real stack.** Both create one throwaway account and delete it. Neither prints a password, token or cookie value.
  - `python ../evidence/authentication-http-smoke.py` (from `backend/`, venv active) runs 75 HTTP checks and takes about three minutes. It restarts the `backend` Compose service before each check group, so the in-memory limiter starts empty and no group spends another group's quota. It ends with the login rate-limit check: five 401s for one normalized email, then 429. It needs the one-worker Compose setting above.
  - `node evidence/authentication-mobile-measure.mjs` (from the repository root) drives headless Google Chrome over the DevTools Protocol with Node's built-in WebSocket, so it needs no dependency. It measures every route at 320, 375, 768 and 1280 px (page scroll, 44 by 44 tappable areas, 16 px inputs, toasts) and checks sign in, sign out and Back. It uses device emulation, not a real phone.

## Environment contract

| Scope          | Variables                                                | Example values                                                       |
| -------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| Flask          | `APP_ENV`, `DATABASE_URL`, `JWT_SECRET_KEY`, `LOG_LEVEL` | development, local PostgreSQL URI, local-only generated secret, INFO |
| Flask (optional) | `RATE_LIMIT_ENABLED` | `true` by default. `false` only for local experiments. It is refused when `APP_ENV=production`. Counters are in process memory, so the limits prove local behavior only |
| Flask tests    | `TEST_DATABASE_URL`                                      | Isolated local PostgreSQL URI whose database name ends in `_test`    |
| Docker Compose (root `.env`) | `DOCKER_DATABASE_URL` | `postgresql+psycopg://revotask:<password>@host.docker.internal:5432/revotask_dev` |
| Container runtime | `PORT`, `GUNICORN_WORKERS` (optional) | `5001` locally. Render sets its own `PORT`. |
| Next.js server | `APP_ORIGIN`, `API_BASE_URL`                             | `http://localhost:3000`, `http://127.0.0.1:5001`. Read on the first request, so `next build` needs neither |
| Playwright     | `E2E_BASE_URL`                                           | `http://localhost:3000` or verified Vercel URL. Added with T15.      |

Both `.env.example` files are committed with placeholders. Real `.env*` files stay ignored, and so do `.venv/`, `__pycache__/`, `.next/`, `node_modules/`, `*.tsbuildinfo` and `playwright/.auth/`. The Route Handlers and Server Components read the two Next.js variables on the server only. They never reach the browser bundle (checked with a sentinel build in `evidence/authentication-T03-T04.md`).

## Dependency pins

- Backend runtime packages are exact pins in `backend/requirements.txt`. Development packages are in `backend/requirements-dev.txt`, which includes the runtime file.
- Frontend packages are exact pins in `frontend/package.json`, and `frontend/package-lock.json` is committed.
- `npm audit` reports seven moderate advisories in development-only lint tooling (`typescript-eslint` → `minimatch`). They do not ship to the browser. The only patched `minimatch` release is a major upgrade that `typescript-eslint` does not use. Tracked in `evidence/foundation-T01-T02.md`.

Deployment installs use `pip install -r requirements.txt` (see the [deployment runbook](DEPLOYMENT.md)).
