# Flask API Contract

The shared [HTTP endpoint reference](../../docs/API.md) defines methods, paths, fields and status codes for E01–E31. This document maps implementation ownership and specifies validation and error behavior at the backend boundary.

| Blueprint | Endpoint IDs | Main validation schemas and checks |
|---|---|---|
| Health route | E01 | Public. Return `data.status` as `ok` on 200. A bounded DB failure returns 503 `SERVICE_UNAVAILABLE`. |
| `auth_bp` | E02–E04 | Register/Login schemas validate bounded inputs. Register enforces 8–128 characters with an uppercase letter, a lowercase letter and an ASCII special character. Login accepts 1–128 characters with no composition rule, so a stored account is never locked out by a later policy change. Login returns expiring JWT and safe user DTO. Logout requires an active JWT and persists its revocation. |
| `boards_bp` | E05–E12 | Board create/update and member add schemas. Reads scope active membership. Rename/delete and membership changes require admin. |
| `columns_bp` | E13–E16 | Column create/update and position schemas. Admin-only writes with Done and position-version checks. |
| `cards_bp` | E17–E22 | Card create/update, CardPositionSchema, My Tasks query and card search schema. Validate assignee participation, anchor ownership and board scope. |
| `comments_bp` | E23–E26 | Comment create/update schemas. Require current board participation and check author on edit/delete. |
| `notifications_bp` | E27–E28 | Page and page-size schema. Reads and writes use current recipient and visible board/card ancestry. |
| `analytics_bp` | E29 | Validate board UUID and active participation. Aggregate counts in SQLAlchemy. |
| `users_bp` | E30–E31 | E30 read ships with T03 for the protected shell. E31 ships with T12: the update schema allows name/email and rejects password and unexpected fields. Serialize the public user DTO. |

Use `routes.py`, `service.py` and `schema.py` in each feature directory. Reject unknown JSON fields, non-object bodies and empty update payloads with 400. Omitted PATCH fields keep their current values. An explicit null is allowed for card description, assignee and the nullable position anchors where defined. Public DTOs exclude password hash and credentials. Flask auth and Next browser auth responses differ as documented in E03.

## Reorder request and conflict

E20 accepts this JSON body after JWT and board authorization:

```json
{
  "column_id": "3b4a1e3b-95cf-4814-a530-f913986d87ef",
  "before_card_id": null,
  "expected_position_version": 7
}
```

A successful response returns `data.card`, `data.columns` for the affected column lists and `data.position_version`. A stale version returns 409 with this envelope:

```json
{
  "error": {
    "code": "POSITION_CONFLICT",
    "message": "The board changed. Refresh and try again.",
    "request_id": "example-request-id"
  }
}
```

## Errors and status mapping

| Status | Stable code | Example |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid UUID, missing content, malformed JSON, a non-object body, or an unexpected or forbidden field. Include `fields` for invalid field values. |
| 401 | `INVALID_CREDENTIALS`, `AUTH_REQUIRED` | Rejected login, or absent, invalid, expired or revoked session on a protected route. |
| 403 | `FORBIDDEN` | Authenticated board participant lacks the required role (for example a member calling an admin-only route), or lacks ownership. |
| 404 | `NOT_FOUND`, `USER_NOT_FOUND` | `NOT_FOUND`: source card, board or another addressed resource is missing or deleted, or the caller is not an active participant of the board (identical to a missing board). `USER_NOT_FOUND`: E11 email matches no registered user, returned only to an admin of the target board; plain envelope without `fields`. |
| 405 | `METHOD_NOT_ALLOWED` | A known path is called with an unsupported method. Keep the `Allow` header that lists the supported methods. |
| 409 | `POSITION_CONFLICT`, `EMAIL_ALREADY_EXISTS`, `STATE_CONFLICT` | Stale order version, duplicate normalized email, or conflicting board state. |
| 413 | `CONTENT_TOO_LARGE` | Request body over 64 KiB. Checked before field validation. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Missing or non-JSON `Content-Type` on a JSON endpoint. `application/json` with parameters such as `charset=utf-8` is accepted. |
| 429 | `RATE_LIMITED` | Login or registration throttled. Forward Retry-After when available. |
| 500 / 503 | `INTERNAL_ERROR` / `SERVICE_UNAVAILABLE` | Unexpected failure or unavailable dependency. Use a safe message and request ID. |

Use the same JSON envelope for framework, JWT and domain errors. The frontend consumes status, code, field errors and request ID. Roll back failed writes before translating exceptions. See the [frontend error matrix](../../frontend/specs/error-handling.md).
