# Design Document: my-tasks-search (T11)

## Overview

This design implements the My Tasks read (E21), the board card search (E22), the `/my-tasks` page, the search control on the board page and the shared navigation change (root T11). It follows `requirements.md` (Requirements 1 to 8, decisions S1–S11 approved on 2026-11-14 with clarifications) and the shared design D5 and D6. Python (Flask, SQLAlchemy, Marshmallow, pytest) and TypeScript (Next.js App Router, Tailwind, daisyUI, Vitest) are the languages already in the repository. No table, migration, dependency, `docs/API.md` path, method, parameter name or response field changes.

### Verified facts about the existing code

| Fact | Where | Consequence |
|---|---|---|
| `cards` has the partial index `ix_cards_assignee_id_active` and `ix_cards_column_order_id` (both `WHERE deleted_at IS NULL`). `board_columns` has `ix_board_columns_board_order_id`. | `backend/app/models/card.py`, `board_column.py` | E21 and E22 are served by existing indexes. No migration. |
| `authorize_board(board_id, user_id, *, role, lock)` returns the generic 404 for a missing board, a deleted board, a nonmember and a removed member. | `blueprints/boards/service.py` | E22 calls it with `lock=False`. No new exception. |
| `register_response_headers` adds `Cache-Control: private, no-store` to every `/api/` response except the health check. | `backend/app/response_headers.py` | E21 and E22 get it by default. A test proves it. |
| `load_json_body` validates a body. Nothing validates a query string. `RequestValidationError(fields=...)` renders the 400 envelope with the standard message "Check the submitted fields." | `backend/app/validation.py`, `exceptions.py` | One new shared helper, `load_query_args`, next to `load_json_body`. |
| Marshmallow's `unknown=RAISE` reports an unknown key as a field entry. | Marshmallow | The helper separates unknown keys itself, because S3 wants the standard message and no field entry for them. |
| `handlePrivateRead` builds the Flask URL from `FLASK_PATHS` and a UUID-checked `params`. It forwards no query string. `flaskRequest` has no query option. | `frontend/lib/server/privateRoute.ts`, `flask.ts` | A small, explicit `search` option is added to `flaskRequest`, `fetchPrivate` and `handlePrivateRead` (DD5). |
| `apiGet` accepts a path only when it matches a declared GET pattern. | `frontend/lib/apiClient.ts` | One new pattern for the search path with a single `q` (DD6). |
| `useKanbanBoard` owns the board state, the gate and the access-loss redirect (`isBoardAccessError` shows the toast and pushes `/`). `useErrorHandler` handles `AUTH_REQUIRED` with a hard redirect to login. | `frontend/hooks` | `useCardSearch` reuses both and does not use the gate (DD9). |
| `KanbanBoard` owns `openCardId` and finds the open card in the live `columns`. `BoardCard` disables its buttons while the board is busy. | `frontend/components/kanban/KanbanBoard.tsx` | The search lives inside `KanbanBoard`, so it reads the live columns and calls the same open function (DD8). |
| `chipClass(id)` (six fixed chip colors from the board ID) is a private function in `BoardList.tsx`. | `frontend/components/boards/BoardList.tsx` | Move it to `lib/boardChip.ts` and import it in both places, so the color of a board is the same everywhere (FE-D6, DD11). |
| `AppHeader`'s `<nav>` has `hidden lg:block`, so below 1024 px there is no navigation. | `frontend/components/shared/AppHeader.tsx` | S10 changes the shared shell (DD12). |
| `app/error.tsx` is the segment error boundary, with a "Try again" control that calls `retry()`. | `frontend/app/error.tsx` | The My Tasks read error state is the existing boundary (Requirement 4.6). |
| Tailwind is 4.3.5, so `line-clamp-*` is a built-in utility. | `frontend/package.json` | The description excerpt needs no plugin. |

## Architecture

```text
Browser                         Next.js (Vercel)                      Flask (Render)
 /my-tasks (Server Component) ─ getMyTasks() ─ fetchPrivate("myTasks", ?assignee=me) ─▶ E21
 Board page
  KanbanBoard
   CardSearch ─ useCardSearch ─ apiGet("/api/boards/<id>/cards/search?q=…") ─▶ GET handler ─▶ E22
   result click ─ onOpenCard(cardId) ─▶ existing CardDetailModal (live columns)
```

E21 never reaches the browser. The page is rendered on the server and the token stays in the HttpOnly cookie. E22 is the only new browser read, through one same-origin GET handler that forwards the query string unchanged. Both Flask endpoints are read-only and take no lock.

### Key design decisions

