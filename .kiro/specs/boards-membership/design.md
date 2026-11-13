# Design Document: boards-membership (T05–T06)

## Overview

This slice adds the Flask boards and membership API (E05–E12, root task T05) and the Next.js dashboard, board shell and membership controls (root task T06). It implements R03 (AC03.1–AC03.3), R04 (AC04.1–AC04.2) and AC13.1 for every new page and dialog. It refines root `specs/design.md` D2, D3 and D5 and the layer references in `backend/specs/` and `frontend/specs/`.

The slice adds no table, column or migration. It adds four typed exceptions, one blueprint (`boards_bp`), a small move of generic validators into the existing `backend/app/validation.py`, one Next.js server helper set, four Route Handlers, two shared components, a Confirm_Dialog and the dashboard and board pages.

This document uses the requirement numbering of `requirements.md` ("Requirements 2.4" means Requirement 2, criterion 4). Work packages (WP-…) are the units that `tasks.md` splits into checkbox tasks linked to T05 and T06. Review items R1–R14 are all resolved (see "Review Items and Decisions").

### Verified facts about the existing code

| Question                                       | Finding                                                                                                                                                                                                                                                                                                      | Evidence                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Does `cards` have an assignee column?          | Yes. `cards.assignee_id` is a nullable UUID foreign key to `users.id`, with a partial index on active rows and a `Card.assignee` relationship. There is no `assignee_name` column. The name comes from `users.name` through a join.                                                                          | `backend/app/models/card.py`                                  |
| Does the E07 `Card` shape need a model change? | No. `Card { id, column_id, title, description, assignee_id, assignee_name, order }` maps to `cards.id`, `column_id`, `title`, `description`, `assignee_id`, `LEFT JOIN users.name` and `order`. `Column { id, board_id, name, is_done, order }` maps one to one.                                             | `docs/API.md` data shapes, `board_column.py`                  |
| Does `users` support soft deletion?            | No. Account deletion is outside v1, so a membership join to `users` needs no active filter on the user.                                                                                                                                                                                                      | `backend/app/models/user.py`                                  |
| Which boards-related exceptions exist?         | None. `exceptions.py` has no 403, 404 or 409 class. The central handler already maps Werkzeug `NotFound` to `NOT_FOUND`.                                                                                                                                                                                     | `backend/app/exceptions.py`, `errors.py`                      |
| Does the cache header already apply?           | Yes. `after_request` sets `Cache-Control: private, no-store` on every `/api/` response except `health.get_health`. The new blueprint inherits it, and the slice only adds tests.                                                                                                                             | `backend/app/response_headers.py`                             |
| Where do shared validators live today?         | `backend/app/validation.py` already holds `first_messages` and `load_json_body`. `TrimmedString`, `NormalizedString`, `normalize_email`, `EMAIL_PATTERN`, `EMAIL_MAX` and the fixed messages live in `blueprints/auth/schema.py`.                                                                            | `backend/app/validation.py`, `blueprints/auth/schema.py`      |
| What does the Next side support today?         | `FLASK_PATHS` has four static routes and `FlaskRequest.method` allows only GET and POST. `apiClient.ts` has only `apiPost` with three declared paths. `KnownErrorCode` has no `NOT_FOUND`, `USER_NOT_FOUND` or `STATE_CONFLICT`, so such a code gets the generic fallback message. All three need extending. | `frontend/lib/server/flask.ts`, `apiClient.ts`, `errors.ts`   |
| Is a property-testing library installed?       | No, and none is added (R8). Parameterized pytest and Vitest tests with deterministic fixtures cover the properties.                                                                                                                                                                                          | `backend/requirements-dev.txt`, `frontend/package.json`       |
| Is Playwright installed?                       | No. Playwright automation stays in T15 (R9).                                                                                                                                                                                                                                                                 | `frontend/package.json`                                       |
| How do DB-writing tests clean up today?        | `Tracker` in `backend/tests/auth_helpers.py` records committed users and deletes them by tracked ID. The test database guard in `backend/tests/db_guard.py` requires `TEST_DATABASE_URL` to differ from `DATABASE_URL` and to end in the test suffix.                                                        | `backend/tests/auth_helpers.py`, `db_guard.py`, `conftest.py` |

## Architecture

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as Next.js
    participant F as Flask boards_bp
    participant D as PostgreSQL
    Note over B,D: Open a board (Server Component reads)
    B->>N: GET /boards/{id} (cookie)
    N->>F: GET /api/boards/{id} and /members (Bearer)
    F->>D: membership lookup, columns, cards, members
    F-->>N: 200 BoardDetail, 200 Membership[]  or 404
    N-->>B: HTML shell (BoardShell island) or not-found page
    Note over B,D: Add a member (browser write)
    B->>N: POST /api/boards/{id}/members {email} (Origin)
    N->>N: Origin, UUID, JSON key checks
    N->>F: POST /api/boards/{id}/members (Bearer, X-Request-ID)
    F->>F: token, body validation
    F->>D: membership check, lock board, recheck, insert or reactivate, commit
    F-->>N: 201 {user_id, name, role}
    N-->>B: 201 same envelope
    B->>N: router.refresh() re-reads members (Server Component)
