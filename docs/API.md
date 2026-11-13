# RevoTask HTTP API · Draft contract

Routes below are Flask endpoints relative to `API_BASE_URL`, which contains the origin only. Browser calls go through same-origin Next.js handlers with matching paths, except that the login response contains only the public user DTO. Server Components use the same Flask contract through the server-only client. See the [backend contract](../backend/specs/api-contract.md) for Blueprint ownership, validation schemas and stable error codes. Update examples from tested requests before submission.

## Request and response conventions

- JSON bodies use `Content-Type: application/json`. Reject unknown fields, invalid UUIDs and unsupported values with 400. A malformed JSON body returns 400, a missing or non-JSON `Content-Type` returns 415 and a body over 64 KiB returns 413. Query inputs are validated and pagination caps are applied.
- Flask public routes are health, register and login. All other Flask routes use `Authorization: Bearer <access-token>`. For browser writes, the Next handler verifies exact Origin.
- Success returns `{"data": ...}`. Delete and logout operations without response metadata return 200 with `{"data": null}`. Error example: `{"error":{"code":"VALIDATION_ERROR","message":"Check the submitted fields.","fields":{"title":"Required."},"request_id":"example-id"}}`. Omit `fields` where inapplicable. Timestamps are ISO 8601 UTC. PATCH modifies only submitted fields, except that explicit null clears fields documented as nullable.
- Status conventions: 400 invalid input, 401 invalid authentication, 403 forbidden, 404 missing/deleted resource, or a board the caller is not an active participant of (E07–E12 use the same 404 for nonmembers; E11 adds `USER_NOT_FOUND` for an unregistered email), 405 method not allowed (the response keeps the `Allow` header), 409 duplicate or state conflict, 413 request body too large (`CONTENT_TOO_LARGE`), 415 unsupported content type (`UNSUPPORTED_MEDIA_TYPE`), 429 rate limited, 503 unavailable. Unexpected internal errors return sanitized 500. Field limits below use trimmed length for names, titles and content. Preserve password bytes as entered.

## Endpoints

| ID | Method and path | Request → successful result |
|---|---|---|
| E01 | GET `/api/health` | Public → 200 status; bounded DB check, 503 on failure. |
| E02 | POST `/api/auth/register` | Public. Exactly `name` 1–80, valid `email` ≤254, `password` 8–128 with at least one uppercase letter, one lowercase letter and one ASCII special character (a space does not count); any other field is 400. `name` and `email` are trimmed, `email` is lowercased, `password` is kept as entered → 201 public user. Duplicate normalized email 409. |
| E03 | POST `/api/auth/login` | Public. Exactly `email` ≤254 and `password` 1–128 with no composition rule; any other field is 400 → 200 `{access_token,expires_in,user}` on Flask. On Next the body is `{"data":{"user"}}` and the handler sets the session cookie. Bad credentials 401. |
| E04 | POST `/api/auth/logout` | Authenticated → 200 after JWT revocation. The Next handler also returns 200 and clears the cookie when the cookie is absent or the session is already invalid. It returns 503 and keeps the cookie when revocation fails. |
| E05 | GET `/api/boards` | Accessible active board summaries, sorted by name and ID → 200. |
| E06 | POST `/api/boards` | `name` 1–100 → 201 board summary with admin membership. |
| E07 | GET `/api/boards/{id}` | Participant → 200 board with role, version, columns and nested cards. |
| E08 | PATCH `/api/boards/{id}` | Admin. `name` 1–100 → 200 updated board. |
| E09 | DELETE `/api/boards/{id}` | Admin → 200 with `{"data": null}`; the board is soft-deleted. |
| E10 | GET `/api/boards/{id}/members` | Participant → 200 active participants with public IDs, names and board roles. |
| E11 | POST `/api/boards/{id}/members` | Admin. Registered `email` → 201 membership; a previously removed user is reactivated as `member` with 201; already active 409 `STATE_CONFLICT`; unregistered email 404 `USER_NOT_FOUND` (plain envelope, no `fields`, returned only to an admin of the board). |
| E12 | DELETE `/api/boards/{id}/members/{user_id}` | Admin → 200 with `{"data": null}`; the membership is removed and the user's assignments on active cards in active columns of this board are cleared in the same transaction. Soft-deleted cards, cards in soft-deleted columns and other boards are unaffected. Target without an active membership 404; admin removal 409 `STATE_CONFLICT`. |
| E13 | POST `/api/boards/{id}/columns` | Admin. `name` 1–80, optional `is_done` default false → 201 `{column, position_version}`; the column is appended at the end. `is_done` true while the board has a Done column 409 `STATE_CONFLICT`. |
| E14 | PATCH `/api/columns/{id}` | Admin. `name`, `is_done`, at least one → 200 column; `position_version` does not change. Changing `is_done` on a nonempty column, or setting it true while another Done column exists, returns 409 `STATE_CONFLICT` and writes nothing. Submitting the current `is_done` value is not a change; other valid fields in the request still apply. |
| E15 | DELETE `/api/columns/{id}` | Admin → 200 with `{"data": {"position_version": n}}`. Nonempty column 409 `STATE_CONFLICT`. |
| E16 | PATCH `/api/boards/{id}/columns/reorder` | Admin. `column_id,before_column_id,expected_position_version` → 200 `{columns, position_version}` with every active column in authoritative order. An unchanged position returns 200 with the same version and writes nothing. A `column_id` that is not an active column of this board 404. |
| E17 | POST `/api/columns/{id}/cards` | Participant. `title` 1–160, optional nullable `description` ≤2,000 (blank is stored as null), optional nullable `assignee_id` → 201 `{card, position_version}`; the card is appended at the end. An `assignee_id` that is not an active participant of the board 400 `VALIDATION_ERROR` with `fields.assignee_id`. |
| E18 | PATCH `/api/cards/{id}` | Participant. Editable fields from E17, at least one → 200 card; column, order and `position_version` do not change. The `assignee_id` rule of E17 applies. |
| E19 | DELETE `/api/cards/{id}` | Participant → 200 with `{"data": {"position_version": n}}`; the card is soft-deleted. |
| E20 | PATCH `/api/cards/{id}/position` | Participant. `column_id,before_card_id,expected_position_version` → 200 `{card, columns, position_version}`. An unchanged position returns 200 with the same version and writes nothing. |
| E21 | GET `/api/cards?assignee=me` | Signed-in user → 200 list of active cards assigned to current user with board ID/name. `assignee=me` required for v1. |
| E22 | GET `/api/boards/{id}/cards/search?q=...` | Participant. `q` 1–100 chars → 200 up to 20 active title matches with column IDs. |
| E23 | GET `/api/cards/{id}/comments` | Participant → 200 unpaginated list of active comments sorted by creation time and ID, each with the author's current name. An empty card returns an empty list. |
| E24 | POST `/api/cards/{id}/comments` | Participant. `content` 1–2,000 after trimming (inner line breaks kept) → 201 comment. Records one `comment_created` event in the same transaction. `created_at` and `updated_at` are equal on creation. The server does not deduplicate: two identical posts create two comments. |
| E25 | PATCH `/api/comments/{id}` | Author with current access. `content` 1–2,000 after trimming → 200 comment. `updated_at` changes only when the trimmed content changes; the same content returns 200 and writes nothing. A participant who is not the author, an admin included, gets 403 `FORBIDDEN`. |
| E26 | DELETE `/api/comments/{id}` | Author with current access → 200 with the comment as it was before the delete in `data`. Later reads omit it, and a repeat returns 404. A non-author participant, an admin included, gets 403 `FORBIDDEN`. |
| E27 | GET `/api/notifications?page=1&per_page=20` | Current user. `page` ≥1, `per_page` 1–50 → 200 `{items,page,per_page,total,unread_count}`; newest first. |
| E28 | PATCH `/api/notifications/{id}/read` | Recipient with current access → 200 read item; repeat preserves original `read_at`. |
| E29 | GET `/api/boards/{id}/analytics` | Participant → 200 `{week_start,week_end,cards_per_column,completed_cards,member_activity}`. End is exclusive. |
| E30 | GET `/api/users/me` | Current user → 200 `{id,name,email}`. |
| E31 | PATCH `/api/users/me` | Current user. `name` or `email` (E02 constraints) → 200 public user. `password` or unknown fields 400, duplicate email 409. |