| ID | Decision | Rationale |
|---|---|---|
| DD1 | Both endpoints live in `cards_bp` as thin routes over two read-only service functions, `my_tasks` and `search_cards`. | The contract groups E17–E22 under cards. The blueprint rules (BE01, BE02) put transport in routes and queries in the service. |
| DD2 | One new helper `load_query_args(schema)` in `app/validation.py` validates the query string. A repeated or unknown parameter is an error. Known parameters use Marshmallow fields. | S3. One rule in one place, and the next slice that reads a query string (notifications, E27) reuses it. |
| DD3 | E21 is one SQL statement with an inner join to the caller's active membership. | The membership check and the read share one snapshot, so a removal is honored at once (Requirement 1.8) and no assignment clearing is needed for correctness. |
| DD4 | E22 uses `Card.title.icontains(q, autoescape=True)`, which compiles to `ILIKE '%' || :q || '%' ESCAPE '/'` and escapes `%`, `_` and the escape character. | The ORM does the escaping, so there is no hand-written escape function to get wrong (Requirement 2.2). |
| DD5 | The Next handler forwards the raw query string. `flaskRequest` gets an optional `search` string that is set on the final URL (`url.search`), and the origin check still runs on that URL. The handler does not read, validate or rebuild parameters. | S3. A parsed and rebuilt query would collapse a duplicate and drop an unknown key before Flask could reject it. A raw string cannot change the path, host or method. |
| DD6 | The browser asks for the search through `apiGet` with a path built by one function, `cardSearchPath(boardId, q)`. The declared pattern accepts exactly `?q=<encoded text>`. | A client typo cannot call an undeclared path, and the allowlist stays closed. The handler is still the one that forwards whatever query it receives, so the Flask 400 path is tested through the handler directly. |
| DD7 | `useCardSearch` keeps the query text, a status, and the held response `{query, items}`. It does not keep a filtered copy. | S8. Visibility is computed from live state on every render, so a rolled-back delete restores a result without any bookkeeping. |
| DD8 | The pure function `resolveSearchResults(held, columns)` turns the held response into the visible rows. `CardSearch` is props-only apart from the hook. `KanbanBoard` renders `CardSearch` and passes its live `columns` and `openCard`. | One function holds the S8 rule and one table-driven test covers it (Properties 6 to 9). |
| DD9 | Search does not use the Kanban gate. | S8. A slow search must not freeze moves, and a move must not freeze the search. |
| DD10 | `CardSearch` and the My Tasks list show their own states and do not add a new shared component. | FE-D1 says add a shared part only when two screens need it. |
| DD11 | Move `chipClass` to `lib/boardChip.ts`. Use it in `BoardList` and for the Task_Group chip. | FE-D6. One source for the board color. |
| DD12 | `AppHeader` shows the nav at every width. Below 1024 px it is a second row of the wrapping top bar (`basis-full order-last`). From 1024 px it is the sidebar list. | S10. The existing wrapping row is reused, so no new component. |

## Components and Interfaces

### Backend layout (T11)

```text
backend/app/
  validation.py                                  # + load_query_args
  blueprints/cards/
    routes.py                                    # + list_my_tasks_view (E21), search_cards_view (E22)
    schema.py                                    # + MyTasksQuerySchema, CardSearchQuerySchema, TaskItemSchema, SearchResultSchema
    service.py                                   # + my_tasks, search_cards
specs/fixtures/search-query-cases.json           # shared q and assignee cases (also read by the frontend tests)
```

### Routes

| Endpoint | Route | Caller | Query |
|---|---|---|---|
| E21 | `GET /api/cards` | Signed-in user | `assignee=me` and nothing else |
| E22 | `GET /api/boards/<board_id>/cards/search` | Participant | `q` and nothing else |

Both use `@token_required`. `/api/cards` accepts GET only. The existing 405 handling keeps the `Allow` header.

### Check order

1. Authenticate (401).
2. E22: path board ID through `parse_uuid` (400, no database).
3. The query through `load_query_args` (400, no database).
4. E22: `authorize_board(board_id, user_id)` without a lock (404 for a missing board, a deleted board, a nonmember and a removed member).
5. The read.

E21 has steps 1, 3 and 5. A request that is both a nonmember and has a bad `q` gets 400, as for the other board routes (path and body first, then access).

### Query validation

```python
# backend/app/validation.py
REPEATED = "Send one value."

def load_query_args(schema: Schema) -> dict[str, Any]:
    """Validate the URL query with `schema` (S3). Repeated and unknown parameters are errors."""
    raw = request.args.to_dict(flat=False)               # keeps every value of a repeated key
    known = {k: v for k, v in raw.items() if k in schema.fields}
    errors = {k: REPEATED for k, v in known.items() if len(v) > 1}
    try:
        loaded = schema.load({k: v[0] for k, v in known.items() if len(v) == 1})
    except MarshmallowValidationError as exc:
        errors |= {k: m for k, m in first_messages(exc.messages).items() if k not in errors}
        loaded = {}
    if errors or len(known) != len(raw):                 # unknown key: standard message, no field entry
        raise RequestValidationError(fields=errors or None)
    return loaded
```

Rules, all with fixed messages that never echo input:

| Parameter | Rule | Field message |
|---|---|---|
| `assignee` | Required, exactly `me` (case-sensitive) | "Required." or "Must be me." |
| `q` | Required, trimmed, 1 to 100 characters, no NUL character | "Required." (missing or blank), "Must be at most 100 characters.", "Enter valid text." (NUL) |
| any key | Sent more than once | "Send one value." on a known key |
| any other key | Present | No field entry. The envelope has the standard message "Check the submitted fields." |

A NUL character is rejected because PostgreSQL cannot store or compare it, and the driver would raise a 500. A request with an unknown key beside a bad known value reports the known field and the standard message together.

### Service sketch