```

Reads (E05, E07, E10) run in Server Components through the server-only Flask helper (FE-A1, D5). Writes (E06, E08, E09, E11, E12) run in the browser through same-origin Route Handlers. No browser Route Handler is added for the three reads (R7). After a successful local E11 or E12, the Members_Panel updates its list from the response and calls `router.refresh()`, which re-runs the Server Component E10 read and replaces the local list with the server list (Requirements 4.15).

### Key design decisions

| ID   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Alternatives considered                                              | Reason                                                                                                                                                                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DD1  | Authorization is one service function, `authorize_board(board_id, user_id, *, role=None, lock=False)`. A missing board, a soft-deleted board, a nonmember and a removed member all raise the same `NotFoundError`. A participant with the wrong role raises `UnauthorizedBoardAccessError` (403). **Approved (R2, C1).**                                                                                                                                                                                                                                                                                                                                                      | Per-endpoint checks. 403 for nonmembers (as D2 says today).          | One path cannot drift between endpoints. 404 for nonmembers satisfies Requirements 2.4 and hides which board IDs exist. This changes D2 and `backend/specs/api-contract.md`, so D2, Requirements 7.8, `docs/API.md` and the tests are updated together (C1).                                                                                     |
| DD2  | Writes follow check, lock, recheck. The function reads the caller's membership without a lock. If the caller is a participant, it locks the board row with `SELECT … FOR UPDATE` in one statement and reads the membership again in a second statement. Reads use the first step only.                                                                                                                                                                                                                                                                                                                                                                                        | Lock first. One joined `FOR UPDATE` statement.                       | The recheck must be a new statement. In PostgreSQL READ COMMITTED, a joined row is not refreshed when the lock wait ends, so a membership removed during the wait would still look active. Checking before locking keeps nonmembers from queuing on a board lock, which would reveal that the board exists. D2 requires board lock then recheck. |
| DD3  | Request order is: authenticate (`token_required`), validate path IDs and body (thin route, as in `auth_bp`), then authorize against the board. Body validation uses only the schema, with no board or user lookup, so a bad body returns 400 for a Nonmember, a Member or an Admin alike. **Approved (R5, Requirements 7.9).**                                                                                                                                                                                                                                                                                                                                                | Authorize first, then validate.                                      | A 400 does not depend on the board, so it reveals nothing about existence. It keeps routes thin (BE02) and `load_json_body` unchanged. A Member who sends a bad body to E08 gets 400, not 403.                                                                                                                                                   |
| DD4  | E11 reactivation reuses the soft-deleted `board_members` row. The row's `deleted_at` is cleared and its role is set to `member`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Insert a second row.                                                 | `uq_board_members_board_id_user_id` forbids a second row, and D3 says re-add reactivates the same membership. The admin row is never soft-deleted (DD5), so reactivation always yields `member`.                                                                                                                                                 |
| DD5  | A board has exactly one admin, the creator. E11 only creates `member` rows and E12 refuses an `admin` target. This also covers an admin removing themselves.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Allow admin transfer or leaving.                                     | Matches D3 ("No admin removal in v1"). The invariant is checked by Property 9.                                                                                                                                                                                                                                                                   |
| DD6  | E12 removes the membership and clears the removed user's active card assignments on that board in one transaction under the existing board lock: `UPDATE cards SET assignee_id = NULL` for cards with `deleted_at IS NULL`, `assignee_id = target` and `column_id` in the columns of that board. The statement runs after the soft delete and before `_commit()`. **Approved (R1).** The T08 deferral and its marked comment are removed.                                                                                                                                                                                                                                     | Defer to T08.                                                        | `cards` already exists, the statement is valid today, and tests can seed card rows directly. This closes AC04.2 in T05. The `column_id IN (columns of this board)` filter keeps assignments on other boards intact.                                                                                                                              |
| DD7  | New exceptions: `NotFoundError` (404 `NOT_FOUND`), `UserNotFoundError` (404 `USER_NOT_FOUND`), `UnauthorizedBoardAccessError` (403 `FORBIDDEN`) and `StateConflictError` (409 `STATE_CONFLICT`). All use fixed messages. The 403 and 404 names follow the table in `backend/specs/architecture.md`.                                                                                                                                                                                                                                                                                                                                                                           | One generic `HttpError`. Reuse Werkzeug `abort(404)`.                | BE05 asks for typed domain exceptions. `STATE_CONFLICT` is already listed in `api-contract.md`. Both E11 (already active) and E12 (admin target) use it. `EMAIL_ALREADY_EXISTS` stays for registration only.                                                                                                                                     |
| DD8  | E11 with an unregistered email returns a plain 404 envelope with code `USER_NOT_FOUND`, only after `authorize_board(role="admin", lock=True)` succeeds. The envelope has no `fields`. Board-access 404s keep code `NOT_FOUND`. **Approved (R4, R13).** Replaces the earlier `fields.email` design.                                                                                                                                                                                                                                                                                                                                                                            | 404 `NOT_FOUND` with `fields.email`. 400 with a field error.         | A distinct code lets the UI tell "no such user" from "board gone" without parsing messages or adding `fields` to a 404. Only an Admin of the target board can reach this branch. The account-enumeration risk is accepted for v1 and recorded (see R4).                                                                                          |
| DD9  | Responses are built from explicit marshmallow schemas with `Meta.fields` (BoardSummary, BoardDetail parts, Membership). No ORM object is dumped directly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `jsonify` of dicts built inline.                                     | Same allowlist pattern as `PublicUserSchema` (BE03, D3).                                                                                                                                                                                                                                                                                         |
| DD10 | E07 uses explicit batched queries for columns and cards, not relationship loaders.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `selectinload(Board.columns.and_(…))` as written in `data-model.md`. | The relationship has no `order_by`, and explicit queries give SQL `ORDER BY ("order", id)` and a single join for `assignee_name`. The query count stays constant (three: membership and board, columns, cards), which meets the intent of DB03.                                                                                                  |
| DD11 | Dashboard and board data are Server Component reads. The dashboard list is held in a client island so a created board appears in the list before navigation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Rely on `router.refresh()`.                                          | Requirements 1.7 says the board shows in the list and its page opens. A local list update followed by `router.push` does both and needs no extra request.                                                                                                                                                                                        |
| DD12 | Confirm_Dialog uses the native `<dialog>` with `showModal()`, wrapped by a new `BaseModal` (FE-C3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A hand-built focus trap.                                             | The browser gives an inert background, Tab containment and Escape (`cancel` event). The component adds initial focus on Cancel, focus return to the opener, and blocks closing while the request is pending.                                                                                                                                     |
| DD13 | The Next Flask helper gets parameterized routes with UUID-only substitution, plus PATCH and DELETE. The browser client gets `apiRequest` with a declared method and path allowlist. `apiPost` keeps its signature.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A free-form fetch wrapper.                                           | Keeps the rule that callers pick a route key and never a free string or URL (`flask.ts`). Path traversal through an ID segment is impossible because the value must match a UUID pattern.                                                                                                                                                        |
| DD14 | Only the generic validators needed by both blueprints move into the existing `backend/app/validation.py`: `TrimmedString`, `NormalizedString`, `normalize_email`, `EMAIL_PATTERN`, `EMAIL_MAX`, and the fixed messages `REQUIRED`, `NOT_TEXT`, `UNKNOWN`, `EMAIL_LENGTH`, `EMAIL_FORMAT`, plus the not-blank and email-format validator functions. `blueprints/auth/schema.py` imports them from there. Auth-only items (`NAME_MAX` rules, password rules, `RegisterSchema`, `LoginSchema`) stay in the auth blueprint. Boards schemas import from `app.validation`, not from auth. **Approved (R10).** Replaces the earlier "boards schemas import from auth schema" choice. | Import from `auth/schema.py`. A new shared module.                   | `validation.py` is the existing shared location, so no new module is needed. Behavior is preserved and proved by the existing auth regression tests plus `auth-field-cases.json`.                                                                                                                                                                |
| DD15 | Every DB-writing test runs against `TEST_DATABASE_URL` through the existing `db_guard`. A boards `Tracker` (extending the pattern in `auth_helpers.py`) records the IDs of users, boards and any cards or columns a test creates, directly or through the API, and a fixture finalizer deletes them in foreign-key order even when an assertion fails. See "Test data isolation". **Approved (Requirements 7.12).**                                                                                                                                                                                                                                                           | Truncate tables. Delete by name pattern.                             | Deleting only tracked IDs cannot touch rows the run did not create, and the guard refuses dev or production URLs.                                                                                                                                                                                                                                |
| DD16 | Duplicate board names are allowed. There is no unique constraint and no uniqueness check on E06 or E08. **Approved (R12).**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Reject duplicates per user.                                          | No requirement forbids them, and E05 order ends with the ID tie-breaker.                                                                                                                                                                                                                                                                         |

## Components and Interfaces

### Backend layout (T05)

```text
backend/app/
  exceptions.py                    + NotFoundError, UserNotFoundError, UnauthorizedBoardAccessError, StateConflictError
  validation.py                    + TrimmedString, NormalizedString, normalize_email, EMAIL_PATTERN, EMAIL_MAX,
                                     REQUIRED, NOT_TEXT, UNKNOWN, EMAIL_LENGTH, EMAIL_FORMAT, validator functions
  blueprints/auth/schema.py        imports the moved items from app.validation (behavior unchanged)
  blueprints/boards/
    __init__.py                    boards_bp = Blueprint("boards", __name__)
    routes.py                      E05–E12, thin (BE02)
    schema.py                      BoardCreateSchema, BoardUpdateSchema, MemberAddSchema, BoardSummarySchema,
                                   ColumnSchema, CardSchema, MembershipSchema
    service.py                     authorize_board, create_board, list_boards, get_board_detail,
                                   rename_board, delete_board, list_members, add_member, remove_member
  __init__.py                      register boards_bp
```

`MemberAddSchema` and `BoardCreateSchema` use the shared validators from `app.validation` (DD14). Board name messages (`Must be 1 to 100 characters.`) are defined in the boards schema.

### Routes

| ID  | Route                                             | Auth             | Body schema                            | Service call                               | Success                    |
| --- | ------------------------------------------------- | ---------------- | -------------------------------------- | ------------------------------------------ | -------------------------- |
| E05 | `GET /api/boards`                                 | `token_required` | none                                   | `list_boards(user)`                        | 200 `data: BoardSummary[]` |
| E06 | `POST /api/boards`                                | `token_required` | `BoardCreateSchema` (`name`)           | `create_board(user, name)`                 | 201 `data: BoardSummary`   |
| E07 | `GET /api/boards/<board_id>`                      | `token_required` | none                                   | `get_board_detail(board_id, user)`         | 200 `data: BoardDetail`    |
| E08 | `PATCH /api/boards/<board_id>`                    | `token_required` | `BoardUpdateSchema` (`name`, required) | `rename_board(board_id, user, name)`       | 200 `data: BoardSummary`   |
| E09 | `DELETE /api/boards/<board_id>`                   | `token_required` | none                                   | `delete_board(board_id, user)`             | 200 `data: null`           |
| E10 | `GET /api/boards/<board_id>/members`              | `token_required` | none                                   | `list_members(board_id, user)`             | 200 `data: Membership[]`   |
| E11 | `POST /api/boards/<board_id>/members`             | `token_required` | `MemberAddSchema` (`email`)            | `add_member(board_id, user, email)`        | 201 `data: Membership`     |
| E12 | `DELETE /api/boards/<board_id>/members/<user_id>` | `token_required` | none                                   | `remove_member(board_id, user, target_id)` | 200 `data: null`           |

Each route converts path IDs with `parse_uuid` and raises `RequestValidationError` for a non-UUID (Requirements 2.6) before any query. Body validation (`load_json_body(schema)`) runs in the route before the service call, so the service is reached only with a valid body (Requirements 7.9). A route body is at most five executable lines.

### Service design

```python
# backend/app/blueprints/boards/service.py (design sketch)
def authorize_board(board_id: uuid.UUID, user_id: uuid.UUID, *, role: str | None = None,
                    lock: bool = False) -> tuple[Board, BoardMember]:
    """Return the active board and the caller's active membership.

    NotFoundError: board missing or deleted, or the caller has no active membership.
    UnauthorizedBoardAccessError: caller is a participant but `role` is not satisfied.
    With lock=True: check first, lock the board row, then read the membership again.
    """
    found = _active_membership(board_id, user_id)          # select Board, BoardMember (one statement)
    if found is None:
        raise NotFoundError()
    if lock:
        db.session.execute(select(Board.id).where(Board.id == board_id,
                           Board.deleted_at.is_(None)).with_for_update())
        db.session.expire_all()
        found = _active_membership(board_id, user_id)      # new statement, new snapshot
        if found is None:
            raise NotFoundError()
    board, member = found
    if role is not None and member.role != role:
        raise UnauthorizedBoardAccessError()
    return board, member

