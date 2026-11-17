# Design Document: analytics (T14)

## Overview

This design implements the board analytics read (E29), the analytics panel on the board page and their tests (root T14). It follows `requirements.md` (Requirements 1 to 8, decisions A1–A10 approved on 2026-11-14 with clarifications) and the shared design D3, D5 and D6. Backend: Flask, SQLAlchemy, Marshmallow and pytest. Frontend: Next.js App Router, React, TypeScript, Tailwind, daisyUI, Vitest and React Testing Library. No table, migration, index or dependency is added.

E29 is one read-only request that returns three aggregates for one board: the active cards per active column, the distinct cards that entered Done in the current UTC week, and the counted board events per actor in that week. The panel reads it from the browser through a same-origin handler, independent of the Kanban state, so an analytics failure never disturbs the board.

### Verified facts about the existing code

| Fact | Where | Consequence |
|---|---|---|
| `board_events` has `board_id`, `actor_id`, nullable `card_id`, `kind` (checked against the five kinds) and `occurred_at`. The index `ix_board_events_board_occurred (board_id, occurred_at)` exists. `record_event` stages a row with `occurred_at = utcnow()` in the caller's transaction. | `backend/app/models/board_event.py`, `positions.py` | No migration or index. Both event aggregates are a range scan on the existing index. |
| `entered_done` is written beside `card_created` (a card created in a Done column) and beside `card_moved` (a move from a non-Done column into Done). `comment_created` is written by E24 and `column_reordered` by E16. No event is written for a card or column delete, an edit or an assignment. | `cards/service.py` lines 151–153 and 259–261, `comments/service.py`, `columns/service.py` | One user action that completes a card writes two rows. A1 counts one of them, so the activity query filters on four kinds and `completed_cards` filters on `entered_done`. |
| `authorize_board(board_id, user_id)` is one statement: it returns the role or raises `NotFoundError` (404) for a missing, deleted, nonmember or removed-member case. `lock=True` is only for writes. | `boards/service.py` | E29 calls it without the lock. |
| `load_query_args(schema)` raises 400 for any repeated or unknown key before a database read. With a schema that has no fields, every key is unknown. | `app/validation.py` | `AnalyticsQuerySchema` is an empty schema. Any parameter is a 400 with the standard message and no field entry. |
| `UtcDateTime` serializes with `isoformat()`, which ends in `+00:00`, not `Z`. | `app/validation.py` | A2 needs `Z`. The service formats the two timestamps itself (DD2). |
| `register_response_headers` adds `Cache-Control: private, no-store` to every `/api/` response except health. | `response_headers.py` | E29 gets the header on every response by default. A test proves it. |
| `utcnow()` is `datetime.now(UTC)` in `app/models/base.py`. Services import it by name. | `models/base.py` | The analytics service imports `utcnow` by name, so tests replace `app.blueprints.analytics.service.utcnow` with a fixed clock (DD2). |
| Blueprints are registered in `create_app` one by one, `tests/test_factory.py` lists the routes, and the `analytics` package does not exist. | `app/__init__.py`, `tests/test_factory.py` | One new package, one import and registration, and the route list gains one entry. |
| `BoardTracker.cleanup` deletes the `board_events` of tracked boards, cards and actors, then the other tracked rows, in foreign-key order. An untracked sentinel survives. | `tests/boards_helpers.py` | Analytics tests that insert events directly use tracked boards, cards and users. No new cleanup code. |
| `handlePrivateRead(request, {route, params, forwardQuery})` exists and returns `private, no-store`, clears the cookie on 401 and passes the upstream status. `FLASK_PATHS` lists the routes, and `apiGet(path, signal)` accepts only a path in `DECLARED_GETS`. | `frontend/lib/server/privateRoute.ts`, `flask.ts`, `lib/apiClient.ts` | The handler is one call. One route key and one GET pattern are added. |
| `useKanbanBoard` returns `version` (the `position_version`) and the board shell already holds the hook. Creates, moves and deletes call `replaceBoard(columns, version)`. A refetch after a conflict or a member removal also sets it. | `hooks/useKanbanBoard.ts`, `BoardShell.tsx` | The panel gets `version` as a prop and reads again only when it rises (DD9). |
| `useCardSearch` is the model for a hook with an `AbortController`, a sequence guard and an `onAccessLost` callback. `CardSearch` uses `aria-live="polite"` on a plain element because the board already has one `role="status"` region. `KanbanBoard` handles `onAccessLost` with `notifyError(BOARD_ACCESS_MESSAGE)` and `router.push("/")`. | `hooks/useCardSearch.ts`, `components/kanban/CardSearch.tsx`, `KanbanBoard.tsx` | The analytics hook and panel follow them. |
| `BoardShell` renders `BoardHeader`, the rename form, `KanbanBoard` and the delete dialog in one column (`flex flex-col gap-4 sm:gap-6`). | `components/boards/BoardShell.tsx` | The panel is one more child of that column (DD10). |

## Architecture

