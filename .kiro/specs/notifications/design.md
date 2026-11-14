# Design Document: notifications (T13)

## Overview

This design implements persisted notifications for a new assignment and a new comment on an assigned card, the recipient APIs E27 and E28, and the notification bell with its 30-second poll (root T13). It follows `requirements.md` (Requirements 1 to 10, decisions B1–B10 approved on 2026-11-14 with clarifications) and the shared design D3, D5 and D6. Python (Flask, SQLAlchemy, Marshmallow, pytest) and TypeScript (Next.js App Router, Tailwind, daisyUI, Vitest) are the languages already in the repository. No table, migration or dependency is added. The only shared-contract change is the additive display fields `actor_name`, `board_name` and `card_title` (B1, clarification C33). Clarifications C28–C33 (below) are recorded in `docs/API.md`, `specs/CHANGELOG.md` and the shared documents.

### Verified facts about the existing code

| Fact | Where | Consequence |
|---|---|---|
| The `notifications` table has `recipient_id`, `actor_id`, `board_id`, `card_id` (all RESTRICT foreign keys), `kind` (`assigned`, `commented`), `created_at` (default `utcnow`) and nullable `read_at`. Indexes: `(recipient_id, created_at, id)` and a partial `recipient_id WHERE read_at IS NULL`. `User.notifications` maps to `recipient`. | `backend/app/models/notification.py`, `user.py` | No migration. The list order `created_at DESC, id DESC` is a backward scan of the first index. The unread count can use the partial index. `board_id` and `card_id` stay plain foreign keys, so the queries join explicitly. |
| `create_card` and `update_card` take the board lock with `authorize_board(..., lock=True)`. `update_card` reloads the card with `load_card` (which uses `populate_existing`), so `card.assignee_id` is the committed value under the lock. An assignee is checked with `_require_participant` under the same lock. Each commits once through `commit_or_rollback`. | `cards/service.py` | The old and new assignee are compared under the lock, in the same transaction as the write. Two concurrent edits to one new assignee serialize and the second sees no change (Requirement 1.2). |
| `create_comment` takes the lock, calls `load_card(card_id, board_id)` (the result is discarded), adds the comment, flushes, calls `record_event`, builds the result and commits. A comment `# T13 adds the assignee notification here` marks the place. | `comments/service.py` | The card returned by `load_card` carries the assignee under the lock. The notification is staged after `record_event` and before the commit. |
| `record_event` adds a `BoardEvent` to the session and leaves the commit to the caller. | `positions.py` | `add_notification` follows the same contract. |
| `commit_or_rollback` commits, and on any `SQLAlchemyError` rolls back and re-raises. An exception before the commit leaves the session dirty, and the request teardown removes the session, which rolls back. | `boards/service.py`, `extensions.py` | A failure before or during the commit leaves neither the change nor the notification (Requirement 1.8). |
| `my_tasks` is the model for a visibility query: it joins `Card → BoardColumn → Board → BoardMember (user, active)` with `deleted_at IS NULL` on card, column and board. | `cards/service.py` | The notification filter is the same join with the recipient's membership (B4). |
| `load_query_args(schema)` validates one value per known key and gives 400 for a repeated or unknown key, with no database access. `BoundedInt` accepts JSON integers only. | `app/validation.py` | E27 reuses `load_query_args`. Query values are strings, so a small `QueryInt` field is added (DD4). |
| `token_required`, `parse_uuid`, `NotFoundError` (404 `NOT_FOUND`) and `register_response_headers` (`Cache-Control: private, no-store` on every `/api/` response except health) exist. | `auth_guard.py`, `exceptions.py`, `response_headers.py` | E27 and E28 get the header by default. A test proves it. |
| Blueprints are registered in `create_app` one by one, and `test_factory.py` lists the routes. | `app/__init__.py`, `tests/test_factory.py` | One new import and registration, and the list gains two routes. |
| `handlePrivateRead(request, {route, forwardQuery})` and `handlePrivateWrite(request, {route, method, params})` exist. Without `allowedKeys` the write handler reads no body. `FLASK_PATHS` and `FlaskParamName` list the routes and the path parameters. The invalid-parameter message is "The board ID is not valid." | `frontend/lib/server/privateRoute.ts`, `flask.ts` | Both handlers are one call each. The message is neutralized for the new ID (R8). |
| `apiRequest(method, path, body?, signal?)` accepts a pair only when it matches `DECLARED_BOARD_REQUESTS`. `apiGet(path, signal)` accepts a path only when it matches `DECLARED_GETS`. Both throw before `fetch` for an undeclared pair. | `frontend/lib/apiClient.ts` | One new GET pattern and one new PATCH pattern. |
| `useCardSearch` and `useCardComments` are the models for a hook with an `AbortController`, a sequence guard, `useErrorHandler` and a `mountedRef`. `useErrorHandler` sends `AUTH_REQUIRED` to `/login`. | `frontend/hooks/` | `useNotifications` follows them. |
| `AppHeader` is a client component rendered only by the protected layout. Row 1 is the brand block (`flex-1`) and the account block (Profile link, "Sign out"). The nav row (Boards, My tasks) is `order-last basis-full` below 1024 px. `BaseModal` traps focus, closes on Escape and restores focus. `BaseBadge` is a non-interactive label. `formatCommentTime` formats a local date and time. | `AppHeader.tsx`, `BaseModal.tsx`, `BaseBadge.tsx`, `lib/comments.ts` | The bell joins the brand block. The panel is a `BaseModal`. Row times reuse `formatCommentTime`. |
| `BoardTracker` already deletes notifications of tracked boards and users. `race(app, jobs)` runs requests in threads on the guarded test database. | `tests/boards_helpers.py`, `kanban_helpers.py` | Notification tests reuse both. No new cleanup code beyond a sentinel check. |