def create_board(user: User, name: str) -> tuple[Board, str]:
    board = Board(name=name, creator_id=user.id)           # duplicate names allowed (DD16)
    board.members.append(BoardMember(user_id=user.id, role="admin"))
    db.session.add(board)
    _commit()                                              # rollback on SQLAlchemyError, then re-raise
    return board, "admin"

def add_member(board_id, caller, email) -> BoardMember:
    board, _ = authorize_board(board_id, caller.id, role="admin", lock=True)
    target = db.session.scalar(select(User).where(User.email == email))
    if target is None:                                     # only reached by an Admin of this board
        raise UserNotFoundError()                          # 404 USER_NOT_FOUND, no fields (DD8)
    row = db.session.scalar(select(BoardMember).where(
        BoardMember.board_id == board.id, BoardMember.user_id == target.id))
    if row is not None and row.deleted_at is None:
        raise StateConflictError("This user is already a member of the board.")
    if row is None:
        row = BoardMember(board_id=board.id, user_id=target.id, role="member")
        db.session.add(row)
    else:
        row.deleted_at, row.role = None, "member"          # reactivate the same row (DD4)
    _commit()
    return row

def remove_member(board_id, caller, target_id) -> None:
    board, _ = authorize_board(board_id, caller.id, role="admin", lock=True)
    row = _active_member_row(board.id, target_id)          # NotFoundError if none
    if row.role == "admin":
        raise StateConflictError("The board admin cannot be removed.")
    row.deleted_at = utcnow()
    db.session.execute(                                    # DD6: same transaction, same board lock
        update(Card)
        .where(Card.assignee_id == target_id,
               Card.deleted_at.is_(None),
               Card.column_id.in_(select(BoardColumn.id).where(BoardColumn.board_id == board.id)))
        .values(assignee_id=None))
    _commit()                                              # one commit: membership and assignments together
```

Notes on behavior:

- `_commit()` calls `db.session.commit()`. On `SQLAlchemyError` it calls `db.session.rollback()` and re-raises, which the central handler turns into the sanitized 500 (same pattern as `register_user`, BE06). A failure in the card update or the commit therefore leaves the membership active and the assignments unchanged (Requirements 5.5).
- The `UPDATE` touches only cards whose column belongs to the board in the URL, so assignments of the same user on other boards are preserved (Requirements 5.9). It does not depend on the order of the soft delete and the update, because both commit together.
- `add_member` also catches an `IntegrityError` on `uq_board_members_board_id_user_id` and raises `StateConflictError`. The board lock already prevents this race, so this is a backstop.
- `list_boards` selects `Board` joined to the caller's active `BoardMember` with `Board.deleted_at IS NULL`, ordered by `Board.name, Board.id`. Name ordering uses the database collation. The collation is documented in `backend/specs/` (database notes) and in the evidence notes, and tests use collation-neutral names, for example all-lowercase ASCII letters without accents (R11).
- `get_board_detail` runs `authorize_board`, then selects active columns ordered by `("order", id)`, then selects active cards for those column IDs with `LEFT JOIN users` for `assignee_name`, ordered by `("order", id)`, and groups cards by column. With no columns the second query is skipped and `columns` is `[]` (Requirements 2.3).
- `list_members` selects `board_members.user_id`, `users.name`, `board_members.role` for active rows, ordered with the admin first (`CASE WHEN role = 'admin' THEN 0 ELSE 1 END`), then `users.name` in the database collation, then `board_members.user_id` (Requirements 4.1, R6).
- `delete_board` sets `Board.deleted_at`. Columns, cards and memberships are hidden by parent filtering (D3). A second delete returns 404 because the board is no longer active.
- `rename_board` and `delete_board` lock the board row and return the caller's role (`admin`).

### Serialization

```python
class MembershipSchema(Schema):
    user_id = fields.UUID()
    name = fields.String()
    role = fields.String()
    class Meta:
        fields = ("user_id", "name", "role")

class BoardSummarySchema(Schema):
    id = fields.UUID(); name = fields.String(); role = fields.String(); position_version = fields.Integer()
    class Meta:
        fields = ("id", "name", "role", "position_version")
```

`ColumnSchema` allows `id, board_id, name, is_done, order` plus a nested `cards` list of `CardSchema` (`id, column_id, title, description, assignee_id, assignee_name, order`). The service passes plain dicts, so no ORM attribute (email, hash, timestamp) can reach a schema.

### Frontend layout (T06)

```text
frontend/
  app/(protected)/page.tsx                         dashboard (Server Component, E05)
  app/(protected)/boards/[id]/page.tsx             board page (Server Component, E07 + E10)
  app/(protected)/boards/[id]/not-found.tsx        not-found state with link to "/"
  app/api/boards/route.ts                          POST (E06)
  app/api/boards/[id]/route.ts                     PATCH (E08), DELETE (E09)
  app/api/boards/[id]/members/route.ts             POST (E11)
  app/api/boards/[id]/members/[userId]/route.ts    DELETE (E12)
  components/boards/BoardList.tsx                  server-compatible, props only
  components/boards/CreateBoardForm.tsx            client
  components/boards/BoardsDashboard.tsx            client: list state + form, navigates on create
  components/boards/BoardShell.tsx                 client island: header, panel, placeholder
  components/boards/BoardHeader.tsx                client: name, role badge, rename and delete controls
  components/boards/RenameBoardForm.tsx            client
  components/boards/MembersPanel.tsx               client: list, add form, remove controls, refresh after mutation
  components/boards/AddMemberForm.tsx              client
  components/boards/ColumnsPlaceholder.tsx         server-compatible
  components/shared/BaseBadge.tsx                  new (FE-C3)
  components/shared/BaseModal.tsx                  new, native <dialog> (FE-C3)
  components/shared/ConfirmDialog.tsx              new, composes BaseModal
  components/shared/AppHeader.tsx                  brand becomes a link to "/" (min-h-11)
  lib/boardRules.ts                                name rule; email rule re-exported from authRules.ts
  lib/boards.ts                                    parsers (allowlist) for BoardSummary, Membership, BoardDetail
  lib/types.ts                                     + BoardSummary, BoardDetail, Membership, BoardRole
  lib/errors.ts                                    + NOT_FOUND, USER_NOT_FOUND, STATE_CONFLICT codes and fallback copy
  lib/apiClient.ts                                 + apiRequest(method, path, body, signal) with allowlist
  lib/server/flask.ts                              + parameterized routes, PATCH, DELETE
  lib/server/privateRoute.ts                       + handlePrivateWrite helper
  lib/server/boards.ts                             getBoards, getBoard, getBoardMembers (server-only helper, Server Components)
```

Component boundaries follow FE-C1 and FE-C2. `BoardShell` receives only serializable data: the `BoardSummary`, the members and the viewer role. `columns` is read by the page but not passed to the client in this slice, because only the placeholder renders (the Kanban island arrives in T09).

### Server helpers

```ts
// lib/server/flask.ts (additions)
export const FLASK_PATHS = {
  /* existing four */
  boards: "/api/boards",
  board: "/api/boards/:boardId",
  boardMembers: "/api/boards/:boardId/members",
  boardMember: "/api/boards/:boardId/members/:userId",
} as const;
export type FlaskRequest = {
  route: FlaskRoute;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  params?: Partial<Record<"boardId" | "userId", string>>; // each value must match the UUID pattern
  body?: unknown;
  token?: string;
  requestId: string;
};
```

`flaskRequest` replaces `:name` tokens only with values that match `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (case-insensitive) and throws otherwise. The origin check on the final URL stays.

```ts
// lib/server/boards.ts (server-only helper, R7)
export async function getBoards(): Promise<BoardSummary[]>; // 200 only, else throws ApiError
export async function getBoard(id: string): Promise<BoardDetail>; // 404 -> notFound()
export async function getBoardMembers(id: string): Promise<Membership[]>; // 404 -> notFound()
```

They use `fetchPrivate` (no cookie or 401 redirects to `/login`) and the parsers in `lib/boards.ts`, which keep only allowlisted fields. A non-UUID `[id]` calls `notFound()` before any Flask call. The board page runs `getBoard` and `getBoardMembers` with `Promise.all`. No `loading.tsx` is added under `(protected)` (see the redirect note in `frontend/specs/error-handling.md`).

```ts
// lib/server/privateRoute.ts (new): shared by the four write handlers
export async function handlePrivateWrite(
  request: NextRequest,
  spec: {
    route: FlaskRoute;
    method: "POST" | "PATCH" | "DELETE";
    params?: { boardId?: string; userId?: string };
    allowedKeys?: readonly string[]; // present: JSON body with exactly these keys; absent: no body
  },
): Promise<NextResponse>;
```

Order of checks, matching the auth handlers: server environment, exact Origin (403), session cookie (none: 401 `AUTH_REQUIRED` with the cookie cleared), UUID params (400), then `readJsonObject` for 415, 413 and 400 key checks, then `callFlask`, then `passThrough`. A 401 from Flask clears the cookie (`api-integration.md`). A transport failure or a non-envelope reply returns the fixed 503 envelope.