```text
Flask
  GET /api/boards/<id>/analytics  (analytics_bp)
    token_required ─ parse_uuid (400) ─ load_query_args(empty) (400) ─ authorize_board (404, no lock)
    service.board_analytics:  week_bounds(utcnow())
       1. columns LEFT JOIN active cards   ─▶ cards_per_column
       2. count(DISTINCT card_id) of entered_done in [start, end)  ─▶ completed_cards
       3. counted events GROUP BY actor JOIN users ─▶ member_activity
Browser
  BoardShell ─ useKanbanBoard (version)
     └─ AnalyticsPanel (client, own state, no Kanban gate)
          useBoardAnalytics ─ apiGet /api/boards/<id>/analytics ─▶ Next GET handler ─▶ Flask E29
          AnalyticsFigures (props only): week line, completed figure, two lists
```

The token stays in the HttpOnly cookie. Flask re-validates every request and stays authoritative. There is no new server page and the board page does not read E29 on the server, so E29 cannot make the page fail (A8).

### Key design decisions

| ID | Decision | Rationale |
|---|---|---|
| DD1 | A new `analytics` blueprint with `__init__.py`, `routes.py`, `schema.py` and `service.py` (BE01) and one route, `GET /api/boards/<board_id>/analytics`, view `board_analytics_view`. `create_app` registers `analytics_bp`. | BE01 lists `analytics` among the eight Blueprints. One feature, one package. |
| DD2 | The Week comes from `week_bounds(now)`. It converts `now` to UTC, takes midnight of that date, subtracts `weekday()` days (Monday is 0) and adds 7 days for the end. The service calls `week_bounds(utcnow())`, with `utcnow` imported by name. `week_start` and `week_end` are formatted with `strftime("%Y-%m-%dT%H:%M:%SZ")`, not `UtcDateTime`. Both bounds go into the SQL as aware datetimes: `occurred_at >= start AND occurred_at < end`. | A2 and Requirements 4.1–4.5. A UTC computation in Python does not depend on the database session time zone. One clock call per request keeps the three figures on one Week. Tests replace `utcnow` with a fixed clock, with no new abstraction. `UtcDateTime` would emit `+00:00` and break the contract. |
| DD3 | Three separate statements, run in one request on the same session: (1) the column counts, (2) the distinct completions, (3) the activity. Each filters by `board_id` itself. None joins another's table. | Requirement 3.6 and D6. Joining cards to events would multiply rows. Three small grouped queries cannot inflate each other. |
| DD4 | Statement 1: `select(BoardColumn.id, BoardColumn.name, func.count(Card.id))` with `outerjoin(Card, and_(Card.column_id == BoardColumn.id, Card.deleted_at.is_(None)))`, filtered by `BoardColumn.board_id` and `BoardColumn.deleted_at IS NULL`, grouped by the column ID, name and order, ordered by `(BoardColumn.order, BoardColumn.id)`. The active-card test is in the join condition. | Requirement 1. A filter in the `WHERE` clause would drop an empty column and make the left join pointless. Counting `Card.id` (not `*`) gives 0 for an empty column. |
| DD5 | Statement 2: `select(func.count(func.distinct(BoardEvent.card_id)))` where `board_id` matches, `kind == "entered_done"` and the window holds. No join to `cards`. | Requirement 2. The history is the source, so a card deleted or moved out later still counts (A3). `count(DISTINCT)` counts a repeated card once and ignores a null `card_id`. |
| DD6 | Statement 3: `select(User.id, User.name, func.count(BoardEvent.id).label("n"))` joined on `User.id == BoardEvent.actor_id`, where `board_id` matches, `kind IN COUNTED_KINDS` and the window holds, grouped by `User.id` and `User.name`, ordered by `n` descending, `func.lower(User.name)`, then `User.id`. `COUNTED_KINDS = ("card_created", "card_moved", "column_reordered", "comment_created")` is one constant. The query does not join `board_members`. | Requirement 3 and A1, A4. Only users with at least one row appear, so zero-activity members are omitted. Not joining memberships keeps a removed member's work. The name is the user's current name. One constant is the single place that says `entered_done` is not activity. |
| DD7 | E29 is read-only: `authorize_board` without `lock=True`, no `commit`, no event and no notification. The three statements are reads, and the request teardown removes the session. | A6 and Requirement 5.4. A read must not wait for a board writer. |
| DD8 | The route order is `token_required`, then `parse_uuid` (a malformed ID raises `RequestValidationError`), then `load_query_args(AnalyticsQuerySchema())`, then the service, which calls `authorize_board` first. A query is never examined before the ID, and no database read happens before both 400 checks. | A5 and Requirement 5.1. The same order as E22, without a body. |
| DD9 | `useBoardAnalytics({ boardId, version, onAccessLost })` runs one read at a time. It reads on mount and when `boardId` changes, when `version` is greater than `startedVersionRef` (the version current when the last read started), and on `refresh()`. Starting a read sets `startedVersionRef` to the current `version`. A new read aborts the earlier one. | A8 and Requirements 6.4–6.6. Comparing against the version of the last read means an unchanged, rolled-back or equal version never starts a read, while a rise always does, even if a read was in flight. |
| DD10 | `AnalyticsPanel` is rendered by `BoardShell` after `KanbanBoard`. It is a single `.surface` panel below the columns. The Kanban region keeps the board's full width and its own horizontal scroll. | The columns stay the memorable thing on the screen (FE-D8). A panel above them would push every column down by its height at every width. FE-D4 puts secondary work in a side column from 1024 px, but the board page gives the full width to the columns, so the panel stacks below them. |
| DD11 | Errors stay in the panel. The hook never throws. A parse failure counts as a service error. A 404 calls `onAccessLost`. A 401 calls `handleError` (the login redirect). A 400, a 5xx and a transport error set `error` and keep the last figures. No toast is raised for these. | Requirement 6.8 and the user's check that an E29 failure leaves the board usable. The board's own regions never depend on E29. |
| DD12 | `AnalyticsFigures` is a props-only, server-compatible component. `AnalyticsPanel` owns the hook, the heading, the Refresh button, the live region and the states. | FE-C2: one responsibility each, so the figures render in a test without a hook. |