## Architecture

```text
Writers (inside the existing transaction, after authorize_board(lock=True))
  E17 create_card ─┐
  E18 update_card ─┼─ add_notification(...)  ──▶ db.session (no commit)  ──▶ commit_or_rollback()
  E24 create_comment ┘                                    one transaction with the change itself

Readers
  Browser ─ NotificationBell (AppHeader, every width)
     useNotifications ─ apiGet  /api/notifications?page=&per_page=20 ──▶ Next GET handler ──▶ Flask E27
                      ─ apiRequest PATCH /api/notifications/<id>/read ─▶ Next PATCH handler ─▶ Flask E28
     NotificationPanel (BaseModal) ─ rows ─ Link /boards/<board_id>
```

The token stays in the HttpOnly cookie. Flask re-validates every request and stays authoritative. There is no new server page.

### Key design decisions

| ID | Decision | Rationale |
|---|---|---|
| DD1 | One write function, `add_notification(recipient_id, actor_id, board_id, card_id, kind)` in `notifications/service.py`. It adds a `Notification` with `created_at = utcnow()` to the session and does not commit or flush. The rules that decide whether to call it stay in the three writers, next to the data they already hold. | A change and its notification share one commit (B2, Requirement 1.8). The writers know the previous assignee and the author. A rule engine for three call sites would be more code than the three `if` lines. |
| DD2 | The three trigger rules. `create_card`: `assignee_id is not None and assignee_id != user_id`. `update_card`: `"assignee_id" in changes`, the new value is not null, it differs from the card's assignee read under the lock, and it differs from the caller. `create_comment`: `card.assignee_id is not None and card.assignee_id != user_id`. All three run after the write is flushed and before the commit. | B2 and B3. Reading the previous assignee after `load_card` under the lock makes "unchanged" an exact test (Requirement 1.2) and gives A→B→A two notifications for A (Requirement 1.6). Excluding `assignee_id == user_id` is the self-assignment rule. A removed member cannot be an assignee: E12 clears the assignment, and `_require_participant` rejects a non-participant. |
| DD3 | One visibility filter, `_visible(stmt, user_id)`, applied to every read and to the E28 update: `Notification → Card → BoardColumn → Board`, joined with the recipient's active `BoardMember`, with `deleted_at IS NULL` on card, column and board and `recipient_id = :user`. The list items, `total`, `unread_count` and E28 all call it. | B4 and Requirement 5.4. One definition cannot drift between the list, the counts and the write. Following the card's parent chain (as D3 says) means a deleted ancestor hides the row. Rows are never deleted, so a rejoin shows them again with their original `read_at`. |
| DD4 | E27 parameters are `page` and `per_page` strings. `QueryInt(minimum, maximum, message)` accepts only `0` or `[1-9][0-9]*` of at most 10 digits (ASCII, no sign, no space, no leading zero, no decimal, no hex, no empty text) and then checks the range. `page` is 1 to 2,147,483,647 (default 1), `per_page` is 1 to 50 (default 20). The offset is `(page - 1) * per_page` in Python integers and is passed to SQLAlchemy as an integer, which PostgreSQL reads as a 64-bit `OFFSET`. The largest offset is 107,374,182,200, far below 2^63. | B5. Strict text parsing keeps the same strictness as E21 and E22. Python integers do not overflow, and the 64-bit offset holds the largest accepted values. A test sends `page=2147483647&per_page=50` against the real database. |
| DD5 | The list is three statements in one request: the items page, and one counts statement `SELECT count(*), count(*) FILTER (WHERE read_at IS NULL)` through `_visible`. Items are ordered by `created_at DESC, id DESC`. The counts run even when the page is empty. | B6. Two reads are simpler than a window function, which returns no row on an empty page. READ COMMITTED may show a count that differs by one concurrent commit from the items. The next poll corrects it (R2). |
| DD6 | `mark_read(notification_id, user_id)`: one `UPDATE notifications SET read_at = :now WHERE id = :id AND recipient_id = :user AND read_at IS NULL AND id IN (visible ids)` with `synchronize_session=False`, then the item select through `_visible` for that ID. No row: roll back and raise `NotFoundError`. A row: commit and return it. No board lock. | B7. The conditional `read_at IS NULL` makes two concurrent marks commit one value: the second `UPDATE` waits for the row lock, re-checks the predicate, matches nothing and then reads the first value. A notification that is hidden, foreign or missing matches nothing in the select either, so all three give the same 404. If a removal hides the row between the update and the select, the rollback undoes the update and the answer is 404 (R5). |
| DD7 | E28 reads no body. The route does not call `load_json_body`. The Next handler passes no `allowedKeys`, so it reads no body and forwards none. The client sends `PATCH` without a body. | Requirement 4.5 and 10.1. Nothing can be smuggled through a field that is never read. |
| DD8 | Display fields come from joins on the same statement: `User` (actor) for `actor_name`, `Board.name`, `Card.title`. They are current values and only rows that pass `_visible` are selected. `NotificationSchema` is a dump-only allowlist of the ten fields. | B1, Requirement 3.5 and 5.6. No extra request per row and no name of an inaccessible board or user can leave. |
| DD9 | `useNotifications` owns the list, the counts, the page and the poll. A single timer is restarted by every E27 request, so the next Poll is 30 seconds after the last request started (mount, tick, page change, retry, mark refresh). A tick is skipped when a request is in flight or an E28 is pending. | B9, Requirement 8.1–8.3. One timer and one rule means no overlap, and a manual refresh resets the clock without extra state. |
| DD10 | One counter, `latestRef`, guards every E27 response. It increases on each new E27 request, on a completed E28 and on a page change. A response applies only when its captured value equals `latestRef`. A new request aborts the previous one. | B9 and Requirement 8.5. A response for an earlier page, or requested before a completed E28, has an older value and is dropped, with no error shown. One rule covers both cases and the unmount case. |
| DD11 | Two kinds of E27 request. A background request (the mount request and every Poll) swallows failures: it keeps the list and count and shows nothing. A foreground request (opening the panel, changing the page, Retry, the refresh after a mark) sets `status: "error"` on failure, which the panel shows with Retry while it keeps the rows. | Requirement 7.8 and 8.6 are both true: only the user's own action shows an error. A 401 is handled by `useErrorHandler` for either kind and stops the timer. |
| DD12 | `markRead(id, { quiet })` runs one E28 at a time. On success it replaces the row with the server item, lowers the badge count by one only if the row was Unread, bumps `latestRef` (which aborts and invalidates any E27 in flight) and sends one foreground E27 for the shown page. On 404 it sends a foreground E27. On a 5xx, a rate limit or a transport error it keeps the row Unread, announces the failure and, when not `quiet`, shows a toast and a retry message on the row. `quiet` is the link click: it swallows the failure. | B8, Requirements 7.4, 7.5, 7.8 and 8.3. One request at a time keeps "a tick is skipped while E28 is pending" a single boolean. A failed link-click mark must not interrupt the page that opened. |
| DD13 | The panel is closed or opened by the bell component, not the hook. Opening calls `open()`, which sets page 1, status `loading` and sends a foreground E27. Closing calls `close()`, which sets page 1 for the next Poll and keeps the held rows. | Requirement 7.7 and 7.12. Reopening shows loading and then the fresh first page, not the page that was last read. |
| DD14 | The bell is placed in the brand block of the header. Below 1024 px it sits at the right end of row 1, before the account block. From 1024 px it sits at the right end of the sidebar's brand row. The block keeps `flex-wrap` as the fallback, so at 320 px the account controls may drop to a second row, and each control keeps its 44 px box. | Requirement 6.1 and 6.4. The nav row and the account block stay as they are. The measured check at 320 and 375 px decides whether the fallback is used (R3). |
| DD15 | No new shared part. The panel and rows use `BaseModal`, `BaseButton`, `BaseBadge` and the `.surface`-free divided list (`divide-y divide-base-300`) inside the modal. | FE-D1, FE-D3. The modal is the panel, so a nested `.surface` is avoided. |

