# Design Document: my-tasks-search (T11)

## Overview

This design implements the My Tasks read (E21), the board card search (E22), the `/my-tasks` page, the search control on the board page and the shared navigation change (root T11). It follows `requirements.md` (Requirements 1 to 8, decisions S1–S11 approved on 2026-11-14 with clarifications) and the shared design D5 and D6. Python (Flask, SQLAlchemy, Marshmallow, pytest) and TypeScript (Next.js App Router, Tailwind, daisyUI, Vitest) are the languages already in the repository. No table, migration, dependency, `docs/API.md` path, method, parameter name or response field changes (Rev 2: the E21 item gains two fields, C42).

**Revision 2 (2026-11-20).** Requirements 9 and 10 (decisions S12–S17, approved 2026-11-20 in chat as written) add a status badge to each My Tasks row and a local title search above the groups. The design adds two fields to the E21 item, one small variant to `BaseBadge`, one pure filter helper and a client state in `MyTasks`. See "Revision 2 design" after "Mobile design". The Revision 1 sections stay as the record of what was built. Where Revision 2 changes a Revision 1 statement, the statement is marked "(Rev 2)" in place. The one contract change is the additive E21 item (C42).

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

Explicit allowlist schemas, as for the other endpoints. `TaskItemSchema` dumps `id, column_id, title, description, assignee_id, assignee_name, order, board_id, board_name` (Rev 2: and `column_name`, `is_done`). `SearchResultSchema` dumps `id, title, column_id` and nothing else, so no description, assignee or comment reaches the response (Requirement 2.6). `description` is returned in E21 because the page shows an excerpt and the contract's `Card` shape includes it.

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
| `MyTasks` | Client (Rev 2, DD17), serializable props | The search field and its query state, the filter, summary strip, `TaskGroup` per board, the empty state and the no-match state. |
| `TaskGroup` | Props-only | The heading link to `/boards/<id>` with the chip, and a `ul` of rows. Each row links to the same board and shows the Status_Badge (Rev 2). |
| `CardSearch` | Client | The labelled field, the five states, the result list. Calls `onOpenCard(cardId)`. |
| `useCardSearch` | Hook | Query text, debounce, request, abort, late-response guard, retry. |

The task row is a link to the board with the card title and a two-line excerpt (`line-clamp-2`, `break-words`), and the group heading is a second link to the same board. The row link has the accessible name "<title>, <board name>" (Rev 2: "<title>, <board name>, <column name>", DD14). There is no card deep link (S9).

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

## Revision 2 design (status badge and task search)

### Verified facts for Revision 2

| Fact | Where | Consequence |
|---|---|---|
| `my_tasks` already joins `BoardColumn` (for the board and the soft-delete filter) but selects no column field. | `backend/app/blueprints/cards/service.py` | `BoardColumn.name` and `BoardColumn.is_done` are two more selected columns on the same join. No extra query, no migration (DD13). |
| `TaskItemSchema` is an explicit allowlist with `Meta.fields`. | `backend/app/blueprints/cards/schema.py` | Add two declared fields and two names to `Meta.fields`. An undeclared column can never leak. |
| `parseTaskItem` calls `parseCard(value)` and then copies `board_id` and `board_name`, throwing `malformedApiError` on any other shape. | `frontend/lib/tasks.ts` | Extend with `column_name` (string) and `is_done` (boolean). |
| `BaseBadge` has `primary` and `ghost` variants. `--color-success` (`#1a7f4b`, content white) exists in the theme. | `components/shared/BaseBadge.tsx`, `app/globals.css` | Add a `success` variant (`badge-success`). The color is the existing semantic one, so FE-D1 holds (DD15). |
| `Icon` has `check` and `x`. `FormField` has `type="search"`, `maxLength`, `hideLabel`, `inputClassName` and `inputRef`. `CardSearch` already shows the search-field pattern (icon at the left, `pl-9`, label hidden, an `aria-live` `sr-only` paragraph). `titleMatches(title, query)` and `SEARCH_QUERY_MAX` exist in `lib/cardSearch.ts`. | frontend | Reuse all of them. No new shared component and no new matching function (DD16). |
| `MyTasks` is a props-only component rendered by the Server Component page. The page passes `tasks` (serializable). | `components/tasks/MyTasks.tsx`, `app/(protected)/my-tasks/page.tsx` | `MyTasks` gets `"use client"` and a `useState` query. The page stays a Server Component (FE-C1). |
| The row link has `aria-label="<title>, <board name>"`, and an `aria-label` replaces the link's content. | `TaskGroup.tsx` | The label gains the column name, or the badge is invisible to a screen reader (DD14). |
| No Playwright step reads a My Tasks row name. `mobile.spec.ts` only visits the route. | `frontend/e2e` | The label change breaks no journey. |

