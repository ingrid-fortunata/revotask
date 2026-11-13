# Component Changelog

Record actual changes for this component. Reference the matching app release in [the root changelog](../CHANGELOG.md).

## [Unreleased]

- Kanban API (T07–T08) implemented locally: columns E13–E16 in `app/blueprints/columns/` and cards E17–E20 in `app/blueprints/cards/`. Order and version rules live in `app/positions.py`: midpoint and rebalanced float order, an unchanged-position check, a guarded `position_version` bump (409 `STATE_CONFLICT` at 2147483647) and audit events. Every write follows one order: access (404 or 403), board lock, recheck of the addressed resource, version (409 `POSITION_CONFLICT`), then destination and anchor (400 "Choose a valid destination."). A move that does not change the position writes nothing. `card_created`, `card_moved`, `column_reordered` and `entered_done` are written in the same transaction and only for a real change. `StrictBool` and `BoundedInt` in `app/validation.py`, `commit_or_rollback` public in `boards/service.py`, and `read_columns` shared by E07 and E20. No migration.
- Verification: `pytest` 1570 passed and 1 skipped (the same deliberate E05 skip), `ruff check .` and `ruff format --check .` clean. New tests cover the schemas against `specs/fixtures/kanban-field-cases.json`, CRUD, moves in both directions, rebalance, the check order, the 404 and 403 matrices, events, rollback on an injected commit failure, the version ceiling and concurrent writes on the test database (`evidence/kanban-T07-T09.md`).
- Boards and membership (T05) implemented locally: E05–E09 for boards and E10–E12 for members, in `app/blueprints/boards/`. Errors use `NOT_FOUND` (404), `USER_NOT_FOUND` (404, no `fields`), `FORBIDDEN` (403) and `STATE_CONFLICT` (409). Non-members and removed members get the same 404 as a missing board. Members get 403 on Admin-only actions. Bodies are validated before authorization. Duplicate board names are allowed.
- Member removal (E12) soft-deletes the membership and clears that member's assignments on active cards in active columns of the board, in one transaction under the board lock (AC04.2). Cards in soft-deleted columns, soft-deleted cards and other boards keep their assignments (kanban review L7). Verified by `tests/test_board_members_assignments.py` (4 tests, including the soft-deleted column case and rollback) and Property 15 in `tests/test_boards_properties_scoping.py`.
- Generic validators moved from the auth schema to `app/validation.py`. The auth regression is unchanged (202 auth tests pass).
- Verification: `ruff check .` is clean. `pytest` gives 1147 passed and 1 skipped (after the E12 scope fix). The skip is deliberate: E05 has no error response for an authenticated caller (`tests/test_boards_properties_writes.py`). The backend Docker image was rebuilt with `docker compose up -d --build backend`, and the boards route returns 401 without a token.
- Known limits: `USER_NOT_FOUND` reveals whether an email belongs to a registered user, visible only to board Admins (accepted for v1). The per-admin E11 rate limit with shared storage is T16. E12 no longer clears cards in soft-deleted columns (decided, L7).
- Register password rule (revision 3): 8 to 128 characters with at least one ASCII uppercase letter, lowercase letter and special character (`PASSWORD_MIN = 8`, `_password_composition` in `schema.py`). Login is unchanged. Migration and schema: none.
- Authentication (T03) implemented locally: `POST /api/auth/register`, `/login`, `/logout` and `GET /api/users/me` (E02–E04, E30 read). Argon2id hashing (`argon2-cffi` defaults), Marshmallow schemas that accept exactly the declared fields, a `@token_required` guard that returns 401 `AUTH_REQUIRED` for every bad credential (the library default is 422), a `revoked_tokens` blocklist written with `ON CONFLICT DO NOTHING`, and `actor_id` in the request log.
- Added 413 `CONTENT_TOO_LARGE` (body over 64 KiB), 415 `UNSUPPORTED_MEDIA_TYPE` and 400 for malformed JSON in the shared envelope. Every response under `/api/` except `GET /api/health` carries `Cache-Control: private, no-store`.
- Added Flask-Limiter with in-memory storage: register 5 per minute per address, login 20 per minute per address and 5 per minute per normalized email, 429 `RATE_LIMITED` with `Retry-After`. Optional `RATE_LIMIT_ENABLED` (default true, refused in production). **Local behavior only.** Shared storage and trusted client address handling are open for T16.
- New pins: `argon2-cffi==25.1.0`, `marshmallow==4.4.0`, `Flask-Limiter==4.1.1`. No schema change and no migration.
- Tests: `schema_at_head` now checks the Alembic version for each test, because the foundation migration tests rebuild the schema. Two foundation tests were updated for behavior this slice changes (`test_factory.py`, `test_errors.py`).
- Verification: `pytest` 428 passed (foundation 186), Ruff lint and format pass, the 8-way simultaneous-registration test passed in every run, the Docker image rebuilds and serves. Revision 3 HTTP smoke 73 of 73. Evidence: `evidence/authentication-T03-T04.md`.
- Revision 4: Compose runs one Gunicorn worker, so the login and register limits are exact locally (evidence F-AUTH-11). `Retry-After` is sent only with 429 (F-AUTH-13). Tests reset the limiter per app, and a negative control shows the normalized-email sequence fails on a raw key. Pytest 431 passed.
- Known limitations: other framework 4xx responses (406, 414) keep Flask's default HTML. There is no job that deletes expired `revoked_tokens` rows. Limiter counters are per Gunicorn worker, so production needs shared storage (T16) before more than one worker runs.
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