## Components and Interfaces

### Backend layout

```text
backend/app/blueprints/analytics/
  __init__.py   analytics_bp and the routes import
  routes.py     board_analytics_view
  schema.py     AnalyticsQuerySchema, ColumnCountSchema, ActivityCountSchema, AnalyticsSchema
  service.py    COUNTED_KINDS, week_bounds, board_analytics
backend/app/__init__.py         register analytics_bp
backend/tests/test_factory.py   lists analytics.board_analytics_view
```

### Route

```python
@analytics_bp.get("/api/boards/<board_id>/analytics")
@token_required
def board_analytics_view(board_id: str):
    board_uuid = parse_uuid(board_id)
    if board_uuid is None:
        raise RequestValidationError()
    load_query_args(AnalyticsQuerySchema())
    return jsonify(data=AnalyticsSchema().dump(service.board_analytics(board_uuid, g.current_user.id)))
```

### Check order

1. `token_required`: 401 `AUTH_REQUIRED` for no, malformed, expired or revoked token.
2. `parse_uuid`: 400 `VALIDATION_ERROR` for a malformed ID.
3. `load_query_args`: 400 `VALIDATION_ERROR` with the standard message and no `fields` for any query key.
4. `authorize_board`: 404 `NOT_FOUND` for a missing, deleted, nonmember or removed-member case.
5. The three reads, then the 200 response.

A request that fails steps 2 and 4 returns the step 2 error. A nonmember with a query parameter gets the 400, not the 404 (A5).

### Service sketch

```python
COUNTED_KINDS = ("card_created", "card_moved", "column_reordered", "comment_created")

def week_bounds(now: datetime) -> tuple[datetime, datetime]:
    """Monday 00:00 UTC of the week that holds `now`, and the next Monday (exclusive)."""
    now = now.astimezone(UTC)
    start = datetime(now.year, now.month, now.day, tzinfo=UTC) - timedelta(days=now.weekday())
    return start, start + timedelta(days=7)

def board_analytics(board_id, user_id) -> dict:
    authorize_board(board_id, user_id)                       # 404, no lock
    start, end = week_bounds(utcnow())
    in_week = and_(BoardEvent.board_id == board_id,
                   BoardEvent.occurred_at >= start, BoardEvent.occurred_at < end)
    columns = db.session.execute(
        select(BoardColumn.id, BoardColumn.name, func.count(Card.id))
        .outerjoin(Card, and_(Card.column_id == BoardColumn.id, Card.deleted_at.is_(None)))
        .where(BoardColumn.board_id == board_id, BoardColumn.deleted_at.is_(None))
        .group_by(BoardColumn.id, BoardColumn.name, BoardColumn.order)
        .order_by(BoardColumn.order, BoardColumn.id)).all()
    completed = db.session.execute(
        select(func.count(func.distinct(BoardEvent.card_id)))
        .where(in_week, BoardEvent.kind == "entered_done")).scalar_one()
    activity = db.session.execute(
        select(User.id, User.name, func.count(BoardEvent.id).label("n"))
        .join(User, User.id == BoardEvent.actor_id)
        .where(in_week, BoardEvent.kind.in_(COUNTED_KINDS))
        .group_by(User.id, User.name)
        .order_by(desc("n"), func.lower(User.name), User.id)).all()
    return {"week_start": _iso_z(start), "week_end": _iso_z(end),
            "cards_per_column": [...], "completed_cards": completed, "member_activity": [...]}
```

The sketch is a plan, not final code. `ponytail:` the activity query filters `kind` after the `(board_id, occurred_at)` range scan. Add `kind` to the index only if a board's weekly events make the scan measurable.

### Schemas

`AnalyticsQuerySchema` is an empty `Schema`. The response schemas are dump-only allowlists: `ColumnCountSchema` (`column_id` UUID, `name` String, `count` Integer), `ActivityCountSchema` (`user_id` UUID, `name` String, `count` Integer) and `AnalyticsSchema` (`week_start` String, `week_end` String, `cards_per_column` nested many, `completed_cards` Integer, `member_activity` nested many). No event ID, card ID, comment text or email can appear.