```ts
// lib/apiClient.ts (addition). Declared method/path pairs only.
type ApiMethod = "POST" | "PATCH" | "DELETE";
export function isDeclaredApiRequest(method: ApiMethod, path: string): boolean;
export async function apiRequest<T>(
  method: ApiMethod,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T>;
```

`isDeclaredApiRequest` matches `POST /api/boards`, `PATCH|DELETE /api/boards/{uuid}`, `POST /api/boards/{uuid}/members`, `DELETE /api/boards/{uuid}/members/{uuid}` and the three existing auth paths. `apiPost` calls `apiRequest` and keeps its current behavior and tests.

### Screens and states

| Surface                   | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/` Dashboard             | Server Component calls `getBoards()` and renders `BoardsDashboard`. Each board is a link (`min-h-11 block break-words`) with its name and a `BaseBadge` reading Admin or Member. With zero boards it shows "You have no boards yet." above the create form. The create form is always shown. On 201 the island inserts the board in name order and calls `router.push('/boards/{id}')`. On 400 the field message shows under the input and the typed name stays. Any other failure goes through `useErrorHandler`. |
| `/boards/[id]` Board page | Server Component calls `getBoard` and `getBoardMembers`. A 404 renders `not-found.tsx` (a message and a link to `/`). The shell shows the header (`h1` name, role badge), the Members_Panel and `ColumnsPlaceholder` ("Columns will appear here.").                                                                                                                                                                                                                                                                |
| Rename (Admin)            | A "Rename board" button reveals `RenameBoardForm` seeded with the current name. On 200 the header shows the returned name and the form closes. On 400 the field error shows and the value stays. Duplicate names are accepted.                                                                                                                                                                                                                                                                                     |
| Delete (Admin)            | "Delete board" opens `ConfirmDialog` naming the board. Confirm calls E09. On 200 the page calls `router.push('/')`. A 404 is a board-access 404 (see below).                                                                                                                                                                                                                                                                                                                                                       |
| Members_Panel             | A list of `name` with a role badge, in the order the server returns (admin first, then name, then `user_id`). For an Admin it also shows `AddMemberForm` and a Remove button on each row whose role is `member`. A Member sees the list only.                                                                                                                                                                                                                                                                      |
| Add member                | Submits `{email}` (trimmed and lowercased on the client). On 201 the panel appends the returned membership, clears the field and calls `router.refresh()`, so the Server Component re-reads E10 and replaces the local list. On 400, 409 or 404 with code `USER_NOT_FOUND` the message shows under the email field and the email stays. Only the code `USER_NOT_FOUND` maps to the email field. A 404 with any other code is a board-access 404.                                                                   |
| Remove member             | "Remove" opens `ConfirmDialog` naming the member. Confirm calls E12. On 200 the row leaves the list and the panel calls `router.refresh()`. A 404 is a board-access 404. A 409 or 403 shows a toast and keeps the row.                                                                                                                                                                                                                                                                                             |
| Board-access 404          | Any Board_Page action (E08, E09, E11 without `USER_NOT_FOUND`, E12) that returns 404 after the page loaded shows the generic access error toast ("You no longer have access to this board.") and calls `router.push('/')` (Requirements 2.10, 4.14, R14). The message never says whether the board was deleted or access was removed.                                                                                                                                                                              |
| `ConfirmDialog`           | Props: `open`, `title`, `message` (names the target), `confirmLabel`, `pending`, `onConfirm`, `onCancel`. Focus starts on Cancel. Escape and Cancel call `onCancel` and never call the API. While `pending` it ignores Escape and disables both buttons. On close, focus returns to the opener (kept in a ref). The `modal-box` is `w-full max-w-md` with `modal-bottom sm:modal-middle`.                                                                                                                          |

Controls that depend on role come from one pure function so Property 13 can test it:

```ts
// lib/boardPermissions.ts
export function boardControls(viewerRole: BoardRole) {
  /* canRename, canDelete, canAddMember */
}
export function canRemoveMember(
  viewerRole: BoardRole,
  row: Membership,
): boolean {
  return viewerRole === "admin" && row.role === "member";
}
```

### Mobile design (Requirements 6, FE-S4–S6)

| Surface                               | 320–639 px                                                                                                                           | 640 px and wider                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `main` on both pages                  | `mx-auto w-full max-w-3xl p-4`, no `min-h-screen` or `h-screen`                                                                      | `sm:p-6`                                        |
| Create-board form and add-member form | `flex flex-col gap-2`, input via `FormField` (`min-h-11 text-base w-full`), submit `BaseButton` full width                           | `sm:flex-row sm:items-end`, submit `sm:w-auto`  |
| Board list                            | `ul` of links, each `min-h-11 flex items-center justify-between gap-2`, name `min-w-0 break-words`, badge `shrink-0`                 | Same                                            |
| Board header                          | `flex flex-col gap-2`. The `h1` has `break-words min-w-0`. Rename and Delete buttons wrap below (`flex flex-wrap gap-2`, `min-h-11`) | `sm:flex-row sm:items-start sm:justify-between` |
| Members list                          | `li` is `flex flex-wrap items-center justify-between gap-2`. Name `min-w-0 break-words`. Remove button `min-h-11 min-w-11`           | Same                                            |
| `ConfirmDialog`                       | `modal-bottom`, buttons stacked and full width, `min-h-11`                                                                           | `sm:modal-middle`, buttons in a row             |
| `AppHeader` brand link                | `inline-flex min-h-11 items-center`                                                                                                  | Same                                            |

`BaseButton` and `FormField` already carry `min-h-11 min-w-11` and `text-base`. New shared components set the same classes themselves, and tests assert them. The existing `lib/mobileGuard.test.ts` runs unchanged over the new files. jsdom does not compute layout, so the measured check is a script in the style of `evidence/authentication-mobile-measure.mjs`, run at 320, 375, 768 and 1280 px for `/`, `/boards/[id]` with an Admin and a Member, the rename form, both Confirm_Dialog states (delete board and remove member), the not-found state, and a real-browser check of dialog focus entry, Tab containment, Escape and focus return. It reads `getBoundingClientRect()` for every interactive element, checks `elementFromPoint` at its center, reads the computed input font size and checks `document.documentElement.scrollWidth <= innerWidth`. This slice runs it and records the widths and whether the browser was an emulator or a real device in `evidence/boards-membership-T05-T06.md`, together with the manual browser journey of create, open, add member, remove member and delete board (Requirements 6.6, 7.6). Playwright automation of that journey stays in T15 (R9).

## Data Models

No schema change. The slice uses these existing tables only.

| Table           | Use in this slice                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `boards`        | Insert on E06, `name` update on E08, `deleted_at` on E09, `position_version` read on E05 and E07.                                                |
| `board_members` | Insert on E06 (admin) and E11 (member), reactivation on E11, `deleted_at` on E12. All reads filter `deleted_at IS NULL`.                         |
| `users`         | Read `name` for E10 and E07, lookup by normalized `email` on E11.                                                                                |
| `board_columns` | Read on E07. Read in the E12 assignment-clearing subquery (`board_id`). Empty of rows until T07.                                                 |
| `cards`         | Read on E07. `assignee_id` set to NULL by E12 for active cards on the board's columns. Empty of rows until T08, except for rows seeded by tests. |

### Wire shapes (unchanged from `docs/API.md`)

```text
BoardSummary { id, name, role, position_version }
BoardDetail  { ...BoardSummary, columns: ColumnWithCards[] }
Column       { id, board_id, name, is_done, order }
ColumnWithCards { ...Column, cards: Card[] }
Card         { id, column_id, title, description, assignee_id, assignee_name, order }
Membership   { user_id, name, role }
```

### Frontend types

```ts
export type BoardRole = "admin" | "member";
export type BoardSummary = {
  id: string;
  name: string;
  role: BoardRole;
  position_version: number;
};
export type Membership = { user_id: string; name: string; role: BoardRole };
export type BoardDetail = BoardSummary & { columns: unknown[] }; // typed fully in T07–T08
```

`KnownErrorCode` in `lib/errors.ts` gains `NOT_FOUND`, `USER_NOT_FOUND` and `STATE_CONFLICT`.

### Request rules

| Field                   | Rule (server and client)                                                                  | Message source                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Board `name` (E06, E08) | Trimmed, 1 to 100 Unicode code points. Required. Duplicates allowed.                      | Fixed messages: `Required.`, `Must be text.`, `Must be 1 to 100 characters.`; `Unknown field.` for extra keys |
| Member `email` (E11)    | Trimmed, lowercased, at most 254 code points, matches the shared email pattern. Required. | Shared `EMAIL_FORMAT`, `EMAIL_LENGTH`, `REQUIRED` from `app.validation`                                       |

Both rule sets are covered by a new shared fixture, `specs/fixtures/board-field-cases.json`, read by the Flask schema tests and `lib/boardRules.test.ts`, as the auth rules do with `auth-field-cases.json`. The auth regression tests and `auth-field-cases.json` run unchanged after the validator move (Requirements 7.11).

## Error Handling

All errors use the existing envelope and `request_id`.

| Situation                                                               | Status and code                                                                | Source                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| No, invalid, expired or revoked token                                   | 401 `AUTH_REQUIRED`                                                            | `token_required`                    |
| Path ID not a UUID, bad or empty body, unknown field, bad name or email | 400 `VALIDATION_ERROR` (with `fields` for field problems)                      | route and schema                    |
| Missing or non-JSON `Content-Type`, body over 64 KiB                    | 415 `UNSUPPORTED_MEDIA_TYPE`, 413 `CONTENT_TOO_LARGE`                          | existing handlers                   |
| Board missing, soft-deleted, or caller not a participant (E07–E12)      | 404 `NOT_FOUND`, message "Resource not found." for all four cases, no `fields` | `NotFoundError`                     |
| Participant lacks the admin role on E08, E09, E11, E12                  | 403 `FORBIDDEN`                                                                | `UnauthorizedBoardAccessError`      |
| E11 email matches no user (caller is Admin of the board)                | 404 `USER_NOT_FOUND`, plain envelope, no `fields`                              | `UserNotFoundError`                 |
| E11 user already active                                                 | 409 `STATE_CONFLICT`                                                           | `StateConflictError`                |
| E12 target has no active membership on this board                       | 404 `NOT_FOUND`                                                                | `NotFoundError`                     |
| E12 target is the admin (including the caller)                          | 409 `STATE_CONFLICT`                                                           | `StateConflictError`                |
| Database failure during a write                                         | Rollback, then 500 `INTERNAL_ERROR`                                            | `_commit()` and the central handler |

Check order for every route: token (401), path UUID and body (400), board and caller (404), role (403), then the target (404, 409). For E11 the user lookup happens after the role check, so only an Admin of the target board learns whether an email is registered. A Member or Nonmember sending an unregistered email gets 403 or 404 `NOT_FOUND`, never `USER_NOT_FOUND`.

Security note (R4): `USER_NOT_FOUND` lets a board Admin test whether an email is registered (account enumeration). This is accepted for v1. A per-admin E11 rate limit using shared storage is tracked in T16 before public release and is recorded in `specs/traceability.md` and the evidence notes (Requirements 7.7).

Frontend mapping, using `useErrorHandler` and `error-handling.md`:

| Condition                                               | Behavior                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 401                                                     | Existing redirect to `/login`. The Route Handler clears the cookie.                                                        |
| 400                                                     | Field messages inline under the input, input kept, first invalid field focused.                                            |
| 403 on a write                                          | Toast with the server message and the view unchanged. The Board_Page then calls `router.refresh()` so a role change shows. |
| 404 on a page read                                      | `notFound()` renders the not-found state.                                                                                  |
| 404 on E08, E09 or E12, or E11 without `USER_NOT_FOUND` | Generic access error toast, then `router.push('/')`.                                                                       |
| 404 on E11 with code `USER_NOT_FOUND`                   | Inline under the email field, email kept. Only this code maps to the field.                                                |
| 409 on E11 or E12                                       | E11: inline under the email field. E12: toast, row kept.                                                                   |
| 5xx or transport failure                                | Existing safe retry toast. The form or dialog stays open and the typed value is kept.                                      |

`lib/errors.ts` adds `NOT_FOUND` ("That item was not found."), `USER_NOT_FOUND` ("No registered user has this email.") and `STATE_CONFLICT` ("That change conflicts with the current state.") to `KnownErrorCode` and the fallback copy. Without this, `apiErrorFromEnvelope` replaces the server message with the generic text.

## Testing Strategy

### Approach

- Unit and example tests cover specific shapes, status codes and UI states.
- No property-testing library is added (R8, Requirements 7.10). Each property below is covered by parameterized pytest and Vitest tests. Pure-function properties (1, 2, 3, 13, 14) run over the shared JSON case tables, which include boundary, whitespace, Unicode and malformed values. DB-backed properties (4–12, 15–17) run over enumerated, deterministic fixture matrices: fixed user, board, membership and card sets built per test, covering each role, relationship and state combination named in the property. There is no random generation and no iteration minimum.
- Each property test carries the tag `Feature: boards-membership, Property N: <title>`.
- Infrastructure behavior (Cache-Control header, Origin check, cookie handling) is covered by example tests.

### Test data isolation (Requirements 7.12, DD15)

- Every DB-writing test uses the Flask app configured from `TEST_DATABASE_URL`. The existing `db_guard` refuses a URL equal to `DATABASE_URL` or without the test suffix, so dev and production data are never touched.
- A `BoardTracker` extends the `Tracker` pattern in `auth_helpers.py`. It records the IDs of every user, board, column, card and membership that a test or fixture creates. IDs created through the API (for example the board ID in an E06 response) are registered by the test helper that makes the call.
- Cleanup runs from a pytest fixture finalizer (`yield` inside `try/finally`, or `request.addfinalizer`), so it runs when assertions fail. It deletes only tracked IDs, in foreign-key order: cards (by tracked card IDs and by tracked board column IDs), `board_columns` of tracked boards, `board_members` of tracked boards and tracked users, tracked boards, then tracked users. Related rows such as memberships and cards that reference tracked users or boards are removed even when the test did not track them individually, because they are selected by tracked board or user ID. No `TRUNCATE`, no name patterns.
- One teardown test creates data, forces a failed assertion inside a subtest harness, and checks that the tracked rows are gone and that a pre-seeded untracked sentinel row remains.
- Two-board assignment fixture (Property 15, BT5): users A (admin of boards 1 and 2) and B (member of both); one column per board; cards on board 1 and board 2 assigned to B, one soft-deleted card assigned to B on board 1, and one card assigned to A. After E12 on board 1, active board 1 cards assigned to B are NULL, board 2 cards assigned to B are unchanged, and A's card is unchanged.

### Backend test files (V03; pytest on the guarded test database)

| File                           | Covers                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test_boards_schema.py`        | BT1: name and email rules against `board-field-cases.json`, unknown fields, serializer allowlists.                                                                                                                                                                                                                                    |
| `test_boards_create_list.py`   | BT2: E06 201 and admin membership, 400 cases, duplicate names, E05 filtering and order (collation-neutral names).                                                                                                                                                                                                                     |
| `test_boards_detail.py`        | BT3: E07 shape, empty columns, ordering with directly seeded columns and cards, `assignee_name` join, soft-deleted children excluded.                                                                                                                                                                                                 |
| `test_boards_update_delete.py` | BT4: E08 and E09 as Admin, 403 as Member, state unchanged, later 404s, duplicate names on rename.                                                                                                                                                                                                                                     |
| `test_board_members.py` | BT5: E10 order (admin first, name, `user_id`), E11 (201, reactivation, 409, 404 `USER_NOT_FOUND` after admin check, 400), E12 (200, 404, 409), allowlist, no email in the body. |
| `test_board_members_assignments.py` | BT5 (Property 15): E12 assignment clearing on two boards with the two-board fixture, and rollback after the card update. |
| `test_boards_access.py` | BT6: nonmember 404 matrix over E07–E12 (nonexistent board, soft-deleted board, Nonmember, removed member, user ID from another board), invalid UUID 400, anonymous 401, Cache-Control on success and error responses. |
| `test_boards_roles.py` | BT6: 403 for a Member on each admin-only route (E08, E09, E11, E12) with state unchanged; Admin succeeds on the same requests. |
| `test_boards_request_order.py` | BT6: request order (401, then 400, then 404/403) on E08 and E11, including a bad body from a Nonmember; `USER_NOT_FOUND` only for an Admin. |
| `test_boards_atomicity.py` | BT7: failure injection after the first insert on E06, then a read shows the prior state. Concurrent double E11 gives one 201 and one 409. Concurrent E12 and E11 on the same user ends in a consistent state. The E12 rollback is in `test_board_members_assignments.py`. |
| `test_boards_properties_rules.py` | Properties 1–3 (backend), as parameterized tests. |
| `test_boards_properties_reads.py` | Properties 4–7 (backend), as parameterized tests. |
| `test_boards_properties_writes.py` | Properties 8–12 (backend), as parameterized tests. |
| `test_boards_properties_scoping.py` | Properties 15–17 (backend), as parameterized tests. |
| `test_boards_cleanup.py`       | Teardown isolation test described above.                                                                                                                                                                                                                                                                                              |
| Existing auth tests            | Run unchanged after the validator move (Requirements 7.11).                                                                                                                                                                                                                                                                           |