## Components and Interfaces

### Backend layout

```text
backend/app/blueprints/notifications/
  __init__.py   notifications_bp, imports routes
  routes.py     GET /api/notifications, PATCH /api/notifications/<id>/read
  schema.py     NotificationListQuerySchema (QueryInt page, per_page), NotificationSchema
  service.py    add_notification, list_notifications, mark_read, _visible
backend/app/blueprints/cards/service.py     create_card, update_card call add_notification
backend/app/blueprints/comments/service.py  create_comment calls add_notification
backend/app/__init__.py                      register notifications_bp
```

`notifications/service.py` imports only models and `app.extensions`. `cards/service.py` and `comments/service.py` import it, so there is no import cycle.

### Routes

| Method and path | Handler |
|---|---|
| GET `/api/notifications` | `@token_required`, `load_query_args(NotificationListQuerySchema())`, `list_notifications(user_id, page, per_page)`, `200 {data: {items, page, per_page, total, unread_count}}` |
| PATCH `/api/notifications/<notification_id>/read` | `@token_required`, `parse_uuid` (400), `mark_read(id, user_id)`, `200 {data: item}` |

### Check order

| Route | Order |
|---|---|
| E27 | `token_required` (401) → `load_query_args` (400, no database access) → read. |
| E28 | `token_required` (401) → path UUID (400) → update and select (404) → commit. |

### Service sketch

```python
def add_notification(recipient_id, actor_id, board_id, card_id, kind) -> None:
    """Stage one notification. The caller commits it with its own change."""
    db.session.add(Notification(recipient_id=recipient_id, actor_id=actor_id, board_id=board_id,
                                card_id=card_id, kind=kind, created_at=utcnow()))

def _visible(stmt, user_id):
    return (stmt.select_from(Notification)
        .join(Card, Card.id == Notification.card_id)
        .join(BoardColumn, BoardColumn.id == Card.column_id)
        .join(Board, Board.id == BoardColumn.board_id)
        .join(BoardMember, and_(BoardMember.board_id == Board.id,
                                BoardMember.user_id == Notification.recipient_id,
                                BoardMember.deleted_at.is_(None)))
        .where(Notification.recipient_id == user_id, Card.deleted_at.is_(None),
               BoardColumn.deleted_at.is_(None), Board.deleted_at.is_(None)))

def list_notifications(user_id, page, per_page):
    rows = db.session.execute(
        _visible(select(*_ITEM_COLUMNS).join(User, User.id == Notification.actor_id), user_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(per_page).offset((page - 1) * per_page)).all()
    total, unread = db.session.execute(
        _visible(select(func.count(), func.count().filter(Notification.read_at.is_(None))), user_id)).one()
    return {"items": [r._asdict() for r in rows], "page": page, "per_page": per_page,
            "total": total, "unread_count": unread}

def mark_read(notification_id, user_id):
    db.session.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.recipient_id == user_id,
               Notification.read_at.is_(None),
               Notification.id.in_(_visible(select(Notification.id), user_id).correlate(None)))
        .values(read_at=utcnow()).execution_options(synchronize_session=False))
    row = db.session.execute(
        _visible(select(*_ITEM_COLUMNS).join(User, User.id == Notification.actor_id), user_id)
        .where(Notification.id == notification_id)).one_or_none()
    if row is None:
        db.session.rollback()
        raise NotFoundError()
    commit_or_rollback()
    return row._asdict()
```

