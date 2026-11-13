# Component Changelog

Record actual changes for this component. Reference the matching app release in [the root changelog](../CHANGELOG.md).

## [Unreleased]

- Authentication (T03) implemented locally: `POST /api/auth/register`, `/login`, `/logout` and `GET /api/users/me` (E02–E04, E30 read). Argon2id hashing (`argon2-cffi` defaults), Marshmallow schemas that accept exactly the declared fields, a `@token_required` guard that returns 401 `AUTH_REQUIRED` for every bad credential (the library default is 422), a `revoked_tokens` blocklist written with `ON CONFLICT DO NOTHING`, and `actor_id` in the request log.
- Added 413 `CONTENT_TOO_LARGE` (body over 64 KiB), 415 `UNSUPPORTED_MEDIA_TYPE` and 400 for malformed JSON in the shared envelope. Every response under `/api/` except `GET /api/health` carries `Cache-Control: private, no-store`.
- Added Flask-Limiter with in-memory storage: register 5 per minute per address, login 20 per minute per address and 5 per minute per normalized email, 429 `RATE_LIMITED` with `Retry-After`. Optional `RATE_LIMIT_ENABLED` (default true, refused in production). **Local behavior only.** Shared storage and trusted client address handling are open for T16.
- New pins: `argon2-cffi==25.1.0`, `marshmallow==4.4.0`, `Flask-Limiter==4.1.1`. No schema change and no migration.
- Tests: `schema_at_head` now checks the Alembic version for each test, because the foundation migration tests rebuild the schema. Two foundation tests were updated for behavior this slice changes (`test_factory.py`, `test_errors.py`).
- Verification: `pytest` 382 passed (foundation 186), Ruff lint and format pass, the 8-way simultaneous-registration test passed 5 of 5 runs, the Docker image rebuilds and serves. Evidence: `evidence/authentication-T03-T04.md`.
- Known limitations: other framework 4xx responses (406, 414) keep Flask's default HTML. There is no job that deletes expired `revoked_tokens` rows. Limiter counters are per process.
- Added per-Blueprint live smoke checks and review guidance for models, auth and position changes.
- Revision 2: `backend/Dockerfile` (`python:3.14.5-slim`, non-root user, Gunicorn on `0.0.0.0:$PORT`), `backend/.dockerignore` and root `compose.yaml` for the `backend` service on `127.0.0.1:5001`. Gunicorn 27.0.1 is pinned in `requirements.txt`. The container reads `DOCKER_DATABASE_URL` from the root `.env`, reaches the host PostgreSQL through `host.docker.internal`, and runs Alembic only as one-off commands.
- Revision 2 verification: `docker compose build backend`; `docker compose config --quiet`; `GET /api/health` 200 on `127.0.0.1:5001` from the container; `db current` at head; `docker compose down` leaves the host database unchanged.
- Foundation (T01–T02) implemented locally: app factory with validated settings, JSON error envelope, request IDs, `GET /api/health` (E01), nine models, initial migration `a265fb5e7047` and `bootstrap-schema`.
- Added `405 METHOD_NOT_ALLOWED` with `Allow` to the shared error envelope.
- Migration environment pins `search_path=public` for its own engine. See `specs/CHANGELOG.md`.
- Fixed: migrations keep `revotask.*` loggers enabled when Alembic loads its logging config.
- Fixed: the schema check runs on its own connection. Before this, `db upgrade` could exit 0 without applying DDL.
- Verification: `pytest -v` 186 passed on Python 3.14.5 with PostgreSQL 16.14. Ruff lint and format pass. Live `flask run` on port 5001 returned `GET /api/health` 200 and `POST` 405. The local API runs on port 5001 because macOS AirPlay Receiver keeps port 5000.
- Known limitations: a 405 log line reports `route=<unmatched>`. Other framework 4xx responses (406, 414) keep Flask's default HTML. The 400, 413 and 415 cases moved to the JSON envelope in T03.
- Documented the data model, Blueprint architecture and API contract.
- Added a local environment example and implementation entry point in the project prompt pack.

## Entry template

```markdown
## [X.Y.Z] - YYYY-MM-DD
### Added
- …
### Changed
- …
### Fixed
- …
- App release and commit: …
- API, migration or environment impact: …
- Verification and evidence: …
```
