# Flask Implementation Architecture

## Modules and responsibilities

- `app/__init__.py` creates the Flask app, validates environment settings, initializes SQLAlchemy, Flask-Migrate and JWT, then registers Blueprints and global error handlers.
- `app/blueprints/<feature>/routes.py` handles transport and delegates to a service. Aim for at most five executable lines per handler where practical. Document any exception in the code review. `schema.py` owns Marshmallow request validation and safe DTO serialization. `service.py` owns authorization, transactions and business logic.
- `app/models/` owns the SQLAlchemy models and relations. The Alembic versions are tracked under `migrations/`.
- `app/exceptions.py` defines typed domain exceptions. Register their handlers centrally. Keep the test client wired to the actual app factory and handler configuration.

## Auth, transaction and error flow

Implement the Flask-JWT-Extended guard behind the common `@token_required` decorator, or use the library decorator consistently and record that choice. Health, login and register are public. Every protected feature route checks the JWT before calling the service. Services enforce membership, role and ownership independently of frontend controls. Never return a JWT in a public user DTO.

Validate the request, resolve the source resource, authorize, and perform the mutation in one service transaction. Acquire board locks for writes governed by D2/D4 and recheck permissions. A card move updates position and required events atomically. Assignment and comment writes persist their notifications in the same transaction.

| Domain exception | Global response |
|---|---|
| `CardNotFoundException` | 404 `NOT_FOUND` |
| `UnauthorizedBoardAccessError` | 403 `FORBIDDEN` |
| `InvalidCredentialsError` | 401 `INVALID_CREDENTIALS` |
| `PositionConflictError` | 409 `POSITION_CONFLICT` |

Return an error envelope with request ID. Log status, route, safe actor ID and code. Log neither tokens, password hashes nor request bodies containing credentials. Translate known uniqueness and state conflicts only. Unexpected database failures use sanitized 500/503 responses and rollback.

## Required verification

- Test `reorder_card()` with independent PostgreSQL fixtures for same-column move, cross-column move, missing card, unauthorized board and correct FLOAT ordering. Add stale-version and rebalance coverage from shared D4.
- Exercise comment creation through Flask's test client for 201 success, 400 missing content, 401 without token and 403 outside the board. Verify persisted state and test edit/delete ownership separately.
- Check all eight Blueprints, public health, migrations and safe DTOs against the [API contract](api-contract.md) and [test plan](../../docs/TEST-PLAN.md).
