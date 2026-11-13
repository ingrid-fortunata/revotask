# Component Changelog

Record actual changes for this component. Reference the matching app release in [the root changelog](../CHANGELOG.md).

## [Unreleased]

- Added per-Blueprint live smoke checks and review guidance for models, auth and position changes.
- Revision 2: `backend/Dockerfile` (`python:3.14.5-slim`, non-root user, Gunicorn on `0.0.0.0:$PORT`), `backend/.dockerignore` and root `compose.yaml` for the `backend` service on `127.0.0.1:5001`. Gunicorn 27.0.1 is pinned in `requirements.txt`. The container reads `DOCKER_DATABASE_URL` from the root `.env`, reaches the host PostgreSQL through `host.docker.internal`, and runs Alembic only as one-off commands.
- Revision 2 verification: `docker compose build backend`; `docker compose config --quiet`; `GET /api/health` 200 on `127.0.0.1:5001` from the container; `db current` at head; `docker compose down` leaves the host database unchanged.
- Foundation (T01–T02) implemented locally: app factory with validated settings, JSON error envelope, request IDs, `GET /api/health` (E01), nine models, initial migration `a265fb5e7047` and `bootstrap-schema`.
- Added `405 METHOD_NOT_ALLOWED` with `Allow` to the shared error envelope.
- Migration environment pins `search_path=public` for its own engine. See `specs/CHANGELOG.md`.
- Fixed: migrations keep `revotask.*` loggers enabled when Alembic loads its logging config.
- Fixed: the schema check runs on its own connection. Before this, `db upgrade` could exit 0 without applying DDL.
- Verification: `pytest -v` 186 passed on Python 3.14.5 with PostgreSQL 16.14. Ruff lint and format pass. Live `flask run` on port 5001 returned `GET /api/health` 200 and `POST` 405. The local API runs on port 5001 because macOS AirPlay Receiver keeps port 5000.
- Known limitations: a 405 log line reports `route=<unmatched>`. Other framework 4xx responses (400, 413, 415) keep Flask's default HTML until T03.
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