### Revision 2 decisions

| ID | Decision | Rationale |
|---|---|---|
| DD13 | E21 selects `BoardColumn.name AS column_name` and `BoardColumn.is_done AS is_done` in the same statement. `TaskItemSchema` dumps both. | S12. One snapshot with the card, so the status cannot disagree with the card's position. No new query, index or table. |
| DD14 | Each row is `[title and excerpt] [Status_Badge] [chevron]`. The row link's accessible name becomes `"<title>, <board name>, <column name>"`. The badge is plain text inside the link and never takes focus. | Requirements 9.2 to 9.4. The visible badge and the spoken name say the same thing. |
| DD15 | `BaseBadge` gets `variant="success"` (`badge-success`). A done badge shows `<Icon name="check" className="size-3.5" />` before the text. An open badge is `ghost` with no icon. The badge text is the column name. A caller can let a long name wrap by passing `h-auto min-h-6 max-w-[45%] whitespace-normal py-0.5 text-left` as `className`, because daisyUI's `badge` has a fixed height and `BaseBadge` already carries `shrink-0`. | S13, FE-D1 (no new color), 9.3 (not color alone), 9.5 (FE-S4). The 45% cap keeps at least half of the row for the title. |
| DD16 | The filter is a pure function `filterTasks(tasks, query)` in `lib/tasks.ts`. It trims the query, returns `tasks` unchanged when the trimmed text is empty, and otherwise keeps a task when `titleMatches(task.title, trimmed)`. `MyTasks` groups the filtered list with the existing `groupTasksByBoard`. | S14, S15. `titleMatches` is the function the board search already uses (case-insensitive literal substring), so the two searches agree and there is no wildcard to escape. Grouping after the filter drops empty groups and keeps the API order for free (10.6, S1). |
| DD17 | `MyTasks` becomes a client component: `"use client"`, `const [query, setQuery] = useState("")`, and a `useRef` for the field. No debounce, no effect, no URL, no storage. The page file does not change. | S15, S17. One file holds the state. A wrapper component would add a file for no reuse (FE-C2 is met: `MyTasks` composes the field and `TaskGroup`, and `TaskGroup` stays props-only). |
| DD18 | The search block renders only when `tasks.length > 0`. The field copies the `CardSearch` markup: `FormField` (`type="search"`, `hideLabel`, label "Search my tasks", placeholder "Search my tasks", `maxLength={SEARCH_QUERY_MAX}`, `pl-9`, `autoComplete="off"`) with the `search` icon, in a `w-full sm:max-w-sm` wrapper. | 10.1, 10.10. One pattern for both searches. |
| DD19 | An `sr-only` `<p aria-live="polite" aria-atomic="true">` holds the announcement: `"<N> tasks"` while filtering with matches and `"No tasks match."` otherwise. It is always rendered while `tasks.length > 0`, so a change is announced. | 10.7. Same pattern as `CardSearch`, which avoids a second `role="status"`. |
| DD20 | The summary strip shows `"<shown> of <all> tasks on <k> boards"` when the normalized query is not empty and `shown > 0`, and `"<all> tasks on <k> boards"` otherwise. When `shown` is 0 the strip shows `"0 of <all> tasks"` without the boards part, because "on 0 boards" reads as a defect. Singular forms follow the existing `task` and `board` labels. | 4.3, 10.6. This refines 10.6 for the zero case (review item R1). |
| DD21 | The no-match state is a dashed `surface` panel like the empty state, with the text `No tasks match "<query>".` (the trimmed query, as plain text) and a ghost `BaseButton` "Clear search". The button empties the query and calls `inputRef.current?.focus()`. | 10.5, 10.9. The dashed panel matches FE-D7's empty state, and the text differs from "No cards are assigned to you." The native clear of `type="search"` fires `onChange` with `""`, so it needs no code. |
| DD22 (S18) | `MyTasks` runs `router.refresh()` in an effect on mount and on `visibilitychange` to `visible`, and removes the listener on unmount. No staleness check. `router.refresh()` re-renders the Server Component and keeps client state, so the typed query stays. | The Back button restores an earlier render from Next's router cache, and the journey showed the stale badge. Visibility alone does not fire on Back, so the mount refresh fixes Back and the listener covers a tab left open. A render timestamp would skip the refresh on a fresh visit, but a client clock that differs from the server's could suppress a needed refresh, so the simple always-refresh is kept. Ceiling: one extra E21 read per visit. |