### Next handler and client allowlist

- `frontend/lib/server/flask.ts`: add the route key `boardAnalytics: "/api/boards/:boardId/analytics"` to `FLASK_PATHS`.
- `frontend/app/api/boards/[id]/analytics/route.ts`: `GET` that calls `handlePrivateRead(request, { route: "boardAnalytics", params: { boardId: id }, forwardQuery: true })`. The query string is forwarded unchanged, so Flask returns the 400 for any parameter and the handler never reads it.
- `frontend/lib/apiClient.ts`: add `new RegExp(`^/api/boards/${UUID}/analytics$`)` to `DECLARED_GETS`. The pattern has no query part, so a browser read with a query string throws before `fetch`.

### Frontend layout

```text
frontend/lib/analytics.ts                       types use, analyticsPath, parseAnalytics, formatWeekRange, barPercent
frontend/lib/types.ts                           BoardAnalytics, ColumnCount, ActivityCount
frontend/hooks/useBoardAnalytics.ts             the hook (client)
frontend/components/analytics/AnalyticsPanel.tsx    client: hook, heading, Refresh, live region, states
frontend/components/analytics/AnalyticsFigures.tsx  props only: week line, completed figure, two lists
frontend/components/boards/BoardShell.tsx       renders AnalyticsPanel after KanbanBoard
frontend/app/api/boards/[id]/analytics/route.ts GET handler
```

### `lib/analytics.ts`

- `analyticsPath(boardId)` returns `/api/boards/${boardId}/analytics`.
- `parseAnalytics(value)` copies only the five documented keys and throws `malformedApiError()` for any other shape: a non-object, a missing key, `week_start` or `week_end` that is not a string ending in `Z`, a list item without the exact fields, or a count that is not a non-negative safe integer. Extra keys are ignored, not copied.
- `formatWeekRange(weekStart, weekEnd)` returns text such as `Week of 9 Nov, 07:00 to 16 Nov, 07:00 (local time)`. It parses both timestamps, uses the local fields of the viewer's time zone and a fixed month list (no locale), and shows `week_end` as is, because the end is exclusive and the time is part of the text. The server Week stays the UTC week (A2). Tests fix the zone with `TZ=Asia/Jakarta` in `vitest.config.mts`.
- `barPercent(count, max)` returns a whole percent from 0 to 100 (0 when `max` is 0). It is used only for a decorative bar.

### `useBoardAnalytics`

```ts
useBoardAnalytics({ boardId, version, onAccessLost }) → { data, status, busy, error, refresh }
// status: "loading" (no figures yet), "ready" (figures held). busy: a read is in flight.
// error: a message while the last read failed, else null.
```

- State: `data` (the parsed result or null), `busy`, `error`. `status` is `"loading"` while `data` is null and no error, so the first read shows the loading state, and a later read shows the last figures with `busy` true (Requirement 6.7).
- One `AbortController` and one sequence number per read. A response applies only when its sequence is the latest and its signal is not aborted. A new read, a board change and unmount each abort the earlier request, so a late response never changes state (Requirement 6.6).
- Effects: one effect keyed on `boardId` resets `data` and `error`, sets `startedVersionRef` and starts a read, with the abort on cleanup. A second effect keyed on `version` starts a read only when `version > startedVersionRef.current`.
- The read calls `apiGet(analyticsPath(boardId), signal)` and `parseAnalytics`. A 404 (`isBoardAccessError`) calls `onAccessLost`. `AUTH_REQUIRED` calls `handleError`. Anything else, an abort excepted, sets `error` to "Analytics could not be loaded." and keeps `data`.
- The hook reads no Kanban gate and holds no Kanban state. It takes `version` as a number.
- Callbacks (`onAccessLost`, `handleError`) are held in a ref, as `useCardSearch` does.

### `AnalyticsPanel` and `AnalyticsFigures`

```text
Analytics                                              [Refresh]
Week of 9 Nov, 07:00 to 16 Nov, 07:00 (local time)
Cards completed this week      4

Cards per column                    Activity this week
──────────────────                  ──────────────────
To do               3  ▬▬▬▬▬        Ana Lee            9
In progress         2  ▬▬▬          Ben Ortiz          5
Done                4  ▬▬▬▬▬▬       Sam Taylor         1
```

- `AnalyticsPanel`: a `<section aria-labelledby>` with `.surface p-4 sm:p-5` and `aria-busy` while a read is in flight. Header row: the `h2` "Analytics" (`text-lg font-semibold`) and the Refresh `BaseButton` (secondary, 44 px). Under it: the loading text "Loading analytics…" while there is no figure, the error block (`role="alert"` text plus a Retry `BaseButton`) when `error` is set, and `AnalyticsFigures` when figures are held. A plain `<p aria-live="polite" aria-atomic="true" className="sr-only">` carries "Loading analytics…", "Analytics refreshed." and the error text. It does not use `role="status"` (the board has one).
- `AnalyticsFigures`: the week line (`text-sm text-base-content/70`), the completed figure (a label and a `tabular-nums` number), and from 768 px two columns (`md:grid-cols-2`) with `h3` headings "Cards per column" and "Activity this week" (`text-base font-semibold`). Each is a `<ul className="divide-y divide-base-300">` of rows with the name (`min-w-0 break-words`) and the count (`tabular-nums`). The column rows add a decorative bar: a `bg-base-200` track and a `bg-primary` fill whose width is `barPercent(count, maxCount)`, both `aria-hidden`. Empty states: "No columns yet." and "No activity this week." The completed figure shows `0` when nothing was completed. No panel is nested in the panel: the lists are divided rows (FE-D3).
- Names render as text nodes only (Requirement 6.9). No color, font or dependency is added (FE-D1).