```python
# backend/app/blueprints/cards/service.py
def my_tasks(user_id) -> list[dict]:                                  # E21
    rows = db.session.execute(
        select(Card.id, Card.column_id, Card.title, Card.description, Card.assignee_id,
               User.name.label("assignee_name"), Card.order,
               Board.id.label("board_id"), Board.name.label("board_name"))
        .join(BoardColumn, BoardColumn.id == Card.column_id)
        .join(Board, Board.id == BoardColumn.board_id)
        .join(BoardMember, and_(BoardMember.board_id == Board.id, BoardMember.user_id == user_id,
                                BoardMember.deleted_at.is_(None)))
        .join(User, User.id == Card.assignee_id)
        .where(Card.assignee_id == user_id, Card.deleted_at.is_(None),
               BoardColumn.deleted_at.is_(None), Board.deleted_at.is_(None))
        .order_by(func.lower(Board.name), Board.id, BoardColumn.order, Card.order, Card.id)
    ).all()
    return [row._asdict() for row in rows]

def search_cards(board_id, user_id, q: str) -> list[dict]:            # E22
    authorize_board(board_id, user_id)                                # 404, no lock
    rows = db.session.execute(
        select(Card.id, Card.title, Card.column_id)
        .join(BoardColumn, BoardColumn.id == Card.column_id)
        .where(BoardColumn.board_id == board_id, BoardColumn.deleted_at.is_(None),
               Card.deleted_at.is_(None), Card.title.icontains(q, autoescape=True))
        .order_by(BoardColumn.order, Card.order, Card.id)
        .limit(20)                                                    # SEARCH_LIMIT
    ).all()
    return [row._asdict() for row in rows]
```

`my_tasks` requires the caller's active membership in the same statement, so a card whose board the caller has left is not returned even if it still names them (Requirement 1.8). The `User` join returns the assignee's current name, which is the caller's own name. Neither function writes, flushes, records an event or takes a lock (Requirement 3.3). The sort follows S1 exactly. The case-insensitive board name sort uses `lower()` in the database collation, so two names that differ only by case fall back to the board ID. The tests use ASCII names so they do not depend on the collation.

### Serialization

Explicit allowlist schemas, as for the other endpoints. `TaskItemSchema` dumps `id, column_id, title, description, assignee_id, assignee_name, order, board_id, board_name`. `SearchResultSchema` dumps `id, title, column_id` and nothing else, so no description, assignee or comment reaches the response (Requirement 2.6). `description` is returned in E21 because the page shows an excerpt and the contract's `Card` shape includes it.

### Next handlers and client allowlist

```text
frontend/lib/server/flask.ts          # FLASK_PATHS: myTasks "/api/cards", boardCardSearch "/api/boards/:boardId/cards/search"
                                      # flaskRequest(request: { …, search?: string })
frontend/lib/server/privateRoute.ts   # PrivateReadSpec { …, forwardQuery?: boolean }
frontend/lib/server/session.ts        # fetchPrivate(route, { …, search? })
frontend/lib/server/tasks.ts          # getMyTasks()  — Server Component read of E21
frontend/app/api/boards/[id]/cards/search/route.ts   # GET → handlePrivateRead(request, { route: "boardCardSearch", params: { boardId }, forwardQuery: true })
```

`flaskRequest` accepts `search` only as a string that is empty or starts with `?`, and sets it with `url.search = search` after the path is built. A value with a fragment (`#`) is not sent, because a URL fragment never reaches the server, and `new URL` treats it as the fragment. The origin check that follows still runs on the final URL, so a query cannot move the request to another host or path. `handlePrivateRead` passes `request.nextUrl.search` (the raw string, repeats and unknown keys included) when `forwardQuery` is true and nothing otherwise. The UUID check on `boardId` runs first, so a bad ID is a 400 from the handler. The handler never reads the parameters, so it cannot normalize them. `getMyTasks` calls `fetchPrivate("myTasks", { method: "GET", search: "?assignee=me" })`.

The client side:

```ts
// frontend/lib/cardSearch.ts
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_RESULT_LIMIT = 20;
export function cardSearchPath(boardId: string, q: string): string   // `/api/boards/${boardId}/cards/search?q=${encodeURIComponent(q)}`
export function parseSearchResults(value: unknown): SearchResult[]    // allowlist, throws ApiError on any other shape
export function resolveSearchResults(held: HeldSearch, columns: ColumnWithCards[]): VisibleResult[]
export function titleMatches(title: string, q: string): boolean       // case-insensitive substring
// frontend/lib/tasks.ts
export function parseTaskList(value: unknown): TaskItem[]             // allowlist
export function groupTasksByBoard(tasks: TaskItem[]): TaskGroup[]     // first appearance order
```

`apiClient.ts` adds one declared GET pattern, `^/api/boards/<uuid>/cards/search\?q=[^&#]*$`, and its comment lists the new read. `types.ts` adds `TaskItem = Card & { board_id; board_name }` and `SearchResult = { id; title; column_id }`.

### Frontend layout (T11)

```text
frontend/
  app/(protected)/my-tasks/page.tsx                 # Server Component: getCurrentUser, getMyTasks, <MyTasks>
  app/api/boards/[id]/cards/search/route.ts         # GET handler (DD5)
  components/tasks/MyTasks.tsx                      # props-only: summary strip, groups, empty state
  components/tasks/TaskGroup.tsx                    # props-only: one board heading (link + chip) and its rows
  components/kanban/CardSearch.tsx                  # client: field, states, results (uses the hook)
  hooks/useCardSearch.ts                            # debounce, abort, latest-response guard
  lib/cardSearch.ts, lib/tasks.ts, lib/boardChip.ts
  components/shared/AppHeader.tsx                   # nav at every width + "My tasks" link
```