### Backend change (E21)

```python
# backend/app/blueprints/cards/service.py  (my_tasks) — two lines added to the select
            Board.name.label("board_name"),
            BoardColumn.name.label("column_name"),       # Rev 2
            BoardColumn.is_done.label("is_done"),        # Rev 2
```

```python
# backend/app/blueprints/cards/schema.py  (TaskItemSchema)
    column_name = fields.String()                         # Rev 2
    is_done = fields.Boolean()                            # Rev 2
    # Meta.fields gains "column_name", "is_done" after "board_name"
```

The docstring of `my_tasks` says that the status comes from the same join. The sort, the filters, the query validation and the membership join do not change. The `docs/API.md` E21 row and the "E21 item" shape line are the contract edits (C42).

### Frontend change

```ts
// frontend/lib/types.ts
export type TaskItem = Card & { board_id: string; board_name: string; column_name: string; is_done: boolean };

// frontend/lib/tasks.ts
export function parseTaskItem(value: unknown): TaskItem {
  if (!isRecord(value) || typeof value.board_id !== "string" || typeof value.board_name !== "string"
      || typeof value.column_name !== "string" || typeof value.is_done !== "boolean") throw malformedApiError();
  return { ...parseCard(value), board_id: value.board_id, board_name: value.board_name,
           column_name: value.column_name, is_done: value.is_done };
}
export function filterTasks(tasks: TaskItem[], query: string): TaskItem[] {
  const q = query.trim();
  return q === "" ? tasks : tasks.filter((task) => titleMatches(task.title, q));
}
```

```tsx
// components/tasks/MyTasks.tsx  ("use client")
const [query, setQuery] = useState("");
const trimmed = query.trim();
const shown = filterTasks(tasks, query);
const groups = groupTasksByBoard(shown);
// tasks.length === 0            → the Revision 1 empty state, no field (4.4)
// otherwise: field, sr-only live line, summary strip (DD20), then
//   shown.length === 0          → the no-match panel (DD21)
//   else                        → one <TaskGroup> per group
```

```tsx
// components/tasks/TaskGroup.tsx — one row
<Link aria-label={`${task.title}, ${group.boardName}, ${task.column_name}`} ...>
  <span className="flex min-w-0 flex-1 flex-col gap-1"> …title and excerpt as before… </span>
  <BaseBadge variant={task.is_done ? "success" : "ghost"} className="max-w-[45%] ...">
    {task.is_done ? <Icon name="check" className="size-3.5" /> : null}
    <span className="min-w-0 break-words">{task.column_name}</span>
  </BaseBadge>
  <Icon name="chevron-right" />
</Link>
```

