# RevoTask Backend

Flask REST API for RevoTask, a collaborative Kanban app. It handles authentication, boards and membership, columns, cards, comments, notifications, profile updates, search and board analytics.

**Live API:** https://revotask.onrender.com

## Tech stack

| Area | Technology |
| --- | --- |
| Language | Python 3.14.5 (pinned in `.python-version`) |
| Framework | Flask 3.1, Blueprints with an app factory |
| Database | PostgreSQL, SQLAlchemy 2.1, Flask-SQLAlchemy, Flask-Migrate (Alembic) |
| Auth | Flask-JWT-Extended, Argon2id password hashing (argon2-cffi) |
| Validation | Marshmallow 4 |
| Rate limiting | Flask-Limiter (in-process counters) |
| Server | Gunicorn (Docker image) |
| Tooling | pytest, Ruff |

## Project structure

```text
backend/
├── app/
│   ├── __init__.py          # create_app() factory, registers blueprints and error handlers
│   ├── config.py            # Environment settings and validation
│   ├── extensions.py        # db, migrate, jwt, limiter instances
│   ├── auth_guard.py        # Token-required guard and JWT revocation check
│   ├── errors.py            # Global error handlers (error envelope with request ID)
│   ├── exceptions.py        # Typed domain exceptions
│   ├── positions.py         # Card and column ordering and rebalancing
│   ├── cli.py               # `flask bootstrap-schema`
│   ├── blueprints/          # One package per feature
│   │   └── <feature>/       # routes.py (transport), schema.py (validation), service.py (logic)
│   └── models/              # SQLAlchemy models
├── migrations/              # Alembic migrations
├── specs/                   # Data model, API contract, architecture
├── tests/                   # pytest suite (real PostgreSQL test database)
├── Dockerfile
├── pyproject.toml           # Ruff and pytest settings
├── requirements.txt         # Runtime dependencies (exact pins)
└── requirements-dev.txt     # Runtime plus pytest, Ruff, python-dotenv
```

Blueprints: `health`, `auth`, `users`, `boards`, `columns`, `cards`, `comments`, `notifications`, `analytics`.

Each handler in `routes.py` only parses the request and calls a service. Services own authorization, transactions and business rules. Schemas own request validation and safe response shapes.

## Prerequisites

- Python 3.14.5
- PostgreSQL 16 with a login role and two databases, one for development and one for tests (name ending in `_test`):

```sql
CREATE ROLE revotask WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '<choose-a-password>';
CREATE DATABASE revotask_dev OWNER revotask;
CREATE DATABASE revotask_test OWNER revotask;
```

## Getting started

```bash
cd backend
python3.14 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env              # then fill in the values below
flask --app app:create_app bootstrap-schema   # creates the revotask schema if missing
flask --app app:create_app db upgrade         # applies migrations
flask --app app:create_app run --port 5001
```

Run `bootstrap-schema` before `db upgrade`. The migrations never create the schema. Both commands are safe to repeat.

Check that the API is up:

```bash
curl -s http://127.0.0.1:5001/api/health
# {"data":{"status":"ok"}}
```

Use port 5001 locally. On macOS, AirPlay Receiver holds port 5000.

## Environment variables

Copy `.env.example` to `.env`. Real `.env` files are git-ignored.

| Variable | Required | Description |
| --- | --- | --- |
| `APP_ENV` | Yes | `development` or `production` |
| `DATABASE_URL` | Yes | `postgresql+psycopg://user:password@host:5432/revotask_dev` |
| `JWT_SECRET_KEY` | Yes | Secret used to sign tokens. Generate your own, never commit it |
| `LOG_LEVEL` | No | Defaults to `INFO` |
| `TEST_DATABASE_URL` | Tests | Local database whose name ends in `_test` |
| `RATE_LIMIT_ENABLED` | No | `true` by default. Refused when `APP_ENV=production` if set to `false` |
| `PORT`, `GUNICORN_WORKERS` | Container | Set by Compose or Render. The image defaults to 2 workers |

## Run with Docker

From the repository root (the Compose file is there):

```bash
cp .env.example .env              # set DOCKER_DATABASE_URL (host is host.docker.internal)
docker compose build backend
docker compose run --rm --no-deps backend flask --app app:create_app bootstrap-schema
docker compose run --rm --no-deps backend flask --app app:create_app db upgrade
docker compose up -d backend      # http://127.0.0.1:5001
```

Stop native Flask first, because both use port 5001. See the [development guide](../docs/DEVELOPMENT.md) for details.

## API overview

All routes are under `/api`. Responses use a `{"data": ...}` success envelope and an error envelope with a request ID. Protected routes need a JWT.

| Feature | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` |
| Profile | `GET /api/users/me`, `PATCH /api/users/me` |
| Boards | `GET` and `POST /api/boards`, `GET`, `PATCH` and `DELETE /api/boards/{id}` |
| Members | `GET` and `POST /api/boards/{id}/members`, `DELETE /api/boards/{id}/members/{user_id}` |
| Columns | `POST /api/boards/{id}/columns`, `PATCH /api/boards/{id}/columns/reorder`, `PATCH` and `DELETE /api/columns/{id}` |
| Cards | `POST /api/columns/{id}/cards`, `PATCH` and `DELETE /api/cards/{id}`, `PATCH /api/cards/{id}/position` |
| My tasks and search | `GET /api/cards?assignee=me`, `GET /api/boards/{id}/cards/search?q=` |
| Comments | `GET` and `POST /api/cards/{id}/comments`, `PATCH` and `DELETE /api/comments/{id}` |
| Notifications | `GET /api/notifications`, `PATCH /api/notifications/{id}/read` |
| Analytics | `GET /api/boards/{id}/analytics` |

Full request and response details: [docs/API.md](../docs/API.md) and [api-contract.md](specs/api-contract.md).

Card and column moves are versioned with `position_version`. A stale move returns `409 POSITION_CONFLICT`.

## Testing and linting

```bash
cd backend
source .venv/bin/activate
ruff check . && ruff format --check .
pytest -v
```

- Tests run against a real PostgreSQL database set in `TEST_DATABASE_URL`.
- The test setup refuses to run if that URL matches `DATABASE_URL`, names another database or uses a remote host.
- Migration tests drop and rebuild the `revotask` schema on the test database. Never point `TEST_DATABASE_URL` at data you care about.
- Rate limits are off in the test configuration. `tests/test_rate_limit.py` builds its own app with them on.

## Deployment

- Hosted on Render as a Docker Web Service (root directory `backend`, auto-deploy off).
- `.github/workflows/deploy-backend.yml` runs on each push to `main` that changes `backend/`. It runs `flask db upgrade` against Supabase, then triggers the Render deploy.
- Gunicorn does not run migrations.
- Production rate limiting needs shared storage before more than one worker is used.

See the [deployment runbook](../docs/DEPLOYMENT.md).

## Documentation

- [Backend specs](specs/README.md): [data model](specs/data-model.md), [API contract](specs/api-contract.md), [architecture](specs/architecture.md)
- [Backend changelog](CHANGELOG.md)
- [Development guide](../docs/DEVELOPMENT.md), [test plan](../docs/TEST-PLAN.md)
- [Project README](../README.md)