| Component | Boundary | Responsibility |
|---|---|---|
| `MyTasksPage` (`page.tsx`) | Server | Verify the session, read E21, render `MyTasks`. A read failure throws `ApiError` to `app/error.tsx`. |
| `MyTasks` | Props-only | Summary strip, `TaskGroup` per board, the empty state. |
| `TaskGroup` | Props-only | The heading link to `/boards/<id>` with the chip, and a `ul` of rows. Each row links to the same board. |
| `CardSearch` | Client | The labelled field, the five states, the result list. Calls `onOpenCard(cardId)`. |
| `useCardSearch` | Hook | Query text, debounce, request, abort, late-response guard, retry. |

The task row is a link to the board with the card title and a two-line excerpt (`line-clamp-2`, `break-words`), and the group heading is a second link to the same board. The row link has the accessible name "<title>, <board name>". There is no card deep link (S9).

### Search state and the live board

```ts
type SearchStatus = "idle" | "loading" | "ready" | "error";
type HeldSearch = { query: string; items: SearchResult[] };       // as returned, never pruned

function resolveSearchResults(held: HeldSearch, columns: ColumnWithCards[]): VisibleResult[] {
  const live = new Map(columns.flatMap(c => c.cards.map(card => [card.id, { card, column: c }] as const)));
  return held.items.flatMap(item => {
    const hit = live.get(item.id);
    if (!hit) return [];                                          // gone: hidden, not removed
    if (hit.card.title !== item.title && !titleMatches(hit.card.title, held.query)) return [];
    return [{ cardId: hit.card.id, title: hit.card.title, columnName: hit.column.name }];
  });
}
```

The server matched every item at the time of the response, so a card whose title is unchanged since then is shown without a second client test. This keeps the client from hiding a result for a Unicode case rule that differs between PostgreSQL's `ILIKE` and JavaScript. Only an edited title goes through `titleMatches` (`toLocaleLowerCase` on both sides, `includes`). A deleted card leaves the live map, so its result is hidden. A rolled-back delete puts the card back in the live columns, so the same held item shows again. A card that starts to match after a rename is not in `held.items`, so it appears only after the next request (S8). The held response is replaced only by a new response of the current query.

### Hook

```ts
useCardSearch({ boardId, onAccessLost }): {
  query: string;                        // the field text, as typed
  setQuery: (text: string) => void;
  status: SearchStatus;
  held: HeldSearch | null;
  fieldError: string | null;            // a 400 field message
  retry: () => void;
}
```

Behavior:

1. `setQuery(text)` stores the text and computes `trimmed`. If `trimmed` is empty: clear the timer, abort the request, bump the sequence number, set `held = null`, `status = "idle"` and clear any error, all in the same call, so the results go away at once (S6).
2. If `trimmed` equals the query of the held response or of the request in flight, nothing is sent (a trailing space or a retyped identical text).
3. Otherwise (the trimmed text changed, Q3): clear the timer, abort the previous request, clear `held`, set `status = "loading"` (the field shows "Searching…" for the debounce and the request) and start a 300 ms timer (`SEARCH_DEBOUNCE_MS`). When it fires it takes the next sequence number, makes an `AbortController` and calls `apiGet(cardSearchPath(boardId, trimmed), signal)`.
4. A response is applied only when its sequence number is the latest and its signal is not aborted. A late response of an earlier query is dropped. An abort is never shown as an error.
5. Success sets `held = { query: trimmed, items: parseSearchResults(data) }` and `status = "ready"`. A 5xx or a transport failure sets `status = "error"` and keeps the typed text. A 400 sets `fieldError` from `fields.q` and `status = "error"` with no Retry. A 404 (`isBoardAccessError`) calls `onAccessLost()`. A 401 goes to `useErrorHandler`, which redirects to login.
6. `retry()` runs the current trimmed query at once, without the debounce.
7. An effect cleanup on unmount clears the timer and aborts the request (FE-A2).

`KanbanBoard` passes `onAccessLost` that shows the existing board access toast and navigates to `/`, the same function that `useKanbanBoard` already uses. The search does not read or write the gate (DD9, Requirement 5.8).

### States and screens

| Area | Behavior |
|---|---|
| Placement | `CardSearch` sits above the columns region inside `KanbanBoard`, in a `surface` panel only if it needs one. It is a single row: label and field. It is visible to every Participant. |
| Field | `FormField`, label "Search cards", `type="search"`, `maxLength={100}`, `text-base`, `min-h-11`, `autoComplete="off"`. The field error from a 400 shows under it. |
| Idle | Empty field, no results block, no message about results. |
| Loading | "Searching…" with `aria-busy` on the results block. |
| Results | `ul` with `divide-y divide-base-300`. Each row is a `BaseButton` ghost with the card title (wrapping) and below it the column name in `text-sm text-base-content/70`. The accessible name is "<title>, in <column>". When the response held 20 items, a line "Showing N results." follows, where N is the visible count (S4). |
| No results | `No cards match "<query>".` The query is shown as text. The idle state shows nothing, so the two never look alike. If the response had items and all are hidden by live state, the same message shows. |
| Error | A message "Search could not be completed." and a Retry `BaseButton`. A 400 shows the field message and no Retry. |
| Live region | One `role="status"` `aria-live="polite"` element announces "N results", the no-result text or the error text. |
| Color | `primary` on the focus ring only, as everywhere. No new color (FE-D1). |