The badge shares the row with the title, so on a 320 px screen the title column has `min-w-0 flex-1` and the badge is capped at 45% of the row, which leaves the title at least half. A column name of 80 characters (the column limit) wraps inside the badge. `BaseBadge` gets the `success` variant and a note that its text may wrap when a caller passes `h-auto` and `whitespace-normal`. daisyUI's `badge` has a fixed height, so the caller removes it for a wrapping name (`h-auto min-h-6 py-0.5 whitespace-normal text-left`).

### Revision 2 states and behavior

| Case | Result |
|---|---|
| No task | Revision 1 empty state, no field, no summary of filtering. |
| Tasks, empty or blank query | All groups, summary "3 tasks on 2 boards". |
| Query with matches | Only matching rows, groups with no match hidden, summary "1 of 3 tasks on 1 board", live line "1 task" (singular and plural follow the count). |
| Query with no match | Field stays, the no-match panel, summary "0 of 3 tasks", live line "No tasks match." |
| Clear search | Query `""`, focus on the field, full list. |
| Reload or a link visit | Empty field, full list (state is local, S17). |
| Column renamed or card moved on the board | The page shows the status of its last load. Navigating back or reloading fetches the new value (9.6). |

### Revision 2 mobile design (Requirement 7, FE-S4 to FE-S6)

The field is full width at 375 px, `sm:max-w-sm` from 640 px, 16 px font and `min-h-11`. The "Clear search" button is `min-h-11 min-w-11`. The badge is a label with no target size. At 320 px the row is title block (at least 55%) plus badge (up to 45%) plus the 20 px chevron, and every text wraps (`break-words`, `min-w-0`), so the page does not widen. The measured script adds a done row, an open row, a row with an 80-character column name, a matching query and a no-match query, and checks `scrollWidth <= innerWidth`, the 44 px boxes of the field and the clear button, and that the badge's bounding box stays inside its row.

## Data Models

No schema change. `cards`, `board_columns`, `boards`, `board_members` and `users` are read as they are.

### Wire shapes

```text
E21 item   { id, column_id, title, description, assignee_id, assignee_name, order, board_id, board_name, column_name, is_done }   # Rev 2: column_name, is_done added (C42)
E22 item   { id, title, column_id }
```

### Frontend types