### Frontend test files (Vitest and React Testing Library)

| File                                                                                                               | Covers                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/boardRules.test.ts`                                                                                           | FT1: shared fixture, client/server parity.                                                                                                                                                                                                          |
| `lib/errors.test.ts` (extended)                                                                                    | `NOT_FOUND`, `USER_NOT_FOUND`, `STATE_CONFLICT` keep their copy.                                                                                                                                                                                    |
| `lib/apiClient.test.ts` (extended)                                                                                 | FT2: `apiRequest` allowlist, unwrap of `data: null`, error mapping, existing `apiPost` tests unchanged.                                                                                                                                             |
| `lib/server/flask.test.ts` (extended)                                                                              | Parameter substitution accepts UUIDs only and rejects `..`, `/`, `?` and empty values.                                                                                                                                                              |
| `app/api/boards/**/route.test.ts`                                                                                  | FT3: Origin 403, missing cookie 401, bad UUID 400, key checks, 415 and 413, forwarded method, path and bearer, 401 clears the cookie, non-envelope upstream gives 503.                                                                              |
| `components/shared/ConfirmDialog.test.tsx`, `BaseModal.test.tsx`                                                   | FT4: focus placement, Tab containment, Escape without calling `onConfirm`, focus return, pending state, named target.                                                                                                                               |
| `components/boards/BoardsDashboard.test.tsx`, `BoardList.test.tsx`, `CreateBoardForm.test.tsx`                     | FT5: list, badges, links, empty state, create success and failure with the name kept.                                                                                                                                                               |
| `components/boards/BoardShell.test.tsx`, `MembersPanel.test.tsx`, `AddMemberForm.test.tsx`, `BoardHeader.test.tsx` | FT6: role-based controls, add, remove through the dialog, rename, delete, `router.refresh()` after a successful E11 or E12, `USER_NOT_FOUND` mapped to the email field only, other 404 navigates to `/` with the access error, 400 and 409 mapping. |
| `app/(protected)/boards/[id]/page.test.tsx`, `page.test.tsx`                                                       | FT7: server pages call the helpers, redirect without a session, `notFound()` on 404 and on a non-UUID.                                                                                                                                              |
| `lib/boardPermissions.test.ts`                                                                                     | Property 13.                                                                                                                                                                                                                                        |
| `lib/mobileGuard.test.ts`                                                                                          | Unchanged. Runs over the new files.                                                                                                                                                                                                                 |

### Browser checks (V10, V11)

The measured mobile check is a script in the style of `evidence/authentication-mobile-measure.mjs` (see Mobile design). This slice runs it and a manual browser pass of the create, open, add member, remove member and delete board journey (Chrome device emulation, or a real device if available), and records the widths checked, emulator or real device, and the journey result in `evidence/boards-membership-T05-T06.md`. Playwright is not added here. The automated Playwright journey (PW1) is delivered in T15 and carried there from this slice (R9, Requirements 7.6).

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

Prework reflection merged these criteria: 1.3 and 1.4 with 3.6 and 5.2 (listing), 2.4 and 2.5 with 3.6, 5.2 and 7.1 (indistinguishable 404), 3.2, 3.3 and 4.7 (role gate), 4.1 to 4.4, 5.1, 5.3 and 5.4 (membership model), 4.8 with 7.3 (allowlist), 3.10, 4.10, 4.13 and 5.8 (control gating), 4.5, 4.6 and 7.9 (request order), and 5.1, 5.9 (assignment clearing). Criteria 7.10 (no new library) and 7.11 (validator move) are process or regression checks, not properties.

### Property 1: Board name rule

For any string `s`, the board name schema accepts `s` if and only if the trimmed value has 1 to 100 Unicode code points, and the accepted value equals the trimmed value. For any string, the client rule in `boardRules.ts` accepts it exactly when the server schema accepts it, and both return the same message when they reject it.

**Validates: Requirements 1.1, 1.2, 1.8, 3.1, 3.4**

### Property 2: Request schemas accept exactly their field set

For any JSON object, the E06 and E08 schemas accept it only if its keys are exactly `{name}`, and the E11 schema accepts it only if its keys are exactly `{email}`. For any object with an extra key or a missing key, the schema rejects it with `VALIDATION_ERROR` and the failing key in `fields`.

**Validates: Requirements 1.2, 3.4, 4.6**

### Property 3: Member email rule and normalization

For any string `s`, the E11 email rule accepts `s` if and only if the normalized value (trimmed, lowercased) is at most 254 code points and matches the shared email pattern. The accepted value equals the normalized value, and the client rule agrees with the server rule on acceptance and message. For any string, the shared validators in `app.validation` give the same result when called from the auth schemas and from the boards schemas.

**Validates: Requirements 4.2, 4.6, 7.11**

### Property 4: Board listing visibility and order

For any set of users, boards (active or soft-deleted) and memberships (active or removed), and for any caller `u`, E05 returns exactly the active boards on which `u` has an active membership, each with `u`'s role, ordered by name and then ID. A board that is deleted or whose membership for `u` is removed does not appear.

**Validates: Requirements 1.3, 1.4, 3.6, 5.2**

### Property 5: Board detail filtering and order

For any board with any set of columns and cards, active or soft-deleted, with arbitrary `order` values including ties, E07 for a participant returns exactly the active columns sorted by `(order, id)`, each carrying exactly its own active cards sorted by `(order, id)`. Every card's `assignee_name` equals the assignee's name, or null when `assignee_id` is null.

**Validates: Requirements 2.1, 2.2**

### Property 6: Inaccessible boards are indistinguishable

For any UUID that names a nonexistent board, a soft-deleted board, a board on which the caller has no membership, or a board on which the caller's membership was removed, and for each of E07 through E12 with an otherwise valid request, the response status, error code (`NOT_FOUND`), message and absence of `fields` are identical across all four cases. For E12, a `user_id` that belongs to another board's member returns 404 and changes nothing.

**Validates: Requirements 2.4, 2.5, 3.6, 5.2, 7.1**

### Property 7: Non-UUID identifiers are rejected before lookup

For any path segment that is not a valid UUID, E07 through E12 return 400 `VALIDATION_ERROR` and perform no database lookup of that segment.

**Validates: Requirements 2.6**

### Property 8: Role gate

For any board and any caller whose active role is `member`, E08, E09, E11 and E12 with otherwise valid input return 403 `FORBIDDEN`, and the board name, board `deleted_at`, the set of memberships and all card assignments are unchanged.

**Validates: Requirements 3.2, 3.3, 4.7**

### Property 9: Membership model and admin invariant

For any sequence of E11 and E12 calls by the admin over any set of registered users, the E10 list equals a simple model (a set of active members plus the admin), ordered with the admin first, then by name, then by `user_id` (names chosen to be collation-neutral). E11 on an active participant returns 409, E11 on a removed user reuses the original membership row ID with role `member` and returns 201, E12 on a non-participant returns 404, and E12 on the admin returns 409. After every step the board has exactly one active admin, the creator.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 5.1, 5.3, 5.4**

### Property 10: Response allowlist

For any board, user, membership and card data, including records that carry extra attributes such as email, password hash or timestamps, the serialized BoardSummary has exactly the keys `{id, name, role, position_version}`, the Membership has exactly `{user_id, name, role}`, each column has exactly `{id, board_id, name, is_done, order, cards}` and each card has exactly `{id, column_id, title, description, assignee_id, assignee_name, order}`.

**Validates: Requirements 4.8, 7.3**

### Property 11: Failed writes leave no partial state

For any failure injected after the first write of E06 or E12 and before commit (including after the card update in E12), a later read shows the state from before the call. No board or admin membership exists after a failed E06. The membership is still active and every card assignment is unchanged after a failed E12.

**Validates: Requirements 1.1, 5.1, 5.5**

### Property 12: Authentication and private caching on every board route

For any of E05 through E12 and any missing, malformed, expired or revoked token, the response is 401 `AUTH_REQUIRED`. For any of E05 through E12 and any outcome (success or error), the response carries `Cache-Control: private, no-store`.

**Validates: Requirements 7.2**

### Property 13: Role-based controls

For any viewer role and any list of memberships, the Members_Panel renders the add-by-email form if and only if the role is `admin`, and renders a Remove control for a row if and only if the viewer is `admin` and the row's role is `member`. The Board_Page renders the rename and delete controls if and only if the viewer role is `admin`.

**Validates: Requirements 3.10, 4.10, 4.13, 5.8**

### Property 14: Browser client sends only declared requests

For any method and any string used as a board or user ID segment, `isDeclaredApiRequest` and the Route Handler parameter check accept the segment only if it is a UUID. For any other string, including values with `..`, `/`, `?` or `#`, `apiRequest` throws before calling `fetch` and a Route Handler returns 400 before calling Flask.