E15 and E19 return position metadata for synchronizing clients. E16 and E20 require a nonnegative integer version (0 to 2147483647, not a boolean) and an explicit nullable anchor. Order conflicts return `POSITION_CONFLICT` with 409.

Check order for E13–E20: authenticate (401), validate path IDs and the body shape (400), resolve the board and check the caller's access (404 for a nonmember, 403 for a member on E13–E16), take the board lock, recheck membership, role and the addressed resource under the lock (404), compare the version (409 `POSITION_CONFLICT`), then validate the destination and anchor. An invalid destination column, an anchor that is the card itself, deleted, in another column or on another board returns 400 `VALIDATION_ERROR` with the fixed message "Choose a valid destination." and no `fields`, so nothing about another board is disclosed. The source resource is the card (E18–E20), the column (E14, E15) or, for E16, the `column_id` in the body; a missing source returns the normal 404.

Only a request that changes a position, or creates or deletes a column or card, changes `position_version` (by 1). E14, E18 and an unchanged E16 or E20 leave it alone. When `position_version` is already 2147483647, a request that would change it returns 409 `STATE_CONFLICT` with a fixed message and writes nothing; reads still work. Events (`card_created`, `card_moved`, `column_reordered`, `entered_done`) are written in the same transaction and only for a real change. `entered_done` is written for a card created in a Done column and for a card moved from a column that is not Done into the Done column.

Comment check order for E23–E26: authenticate (401), validate path IDs and the body shape (400), resolve the board from the card or comment through the parent chain and check the caller's access (404 for a nonmember or a removed member, including a removed author). E24–E26 then take the board lock, recheck membership, reload the card or comment under the lock (404 when missing, soft-deleted or on an inactive card), and only then check authorship for E25 and E26 (403). Comment writes do not change `position_version`. Only E24 records an event (`comment_created`); edit and delete record none and do not remove the earlier event. Content is plain text: the server stores the trimmed text and never interprets HTML or Markdown. A blank, non-text, over-long or unknown field returns 400 with `fields.content` where a field applies.

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