```ts
type TaskItem = Card & { board_id: string; board_name: string; column_name: string; is_done: boolean };  // Rev 2
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
| `test_my_tasks.py` (extended, Rev 2) | Every item has `column_name` and `is_done` and the key set is exactly the documented ten plus two. A card in the Done column has `is_done` true and a card in another column false, with the column's name. Cards of one board in two columns show their own column. After an Admin renames a column and after the Done flag moves (E14 on an empty column), the next E21 shows the new values. The existing exclusions, order, membership removal, no-write and `no-store` tests keep passing. |
| `test_boards_cleanup.py` (extended) | The sentinel survives the T11 cleanup. |

The 100-card timing is a measurement script in `evidence/`, not a pytest case.

### Frontend test files (Vitest and React Testing Library)

| File | Covers |
|---|---|
| `lib/cardSearch.test.ts` | `cardSearchPath` encoding (a `&`, `#`, `%` and a space in `q`), `parseSearchResults` allowlist and error shape, `titleMatches`, and the table-driven `resolveSearchResults` cases: unchanged title, rename that still matches, rename that no longer matches, a move to another column, a delete, a rolled-back delete that restores the result, an empty board. |
| `lib/tasks.test.ts` | `parseTaskList` allowlist and error shape, `groupTasksByBoard` keeps the API order, groups by first appearance, handles an empty list. Rev 2: the parser copies `column_name` and `is_done` and throws on a missing key, a non-string name and a non-boolean flag. `filterTasks`: empty and whitespace-only query return the same list, case-insensitive match, literal `%`, `_`, `\`, `*` and `.`, trims the query, title only (a description, board name or column name does not match), keeps the API order, no match returns `[]`. |
| `components/shared/BaseBadge.test.tsx` (new, Rev 2) | The `success` variant gives `badge-success`, `ghost` stays the default, a caller `className` is appended. |
| `lib/apiClient` tests (extended) | The search pattern is declared, any other `/cards/search` path, a second parameter, a non-UUID board ID or a fragment throws before `fetch`. |
| `lib/server/flask.test.ts` (extended) | `search` is applied to the final URL, a duplicate and unknown key are kept in order, a value that does not start with `?` throws, the origin check still runs. |
| `app/api/cardSearchRoute.test.ts` | The handler forwards the query string unchanged: one `q`, a repeated `q`, an unknown key, a blank `q` and a `q=%00` (NUL) reach Flask exactly as sent, and the Flask 400 body and status pass through. A bad board ID is 400 without a call. A missing cookie is 401 and clears the cookie. The bearer token comes from the cookie, `no-store` is set and no token is in the response. |
| `hooks/useCardSearch.test.tsx` | With fake timers: a burst of keystrokes sends one request after 300 ms, nothing before 300 ms, the trimmed text is sent, no request for blank text, clearing the field clears the results at once and aborts the request and the timer, an identical trimmed text sends nothing, two deferred requests that resolve out of order leave the newest results, an abort is not an error, 5xx and transport failure give the error state and keep the text, Retry sends one request without a delay, a 400 shows the field message and sends no retry, a 404 calls `onAccessLost`, unmount aborts and clears the timer. |
| `components/kanban/CardSearch.test.tsx` | The label, idle (no message), loading, results (title and column name), no results with the query text, error with Retry, "Showing 20 results." only when 20 were returned and with the visible count, a result hidden after a rename that no longer matches, a new title and column shown after a rename and a move, a deleted card hidden and restored on rollback, a new match not shown until the next search, selecting a result calls `onOpenCard` with the card ID, the live region text. |
| `components/kanban/KanbanBoard.test.tsx` (extended) | The search above the columns, a result opens the detail modal for the current card and focus returns to the result, the search stays usable while the board is busy and a pending search does not disable a move. |
| `components/tasks/MyTasks.test.tsx` | Groups in the given order, heading link and row link to `/boards/<id>`, the summary text for one and several tasks and boards, the empty state, the excerpt and long text classes, no card ID in any link. Rev 2: every row shows its column name as a badge, a done row has the check icon and `badge-success` and an open row has `badge-ghost` and no icon, the row's accessible name ends with the column name, a done task in a column named "Selesai" shows `badge-success`, the check icon and "Selesai", an 80-character column name gets the wrapping classes, and the order of rows does not change with the badge. Search: no field when there is no task, a labelled `type="search"` field with `maxLength` 100, typing filters at once with no timer and no `fetch`, groups with no match disappear, the summary "1 of 3 tasks on 1 board" and "0 of 3 tasks", the no-match text with the query as text (a `<b>` in the query renders as text), the empty state text is not the no-match text, Clear search empties the field and focuses it, a whitespace-only query shows everything, the live line text. Refresh (S18): `router.refresh()` once on mount, again when the tab becomes visible and not when hidden, never after unmount, and the typed query kept across new props. |
| `app/(protected)/my-tasks/page.test.tsx` | The session is verified, E21 is read with `?assignee=me`, the page renders the groups, a read failure throws, a missing session redirects. Rev 2: a response without `column_name` or `is_done` throws to the error boundary. The test data of this file, `lib/server/tasks.test.ts` and `MyTasks.test.tsx` gain the two fields. |
| `components/shared/AppHeader.test.tsx` (extended) | Both links render, `aria-current` on `/`, `/boards/x` and `/my-tasks`, both have `min-h-11`, the nav has the classes that show it below 1024 px (`order-last`, `basis-full`) and no `hidden` on the nav. |
| `lib/boardChip.test.ts`, `components/boards/BoardList.test.tsx` | The same board ID gives the same chip class in both places. |

### Browser checks (V07, V11)

- `evidence/my-tasks-search-mobile-measure.mjs` in the style of `evidence/comments-mobile-measure.mjs`. `/my-tasks` with tasks on two boards and with none, the board page with the search in idle, loading (delayed), results, 20 results, no results and error, and the header at each width. At 320, 375, 768 and 1280 px. Checks: `scrollWidth <= innerWidth` for the page (the Kanban region may scroll), every interactive box at least 44 by 44 CSS px with `elementFromPoint` at the center (the field, Retry, a result, a task row and both AppHeader links), a 16 px font on the field, and at both 320 and 375 px: Boards and My tasks reachable, each link at least 44 by 44 CSS px, no horizontal overflow caused by the header, and no overlap of the sticky bar over the content (the first content element starts at or below the bottom of the bar, and an anchor or focus jump is not hidden under it) (Q6).
- Screenshots at 375, 768 and 1280 px beside the record (FE-D9). The record says emulator or real device.
- A manual journey at 375 px: open My tasks from the top bar, follow a board link, type a query, see results, open a card from a result, clear the query, a no-result query, rename the card and see the result follow it.
- A late-response check in the browser by delaying one request, and the validation check through the real handler with `curl` (repeated `q`, unknown key, blank `q`, `q=%00`) against the dev server.
- Timing: 30 sequential E22 and 30 sequential E21 requests on a board of 100 cards, with raw timings and conditions, compared with the 800 ms reference (Requirement 8.9).
- (Rev 2) `evidence/my-tasks-search-mobile-measure.mjs` is extended, not replaced, with a done row, an open row, a row with an 80-character column name, a matching query and a no-match query on `/my-tasks` at 320, 375, 768 and 1280 px. It also checks that typing sends no request (a `fetch` and network counter stays at zero), the 44 px boxes and 16 px font of the field and the clear button, and that every badge stays inside its row. Revision 2 files are named so the Revision 1 files stay (`my-tasks-search-mobile-rev2.json`, `my-tasks-search-screenshots-rev2/`).
- (Rev 2) A manual journey at 375 px: open My tasks, see done and open badges, type part of a title, see the summary change, type text that matches nothing, clear it, then mark a card done on its board, return through the "My tasks" link and through the browser Back button, and record whether the green badge shows in each case and after a reload.
- The V10 Playwright journey is delivered in T15. (Rev 2: the Playwright My Tasks step is not added here, as with Revision 1. Real-device checks stay open.)

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
13. **Status matches the column (Rev 2).** For every table of cards across columns (Done and not Done, renamed, moved), each E21 item's `column_name` and `is_done` equal the current name and flag of the column that holds the card, and the badge shows done if and only if `is_done` is true (Requirements 9.1 to 9.3, 9.6).
14. **Filter (Rev 2).** For any task list and query, `filterTasks` returns the tasks whose title contains the trimmed query case-insensitively as a literal substring, in the input order, returns the input for an empty trimmed query, and never reads another field. The shown groups are those of the returned tasks, in the API order (Requirements 10.2 to 10.4, 10.6).
15. **No request from search (Rev 2).** Typing, filtering and clearing call no `fetch` and no route (Requirements 4.7, 10.2).

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
| 9 (task status, Rev 2, AC06.2) | `GET /api/cards` item · `my_tasks`, `TaskItemSchema`, `parseTaskItem`, `BaseBadge`, `TaskGroup` | WP-R2-B, WP-R2-F | V07 `test_my_tasks.py`, `tasks.test.ts`, `MyTasks.test.tsx`, property 13, V11 measured |
| 10 (My Tasks search, Rev 2, AC06.2) | `MyTasks`, `filterTasks`, `titleMatches` | WP-R2-F | RTL, `tasks.test.ts`, properties 14, 15, V11 measured, manual journey |

Work packages: **WP-B1** `load_query_args`, schemas, `my_tasks`, `search_cards`, routes, the fixture. **WP-B2** backend tests and the cleanup sentinel. **WP-F1** types, parsers, `FLASK_PATHS`, the `search` option, the Next handler, the client allowlist, `getMyTasks`. **WP-F2** `lib/cardSearch.ts` and `useCardSearch`. **WP-F3** `MyTasks`, `TaskGroup`, the page, `CardSearch`, `boardChip`. **WP-F4** `KanbanBoard` wiring. **WP-F5** `AppHeader`. **WP-V** the measured mobile check, the manual journey and the timing record. **WP-D** documentation.

Revision 2 work packages: **WP-R2-B** E21 `column_name` and `is_done` (service, schema, `test_my_tasks.py`). **WP-R2-F** `TaskItem` type and parser, `filterTasks`, `BaseBadge` `success`, `TaskGroup` badge and label, `MyTasks` search and states, their tests and the fixtures that build a `TaskItem`. **WP-R2-V** the measured mobile check, the manual journey, the evidence, the documentation (README, changelogs, traceability). **WP-R2-D** the shared contract documents (C42).

### Dependencies and gates

Revision 2 gates: **B2** the backend E21 checks pass before the frontend parser requires `column_name` and `is_done` (WP-R2-B before WP-R2-F). **C2** the full backend and frontend suites, lint, typecheck and `next build` pass before the measured mobile record is final. **D2** Revision 2 is recorded complete only after B2, C2 and the measured check pass. The frontend and Flask must ship together, because the parser throws on a missing key (Risks).

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

| C42 (Rev 2) | The E21 item gains `column_name` (the current name of the column that holds the card) and `is_done` (that column's Done flag), read in the same statement as the card. Additive: no path, method, parameter, error, filter, sort or existing field changes. Search on My Tasks is local and adds no API (S12, S14). | `docs/API.md` (E21 row and "E21 item" shape), `backend/specs/api-contract.md`, `frontend/specs/api-integration.md`, `frontend/specs/pages-and-components.md` (`/my-tasks` row), `specs/requirements.md` AC06.2, `specs/design.md` D6, `specs/traceability.md`, `docs/TEST-PLAN.md` V07 and V11, `docs/DEPLOYMENT.md` (deploy Flask before the frontend for this change), `guidelines/frontend.md` (component table: `BaseBadge` `success`), `specs/CHANGELOG.md`. Applied at finalize, after the task plan is approved. |

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

### Revision 2 review items (for approval)

S12–S17 are the approved decisions. These are design choices the requirements left open:

| ID | Choice | Default in this design | Alternative |
|---|---|---|---|
| R1 | The summary when a query matches nothing | "0 of 3 tasks" without the boards part (DD20). Requirement 10.6 says "on <shown boards> boards", which would read "on 0 boards". | Keep the sentence as written, "0 of 3 tasks on 0 boards". |
| R2 | Where the "Clear search" button lives | In the no-match panel only. The browser's native clear (`type="search"`) covers the rest. | Also a permanent clear button inside the field. It adds a control and an overlap with the native one. |
| R3 | State holder | `MyTasks` itself becomes the client component (DD17). The page file does not change. | A new client wrapper `MyTasksView` around a props-only `MyTasks`. More files, same behavior. |
| R4 | Long column names | The badge wraps inside the row, capped at 45% of the row (DD15). | Truncate with an ellipsis and a `title`. Hides the status text on a phone, where there is no hover. |
| R5 | Row accessible name | `"<title>, <board name>, <column name>"` (DD14). | Keep the Revision 1 name and add `aria-describedby` to the badge. A longer path for the same result. |
| R6 | `BaseBadge` | One new `success` variant (DD15), a shared-part change recorded in `guidelines/frontend.md`. | A local `badge-success` class in `TaskGroup`. Bypasses the shared part (FE-D1). |

## Risks

| Risk | Handling |
|---|---|
| (Rev 2) Frontend and Flask ship out of step: a new frontend against an old Flask, or the reverse. | **Resolved by deploy order, with the parser kept strict.** Flask is deployed before the frontend, because an old frontend ignores the two new keys and keeps working, while a new frontend on an old Flask shows the error boundary (4.6). The parser does not default a missing `is_done` to false, because that would show a done task as open, which is the wrong answer this feature exists to prevent. The order is written into the T16 deployment runbook (`docs/DEPLOYMENT.md`) at finalize (WP-R2-D), and the local run uses both from one commit. Test: `lib/tasks.test.ts` proves the throw. |
| (Rev 2) A renamed Done column shows its new name, so "done" is not always the word "Done". | **Accepted, as S13 decided, and covered by a test.** The badge uses the board's own wording and the green check marks the done state in a second way. `MyTasks.test.tsx` renders a done task in a column named "Selesai" and expects `badge-success`, the check icon and the text "Selesai". |
| (Rev 2) A long column name or a narrow phone squeezes the title. | **Resolved by the 45% cap and wrapping (DD15), proven by test and measurement.** `MyTasks.test.tsx` renders an 80-character column name (the column limit) and expects the wrapping classes. The measured script checks `scrollWidth <= innerWidth` and the badge inside its row at 320 and 375 px with that name. |
| (Rev 2) The status is as of the page load, so a card moved on the board might look stale on My Tasks. | **Resolved by DD22 (S18) after the journey showed a stale badge on Back.** The page refreshes on mount and when the tab becomes visible. The note below is the earlier reasoning, kept as the record: **accepted for an open page, checked for navigation.** The page is dynamic (it reads the session cookie), and Next 16 does not reuse a dynamic page from the client router cache on a link visit. The manual journey (Browser checks) now moves a card to Done on its board and returns through the "My tasks" link and through the browser Back button, and records what each shows. If Back shows the old status, the evidence says so and the user decides whether a refresh on focus is wanted. No code is added for it now. |
| The sort by `lower(name)` follows the database collation, so mixed-script names can order differently from Python. | The sort is stable and deterministic (the board ID breaks ties). The tests use ASCII names. |
| An unbounded E21 list grows with the user's assignments. | Within the project's scale (no cap in v1, S1). Revisit if one user holds a few hundred cards. |
| A raw query string forwarded by the handler can be long. | Gunicorn rejects a request line above its limit with a non-JSON 400. The browser sends at most 100 units of `q`, so the normal path is far below it. The handler's reply for a non-JSON upstream body already maps to a typed error. |
| `ILIKE '%q%'` cannot use a plain index. | A board holds at most about 100 cards (NFR 1), and the scan is limited to one board's active cards by `ix_board_columns_board_order_id` and `ix_cards_column_order_id`. A trigram index is a later change if boards grow. |
| The taller sticky header on a phone covers content or pushes the board below the fold. | Sticky and in the flow, not fixed. Measured at 320 and 375 px, and the Kanban page keeps its own scroll region. |
| A held result opens a card whose current state differs from the response. | The modal opens from the live columns (S7), and a result is shown only while its live card exists (S8). |
| Selecting a result while the board is busy opens the modal while a move is pending. | Opening is read-only. The modal's Save and Delete keep going through the existing gate, so no new write path exists. Covered in `KanbanBoard.test.tsx`. |
| The handler forwards unknown keys on purpose, so a future key is forwarded too. | Flask rejects it (S3). The test in `cardSearchRoute.test.ts` pins this. |