**Validates: Requirements 2.6, 7.4**

### Property 15: Removal clears only this board's assignments

For any user `u` removed from board `b` by its Admin, with any arrangement of active and soft-deleted cards assigned to `u` on `b`, on other boards, and cards assigned to other users, after E12 every active card on `b` that was assigned to `u` has `assignee_id` NULL, every card on any other board keeps its assignee, every card assigned to another user keeps its assignee, and the membership of `u` on `b` is soft-deleted, all committed together.

**Validates: Requirements 5.1, 5.9**

### Property 16: Request order of authentication, validation and authorization

For any E08 or E11 request, any caller relationship to the board (anonymous, Nonmember, Member, Admin) and any body (valid or invalid), and any email (registered or not): an anonymous caller gets 401; an authenticated caller with an invalid body gets 400 regardless of the board or the user lookup; with a valid body a Nonmember gets 404 `NOT_FOUND`, a Member gets 403, and an Admin of an E11 request with an unregistered email gets 404 `USER_NOT_FOUND`. The code `USER_NOT_FOUND` appears only for an Admin of the target board.

**Validates: Requirements 4.5, 4.6, 7.9**

### Property 17: Duplicate board names are accepted

For any valid board name and any set of existing active boards (owned by anyone) that already use that name, E06 creates a board and E08 renames a board to that name, and both return success. E05 then lists all boards with that name ordered by ID.