`_visible` fixes `recipient_id = :user`, so the update and the select are both scoped to the caller. The subquery uses `.correlate(None)`, so SQLAlchemy does not correlate its `notifications` table with the table being updated. The `_ITEM_COLUMNS` are `Notification.id`, `kind`, `board_id`, `card_id`, `actor_id`, `created_at`, `read_at`, `User.name AS actor_name`, `Board.name AS board_name` and `Card.title AS card_title`.

The writers, shown as the lines they add:

```python
# create_card, after db.session.flush() gives card_id
if assignee_id is not None and assignee_id != user_id:
    add_notification(assignee_id, user_id, board_id, card_id, "assigned")

# update_card, card = load_card(...) under the lock; new = changes.get("assignee_id")
previous = card.assignee_id          # read before the setattr loop
...
if new is not None and new != previous and new != user_id:
    add_notification(new, user_id, board_id, card_id, "assigned")

# create_comment, card = load_card(...) under the lock, after record_event
if card.assignee_id is not None and card.assignee_id != user_id:
    add_notification(card.assignee_id, user_id, board_id, card_id, "commented")
```

### Schemas

`NotificationListQuerySchema` has `page` and `per_page`, each `QueryInt` with `load_default`. Messages: `fields.page` "Must be a whole number from 1 to 2147483647." and `fields.per_page` "Must be a whole number from 1 to 50." They never echo the input. `NotificationSchema` is dump-only with the ten fields, `created_at` and `read_at` as ISO 8601 UTC.

### Next handlers and client allowlist

| File | Behavior |
|---|---|
| `app/api/notifications/route.ts` | `GET` → `handlePrivateRead(request, { route: "notifications", forwardQuery: true })`. The query string goes to Flask unchanged, so Flask validates it. |
| `app/api/notifications/[id]/read/route.ts` | `PATCH` → `handlePrivateWrite(request, { route: "notificationRead", method: "PATCH", params: { notificationId: id } })`. Origin check, cookie check and UUID check come from the helper. No `allowedKeys`, so no body is read or forwarded. |
| `lib/server/flask.ts` | `FLASK_PATHS` gains `notifications` and `notificationRead` (`/api/notifications/:notificationId/read`). `FlaskParamName` and `FLASK_PARAM_NAMES` gain `notificationId`. |
| `lib/server/privateRoute.ts` | The invalid-parameter message becomes "The ID is not valid." (R8). |
| `lib/apiClient.ts` | `DECLARED_GETS` gains `^/api/notifications\?page=[1-9][0-9]*&per_page=[1-9][0-9]*$`. `DECLARED_BOARD_REQUESTS` gains `PATCH ^/api/notifications/<uuid>/read$`. No other `/api/notifications` pair. |

### Frontend layout

```text
frontend/lib/notifications.ts                        types parsers, paths, text, labels, constants
frontend/hooks/useNotifications.ts                   state, poll, mark, guards
frontend/components/notifications/NotificationBell.tsx   button, badge, open state
frontend/components/notifications/NotificationPanel.tsx  BaseModal, list, paging, states (props only)
frontend/components/notifications/NotificationRow.tsx    one row: link, Unread marker, Mark as read
frontend/components/shared/AppHeader.tsx             renders the bell in the brand block
frontend/lib/types.ts                                Notification, NotificationPage
```

### `lib/notifications.ts`

| Export | Behavior |
|---|---|
| `NOTIFICATIONS_PER_PAGE = 20`, `POLL_INTERVAL_MS = 30_000` | Constants. |
| `notificationsPath(page)` | `/api/notifications?page=<n>&per_page=20`. |
| `notificationReadPath(id)` | `/api/notifications/<id>/read`. |
| `parseNotification(value)`, `parseNotificationPage(value)` | Copy only the ten fields and the page fields, check the types, and throw `malformedApiError()` for anything else, as `parseComment` does. |
| `notificationText(item)` | `"<actor_name> assigned you to <card_title>"` or `"<actor_name> commented on <card_title>"`. Plain text, rendered as a React text node. |
| `badgeText(count)` | `""` at 0, the number up to 99, `"99+"` above. |
| `bellLabel(count)` | `"Notifications"` at 0, else `"Notifications, <count> unread"` with the exact count. |
| `pageCount(total)` | `max(1, ceil(total / 20))`. |

### `useNotifications`

```ts
useNotifications(): {
  items, page, pageCount, total, unread,
  status: "idle" | "loading" | "ready" | "error",   // panel state; the bell reads `unread`
  markingId: string | null, rowNotice: { id, text } | null, announcement: string,
  open(), close(), goToPage(n), retry(), markRead(id, opts?),
}
```

State and refs: `latestRef` (the guard of DD10), `controllerRef` (the in-flight E27), `pageRef`, `timerRef`, `markPendingRef`, `mountedRef`, `stoppedRef` (set after a 401).