### `BoardShell`

`BoardShell` renders `<AnalyticsPanel boardId={board.id} version={kanban.version} onAccessLost={handleAccessLost} />` after `KanbanBoard`. `handleAccessLost` calls `notifyError(BOARD_ACCESS_MESSAGE)` and `router.push("/")`, the same outcome as the search. The panel is shown to every participant, so it does not use `boardControls`.

### Mobile design (Requirement 7, FE-S4 to FE-S6, FE-D9)

- Base classes are for 320 px and up: the panel is one column, the header row wraps (`flex flex-wrap items-center justify-between gap-2`), names wrap (`min-w-0 break-words`), numbers do not shrink (`shrink-0 tabular-nums`). The two lists sit side by side only from `md:`.
- Refresh and Retry use `BaseButton`, whose box is at least 44 px (`min-h-11`). They keep the visible focus ring.
- The Kanban region keeps its own `overflow-x-auto`. The panel adds no `overflow-x` and no fixed width, so it cannot widen the page.
- The measured check records, at 320, 375, 768 and 1280 px, the panel in its states (loading, figures, empty board, error), the box of each control, `elementFromPoint` at its center, a visible focus ring after Tab, and `scrollWidth <= clientWidth` for the page.

## Data Models

No schema change. The wire shape:

```text
E29 data { week_start, week_end, cards_per_column: Column_Count[], completed_cards, member_activity: Activity_Count[] }
Column_Count   { column_id, name, count }
Activity_Count { user_id, name, count }
BoardAnalytics (TypeScript) mirrors it, with `completed_cards` and the counts as numbers
```

## Error Handling

| Case | Outcome |
|---|---|
| No, malformed, expired or revoked token | 401 `AUTH_REQUIRED`. The Next handler clears the cookie. The hook calls `handleError`, which goes to `/login`. |
| Board ID is not a UUID | 400 `VALIDATION_ERROR`. The Next handler answers it before the upstream call ("The ID is not valid."). |
| Any query parameter | 400 `VALIDATION_ERROR`, the standard message, no `fields`, before any read. |
| Missing, deleted, nonmember or removed-member board | 404 `NOT_FOUND`, one envelope. The hook calls `onAccessLost`: the board toast and a redirect to the dashboard. |
| A database error during the reads | The Flask handler returns the sanitized 500 and no partial result. The panel shows its error and Retry and keeps the last figures. |
| A response that fails `parseAnalytics` | Treated as a service error: the panel error and Retry, last figures kept. |
| A transport failure or a 5xx | The panel error and Retry, last figures kept. The board stays usable. |

## Testing Strategy

### Approach

Parameterized pytest, Vitest and React Testing Library, as in the earlier slices. Tests assert status, body, stored rows, rendered text, roles and the requests sent. Frontend timing tests use fake timers and deferred requests. The Playwright journey (V10) is delivered in T15.

### Test data isolation (Requirement 8.6)

Database-writing tests use the `board_tracker` fixture on the app built from `TEST_DATABASE_URL` through `db_guard`. Every user, board, column and card a test creates, directly or through the API, is tracked, and events inserted by a helper use only tracked board, card and user IDs, so the tracker deletes them at teardown, whether the test passes or fails. No `TRUNCATE`, no name pattern, never `DATABASE_URL`. `test_analytics_cleanup.py` creates tracked rows and events, fails on purpose after the events exist, and proves that exactly the tracked rows were removed and an untracked sentinel board with an event survived.

### Backend test files (V08)