Selecting a result calls `onOpenCard(cardId)`. `KanbanBoard` sets `openCardId`, and `openCard` is found in the live `columns`, so the modal always opens the current card (S7). `BaseModal` returns focus to the button that was focused, which is the result button. If the board becomes busy, the results stay selectable. The modal's own Save and Delete keep their existing behavior through the Kanban gate.

### AppHeader

The `<nav aria-label="Main">` is always rendered. Below 1024 px the header is already a wrapping flex row (brand, then name and Sign out). The nav gets `order-last basis-full` there and becomes a horizontal row of two links, each `min-h-11 min-w-11`, with `aria-current="page"` on the current one. From 1024 px (`lg:`) it is the existing vertical sidebar list, and each link keeps its icon (the icons are `hidden lg:block`, so the phone row is text only). The active state is `bg-white/10 text-white`, as today. `Boards` is current on `/` and `/boards/*`. `My tasks` is current on `/my-tasks`. The second row makes the sticky top bar taller on a phone (about two touch rows). It stays within the viewport at 320 px and the content below is not covered, because the bar is sticky and in the flow, not fixed. This is measured in the browser check (Risks).

### Mobile design (Requirements 6, 7, FE-S4 to FE-S6, FE-D9)

`/my-tasks`: `main` with `mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8`, the title `text-2xl sm:text-3xl font-semibold tracking-tight`, the summary strip (one `surface` with "3 tasks on 2 boards" and `tabular-nums`), then one `surface` per board group with `divide-y divide-base-300` rows. Below 1024 px there is only the main column. Titles, excerpts and board names use `break-words min-w-0`. Each row is a full-width link with `min-h-11`. The board page keeps its full-width layout, and the search field is full width at 375 px with a `text-base` font so iOS Safari does not zoom. Results stack and wrap. `lib/mobileGuard.test.ts` keeps `h-screen`, `100vh` and zoom locks out of the new files. Measured checks are in "Browser checks".

## Data Models

No schema change. `cards`, `board_columns`, `boards`, `board_members` and `users` are read as they are.

### Wire shapes (unchanged from `docs/API.md`)

```text
E21 item   { id, column_id, title, description, assignee_id, assignee_name, order, board_id, board_name }
E22 item   { id, title, column_id }
```

### Frontend types

```ts
type TaskItem = Card & { board_id: string; board_name: string };
type TaskGroup = { boardId: string; boardName: string; tasks: TaskItem[] };
type SearchResult = { id: string; title: string; column_id: string };
type VisibleResult = { cardId: string; title: string; columnName: string };
```

## Error Handling

| Case | Flask | Browser |
|---|---|---|
| No or revoked token | 401 `AUTH_REQUIRED` | Page: redirect to `/login`. Search: handler clears the cookie, `useErrorHandler` redirects. |
| Missing, repeated, invalid or unknown query parameter | 400 `VALIDATION_ERROR`, `fields.assignee` or `fields.q` for a known parameter, the standard message for an unknown one | Search sends only a trimmed `q` of at most 100 units, so this is a defect or a hand-made request. The field message shows and there is no Retry. |
| Bad board ID in the path | 400 before any query | Handler returns its own 400 "The board ID is not valid." |
| Missing, deleted or inaccessible board | 404 `NOT_FOUND`, one envelope (C1) | Existing board access outcome: toast and redirect to `/`. |
| Database failure | Sanitized 500, no partial list | Page: error boundary with Try again. Search: error state with Retry. |
| Timeout or network failure | none | Search: error state with Retry. Page: error boundary. |

## Testing Strategy

### Approach

Parameterized pytest and Vitest tests with deterministic fixtures. No Hypothesis or fast-check. The Playwright journey is delivered in T15. This slice runs a measured mobile check, a manual journey and a timing measurement.

### Test data isolation (Requirement 8.7)

Backend tests run on `TEST_DATABASE_URL` through `db_guard` and `BoardTracker`. Every user, board, column, card and membership comes from a tracker helper, and the tracker's cleanup deletes exactly those rows in foreign-key order after each test, pass or fail. No `TRUNCATE`, no name patterns, never `DATABASE_URL`. `test_boards_cleanup.py` is extended with an untracked sentinel board that holds a card assigned to a tracked user, and the sentinel survives the cleanup of a T11 test.

### Backend test files (V07)