| Event | Behavior |
|---|---|
| Mount | A background request for page 1. Start the timer. |
| Request start (any) | Abort the previous request, increase `latestRef`, capture it, restart the 30-second timer. |
| Tick | If stopped, unmounted, a request is in flight or an E28 is pending, restart the timer and send nothing. Otherwise a background request for `pageRef`. |
| Response | Apply only if the captured value equals `latestRef` and the component is mounted. Set items, page, total and unread. If the page is empty and `total > 0` and `page > pageCount`, set the page to `pageCount` and send a foreground request (Requirement 7.9). |
| Failure | Dropped silently if superseded or aborted. A 401 calls `handleError` and stops the timer. Otherwise a background failure changes nothing and a foreground failure sets `status: "error"`. |
| `open()` | Page 1, `status: "loading"`, foreground request. |
| `close()` | Page 1 for the next Poll. Rows stay held. |
| `goToPage(n)` | Set `pageRef`, increase `latestRef`, foreground request. |
| `markRead(id, opts)` | Ignore if `markPendingRef`. Send E28. Success, 404 and failure as in DD12. Always clear `markPendingRef` and `markingId` in `finally`. |
| Unmount | Clear the timer, abort the request, set `mountedRef` false. No state update and no toast follows. |

The apply step and the `markRead` success both write `unread` from the server response when an E27 arrives, so the local decrement is only a bridge until the refresh lands.

### `NotificationBell`

A `button` (`aria-haspopup="dialog"`, `aria-label={bellLabel(unread)}`) with `min-h-11 min-w-11`, the nav-link hover and focus classes, a bell icon (`aria-hidden`) and, when `badgeText` is not empty, a `BaseBadge` (`variant="primary"`) positioned at the icon's corner with `aria-hidden`, so the exact count is read once from the label. Before the first response `unread` is unknown and no badge shows. It owns `open` and calls `open()` and `close()` on the hook. It renders `NotificationPanel` with the hook's state.

### `NotificationPanel`

Props only: `open`, `onClose`, `items`, `page`, `pageCount`, `total`, `unread`, `status`, `markingId`, `rowNotice`, `announcement`, and the callbacks `onRetry`, `onPage`, `onMark`, `onFollow`. It is a `BaseModal` labelled by its heading ("Notifications"), with a summary line ("<unread> unread of <total>") and:

| State | Content |
|---|---|
| `loading` | A "Loading notifications…" line (`role="status"`). |
| `error` | A message with a Retry `BaseButton`. Rows already held stay above it. |
| `ready` with no item | "You have no notifications." and "You get one when someone assigns you a card or comments on a card assigned to you." |
| `ready` | A list (`ul`, `divide-y divide-base-300`) of `NotificationRow`, then, when `pageCount > 1`, "Newer" and "Older" buttons and "Page n of m". |

A visually hidden live region (`aria-live="polite"`) carries `announcement`.

### `NotificationRow`

One `li`. The title is a `next/link` to `/boards/<board_id>` with the text `notificationText(item)`, `break-words min-w-0`, a 44 px tall box and an `onClick` that calls `onFollow(item)`. Under it: the board name, `formatCommentTime(created_at)` and, for an Unread row, the text "Unread" in a `BaseBadge variant="primary"` (not color alone). An Unread row also has a "Mark as read" `BaseButton` with `aria-label="Mark as read: <text>"`, disabled while `markingId` is set and loading while it equals this row. A `rowNotice` for the row shows as a `role="alert"` line under the title.

`onFollow(item)` is in the bell: it calls `markRead(item.id, { quiet: true })` for an Unread row and `close()`, and does not call `preventDefault`, so the router navigates at once.

### AppHeader

The brand block becomes `<div className="flex min-w-0 flex-1 items-center justify-between gap-2 lg:flex-none lg:px-3">` holding the brand link and `<NotificationBell />`. Nothing else in the header moves. `guidelines/frontend.md` FE-D2 and FE-S3 are updated (FE-S3 now, FE-D2 with the implementation).

### Mobile design (Requirements 6, 9, FE-S4 to FE-S6, FE-D9)

- The bell, the close control, each row link, each "Mark as read", "Newer", "Older" and Retry are at least 44 by 44 CSS px and show a focus ring.
- The panel is a `BaseModal` (wide is not needed). It scrolls inside itself, so the close control stays reachable. Titles and names wrap (`break-words`, `min-w-0`).
- Below 1024 px row 1 is [brand … bell][account][Sign out]. At 320 px the five header controls may need the wrap fallback of DD14. The measured check records, for 320 and 375 px, each control's box, `elementFromPoint` at its center, a visible focus ring after Tab, no horizontal overflow and no overlap with the content below.
- No color, font or accent is added. "Unread" is text in a `BaseBadge`.

## Data Models

No schema change. The wire shape:

```text
Notification { id, kind, board_id, card_id, actor_id, actor_name, board_name, card_title, created_at, read_at }
E27 data { items: Notification[], page, per_page, total, unread_count }
E28 data Notification
```

## Error Handling

| Case | Outcome |
|---|---|
| E27 query invalid, repeated or unknown | 400 `VALIDATION_ERROR`, `fields.page` or `fields.per_page` for a known key, the standard message for an unknown one, before any read. |
| E27 or E28 without a valid token | 401 `AUTH_REQUIRED`. The Next handler clears the cookie. The UI goes to `/login`. |
| E28 path is not a UUID | 400 `VALIDATION_ERROR`. The Next handler answers it before the upstream call. |
| E28 for a missing, foreign or hidden notification | 404 `NOT_FOUND`, one envelope. The hook refetches. |
| A database error in a writer | Sanitized 500. No change and no notification stored. |
| Foreground E27 failure | `status: "error"` with Retry in the panel, rows kept. |
| Background E27 failure | Nothing shown. The next tick retries. |
| E28 failure (5xx, rate limit, transport) | The row stays Unread. A toast and a row message say so. The button works again. |
| Link-click E28 failure | Swallowed. Navigation already happened. |