| File | Covers |
|---|---|
| `analytics_helpers.py` | `seed_events(app, board_id, rows)` inserts `BoardEvent` rows with a chosen `occurred_at`. `freeze(monkeypatch, iso)` replaces `app.blueprints.analytics.service.utcnow`. `get_analytics` calls E29. Readers open their own app context. |
| `test_analytics_access.py` | 200 for an admin and for a member. 401 for no, malformed, expired and revoked tokens. 404 for a nonmember, a removed member, a missing and a soft-deleted board, one identical envelope. 400 for a malformed ID. 400 for any query parameter (`?week=1`, `?x`, a repeat, `?board_id=<id>`), the standard message and no `fields`. The check order: a malformed ID beats a missing board, and a query parameter beats a 404 for a nonmember. `Cache-Control: private, no-store` on every response, success and error. Only the five documented keys and the documented item fields appear (no email, no event or card ID). |
| `test_analytics_columns.py` | `cards_per_column` for an empty column (count 0), several cards, the Done column listed, board order with an `id` tie-break, a soft-deleted card not counted, a soft-deleted column not listed with its cards, a card moved between columns, cards of another board not counted, and zero columns (an empty list with the other figures still returned). |
| `test_analytics_completed.py` | `completed_cards` counts a card created in Done, a card moved into Done, and the same card entering Done twice in the week once (move out and in, through E20 and by direct events). It keeps a card that was soft-deleted, moved out of Done or in a column soft-deleted after completing. A move within Done, an edit, an assignment and a comment add nothing. Events of another board and of an earlier or later week do not count. 0 for an empty week. |
| `test_analytics_activity.py` | Each of the four counted kinds counts once, and `entered_done` does not count. Creating a card in Done adds 1 and moving a card into Done adds 1. A removed member (E12) who acted in the week still appears, an active member with no events does not, the current name shows after a profile rename, and the order is count descending, lower-cased name, then user ID (ties built with equal counts and names that differ by case). An empty week returns an empty list. |
| `test_analytics_week.py` | With a fixed clock: an event at `week_start` is inside, one microsecond before it is in the earlier week, one at `week_end` is outside and one a microsecond before it is inside. A request at Sunday 23:59:59 and at the next Monday 00:00:00 returns different windows and the new week starts at 0. A year boundary week and a leap day. The two timestamps end in `Z` and `week_end` is `week_start` plus seven days. A request with a non-UTC `now` still uses the UTC week. `week_bounds` is also tested alone for every weekday. |
| `test_analytics_aggregation.py` | A board with many columns, many cards and many events: each of the three figures is exact and no figure is a product of two tables (for example 5 columns of 6 cards with 40 events each give 30 cards, the real event counts and the real completed number). A real flow through the writers: E13 and E17 (create in Done), E20 (moves), E16 (reorder) and E24 (comments) by two users, then E29 matches the rows written. |
| `test_analytics_readonly.py` | E29 writes no row (events, notifications and other counts unchanged), records no event, changes no `position_version`, and does not wait for a board lock (a second transaction that holds the board row lock does not block it). A failing read returns the sanitized 500 with no partial result. |
| `test_analytics_cleanup.py` | Teardown isolation, including the sentinel board and its event. |
| `test_factory.py` (extended) | Lists `analytics.board_analytics_view`. |

### Frontend test files (Vitest and RTL)

| File | Covers |
|---|---|
| `lib/analytics.test.ts` | `parseAnalytics` accepts a valid result and the empty one, copies only the documented fields and rejects a non-object, a missing key, a `week_start` without `Z`, a count that is negative, fractional, a string or beyond the safe integer range, and an item with a missing field. `formatWeekRange` for a week inside a month, across a month and across a year (using the exclusive end). `barPercent` for 0, `max` 0, the maximum and a fraction. `analyticsPath`. |
| `lib/apiClient.test.ts` (extended) | `GET /api/boards/<uuid>/analytics` is declared, the same path with a query string is not, a non-UUID segment throws before `fetch`. |
| `lib/server/flask.test.ts` (extended) | The `boardAnalytics` route key fills `:boardId` with a UUID only. |
| `app/api/analyticsRoute.test.ts` | A valid request forwards to the E29 path with the bearer token and `private, no-store`. A query string reaches Flask unchanged and the Flask 400 is passed through. A non-UUID ID is 400 before any upstream call. 401 clears the cookie. A missing cookie is 401. No token in the response. A Flask 404 is passed through. |
| `hooks/useBoardAnalytics.test.tsx` | With deferred requests: a read on mount. A rise in `version` starts one read, an equal or lower `version` starts none, and a rise while a read is in flight aborts it and starts one. Refresh starts a read. An earlier slow response cannot overwrite a later one. A board change aborts, drops the figures and ignores the earlier board's response. Unmount aborts and no state changes later. A 404 calls `onAccessLost`. A 401 calls `handleError`. A 5xx, a 400, a transport error and a malformed body set the error and keep the last figures. While busy the held figures stay. |
| `components/analytics/AnalyticsFigures.test.tsx` | The week line, the completed figure (including 0), the column rows in order with their counts, the activity rows in order, "No columns yet." and "No activity this week.", an empty board with zeros, names rendered as text (markup in a name is not HTML), the wrap classes (`min-w-0`, `break-words`) and `tabular-nums`, and that a bar is `aria-hidden` while its number is text. |
| `components/analytics/AnalyticsPanel.test.tsx` | Loading, figures, an empty board, error with Retry (a Retry press reads again), a busy refresh that keeps the figures and sets `aria-busy`, the Refresh button's name and its 44 px class, the live region text, a 404 outcome and a 401 outcome. |
| `components/boards/BoardShell.test.tsx` (extended) | The panel is shown to an admin and to a member, it receives the Kanban `version`, and a card create, move and delete that raises the version triggers one more E29 read. With E29 failing at mount and on a later read, the board is usable: a card still moves and is added, the search still works, the Kanban status stays idle, and no error boundary or board-level error appears. A 404 from E29 shows the access toast and redirects. |