| File | Covers |
|---|---|
| `test_search_query_validation.py` | `load_query_args` through both routes, from `search-query-cases.json`: missing, blank, whitespace, 1 and 100 characters ok, 101 not, NUL, repeated, `assignee` other than `me` (`ME`, empty, `me ` ), an unknown key alone and beside a valid parameter, a known invalid value beside an unknown key. The envelope has `fields` only for known parameters, and the standard message otherwise. No database read on a 400 (a query counter stays at zero). |
| `test_my_tasks.py` | E21 200 shape and allowlist, the empty list, only the caller's cards, a Done card included, exclusion of a soft-deleted card, a card in a soft-deleted column, a card on a soft-deleted board, a card assigned to another user, an unassigned card, and a card on a board where the caller has no active membership (a removed member whose assignment still names them). The sort order over two boards with names that differ by case and equal names, and the column and card order. Cards of one board adjacent. A removal hides the board's cards at once. `assignee_name` and `board_name` after a rename. No write, no event, `position_version` unchanged, `no-store`. 401. |
| `test_card_search.py` | E22 200 shape and allowlist, no match as an empty list, case-insensitive matching, literal `%`, `_`, `\` and `/`, title only (a description or comment word does not match), the trimmed `q`, the cap (21 matching cards return 20, in board order, ties broken by card ID), the order across columns and a reorder, soft-deleted card and column excluded, other-board cards never returned, 404 for a nonmember, a removed member, a missing board and a soft-deleted board with one envelope, Admin and Member both allowed, no write, no event, `no-store`, 401, and the check order (401, then a bad path ID or query 400, then 404). |
| `test_search_properties.py` | Parameterized properties 1 to 5 below. |
| `test_boards_cleanup.py` (extended) | The sentinel survives the T11 cleanup. |

The 100-card timing is a measurement script in `evidence/`, not a pytest case.

### Frontend test files (Vitest and React Testing Library)

| File | Covers |
|---|---|
| `lib/cardSearch.test.ts` | `cardSearchPath` encoding (a `&`, `#`, `%` and a space in `q`), `parseSearchResults` allowlist and error shape, `titleMatches`, and the table-driven `resolveSearchResults` cases: unchanged title, rename that still matches, rename that no longer matches, a move to another column, a delete, a rolled-back delete that restores the result, an empty board. |
| `lib/tasks.test.ts` | `parseTaskList` allowlist and error shape, `groupTasksByBoard` keeps the API order, groups by first appearance, handles an empty list. |
| `lib/apiClient` tests (extended) | The search pattern is declared, any other `/cards/search` path, a second parameter, a non-UUID board ID or a fragment throws before `fetch`. |
| `lib/server/flask.test.ts` (extended) | `search` is applied to the final URL, a duplicate and unknown key are kept in order, a value that does not start with `?` throws, the origin check still runs. |
| `app/api/cardSearchRoute.test.ts` | The handler forwards the query string unchanged: one `q`, a repeated `q`, an unknown key, a blank `q` and a `q=%00` (NUL) reach Flask exactly as sent, and the Flask 400 body and status pass through. A bad board ID is 400 without a call. A missing cookie is 401 and clears the cookie. The bearer token comes from the cookie, `no-store` is set and no token is in the response. |
| `hooks/useCardSearch.test.tsx` | With fake timers: a burst of keystrokes sends one request after 300 ms, nothing before 300 ms, the trimmed text is sent, no request for blank text, clearing the field clears the results at once and aborts the request and the timer, an identical trimmed text sends nothing, two deferred requests that resolve out of order leave the newest results, an abort is not an error, 5xx and transport failure give the error state and keep the text, Retry sends one request without a delay, a 400 shows the field message and sends no retry, a 404 calls `onAccessLost`, unmount aborts and clears the timer. |
| `components/kanban/CardSearch.test.tsx` | The label, idle (no message), loading, results (title and column name), no results with the query text, error with Retry, "Showing 20 results." only when 20 were returned and with the visible count, a result hidden after a rename that no longer matches, a new title and column shown after a rename and a move, a deleted card hidden and restored on rollback, a new match not shown until the next search, selecting a result calls `onOpenCard` with the card ID, the live region text. |
| `components/kanban/KanbanBoard.test.tsx` (extended) | The search above the columns, a result opens the detail modal for the current card and focus returns to the result, the search stays usable while the board is busy and a pending search does not disable a move. |
| `components/tasks/MyTasks.test.tsx` | Groups in the given order, heading link and row link to `/boards/<id>`, the summary text for one and several tasks and boards, the empty state, the excerpt and long text classes, no card ID in any link. |
| `app/(protected)/my-tasks/page.test.tsx` | The session is verified, E21 is read with `?assignee=me`, the page renders the groups, a read failure throws, a missing session redirects. |
| `components/shared/AppHeader.test.tsx` (extended) | Both links render, `aria-current` on `/`, `/boards/x` and `/my-tasks`, both have `min-h-11`, the nav has the classes that show it below 1024 px (`order-last`, `basis-full`) and no `hidden` on the nav. |
| `lib/boardChip.test.ts`, `components/boards/BoardList.test.tsx` | The same board ID gives the same chip class in both places. |

### Browser checks (V07, V11)

- `evidence/my-tasks-search-mobile-measure.mjs` in the style of `evidence/comments-mobile-measure.mjs`. `/my-tasks` with tasks on two boards and with none, the board page with the search in idle, loading (delayed), results, 20 results, no results and error, and the header at each width. At 320, 375, 768 and 1280 px. Checks: `scrollWidth <= innerWidth` for the page (the Kanban region may scroll), every interactive box at least 44 by 44 CSS px with `elementFromPoint` at the center (the field, Retry, a result, a task row and both AppHeader links), a 16 px font on the field, and at both 320 and 375 px: Boards and My tasks reachable, each link at least 44 by 44 CSS px, no horizontal overflow caused by the header, and no overlap of the sticky bar over the content (the first content element starts at or below the bottom of the bar, and an anchor or focus jump is not hidden under it) (Q6).
- Screenshots at 375, 768 and 1280 px beside the record (FE-D9). The record says emulator or real device.
- A manual journey at 375 px: open My tasks from the top bar, follow a board link, type a query, see results, open a card from a result, clear the query, a no-result query, rename the card and see the result follow it.
- A late-response check in the browser by delaying one request, and the validation check through the real handler with `curl` (repeated `q`, unknown key, blank `q`, `q=%00`) against the dev server.
- Timing: 30 sequential E22 and 30 sequential E21 requests on a board of 100 cards, with raw timings and conditions, compared with the 800 ms reference (Requirement 8.9).
- The V10 Playwright journey is delivered in T15.