**Validates: Requirements 1.9**

## Acceptance Criteria Map

Work packages group the tasks that `tasks.md` will create. Test IDs refer to the files in the Testing Strategy.

| WP    | Scope                                                                                                    | Root task |
| ----- | -------------------------------------------------------------------------------------------------------- | --------- |
| WP-B0 | Move generic validators into `app/validation.py`, update auth imports, run auth regression tests         | T05       |
| WP-B1 | Exceptions (including `UserNotFoundError`), `authorize_board`, `_commit` helper                          | T05       |
| WP-B2 | Schemas and serializers, `board-field-cases.json`                                                        | T05       |
| WP-B3 | Board services and E05–E09 routes                                                                        | T05       |
| WP-B4 | Member services (including assignment clearing) and E10–E12 routes, blueprint registration               | T05       |
| WP-B5 | Backend tests BT1–BT7, `BoardTracker` fixtures, cleanup test and properties                              | T05       |
| WP-F1 | Error codes (including `USER_NOT_FOUND`), types, parsers, `boardRules`, `boardPermissions`, `apiRequest` | T06       |
| WP-F2 | Flask route table, `handlePrivateWrite`, server board reads                                              | T06       |
| WP-F3 | Four Route Handlers and their tests                                                                      | T06       |
| WP-F4 | `BaseBadge`, `BaseModal`, `ConfirmDialog`, `AppHeader` brand link                                        | T06       |
| WP-F5 | Dashboard page and components                                                                            | T06       |
| WP-F6 | Board page, shell, header, rename, members panel, refresh and access-error handling                      | T06       |
| WP-F7 | Mobile check script, manual journey and the 320, 375, 768 and 1280 px record                             | T06       |
| WP-D  | Documentation: traceability, changelogs, evidence, contract clarifications                               | T05, T06  |

| Requirement | API and UI                                                                       | WP            | Tests                                                      |
| ----------- | -------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------- |
| 1.1         | E06; `CreateBoardForm`                                                           | WP-B2, B3, F5 | BT2, BT7, P1, P11                                          |
| 1.2         | E06 400; form error                                                              | WP-B2, B3, F1 | BT1, BT2, P1, P2                                           |
| 1.3         | E05                                                                              | WP-B3         | BT2, P4                                                    |
| 1.4         | E05 filter                                                                       | WP-B3         | BT2, BT6, P4                                               |
| 1.5         | `/` `BoardList`, `BaseBadge`                                                     | WP-F4, F5     | FT5                                                        |
| 1.6         | `/` empty state                                                                  | WP-F5         | FT5                                                        |
| 1.7         | `BoardsDashboard` insert and `router.push`                                       | WP-F5         | FT5, manual journey, PW1 (T15)                             |
| 1.8         | `CreateBoardForm` error path                                                     | WP-F1, F5     | FT1, FT5, P1                                               |
| 1.9         | E06 and E08 accept duplicate names                                               | WP-B3         | BT2, BT4, P17                                              |
| 2.1         | E07                                                                              | WP-B3         | BT3, P5                                                    |
| 2.2         | E07 order                                                                        | WP-B3         | BT3, P5                                                    |
| 2.3         | E07 empty `columns`                                                              | WP-B3         | BT3                                                        |
| 2.4         | `authorize_board` 404 (C1)                                                       | WP-B1, B3, B4 | BT6, P6                                                    |
| 2.5         | `authorize_board` 404                                                            | WP-B1         | BT6, P6                                                    |
| 2.6         | `parse_uuid` in routes; `notFound()` for bad `[id]`                              | WP-B3, B4, F2 | BT6, FT7, P7, P14                                          |
| 2.7         | `/boards/[id]` `BoardShell`, `ColumnsPlaceholder`                                | WP-F6         | FT6, FT7                                                   |
| 2.8         | `not-found.tsx`                                                                  | WP-F6         | FT7                                                        |
| 2.9         | `fetchPrivate` redirect on both pages                                            | WP-F2, F5, F6 | FT7                                                        |
| 2.10        | Board-access 404 handling: access error toast and `router.push('/')`             | WP-F6         | FT6                                                        |
| 3.1         | E08; `RenameBoardForm`                                                           | WP-B3, F6     | BT4, P1                                                    |
| 3.2         | E08, E09 403                                                                     | WP-B1, B3     | BT4, BT6, P8                                               |
| 3.3         | 403 for a Member on every admin-only action                                      | WP-B1, B3, B4 | BT6, P8                                                    |
| 3.4         | E08 400                                                                          | WP-B2, B3     | BT1, BT4, P1, P2                                           |
| 3.5         | E09                                                                              | WP-B3         | BT4                                                        |
| 3.6         | E05, E07–E12 after delete                                                        | WP-B3         | BT4, BT6, P4, P6                                           |
| 3.7         | `BoardHeader` rename                                                             | WP-F6         | FT6                                                        |
| 3.8         | `ConfirmDialog` for delete                                                       | WP-F4, F6     | FT4, FT6                                                   |
| 3.9         | Delete confirm and `router.push('/')`                                            | WP-F6         | FT6, manual journey, PW1 (T15)                             |
| 3.10        | `boardControls`                                                                  | WP-F1, F6     | FT6, P13                                                   |
| 4.1         | E10 (admin, name, `user_id` order)                                               | WP-B4         | BT5, P9                                                    |
| 4.2         | E11 201                                                                          | WP-B4         | BT5, P3, P9                                                |
| 4.3         | E11 reactivation                                                                 | WP-B4         | BT5, P9                                                    |
| 4.4         | E11 409                                                                          | WP-B4         | BT5, BT7, P9                                               |
| 4.5         | E11 404 `USER_NOT_FOUND` after admin check                                       | WP-B1, B4     | BT5, BT6, P16                                              |
| 4.6         | E11 400 before board authorization                                               | WP-B2, B4     | BT1, BT5, BT6, P2, P3, P16                                 |
| 4.7         | E11, E12 403                                                                     | WP-B1, B4     | BT5, P8                                                    |
| 4.8         | `MembershipSchema`                                                               | WP-B2         | BT1, BT5, P10                                              |
| 4.9         | `MembersPanel` list                                                              | WP-F6         | FT6                                                        |
| 4.10        | `AddMemberForm` for Admin                                                        | WP-F6         | FT6, P13                                                   |
| 4.11        | `AddMemberForm` success                                                          | WP-F6         | FT6, manual journey, PW1 (T15)                             |
| 4.12        | `AddMemberForm` maps only `USER_NOT_FOUND` to the email field                    | WP-F1, F6     | FT6                                                        |
| 4.13        | Member view                                                                      | WP-F1, F6     | FT6, P13                                                   |
| 4.14        | E11 404 without `USER_NOT_FOUND`: access error and navigate                      | WP-F6         | FT6                                                        |
| 4.15        | `router.refresh()` after local E11 or E12                                        | WP-F6         | FT6                                                        |
| 5.1         | E12 with assignment clearing, one transaction under the board lock               | WP-B4         | BT5, BT7, P9, P11, P15                                     |
| 5.2         | E07–E12 and E05 after removal                                                    | WP-B4         | BT5, BT6, P4, P6                                           |
| 5.3         | E12 409                                                                          | WP-B4         | BT5, P9                                                    |
| 5.4         | E12 404                                                                          | WP-B4         | BT5, P9                                                    |
| 5.5         | `_commit()` rollback                                                             | WP-B1, B4     | BT7, P11                                                   |
| 5.6         | `ConfirmDialog` for removal                                                      | WP-F4, F6     | FT4, FT6                                                   |
| 5.7         | Remove confirm                                                                   | WP-F6         | FT6, manual journey, PW1 (T15)                             |
| 5.8         | `canRemoveMember`                                                                | WP-F1, F6     | FT6, P13                                                   |
| 5.9         | Other-board assignments preserved                                                | WP-B4, B5     | BT5, P15                                                   |
| 6.1         | Mobile classes on all new surfaces                                               | WP-F4–F7      | BM1                                                        |
| 6.2         | `min-h-11 min-w-11`                                                              | WP-F4–F7      | FT4–FT6 (classes), BM1 (measured)                          |
| 6.3         | `text-base` inputs (create, rename, add member)                                  | WP-F4–F7      | FT5, FT6 (classes), BM1 (measured)                         |
| 6.4         | Native `<dialog>`, focus ref                                                     | WP-F4         | FT4 (stubbed jsdom), BM1 (real-browser focus, Tab, Escape) |
| 6.5         | Check at 320, 375, 768, 1280                                                     | WP-F7         | BM1                                                        |
| 6.6         | Evidence record of measured check and manual journey                             | WP-F7, D      | Evidence review                                            |
| 6.7         | Create, open, add, remove flow on mobile                                         | WP-F5, F6, F7 | Manual journey at 375 px (recorded); PW1 in T15            |
| 7.1         | `authorize_board` and queries scoped by board                                    | WP-B1, B4     | BT6, P6                                                    |
| 7.2         | Existing `after_request`; `token_required`                                       | WP-B3, B4     | BT6, P12                                                   |
| 7.3         | Schemas with `Meta.fields`                                                       | WP-B2         | BT1, P10                                                   |
| 7.4         | Route Handlers (writes), server helper (reads), `apiRequest`                     | WP-F1, F2, F3 | FT2, FT3, FT7, P14                                         |
| 7.5         | Backend tests                                                                    | WP-B5         | BT1–BT7                                                    |
| 7.6         | Measured mobile check and manual journey now; Playwright suite in T15            | WP-F7, D      | BM1, evidence review                                       |
| 7.7         | Traceability and evidence notes (AC04.2 clearing, enumeration risk, T16 limiter) | WP-D          | Documentation review                                       |
| 7.8         | Contract clarifications C1–C5 below                                              | WP-D          | Documentation review                                       |
| 7.9         | Route order: token, body, then authorization                                     | WP-B3, B4     | BT6, P16                                                   |
| 7.10        | Parameterized pytest and Vitest, no new library                                  | WP-B5         | Test files above                                           |
| 7.11        | Validators in `app/validation.py`, auth imports                                  | WP-B0         | Auth regression tests, BT1, P3                             |
| 7.12        | `BoardTracker` and finalizer cleanup on `TEST_DATABASE_URL`                      | WP-B5         | `test_boards_cleanup.py`                                   |