### Browser checks (V08, V11)

`evidence/analytics-mobile-measure.mjs` (Chrome with device emulation, modeled on the T11 to T13 scripts) runs at 320, 375, 768 and 1280 px against the local app with seeded data: the board page with the panel loading, with figures, on an empty board (no columns, and columns with no activity) and with E29 failing (the error and Retry, the board still usable). It measures each control with `getBoundingClientRect` and `elementFromPoint`, tabs through the panel for a visible focus ring, and confirms no horizontal page overflow outside the Kanban region. It runs the manual journey of Requirement 7.5: open a board, see the figures, complete and move a card, see the counts change without a reload, press Refresh. `evidence/analytics-timing.mjs` records 30 sequential E29 requests on a 100-card board with a week of events, with the conditions and the raw timings (A10). Both are measurements, not new pass-or-fail gates. The browser is an emulator, not a real device, and the record says so.

## Correctness Properties

| # | Property | Requirement | Checked by |
|---|---|---|---|
| 1 | `cards_per_column` has exactly one row per active column of the board, in `(order, id)` order, and each count equals the number of active cards in that column, 0 for an empty one. | 1.1–1.6 | `_columns`, `_aggregation` |
| 2 | `completed_cards` equals the number of distinct `card_id` values with an `entered_done` event on the board inside the Week, whatever happened to the card later. | 2.1–2.6 | `_completed` |
| 3 | `member_activity` has one row per actor with at least one counted event inside the Week, the count equals that actor's counted events, `entered_done` is never counted, and the order is count descending, lower-cased name, user ID. | 3.1–3.5 | `_activity` |
| 4 | No figure depends on another table's row count: adding cards, columns or events of other kinds never changes an unrelated figure. | 3.6, 1.5 | `_aggregation` |
| 5 | An instant belongs to exactly one Week: `week_start` is inside, `week_end` is outside, the window is seven days and starts on a Monday at 00:00:00 UTC. | 4.1–4.4 | `_week` |
| 6 | The Week comes only from the UTC server clock, with no caller input. | 4.3, 4.5 | `_week` |
| 7 | Every 401, 400 and 404 case returns before any aggregate runs, in the order token, ID, query, access, and one 404 envelope covers every inaccessible case. | 5.1–5.3 | `_access` |
| 8 | E29 writes nothing, takes no board lock and changes no `position_version` or event. | 5.4 | `_readonly` |
| 9 | Every E29 response, success or error, is `private, no-store` and carries only the documented keys. | 5.5, 5.7 | `_access` |
| 10 | A read for an earlier request or board never changes the panel state, and unmount stops the request. | 6.6, 8.5 | `useBoardAnalytics.test.tsx` |
| 11 | The panel reads again only when the Kanban `position_version` rises, or on Refresh or board change. | 6.4, 6.5 | `useBoardAnalytics.test.tsx`, `BoardShell.test.tsx` |
| 12 | A failed or malformed E29 never stops a card move, an add or the search, and never raises an error boundary. | 6.8, 8.5 | `BoardShell.test.tsx`, browser check |
| 13 | Every number in the panel is present as text, and a bar is decorative. | 6.2, 7.4 | `AnalyticsFigures.test.tsx` |
| 14 | Refresh and Retry are at least 44 by 44 CSS px and the page does not scroll horizontally from 320 px. | 7.1, 7.2 | Browser check |

## Acceptance Criteria Map

| Requirement | API or UI | Task area | Verification |
|---|---|---|---|
| 1 Cards per column | `analytics/service.py` (DD4) | Backend | `_columns`, `_aggregation`; Properties 1, 4 |
| 2 Completed this week | `analytics/service.py` (DD5) | Backend | `_completed`; Property 2 |
| 3 Activity by member | `analytics/service.py` (DD6) | Backend | `_activity`, `_aggregation`; Properties 3, 4 |
| 4 Week window | `week_bounds`, `_iso_z` (DD2) | Backend | `_week`; Properties 5, 6 |
| 5 Access, read safety | `analytics/routes.py`, `schema.py` (DD7, DD8) | Backend | `_access`, `_readonly`; Properties 7–9 |
| 6 Panel | `AnalyticsPanel`, `AnalyticsFigures`, `useBoardAnalytics` | Frontend | Panel, figures, hook and `BoardShell` tests; Properties 10–13 |
| 7 Mobile, accessible | The panel in `BoardShell` | Frontend and browser | Browser check at 320, 375, 768, 1280; Properties 13, 14 |
| 8 Handler, parsers, tests | `analytics` route handler, `apiClient.ts`, `lib/analytics.ts`, tests | Both | `analyticsRoute.test.ts`, `apiClient.test.ts`, `analytics.test.ts`, backend files, timing record |

### Dependencies and gates

| Gate | Rule |
|---|---|
| A | Root T08 and T10 are verified. No gate blocks the start. |
| B | The backend checks for E29 (access, aggregates, week, read-only) pass before the frontend calls E29. |
| C | The frontend, both full suites and `next build` pass before the mobile record is final. |
| D | Root T14 is checked only after the backend, frontend, measured mobile check, journey and documentation pass. Unverified work stays open with the actual reason. |