## Correctness Properties

Each property is a parameterized test over fixed tables, not a generator.

1. **Task scope.** For every table of cards (assigned to the caller or not, active or soft-deleted, in an active or soft-deleted column, on an active or soft-deleted board, with or without caller membership, in a Done column or not), E21 returns exactly the active assigned cards on boards the caller can access (Requirements 1.1, 1.2).
2. **Task order.** E21 output is sorted by lower-case board name, board ID, column order, card order, card ID, and every board's cards are adjacent (Requirement 1.3).
3. **Search scope and cap.** E22 returns only title matches of active cards of the board, never more than 20, in board order with the card ID as tie-breaker, and never a card of another board (Requirements 2.1 to 2.3, 2.7).
4. **Literal wildcards.** For `q` made of `%`, `_`, `\` and `/` and mixtures, E22 matches only titles that contain the characters, and no title matches only because of a wildcard (Requirement 2.2).
5. **Read only and query strictness.** A call to E21 or E22 changes no row and records no event. Any query with a repeated, unknown, missing or out-of-range parameter is a 400 and reads no card, and an unknown key never appears as a field (Requirements 1.7, 2.5, 3.3).
6. **Live resolution.** For a held response and any live board, a result is visible if and only if its card is on the board and its title is unchanged or the new title contains the query (Requirement 5.9).
7. **Reversible visibility.** Removing a card from the live board and putting it back leaves the visible results as they were before the removal (Requirement 5.10).
8. **No promotion.** A card absent from the held response never becomes visible, whatever its live title (Requirement 5.10).
9. **Latest response wins.** For any order of completion of two or more requests, the displayed results are those of the latest request, and an aborted request never changes the state (Requirement 5.4).
10. **Debounce.** For any sequence of changes closer than 300 ms apart, one request is sent, 300 ms after the last change, with the final trimmed text. A blank value sends none and clears the results at once (Requirements 5.2, 5.3).
11. **Query pass-through.** The handler forwards the query string it receives byte for byte, repeats and unknown keys included (Requirement 8.1).
12. **Navigation.** On every path the header shows both links, marks exactly one as current for `/`, `/boards/*` and `/my-tasks`, and keeps both at 44 px (Requirements 6.1 to 6.3).

## Acceptance Criteria Map

| Requirement | API, UI | Work packages | Verification |
|---|---|---|---|
| 1 (E21, AC06.2) | `GET /api/cards` · `my_tasks` | WP-B1, WP-B2 | V07 `test_my_tasks.py`, properties 1, 2, 5 |
| 2 (E22, AC09.1) | `GET /api/boards/{id}/cards/search` · `search_cards` | WP-B1, WP-B2 | V07 `test_card_search.py`, properties 3, 4, 5 |
| 3 (access, order, read safety) | `load_query_args`, `authorize_board` | WP-B1, WP-B2 | V07 `test_search_query_validation.py`, request-order and cleanup tests |
| 4 (My Tasks page, AC06.2) | `/my-tasks`, `MyTasks`, `TaskGroup` | WP-F1, WP-F3 | RTL, V11 measured, manual journey |
| 5 (board search UI, AC09.1) | `CardSearch`, `useCardSearch`, `resolveSearchResults` | WP-F2, WP-F3, WP-F4 | RTL and hook tests, properties 6 to 10, V11 |
| 6 (navigation) | `AppHeader` | WP-F5 | RTL, V11 measured, property 12 |
| 7 (mobile, AC13.1) | every new page and control | WP-F3, WP-F5, WP-V | V11 measured script, screenshots, manual journey |
| 8 (handlers, verification) | Next handler, allowlist, docs | WP-F1, WP-D | V07, handler tests, property 11, timing record |

Work packages: **WP-B1** `load_query_args`, schemas, `my_tasks`, `search_cards`, routes, the fixture. **WP-B2** backend tests and the cleanup sentinel. **WP-F1** types, parsers, `FLASK_PATHS`, the `search` option, the Next handler, the client allowlist, `getMyTasks`. **WP-F2** `lib/cardSearch.ts` and `useCardSearch`. **WP-F3** `MyTasks`, `TaskGroup`, the page, `CardSearch`, `boardChip`. **WP-F4** `KanbanBoard` wiring. **WP-F5** `AppHeader`. **WP-V** the measured mobile check, the manual journey and the timing record. **WP-D** documentation.

### Dependencies and gates

Root T08 and T09 are verified, and so is T10, so no gate blocks the start. WP-B1 comes before WP-F1 (the handler tests need the contract to be live), WP-F1 before WP-F2, WP-F2 before WP-F3 and WP-F4. WP-F5 is independent. Root T11 is checked only when the backend checks, the frontend checks and the measured mobile check pass. Unverified work stays open.

## Contract and Document Impact

No endpoint path, method, parameter name or response field changes. These clarifications are recorded with the approved requirements and are applied to the shared documents now:

| ID | Change | Where applied |
|---|---|---|
| C18 | E21 and E22 query strictness: a missing, repeated, invalid or unknown parameter returns 400 `VALIDATION_ERROR`, with `fields.assignee` or `fields.q` for a known parameter and the standard message for an unknown one. `q` is trimmed, 1 to 100 characters, and a NUL character is rejected (S3). | `docs/API.md`, `backend/specs/api-contract.md` |
| C19 | E21 order and scope: unpaginated, case-insensitive board name, board ID, column order, card order, card ID. Includes Done cards. Requires the caller's active membership on the board (S1, S2). | `docs/API.md`, `specs/design.md` D6, `specs/requirements.md` AC06.2 |
| C20 | E22: title-only, case-insensitive, `%`, `_` and `\` literal, at most 20 in board order with the card ID as tie-breaker, no total. A nonmember gets the generic 404 (C1). Both endpoints are read-only: no lock, event, notification or version change (S4, S5, S11). | `docs/API.md`, `specs/requirements.md` AC09.1 |
| C21 | A browser Route Handler for E22 that forwards the query string unchanged. E21 has no browser handler (S3, S11). | `frontend/specs/api-integration.md`, `docs/API.md` |
| C22 | The AppHeader shows Boards and My tasks at every width (S10). | `guidelines/frontend.md` FE-D2, `specs/design.md` D5, `frontend/specs/pages-and-components.md` |

Synchronized with this design (2026-11-14): `specs/requirements.md` AC06.2 and AC09.1, `specs/design.md` D5 and D6, `docs/API.md`, `backend/specs/api-contract.md`, `frontend/specs/api-integration.md`, `frontend/specs/pages-and-components.md`, `guidelines/frontend.md` FE-D2, `docs/TEST-PLAN.md` V07 and V11, `specs/traceability.md`, `specs/CHANGELOG.md` and `evidence/spec-review.md`. Left for finalization after the task plan is approved: the link from root T11 in `specs/tasks.md` to `.kiro/specs/my-tasks-search/tasks.md`. Left for the implementation: the README, the application changelogs and `evidence/my-tasks-search-T11.md`.

## Review Items and Decisions

S1–S11 are resolved as written in `requirements.md` ("Approved decisions"). The design was approved on 2026-11-14 with decisions Q1–Q6, which replace the six review items of the draft:

| ID | Decision | Resolution | Where applied |
|---|---|---|---|
| Q1 | Visible result count | When E22 returns 20 results, the line shows the number currently visible. One hidden result reads "Showing 19 results." When every result is hidden, the no-result state shows and the line does not. | States and screens; `CardSearch.test.tsx`; tasks 5.1, 5.2 |
| Q2 | Unchanged titles | A live title equal to the title returned by E22 is trusted as a server match. Only a changed title is re-tested with `titleMatches`. The row shows the current title and column. | Search state and the live board; Properties 6 to 8; tasks 3.1, 5.2 |
| Q3 | Loading | When the normalized (trimmed) query changes, the held results clear. "Searching…" shows for the debounce and the request of a valid query. A blank query clears the results and the loading state at once. The 300 ms debounce, the abort and the latest-response guard stay. A change that leaves the trimmed text the same changes nothing. | Hook steps 1 to 4; Properties 9, 10; tasks 4.1, 4.2 |
| Q4 | NUL in `q` | 400 `VALIDATION_ERROR` with `fields.q` when the decoded query contains a NUL character. Verified in Flask (a `%00` query) and through the same-origin GET handler, which forwards it unchanged and passes the 400 through. | Query validation; `cardSearchRoute.test.ts`; tasks 1.1, 1.4, 2.1, 3.2 |
| Q5 | Sort order | The approved S1 order with the card ID as the final tie-breaker. No column ID tie-breaker is added. | Service sketch; Property 2; tasks 1.3, 2.2 |
| Q6 | Sticky mobile header | The wrapping navigation row is approved. At both 320 px and 375 px, Boards and My tasks are reachable, each link is at least 44 by 44 CSS px, and the header causes no horizontal overflow and does not overlap content. | AppHeader; Browser checks; Property 12; tasks 7.1, 8.1 |

## Risks

| Risk | Handling |
|---|---|
| The sort by `lower(name)` follows the database collation, so mixed-script names can order differently from Python. | The sort is stable and deterministic (the board ID breaks ties). The tests use ASCII names. |
| An unbounded E21 list grows with the user's assignments. | Within the project's scale (no cap in v1, S1). Revisit if one user holds a few hundred cards. |
| A raw query string forwarded by the handler can be long. | Gunicorn rejects a request line above its limit with a non-JSON 400. The browser sends at most 100 units of `q`, so the normal path is far below it. The handler's reply for a non-JSON upstream body already maps to a typed error. |
| `ILIKE '%q%'` cannot use a plain index. | A board holds at most about 100 cards (NFR 1), and the scan is limited to one board's active cards by `ix_board_columns_board_order_id` and `ix_cards_column_order_id`. A trigram index is a later change if boards grow. |
| The taller sticky header on a phone covers content or pushes the board below the fold. | Sticky and in the flow, not fixed. Measured at 320 and 375 px, and the Kanban page keeps its own scroll region. |
| A held result opens a card whose current state differs from the response. | The modal opens from the live columns (S7), and a result is shown only while its live card exists (S8). |
| Selecting a result while the board is busy opens the modal while a move is pending. | Opening is read-only. The modal's Save and Delete keep going through the existing gate, so no new write path exists. Covered in `KanbanBoard.test.tsx`. |
| The handler forwards unknown keys on purpose, so a future key is forwarded too. | Flask rejects it (S3). The test in `cardSearchRoute.test.ts` pins this. |