PW1 is the Playwright journey delivered in T15. BM1 is the measured mobile script run in this slice.

## Contract and Document Impact

No endpoint path, method, request field or response shape changes. The only added contract item is the error code `USER_NOT_FOUND` for E11. The items below clarify behavior that `docs/API.md`, `specs/design.md` or `backend/specs/api-contract.md` leaves open or states differently. Each needs a `specs/CHANGELOG.md` entry with before, after, reason and verification.

| ID  | Document                                                                                                 | Before                                                           | After                                                                                                                                                                                                                                                         | Status and conflict                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `specs/design.md` D2, `backend/specs/api-contract.md` 403 row, `docs/API.md`, Requirements 7.8 reference | "Authenticated nonmembers who target an existing board get 403." | Nonmembers and removed members get 404 on board-scoped E07–E12, the same status and envelope as a missing or deleted board. A participant with the wrong role still gets 403.                                                                                 | **Approved (R2).** Changes D2 and `api-contract.md`. D2, the 7.8 reference, `docs/API.md` and the tests (BT6, P6) are updated together. No client exists yet, so nothing breaks. |
| C2  | `docs/API.md` E09 row                                                                                    | "200 soft-deleted board"                                         | 200 with `{"data": null}`                                                                                                                                                                                                                                     | Wording only. The Conventions section already says deletes return `data: null`.                                                                                                  |
| C3  | `docs/API.md` E12 row                                                                                    | "200 membership removed and assignments cleared"                 | 200 with `{"data": null}`. Assignment clearing for the removed user's active cards on that board happens in T05, in the same transaction.                                                                                                                     | No conflict. AC04.2 is verified in this slice (BT5, P15).                                                                                                                        |
| C4  | `docs/API.md` E11 row and error codes                                                                    | "Registered `email` → 201 membership; already active 409."       | Adds: unregistered email returns 404 with code `USER_NOT_FOUND` and a plain envelope (no `fields`), only after the caller is confirmed as an Admin of the board; a previously removed user is reactivated as `member` with 201; 409 code is `STATE_CONFLICT`. | Adds the code `USER_NOT_FOUND` to the error-code list. Replaces the earlier `fields.email` wording.                                                                              |
| C5  | `docs/API.md` E12 row                                                                                    | "Admin removal 409."                                             | Adds: 404 when the target has no active membership on the board; 409 code is `STATE_CONFLICT`.                                                                                                                                                                | None.                                                                                                                                                                            |

`specs/traceability.md` gets a boards-membership evidence status table that records the AC04.2 clearing verification, the account-enumeration risk of `USER_NOT_FOUND`, and the per-admin E11 rate limit with shared storage tracked in T16. T16 in `specs/tasks.md` gains the E11 limiter wording. `CHANGELOG.md`, `backend/CHANGELOG.md` and `frontend/CHANGELOG.md` get `[Unreleased]` entries. `README.md` status and `specs/tasks.md` keep T05 and T06 unchecked until their acceptance checks pass.

## Review Items and Decisions

All items are resolved. Decisions R1–R14 were approved with the wording below.

| ID  | Item                                        | Status             | Resolution                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **Assignment clearing (AC04.2).**           | Resolved, approved | E12 clears the removed user's active card assignments on that board in the same transaction under the board lock (DD6). Tested with seeded cards on two boards, other-board assignments preserved (P15, BT5). The T08 deferral and the marked comment are removed. |
| R2  | **404 for nonmembers (C1).**                | Resolved, approved | Nonmembers get the same 404 status and envelope as a missing board on board-scoped endpoints. D2, the 7.8 reference, API contract and tests updated together (DD1, C1).                                                                                            |
| R3  | **403 for a Member on admin-only actions.** | Resolved, approved | Matches D2. Covered by P8 and BT6.                                                                                                                                                                                                                                 |
| R4  | **E11 unknown email.**                      | Resolved, approved | 404 `USER_NOT_FOUND` only after the admin check (DD8, P16). The account-enumeration risk is documented. A per-admin E11 rate limit with shared storage is tracked in T16 before public release.                                                                    |
| R5  | **Order of validation and authorization.**  | Resolved, approved | Authenticate, then validate the body (400), then authorize against the board, independent of board and user lookups (DD3, P16).                                                                                                                                    |
| R6  | **E10 order.**                              | Resolved, approved | Admin first, then name, then `user_id` (P9).                                                                                                                                                                                                                       |
| R7  | **Reads and writes through Next.**          | Resolved, approved | A server-only helper serves E05, E07 and E10 reads. Route Handlers serve browser writes.                                                                                                                                                                           |
| R8  | **Property-test libraries.**                | Resolved, approved | No Hypothesis or fast-check. Parameterized pytest and Vitest tests with deterministic DB fixtures cover the properties.                                                                                                                                            |
| R9  | **Playwright.**                             | Resolved, approved | Automation stays in T15. This slice runs and records the measured mobile check and the manual browser journey.                                                                                                                                                     |
| R10 | **Shared validators.**                      | Resolved, approved | Generic string and email validators move into the existing `app/validation.py`. Auth behavior preserved and auth regression tests run (DD14). Replaces the earlier import-from-auth choice.                                                                        |
| R11 | **Sort collation.**                         | Resolved, approved | Name sorting uses the database collation, documented. Tests use collation-neutral names.                                                                                                                                                                           |
| R12 | **Duplicate board names.**                  | Resolved, approved | Allowed (DD16, P17).                                                                                                                                                                                                                                               |
| R13 | **E11 404 shape.**                          | Resolved, approved | Plain 404 envelope with code `USER_NOT_FOUND`. The UI maps only that code to the email field. Inaccessible-board errors stay generic. `USER_NOT_FOUND` is added to the frontend `KnownErrorCode`. Replaces the `fields.email` idea and the earlier C4 wording.     |
| R14 | **Stale members list.**                     | Resolved, approved | The members list refreshes after each successful local mutation. A later board-access 404 shows the access error and navigates to the boards list.                                                                                                                 |

## Risks

| Risk                                                                        | Mitigation                                                                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A joined `FOR UPDATE` read hides a concurrent removal under READ COMMITTED. | DD2: recheck in a separate statement after the lock. BT7 includes a concurrent E11 and E12 test.                                                       |
| The native `<dialog>` behaves differently in jsdom.                         | The test setup stubs `showModal` and `close`. Focus containment and Escape are also checked in the real browser pass.                                  |
| Extending `flaskRequest` weakens the fixed-route rule.                      | UUID-only substitution, the origin check on the final URL, and Property 14.                                                                            |
| Unknown error codes lose their message.                                     | The three new codes are added to `KnownErrorCode`, and `lib/errors.test.ts` covers them.                                                               |
| Moving validators changes auth behavior.                                    | Names are re-imported unchanged in `auth/schema.py`. The auth regression tests and `auth-field-cases.json` run before and after the move (WP-B0).      |
| A DB test leaves rows behind or touches real data.                          | `db_guard` on `TEST_DATABASE_URL`, `BoardTracker` finalizer cleanup by tracked IDs, and `test_boards_cleanup.py`.                                      |
| `USER_NOT_FOUND` allows email enumeration by board Admins.                  | Accepted for v1. Only Admins of the target board reach it (P16). Per-admin E11 rate limit with shared storage is tracked in T16 before public release. |
