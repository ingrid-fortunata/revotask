# RevoTask HTTP API · Draft contract

Routes below are Flask endpoints relative to `API_BASE_URL`, which contains the origin only. Browser calls go through same-origin Next.js handlers with matching paths, except that the login response contains only the public user DTO. Server Components use the same Flask contract through the server-only client. See the [backend contract](../backend/specs/api-contract.md) for Blueprint ownership, validation schemas and stable error codes. Update examples from tested requests before submission.

## Request and response conventions

- JSON bodies use `Content-Type: application/json`. Reject unknown fields, invalid UUIDs and unsupported values with 400. Query inputs are validated and pagination caps are applied.
- Flask public routes are health, register and login. All other Flask routes use `Authorization: Bearer <access-token>`. For browser writes, the Next handler verifies exact Origin.
- Success returns `{"data": ...}`. Delete and logout operations without response metadata return 200 with `{"data": null}`. Error example: `{"error":{"code":"VALIDATION_ERROR","message":"Check the submitted fields.","fields":{"title":"Required."},"request_id":"example-id"}}`. Omit `fields` where inapplicable. Timestamps are ISO 8601 UTC. PATCH modifies only submitted fields, except that explicit null clears fields documented as nullable.
- Status conventions: 400 invalid input, 401 invalid authentication, 403 forbidden, 404 missing/deleted resource, 409 duplicate or state conflict, 429 rate limited, 503 unavailable. Unexpected internal errors return sanitized 500. Field limits below use trimmed length for names, titles and content. Preserve password bytes as entered.

## Endpoints

| ID | Method and path | Request → successful result |
|---|---|---|
| E01 | GET `/api/health` | Public → 200 status; bounded DB check, 503 on failure. |
| E02 | POST `/api/auth/register` | Public. `name` 1–80, valid `email` ≤254, `password` 12–128 → 201 public user. Duplicate normalized email 409. |
| E03 | POST `/api/auth/login` | Public. `email,password` → 200 `{access_token,expires_in,user}` on Flask, `{user}` on Next. Bad credentials 401. |
| E04 | POST `/api/auth/logout` | Authenticated → 200 after JWT revocation. |
| E05 | GET `/api/boards` | Accessible active board summaries, sorted by name and ID → 200. |
| E06 | POST `/api/boards` | `name` 1–100 → 201 board summary with admin membership. |
| E07 | GET `/api/boards/{id}` | Participant → 200 board with role, version, columns and nested cards. |
| E08 | PATCH `/api/boards/{id}` | Admin. `name` 1–100 → 200 updated board. |
| E09 | DELETE `/api/boards/{id}` | Admin → 200 soft-deleted board. |
| E10 | GET `/api/boards/{id}/members` | Participant → 200 active participants with public IDs, names and board roles. |
| E11 | POST `/api/boards/{id}/members` | Admin. Registered `email` → 201 membership; already active 409. |
| E12 | DELETE `/api/boards/{id}/members/{user_id}` | Admin → 200 membership removed and assignments cleared. Admin removal 409. |
| E13 | POST `/api/boards/{id}/columns` | Admin. `name` 1–80, optional `is_done` default false → 201 column and version. |
| E14 | PATCH `/api/columns/{id}` | Admin. `name`, `is_done` → 200 column. Changing Done flag on nonempty column or creating a second Done column returns 409. |
| E15 | DELETE `/api/columns/{id}` | Admin → 200 with new `position_version` in `data`. Nonempty column 409. |
| E16 | PATCH `/api/boards/{id}/columns/reorder` | Admin. `column_id,before_column_id,expected_position_version` → 200 version and authoritative columns in order. |
| E17 | POST `/api/columns/{id}/cards` | Participant. `title` 1–160, optional nullable `description` ≤2,000, optional nullable `assignee_id` → 201 card and version. |
| E18 | PATCH `/api/cards/{id}` | Participant. Editable fields from E17 → 200 card. |
| E19 | DELETE `/api/cards/{id}` | Participant → 200 with new `position_version` in `data`. |
| E20 | PATCH `/api/cards/{id}/position` | Participant. `column_id,before_card_id,expected_position_version` → 200 card, version and affected column lists. |
| E21 | GET `/api/cards?assignee=me` | Signed-in user → 200 list of active cards assigned to current user with board ID/name. `assignee=me` required for v1. |
| E22 | GET `/api/boards/{id}/cards/search?q=...` | Participant. `q` 1–100 chars → 200 up to 20 active title matches with column IDs. |
| E23 | GET `/api/cards/{id}/comments` | Participant → 200 active comments sorted by creation time and ID. |
| E24 | POST `/api/cards/{id}/comments` | Participant. `content` 1–2,000 → 201 comment. |
| E25 | PATCH `/api/comments/{id}` | Author with access. `content` 1–2,000 → 200 comment with updated timestamp. |
| E26 | DELETE `/api/comments/{id}` | Author with access → 200 soft-deleted comment. |
| E27 | GET `/api/notifications?page=1&per_page=20` | Current user. `page` ≥1, `per_page` 1–50 → 200 `{items,page,per_page,total,unread_count}`; newest first. |
| E28 | PATCH `/api/notifications/{id}/read` | Recipient with current access → 200 read item; repeat preserves original `read_at`. |
| E29 | GET `/api/boards/{id}/analytics` | Participant → 200 `{week_start,week_end,cards_per_column,completed_cards,member_activity}`. End is exclusive. |
| E30 | GET `/api/users/me` | Current user → 200 `{id,name,email}`. |
| E31 | PATCH `/api/users/me` | Current user. `name` or `email` (E02 constraints) → 200 public user. `password` or unknown fields 400, duplicate email 409. |

E15 and E19 return position metadata for synchronizing clients. E16 and E20 require a nonnegative integer version and explicit nullable anchor. Order conflicts return `POSITION_CONFLICT` with 409. Invalid targets/anchors on another board return 400 if visible through validation of a move the caller is allowed to attempt, with a generic invalid destination message and no details about that board. Missing source and forbidden access follow the normal 404/403 rules.

## Representative data shapes

```text
BoardSummary { id, name, role, position_version }
BoardDetail { ...BoardSummary, columns: ColumnWithCards[] }
Column { id, board_id, name, is_done, order }
ColumnWithCards { ...Column, cards: Card[] }
Card { id, column_id, title, description, assignee_id, assignee_name, order }
Comment { id, card_id, author_id, author_name, content, created_at, updated_at }
Notification { id, kind, board_id, card_id, actor_id, created_at, read_at }
E13 { column: Column, position_version }
E17 { card: Card, position_version }
E16 { columns: Column[], position_version }
E20 { card: Card, columns: ColumnWithCards[], position_version }
E29 cards_per_column item { column_id, name, count }
E29 member_activity item { user_id, name, count }
E21 item { ...Card, board_id, board_name }
E22 item { id, title, column_id }
E10–E11 membership { user_id, name, role }
```

For E20, send only affected active column lists. For `assignee_name` and other nullable card fields, return null when cleared. Use explicit serialization allowlists for every public response.