## Testing Strategy

### Approach

Parameterized pytest, Vitest and React Testing Library, as in the earlier slices. Tests assert status, body, stored rows, rendered text, roles and the requests sent. Frontend timing tests use fake timers. The Playwright journey (V10) is delivered in T15.

### Test data isolation (Requirement 10.6)

Database-writing tests use the `board_tracker` fixture on the app built from `TEST_DATABASE_URL` through `db_guard`. Every user, board and card a test creates, directly or through the API, is tracked, and the tracker deletes the notifications of tracked boards and users at teardown, whether the test passes or fails. No `TRUNCATE`, no name pattern, never `DATABASE_URL`. `test_notifications_cleanup.py` creates tracked rows, fails on purpose after a notification is written and proves that exactly the tracked notifications were removed and an untracked sentinel notification survived.

### Backend test files (V08)

| File | Covers |
|---|---|
| `notification_helpers.py` | Helpers: assign through E17 or E18, comment through E24, `rows(app, recipient)` read in its own app context, `list_as` and `mark_as`. |
| `test_notifications_triggers.py` | E17 with another assignee (one row: recipient, actor, board, card, `assigned`), self-assignment, no assignee. E18 with a new assignee, the same assignee again, clearing, a title-only edit, reassignment (only the new one), unassigned → A → B → A by a third user (A twice, B once). E24 with a different author (one `commented`), the Assignee as author, an unassigned card, two comments (two rows), an edit and a delete (none). E12 (assignments cleared), E19 and E20 write none. `created_at` is set and follows commit order. |
| `test_notifications_atomicity.py` | Rollback in both directions for E17, E18 and E24: a failing commit after the notification is staged leaves no notification and no card or comment change; a failing `add_notification` leaves no card change, no comment and no event; a 400, 403 and 404 request writes no notification. `position_version` and `board_events` are unchanged by a notification. |
| `test_notifications_concurrency.py` | Two concurrent E18 requests that assign the same new user create one notification. A comment racing with a reassignment creates one `commented` row whose recipient is the assignee that the commit order shows. Two concurrent E28 requests for one row both return 200 and keep one `read_at`. |
| `test_notifications_list.py` | E27: newest first with the `id` tie-break (rows with one `created_at`), defaults, `per_page` 1 and 50, `total` and `unread_count` identical on every page and on an empty page, a page past the end (200, empty items, true counts), the largest `page` with `per_page=50`, an empty account, and a page boundary that neither repeats nor skips a row. Query validation: `page=0`, `-1`, `1.5`, `+1`, `01`, ` 1`, `1 `, `0x1`, `1e2`, `true`, an empty value, a value above 2,147,483,647, a 11-digit value, `per_page=0` and `51`, a repeated parameter, an unknown parameter (the standard message, no field), each 400 before any read. Display fields are current values after a rename of the actor, board and card. The response allowlist. |
| `test_notifications_read.py` | E28: first call sets `read_at` and returns the item, a repeat returns 200 with the original `read_at` and writes nothing, the item has the E27 shape, a non-UUID path is 400, a missing, foreign (another user, an admin of the board included) and hidden ID each return one identical 404, no request body is read (a malformed JSON body is ignored), no event and no lock. |
| `test_notifications_visibility.py` | A removed member (E12) loses the rows from the items, `total` and `unread_count`, and E28 returns 404. After E11 re-adds the member, the same rows return with their original `read_at`, read and Unread, and the counts match on every page. A soft-deleted board, column and card each hide the row from all three reads and from E28. Another user's rows and another board's rows are unaffected. |
| `test_notifications_privacy.py` | 401 on both routes for no, malformed, expired and revoked tokens (and nothing changes). `Cache-Control: private, no-store` on every response, success and error. Recipient isolation (a user never reads or marks another's row). No actor name, card title or notification content in the log output. |
| `test_notifications_cleanup.py` | Teardown isolation, including the sentinel row. |
| `test_factory.py` (extended) | Lists `notifications.list_notifications` and `notifications.mark_read_view`. |

### Frontend test files (Vitest and RTL)

| File | Covers |
|---|---|
| `lib/notifications.test.ts` | `parseNotification` and `parseNotificationPage` (accept, reject a missing or extra shape, copy only allowed fields), `notificationText` for each kind, `badgeText` (0, 1, 99, 100), `bellLabel` (exact count above 99), `pageCount`, the two paths. |
| `lib/apiClient.test.ts` (extended) | `GET /api/notifications?page=&per_page=` and `PATCH /api/notifications/<uuid>/read` are declared, no other `/api/notifications` pair, a non-UUID segment throws before `fetch`. |
| `hooks/useNotifications.test.tsx` | With fake timers: a request on mount, one Poll per 30 seconds, no second request while one is in flight (the tick is skipped), a tick skipped while an E28 is pending, a mark success that aborts a Poll in flight and sends one refresh (the old response is dropped and the count does not move back), a response for an earlier page dropped, the timer reset by a refresh, a background failure that keeps list and count and shows nothing, a foreground failure that sets the error state and keeps rows, 401 handled once and the timer stopped, abort and no state update after unmount, `open()` loading then page 1, `close()` back to page 1, a page that empties moves to the last page, `markRead` success (row read, count lowered then replaced by the refresh), 404 refetch, failure keeps Unread with a row notice and a toast, `quiet` failure with no toast, one E28 at a time. |
| `components/notifications/NotificationBell.test.tsx` | No badge before the first response and at 0, the count, `99+`, the accessible name with the exact count, opening the panel, close returns focus to the bell, a click on a row link of an Unread row sends E28 and navigates although E28 fails, a read row's link sends no request, the target size classes. |
| `components/notifications/NotificationPanel.test.tsx` | Loading, empty, error with Retry and rows kept, the sentence for each kind, the Unread text marker, markup in a title or name rendered as text, the link target, "Mark as read" with its accessible name and disabled and loading states, a row notice with `role="alert"`, paging controls and their disabled states and "Page n of m", no paging at one page, the live region text. |
| `components/shared/AppHeader.test.tsx` (extended) | The bell is in the header with the brand, the five controls (bell, Profile link, Boards, My tasks, Sign out) are all present, the header still wraps and truncates. |
| `app/api/notificationsRoutes.test.ts` | GET: a valid request forwards the query unchanged, a repeated and an unknown key reach Flask untouched, 401 clears the cookie, no token in the response, `private, no-store`. PATCH: a valid request forwards no body, 403 for a wrong Origin, 401 clears the cookie, 400 for a non-UUID path before any upstream call, Flask 404 passed through. |

### Browser checks (V08, V11)

`evidence/notifications-mobile-measure.mjs` (Chrome with device emulation, modeled on the T11 and T12 scripts) runs at 320, 375, 768 and 1280 px against the local app with seeded data: the header with no count, a count and `99+`; the panel loading, with Unread and read rows, empty, error and on the last page. It measures every control with `getBoundingClientRect` and `elementFromPoint`, tabs through the header and the panel for a visible focus ring, checks Escape and the focus return, and confirms no horizontal overflow. It runs the manual journey of Requirement 9.8 with a second user (assign, comment, wait for the poll, open, mark one read, follow another, reload) and records the real result and the browser type (emulator, not a real device).

## Correctness Properties

| # | Property | Requirement | Checked by |
|---|---|---|---|
| 1 | After any E17, E18 or E24 request, the notifications created equal the trigger rules applied to the stored before and after state, and no other row changes. | 1.1–1.5, 2.1–2.4 | `test_notifications_triggers.py` |
| 2 | A notification exists if and only if its triggering change committed. | 1.8, 2.6 | `test_notifications_atomicity.py` |
| 3 | Two concurrent assignments to one new assignee create one notification. | 1.2 | `test_notifications_concurrency.py` |
| 4 | Every E27 and E28 read of a notification passes the same visibility filter, so for every user `total` equals the number of rows E28 can return. | 3.3, 4.4, 5.4 | `_visibility`, `_list` |
| 5 | Removing and re-adding a member returns the same rows with the same `read_at`. | 5.5 | `_visibility` |
| 6 | For any data, pages 1 to n together contain each visible row once, newest first, and `total` and `unread_count` do not depend on the page. | 3.1, 3.3, 3.4 | `_list` |
| 7 | An accepted `page` and `per_page` never produce a database error. A rejected one never reaches the database. | 3.2, 3.6 | `_list` |
| 8 | E28 is idempotent: the first `read_at` is kept, and concurrent calls commit one value. | 4.2, 4.3 | `_read`, `_concurrency` |
| 9 | A foreign, missing and hidden notification give the same 404. | 4.4, 5.3 | `_read`, `_visibility` |
| 10 | E27 and E28 write nothing apart from `read_at`, take no board lock and change no `position_version` or event. | 3.8, 4.6, 2.7 | `_read`, `_atomicity` |
| 11 | The bell count never moves back to an older value after a mark, and no response for an earlier page or request overwrites the current state. | 8.5 | `useNotifications.test.tsx` |
| 12 | At most one E27 request is in flight, and none starts while an E28 is pending. | 8.2, 8.3 | `useNotifications.test.tsx` |
| 13 | Unmounting stops the timer and the request, and no later response changes state. | 8.4 | `useNotifications.test.tsx` |
| 14 | A link click navigates whether or not E28 succeeds. | 7.4 | `NotificationBell.test.tsx` |
| 15 | Every new control is at least 44 by 44 CSS px, and the header's five controls are reachable at 320 and 375 px. | 6.4, 9.3 | Browser check |

## Acceptance Criteria Map

| Requirement | API or UI | Task area | Verification |
|---|---|---|---|
| 1 Assignment | `cards/service.py`, `notifications/service.py` | Backend | `_triggers`, `_atomicity`, `_concurrency`; Properties 1–3 |
| 2 Comment | `comments/service.py` | Backend | `_triggers`, `_atomicity`; Properties 1, 2, 10 |
| 3 List (E27) | `notifications/routes.py`, `schema.py`, `service.py` | Backend | `_list`; Properties 4, 6, 7 |
| 4 Mark read (E28) | Same | Backend | `_read`, `_concurrency`; Properties 8–10 |
| 5 Visibility, privacy | `_visible`, `token_required`, headers | Backend | `_visibility`, `_privacy`; Properties 4, 5, 9 |
| 6 Bell | `NotificationBell`, `AppHeader` | Frontend | `NotificationBell.test.tsx`, `AppHeader.test.tsx`, browser check; Property 15 |
| 7 Panel | `NotificationPanel`, `NotificationRow` | Frontend | `NotificationPanel.test.tsx`, `NotificationBell.test.tsx`; Property 14 |
| 8 Polling | `useNotifications` | Frontend | `useNotifications.test.tsx`; Properties 11–13 |
| 9 Mobile, accessible | Bell, panel, header | Frontend and browser | Browser check at 320, 375, 768, 1280; Property 15 |
| 10 Handlers, allowlist, tests | `notifications` routes, `apiClient.ts`, tests | Both | `notificationsRoutes.test.ts`, `apiClient.test.ts`, backend files |

### Dependencies and gates

| Gate | Rule |
|---|---|
| A | Root T10 is verified. No gate blocks the start. |
| B | The backend triggers, E27 and E28 pass their checks before the frontend calls them. |
| C | The frontend, both full suites and `next build` pass before the mobile record is final. |
| D | Root T13 is checked only after the backend, frontend, measured mobile check and journey pass. Unverified work stays open with the actual reason. |

## Contract and Document Impact

| Clarification | Statement | Documents |
|---|---|---|
| C28 | Triggers: a new assignment (E17, E18) notifies the new assignee when they differ from the caller and from the previous assignee. A comment (E24) notifies the current assignee when they differ from the author. Nothing else notifies. The notification is written in the same transaction as the change, under the board lock, so a rolled-back change leaves none. | `docs/API.md` E17, E18, E24 and E27, `backend/specs/api-contract.md`, `specs/requirements.md` AC10.1 |
| C29 | One notification per qualifying event. No collapsing, no deduplication by card or user. | Same |
| C30 | Visibility: one filter (active board, column and card, and the recipient's active membership) applies to E27 items, `total`, `unread_count` and E28. Rows are kept, so a rejoining member sees them again with their original `read_at`. | `docs/API.md` E27 and E28, `backend/specs/data-model.md`, `specs/requirements.md` AC10.2 |
| C31 | E27: `page` 1 to 2,147,483,647 (default 1) and `per_page` 1 to 50 (default 20), each sent once, strict digits only. A repeated, unknown or invalid parameter is 400 before any read (`fields.page`, `fields.per_page` or the standard message). Order is `created_at` descending, then `id` descending. A page past the end is 200 with an empty list and the true counts. `total` and `unread_count` count all visible rows, whatever the page. | `docs/API.md` E27 and the query rule |
| C32 | E28: no request body. A conditional update scoped to a visible notification of the caller sets `read_at` once and returns 200 with the item in `data`. A repeat returns 200 with the original `read_at` and writes nothing. A missing, foreign or hidden ID returns one generic 404. No board lock. No mark-all, delete or unread endpoint in v1. | `docs/API.md` E28 |
| C33 | The Notification item gains `actor_name`, `board_name` and `card_title`, current values resolved on read for visible rows only. Every existing field stays. | `docs/API.md` data shapes |

Updated at design time: `docs/API.md` (E27, E28, the Notification shape and the clarification paragraph), `backend/specs/api-contract.md` (`notifications_bp` row), `specs/requirements.md` (AC10.1, AC10.2), `docs/TEST-PLAN.md` (V08 and V11), `guidelines/frontend.md` FE-S3, `evidence/spec-review.md` and `specs/CHANGELOG.md`. At implementation: `guidelines/frontend.md` FE-D2 (the bell), `frontend/specs/pages-and-components.md` and `api-integration.md`, `backend/specs/data-model.md` (the visibility note), `specs/traceability.md`, README, USER_GUIDE and the changelogs. `specs/design.md` D3, D5 and D6 already describe the behavior and need no change. Root `specs/tasks.md` links this spec at finalize.

## Review Items and Decisions

| ID | Item | Proposal | Reason |
|---|---|---|---|
| R1 | Strictness of `page` and `per_page` text | Digits only, no sign, no leading zero, at most 10 digits (DD4). | Matches the strict E21 and E22 rules, and `01` or `+1` cannot appear in two forms. |
| R2 | Items and counts in separate statements | Accept (DD5). A count may differ by one concurrent commit from the items. The next poll corrects it. | A window count returns nothing on an empty page, and a REPEATABLE READ transaction adds a mode for no visible gain. |
| R3 | Bell placement at 320 px | Brand block, with the existing `flex-wrap` as the fallback (DD14). The measured check decides. | Keeps the nav row and account block unchanged. If the header needs a third row at 320 px, that is allowed as long as every control keeps 44 px and nothing overlaps. |
| R4 | One E28 at a time | Disable the other "Mark as read" buttons while one runs (DD12). | One boolean makes the "skip the tick" and "no overlap" rules exact. |
| R5 | A removal between the E28 update and the select | Roll back and return 404 (DD6). | The user no longer has access, so the read mark must not persist or be reported. |
| R6 | Model relationships for `Notification` | None. Keep plain foreign keys and explicit joins. | The queries need only joins. The model comment about T13 is updated, and `test_models_metadata.py` stays as it is. |
| R7 | Timer restarted by every request | Yes (DD9). | One timer, no overlap, and a manual refresh resets the clock. |
| R8 | The shared invalid-ID message | Change "The board ID is not valid." to "The ID is not valid." in `privateRoute.ts`. | The text is shown for a notification ID too. No test asserts the old wording. |

## Risks

| Risk | Mitigation |
|---|---|
| The count query scans all of a user's visible rows on every poll (30 seconds). | Acceptable for the coursework scale. Both indexes exist. `ponytail:` if a user has very many rows, keep a denormalized unread counter or cap the count. |
| A user can create many notifications for an assignee by commenting repeatedly. | Out of scope. Tracked with the other abuse limits in T16. |
| The 320 px header is full. | DD14 fallback and the measured check. The decision is recorded in the evidence. |
| A poll in flight when a mark completes. | DD10: the response is dropped and one refresh runs. Tested. |
| Concurrent writers create notifications for a recipient that loses access in between. | The board lock serializes writers with member removal. A later removal hides the row by the visibility filter. |