## Contract and Document Impact

| Clarification | Statement | Documents |
|---|---|---|
| C34 | The Week is the UTC calendar week of the server clock when the request is handled: Monday 00:00:00 UTC inclusive to the next Monday 00:00:00 UTC exclusive. `week_start` and `week_end` are ISO 8601 UTC timestamps that end in `Z`. An event at `week_start` is inside and one at `week_end` is outside. | `docs/API.md` E29 and the clarification paragraph, `specs/design.md` D6 |
| C35 | `completed_cards` is the number of distinct card IDs with an `entered_done` event on the board in the Week. A card counts once however often it entered Done, and the count survives a later delete or a move out of Done. | Same |
| C36 | `member_activity` counts four event kinds: `card_created`, `card_moved`, `column_reordered` and `comment_created`. `entered_done` is used for `completed_cards` only, so creating a card in Done or moving a card into Done adds one activity event. It lists every actor with a counted event in the Week, a former board member included, under the actor's current name, sorted by count descending, lower-cased name, then user ID. An actor with no counted event is omitted. | Same, `specs/requirements.md` AC11.1, `backend/specs/api-contract.md` |
| C37 | `cards_per_column` lists every active column in board order with its active card count, 0 for an empty column, and is empty when the board has no active column. A deleted card or column is not counted or listed. | `docs/API.md` E29 |
| C38 | E29 accepts no query parameter and no body. Any query parameter is 400 `VALIDATION_ERROR` with the standard message and no field entry, before any read. The check order is authenticate (401), board ID (400), query (400), then board access (404, the generic envelope of C1). It is read-only: no lock, event, notification or `position_version` change. Every participant may read it. | `docs/API.md` E29, `backend/specs/api-contract.md` |

Updated at design time: `docs/API.md` (E29 row, the C34–C38 paragraph and the data shapes), `specs/design.md` D6 (the four counted kinds), `specs/requirements.md` (AC11.1), `backend/specs/api-contract.md` (`analytics_bp`), `docs/TEST-PLAN.md` (V08 and V11), `evidence/spec-review.md` and `specs/CHANGELOG.md`. At implementation: `guidelines/frontend.md` (the component table for `AnalyticsPanel` and `AnalyticsFigures`), `frontend/specs/pages-and-components.md` and `api-integration.md`, `specs/traceability.md`, the README, the USER_GUIDE and the changelogs. Root `specs/tasks.md` links this spec at finalize.

## Review Items and Decisions

| ID | Item | Proposal | Reason |
|---|---|---|---|
| R1 | Timestamp format | Format `week_start` and `week_end` in the analytics service with `strftime(...Z)` and do not use `UtcDateTime` (DD2). | A2 requires `Z`. `UtcDateTime` writes `+00:00` and is used by comments and notifications, so it stays unchanged. |
| R2 | Three statements and one snapshot | Accept (DD3). A concurrent commit between two statements can make one figure differ by one event from another. The next read corrects it. | A `REPEATABLE READ` transaction adds a mode for no visible gain on a read that is already approximate by minutes. |
| R3 | Panel placement | Below the Kanban region, in `BoardShell` (DD10). | The columns stay first. An analytics block above them would push them down at every width. |
| R4 | When a version rise reads again | Compare with the version current when the last read started (DD9). A rise during a read aborts it and starts a new one. | Equal, lower or repeated versions never read, and a rise is never lost. |
| R5 | Refresh and Retry together | Keep both. Refresh is always in the header, Retry is part of the error message (DD11, Requirements 6.5, 6.8). | Requirement 6.8 names Retry and A8 names Refresh. Both call the same function. |
| R6 | Index | No new index. `ix_board_events_board_occurred` serves both event queries (Verified facts). | The columns and cards statement uses the existing active-column and active-card indexes. |
| R7 | Clock source | Import `utcnow` by name in the service and replace it in tests (DD2). | The smallest injectable time source. No new class or setting. |
| R8 | No polling | None in this slice (A8). | The user decided. Comments and other users' changes appear on the next read. |

## Risks

| Risk | Mitigation |
|---|---|
| A board with very many events in a week makes the activity scan slow. | The `(board_id, occurred_at)` index bounds the scan to the Week. The timing record (A10) shows the cost on 100 cards. `ponytail:` add `kind` to the index or a rollup only if it is measured as slow. |
| A user acts at the Week boundary and sees a figure reset. | Intended by A2. The panel shows the Week range, so the reset is explained. |
| The panel shows figures that are minutes old after another user's change or a comment. | A8 accepts this. Refresh and the next version rise read again. |
| A former member's name and work remain visible to current members. | A4 decided it. Events are board history. Only the current name and counts are returned, no email or content. |
| The board page has more to load on a phone. | E29 is a small JSON read after first paint, outside the server render. The page renders without it. |
| The three aggregates drift apart if one query changes later. | Properties 1 to 4 and `_aggregation` exercise all three on one seeded board. `COUNTED_KINDS` is the single list. |
