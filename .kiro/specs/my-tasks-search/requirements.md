# Requirements Document

## Introduction

This slice covers root task T11: the My Tasks read (E21), the board card search (E22), the `/my-tasks` page, the search control on the board page and the React and pytest tests for them. It implements AC06.2 and AC09.1 and the mobile criterion AC13.1 (FE-S4–S6) for every new page and control. Verification covers V07 (pytest and React Testing Library), V11 (375 px and wider, debounce and cleanup) and V10 (the Playwright journey, delivered in T15).

The kanban and comments slices already provide `authorize_board` (404 for a nonmember, C1), the error envelope, `token_required`, `parse_uuid`, the `cards.assignee_id` active index, the same-origin Route Handler helpers (`handlePrivateRead`), the server-only read helpers, the `useKanbanBoard` state, `CardDetailModal` and the shared UI parts. The database already holds every column this slice reads. No table, migration or dependency is added. `docs/API.md` already lists E21 and E22 and their item shapes, and no path, method, parameter name or response field changes.

Out of scope: pagination or a result total for E21 or E22, fuzzy or description search, search across boards, search history, filters, sorting controls, a deep link that opens a card from `/my-tasks` (S9), notifications (T13), analytics (T14) and profile editing (T12, which shares V07 but is a separate slice). Out of scope for Revision 2: a status filter or a "hide done" toggle, sorting by status, changing a card's status from My Tasks, a server-side search of E21 (no `q` parameter), a search that reaches descriptions, board names or other boards' cards, and keeping the My Tasks query in the URL (S14, S17).

Decisions S1–S11 were approved on 2026-11-14 with the clarifications recorded in "Approved decisions" at the end. Each is stated as a requirement below.

**Revision 2 (2026-11-20, requested by the user: "untuk page my task, bisa kah kamu tambahkan status per task nya? Misal, kalau sudah done ada badge 'done' agar kita bisa kelihatan yang mana belum done. Tambahkan juga search bar di page my task itu untuk search task user").** The first version (approved 2026-11-14, implemented and verified the same day) lists the tasks with a title and an excerpt only, so a Done task looks like an open one, and the page has no search. Revision 2 adds two things to the My_Tasks_Page:

- **Status per task (Requirement 9).** Each row shows a badge with the name of the column the card is in. A card in the Done column shows a distinct "done" badge, so open tasks are easy to tell from finished ones. This needs E21 to return the column name and its Done flag, an additive change to the E21 item. No path, method or parameter changes.
- **Search my tasks (Requirement 10).** A search field above the groups filters the tasks already loaded on the page. It sends no request and changes no API.

The sections below state the revised behavior. Requirements 1.6, 4.3, 4.4, 4.7, 7.1, 7.2, 7.6, 8.3 and 8.4 are amended in place and marked "(Rev 2)". Decisions S1–S11 keep their history in "Approved decisions"; S12–S17 are new. Work verified under Revision 1 stays verified for the behavior it proved.

## Glossary

- **My_Tasks_API**: The Flask handler for E21 (`GET /api/cards?assignee=me`), in the cards blueprint.
- **Search_API**: The Flask handler for E22 (`GET /api/boards/{id}/cards/search?q=...`), in the cards blueprint.
- **Participant**, **Admin**, **Member**, **Nonmember**, **Active_Board**: As defined in the boards-membership spec.
- **Active_Card**: A card with `deleted_at` null in a column with `deleted_at` null on an Active_Board. Defined in the kanban spec.
- **My_Task**: An Active_Card whose `assignee_id` is the caller, on a board where the caller is an active Participant.
- **Task_Item**: The wire shape of E21: `{id, column_id, title, description, assignee_id, assignee_name, order, board_id, board_name, column_name, is_done}` (Rev 2 adds `column_name` and `is_done`).
- **Task_Status**: The status of a My_Task. It is the card's current column: `column_name` is the column's name and `is_done` is that column's Done flag. A task is "done" when `is_done` is true and "open" otherwise.
- **Status_Badge**: The label on a My_Tasks_Page row that shows the Task_Status.
- **Task_Search**: The client search field on the My_Tasks_Page and the filter it applies to the loaded Task_Items.
- **Task_Query**: The text in the Task_Search field. Its normalized form is the text trimmed.
- **Query_Rule**: `q` is text, trimmed, 1 to 100 characters.
- **Search_Result**: The wire shape of E22: `{id, title, column_id}`.
- **My_Tasks_Page**: The protected Server Component at `/my-tasks`.
- **Task_Group**: The block on the My_Tasks_Page that lists the My_Tasks of one board under a heading that links to that board.
- **Card_Search**: The client control on the Board_Page that holds the query field and the results.
- **Search_Hook**: The hook that debounces the query, aborts the previous request and ignores a late response.
- **Board_Page**, **Kanban_Board**, **Card_Detail_Modal**: As defined in the kanban and comments specs.
- **Test_Database**: The database named by `TEST_DATABASE_URL`.

## Requirements

### Requirement 1: List my assigned cards (E21)

**User Story:** As a signed-in user, I want one list of the cards assigned to me across my boards, so that I know what to work on next.

#### Acceptance Criteria

1. WHEN a signed-in user calls E21 with `assignee=me`, THE My_Tasks_API SHALL return 200 with every My_Task as a Task_Item, and no other card (AC06.2).
2. THE My_Tasks_API SHALL exclude a card that is soft-deleted, a card in a soft-deleted column, a card on a soft-deleted board, a card assigned to another user, an unassigned card, and a card on a board where the caller has no active membership, even when the card still names the caller. It SHALL include a card in the Done column (S2).
3. THE My_Tasks_API SHALL return the Task_Items sorted by board name (case-insensitive), then board ID, then the column order, then the card order, then the card ID, so that cards of one board are adjacent and the order is the same on every call (S1). The page keeps this order when it groups the cards (Requirement 4.1).
4. THE My_Tasks_API SHALL NOT paginate or cap the E21 list in v1 (S1).
5. WHILE the caller has no My_Task, THE My_Tasks_API SHALL return 200 with an empty list.
6. THE My_Tasks_API SHALL return only the documented Task_Item fields (Rev 2: the Revision 1 fields plus `column_name` and `is_done`, Requirement 9.1). `assignee_name` SHALL be the assignee's current name, `board_name` the board's current name and `column_name` the card's current column name.
7. IF `assignee` is missing, is repeated, or has a value other than `me`, THEN THE My_Tasks_API SHALL return 400 `VALIDATION_ERROR` with `fields.assignee`. IF the request carries any other query parameter, THEN THE My_Tasks_API SHALL return 400 `VALIDATION_ERROR` with the standard message "Check the submitted fields." and no field entry for the unknown parameter. In every case it SHALL read no card (S3).
8. WHEN an Admin removes the caller from a board, THE My_Tasks_API SHALL stop returning the cards of that board at once, without relying on the assignment clearing of E12.

### Requirement 2: Search the cards of a board (E22)

**User Story:** As a participant, I want to find a card on a busy board by its title, so that I do not scan every column.

#### Acceptance Criteria

1. WHEN a Participant calls E22 with a `q` that meets the Query_Rule, THE Search_API SHALL return 200 with the Active_Cards of that board whose title contains the trimmed `q`, compared case-insensitively, as Search_Results (AC09.1).
2. THE Search_API SHALL treat `%`, `_` and `\` in `q` as literal characters, so that a search for `50%` matches only titles that contain `50%` and a search for `_` does not match every title (D6).
3. THE Search_API SHALL return at most 20 Search_Results, in board order: the column order, then the card order, then the card ID (S4). It SHALL NOT return a total, and SHALL NOT return a card of another board, a soft-deleted card or a card in a soft-deleted column.
4. WHILE no card title matches, THE Search_API SHALL return 200 with an empty list.
5. IF `q` is missing, is blank or whitespace-only, is longer than 100 characters after trimming, contains a NUL character or is repeated, THEN THE Search_API SHALL return 400 `VALIDATION_ERROR` with `fields.q`. IF the request carries any other query parameter, THEN THE Search_API SHALL return 400 `VALIDATION_ERROR` with the standard message "Check the submitted fields." and no field entry for the unknown parameter. In every case it SHALL run no search (S3).
6. THE Search_API SHALL return only the documented Search_Result fields and SHALL NOT return the description, the assignee or any comment.
7. THE Search_API SHALL match the title only. A word that appears only in a description or a comment SHALL NOT produce a result.

### Requirement 3: Access, check order and read safety

**User Story:** As a board admin, I want the two reads to respect board access, so that nobody learns about a board they cannot open.

#### Acceptance Criteria

1. THE Search_API SHALL check in this order: authentication (401), the path ID and the query (400, before any database lookup), then board access (404). THE My_Tasks_API SHALL check authentication (401) and then the query (400).
2. THE Search_API SHALL return the same 404 `NOT_FOUND` envelope for a missing board, a soft-deleted board, a Nonmember and a removed member, and for a board ID that is a well-formed UUID the caller cannot see (C1). Any Participant, Admin or Member, may search.
3. THE My_Tasks_API and THE Search_API SHALL be read-only. They SHALL write no row, record no event, create no notification, take no Board_Lock and leave every `position_version` unchanged (S5).
4. THE My_Tasks_API and THE Search_API SHALL require a valid bearer token and add `Cache-Control: private, no-store` to every E21 and E22 response, success and error.
5. THE slice SHALL keep every path, method, parameter name and response shape in `docs/API.md` unchanged. The behavior that the contract leaves open SHALL be recorded as contract clarifications in the design, `docs/API.md` and `specs/CHANGELOG.md`: the 400 rules and the strict query set (an unknown or repeated parameter is rejected, and a duplicate is not collapsed), the sort order of E21 and E22, the inclusion of Done cards, the literal wildcards and the C1 404 on E22.
6. IF a database read fails, THEN THE Flask error handlers SHALL return the sanitized 500 envelope and no partial list.

### Requirement 4: My Tasks page

**User Story:** As a signed-in user, I want a My Tasks page grouped by board, so that I can see my work and jump to the board that holds it.

#### Acceptance Criteria

1. WHEN a signed-in user opens `/my-tasks`, THE My_Tasks_Page SHALL verify the session, read E21 through the server-only helper and render the My_Tasks grouped by board, one Task_Group per board in the order the API returned (AC06.2, FE-C1, FE-A1).
2. THE Task_Group heading SHALL be the board name as a link to `/boards/<board_id>`. Each row SHALL show the card title and, when the card has a description, its first lines clamped to a short excerpt. Long titles and board names SHALL wrap (S9).
3. THE My_Tasks_Page SHALL show a summary of the number of tasks and boards, for example "3 tasks on 2 boards", using `tabular-nums` for the numbers (FE-D5). (Rev 2) WHILE the Task_Search filters the list, the summary SHALL show the number of shown tasks out of all tasks and the number of shown boards, for example "1 of 3 tasks on 1 board" (Requirement 10.6).
4. WHILE the caller has no My_Task, THE My_Tasks_Page SHALL show an empty state that says that no card is assigned and tells the user where assignments are made, for example "No cards are assigned to you. Cards assigned to you on any board appear here." (FE-D7). (Rev 2) The empty state SHALL NOT show the Task_Search, because there is nothing to search, and it SHALL stay different from the no-match state of Requirement 10.5.
5. THE My_Tasks_Page SHALL NOT open a card or pass a card ID to the board page. A row links to its board only (S9).
6. IF the E21 read fails, THEN THE My_Tasks_Page SHALL show the visible error state of the app error boundary, with a way to retry, and SHALL NOT show a partial list. IF the session is missing or revoked, THEN THE My_Tasks_Page SHALL redirect to `/login`, as the other protected pages do.
7. THE My_Tasks_Page SHALL send no token to the browser and make no client request. A user who reloads the page SHALL see the current assignments. (Rev 2) The Task_Search and the Status_Badge SHALL keep this: filtering is local, so typing sends no request, and a reload shows the current status and an empty Task_Search. (Rev 2, S18) The refresh of Requirement 9.6 is a Next.js server render request (`router.refresh()`), not a request to Flask from the browser, so no token reaches the browser.

### Requirement 5: Board search UI

**User Story:** As a participant, I want a search field on the board that finds a card as I type, so that I can open it without scanning the columns.

#### Acceptance Criteria

1. THE Board_Page SHALL show the Card_Search above the columns for every Participant. THE field SHALL have a visible label, such as "Search cards", `type="search"`, a 100-character limit and a text size of at least 16 px.
2. WHEN the user types, THE Search_Hook SHALL wait 300 ms after the last change before it sends E22 through a same-origin Route Handler, and SHALL send one request for the final text of a burst, not one per keystroke (AC09.1, S6).
3. THE Search_Hook SHALL send the trimmed text, and SHALL send no request while the trimmed text is empty or equal to the text of the last request. WHEN the trimmed text becomes empty, THE Search_Hook SHALL clear the results at once, without waiting for the debounce, cancel a running debounce timer and abort a pending request, and THE Card_Search SHALL show the idle state (S6).
4. WHEN a newer query starts, THE Search_Hook SHALL abort the earlier request, and SHALL ignore any response of an earlier query that still arrives, so that a slow earlier response cannot replace the results of a newer query (AC09.1). WHEN the Card_Search unmounts, THE Search_Hook SHALL abort its request and clear its timer.
5. THE Card_Search SHALL show five distinct states with different text: idle (an empty field shows no results and no message about results), loading, results, no results ("No cards match "<query>"."), and error (a message and a Retry control). A no-result state SHALL NOT look like the idle state (AC09.1).
6. WHILE the Card_Search shows results, THE Card_Search SHALL list each result with the card title and the name of its column. WHEN the response holds exactly 20 results, THE Card_Search SHALL add the line "Showing 20 results." with the number of results it currently shows, so one hidden result reads "Showing 19 results." WHEN every result is hidden, THE Card_Search SHALL show the no-result state and no count line (S4).
7. WHEN the user selects a result, THE Card_Search SHALL open the Card_Detail_Modal for that card from the current board state, not from the data of the E22 response, and the modal SHALL return focus to the result when it closes (S7). Because a result is shown only while the live board state holds its card (Requirement 5.9), a selected result always has a card to open.
8. THE Card_Search SHALL NOT use the Kanban gate. A pending search SHALL NOT disable a card move, an edit or a comment, and a pending move SHALL NOT disable the search (S8).
9. THE Card_Search SHALL resolve every returned card ID against the live board state and show the card's current title and current column. It SHALL omit a result whose card the board state does not hold (deleted, or the board refetched without it) and a result whose current title was edited and no longer contains the trimmed query, compared case-insensitively. A result whose title is unchanged since the response SHALL stay, because the server matched it (S8).
10. THE Card_Search SHALL derive the visible results from the live board state on every render and SHALL NOT remove a hidden result from the held response. WHEN a failed delete is rolled back and the card returns to the board state, its result SHALL reappear. A card that begins to match the query after a rename SHALL appear only after the next search request (S8).
11. IF E22 returns 404, THEN THE Card_Search SHALL follow the board-access outcome of the existing board 404 handling (access toast and redirect to the dashboard). IF E22 returns 401, THEN THE app SHALL clear the session and go to `/login`, as for other private requests. IF E22 returns 400, THEN THE Card_Search SHALL show the field message and not retry. IF E22 returns 5xx or fails in transport, THEN THE Card_Search SHALL show the error state with Retry and keep the typed text.
12. THE results SHALL be exposed as a list. THE count of results or the no-result and error messages SHALL be available as text in a live region. Search results SHALL render as plain text, never as HTML.

### Requirement 6: Navigation and the shared shell

**User Story:** As a user on any screen size, I want a visible way to reach My Tasks, so that I do not type the address.

#### Acceptance Criteria

1. THE AppHeader SHALL show a "My tasks" link next to "Boards". The current page SHALL have `aria-current="page"`: "Boards" on `/` and `/boards/*`, "My tasks" on `/my-tasks` (FE-D2, FE-D6).
2. WHILE the viewport is below 1024 px, THE AppHeader SHALL show the same two links in the top bar, in a row that wraps and does not widen the page. The navigation is hidden there today, so this slice SHALL change the shell and record it in the frontend guideline and the design (S10). THE evidence SHALL show both links reachable and measured at 44 by 44 CSS px with no horizontal overflow at the 375 px viewport and at 320 px, and the header SHALL cause no horizontal overflow and SHALL NOT overlap the content below it.
3. THE new links SHALL use a tappable area of at least 44 by 44 CSS px and keep a visible focus ring (FE-S3, FE-S5).
4. THE slice SHALL add no color, font or second accent (FE-D1).

### Requirement 7: Mobile and accessible UI

**User Story:** As a user on a phone, I want to see my tasks and search a board at 375 px and wider, so that I can run the core flow on mobile.

#### Acceptance Criteria

1. WHILE the viewport is 375 px wide or wider, THE My_Tasks_Page, the Card_Search and the new header links (Rev 2: and the Status_Badge and the Task_Search) SHALL show no horizontal page scroll. Long card titles, descriptions and board names SHALL wrap (`break-words`, `min-w-0`) and SHALL NOT widen the page. Only the Kanban column region scrolls sideways (FE-S2, FE-S4). Pinch zoom SHALL stay enabled.
2. THE search field, the Retry control, each result, each My Tasks link and both AppHeader links SHALL render with a box of at least 44 by 44 CSS px, confirmed with `elementFromPoint` at the center, and the field SHALL use a 16 px font so that iOS Safari does not zoom (FE-S5). (Rev 2) The same applies to the Task_Search field and its clear control. The Status_Badge is a label, not a control, and has no target size (as `BaseBadge` today).
3. THE new screens SHALL follow the Visual Design System (FE-D1 to FE-D9): `.surface` panels never nested, Figtree type, daisyUI semantic colors, sentence case, the page pattern of FE-D4 (title, summary strip, content), `BaseButton`, `FormField` where a field is needed, and `tabular-nums` for counts. The Task_Group heading SHALL use the board chip color from the board ID, as FE-D6 requires.
4. WHEN a user on a 375 px viewport opens `/my-tasks`, follows a board link, types a query on the board, sees results and opens a card from a result, THE flow SHALL be completable with touch and without hover.
5. WHEN a user types in the field with a keyboard, THE user SHALL be able to reach the results with Tab, select one with Enter or Space and return focus to the field or to the result when the modal closes.
6. WHEN this slice is handed off, THE evidence log SHALL record a screenshot and measured check at 320, 375, 768 and 1280 px for `/my-tasks` (with tasks, with none, and in Rev 2 with open and done badges, with a query that matches and with a query that matches nothing) and for the board page with the search in each of its five states, whether the browser was an emulator or a real device, and the manual journey of My Tasks, board link, search, result, open card, empty query and a no-result query.

### Requirement 8: Browser handlers, client allowlist and verification

**User Story:** As a reviewer, I want the token to stay server-side and the checks to be honest about what ran.

#### Acceptance Criteria

1. WHEN the browser searches a board, THE Next.js app SHALL use the same-origin Route Handler `GET /api/boards/[id]/cards/search`, which requires a UUID board ID, forwards only to the fixed E22 path with the session token from the HttpOnly cookie, and forwards the query string unchanged, so a repeated or unknown parameter reaches Flask and Flask returns the 400 (S3, S11). The handler SHALL NOT validate, drop, merge or reorder parameters. It returns `Cache-Control: private, no-store`, clears the cookie on 401 and passes through the upstream status and error code.
2. THE My_Tasks_Page SHALL read E21 through a server-only helper (`FLASK_PATHS` gains the E21 and E22 route keys). No browser Route Handler for E21 is added in v1 (S11). A path with a non-UUID segment SHALL throw before `fetch`.
3. THE client parsers for E21 and E22 SHALL copy only the documented fields and throw a typed `ApiError` on any other shape, as the existing parsers do (FE-A1). (Rev 2) The E21 parser also copies `column_name` (a string) and `is_done` (a boolean) and throws on a missing key or another type.
4. WHEN V07 runs on the backend, THE pytest suite SHALL cover (Rev 2: `column_name` and `is_done` in every Task_Item, true for a Done column and false for another, and the Done column renamed or flagged by an Admin shown with its current values on the next read) E21 with 200 (success), 400 (missing, repeated or other `assignee`, an unknown parameter alone and beside a valid `assignee`), 401 (no authentication) and the empty list. It SHALL cover a card in the Done column as included, and a card in a soft-deleted column and a soft-deleted card as excluded. It SHALL cover the exclusions of Requirement 1.2 one by one with seeded data on two boards and two users, the inclusion of a Done card, the sort order, removal from a board, the response allowlist, no write and no event, and `Cache-Control`.
5. THE pytest suite for E22 SHALL cover 200 (success, no match), 400 (missing, blank, whitespace, 101 characters, a NUL character, repeated, an unknown parameter alone and beside a valid `q`), 401, 404 (nonmember, removed member, missing and soft-deleted board, other-board card never returned), case-insensitive matching, literal `%`, `_` and `\`, title-only matching, the cap of 20 with 21 matching cards (the 20 returned follow board order, the card ID breaks ties), the order, the allowlist, no write and no event, the check order, and `Cache-Control`.
6. WHEN V07 and V11 run on the frontend, THE Vitest and React Testing Library tests SHALL cover the Search_Hook with fake timers (a burst sends one request after 300 ms, no request below 300 ms, no request for blank text, a cleared field cancels the timer and the request, an earlier slow response cannot overwrite a later one, unmount aborts), the Card_Search states (idle, loading, results, no results, error with Retry, the 20-result line, the removed-card case), the My_Tasks_Page (groups, order, empty state, error state, board links), the AppHeader links and `aria-current`, the Route Handler (valid request, bad ID, 401 clears the cookie, no token in the response, and a repeated `q`, an unknown parameter, a blank `q` and a `%00` (NUL) `q` forwarded to Flask unchanged, with the Flask 400 passed through), the live-state result rules (a rename that no longer matches hides the result, a rename that still matches shows the new title, a card moved to another column shows the new column, a delete hides the result and a rolled-back delete restores it, and a card that begins to match appears only after a new search), the `Showing 20 results.` line, the late-response guard with two deferred requests that resolve out of order, and the parsers, by asserting rendered text, roles and the requests sent, not only that a component mounts.
7. Database-writing tests SHALL write only to the Test_Database (`TEST_DATABASE_URL`, through `db_guard` and `BoardTracker`) and clean up automatically the records created by each run, even when assertions fail. They SHALL remove only the data that run created, and a sentinel untracked board with an assigned card SHALL survive the cleanup.
8. THE slice SHALL use the existing test stack: parameterized pytest, Vitest and React Testing Library. The automated Playwright journey (V10) is delivered in T15.
9. THE evidence SHALL record a measured timing of E22 and E21 on a board of 100 cards (30 sequential requests from one client, with the conditions and the raw timings). The brief's p95 target of 800 ms (NFR 1) is the reference value. It is a recorded measurement and not a new pass-or-fail gate for T11.
10. WHEN the slice is handed off, THE documentation SHALL record the status in `specs/traceability.md`, the README, the changelogs and the evidence log, with real-device checks and Playwright left open where they have not run.

### Requirement 9: Task status on My Tasks (Revision 2)

**User Story:** As a signed-in user, I want each of my tasks to show its status, so that I can see which tasks are done and which are not.

#### Acceptance Criteria

1. THE My_Tasks_API SHALL add two fields to each Task_Item: `column_name`, the current name of the column that holds the card, and `is_done`, that column's Done flag. It SHALL read them in the same query and snapshot as the card, with no extra read. No path, method, query parameter, error, filter, sort order or existing field changes (S12).
2. THE My_Tasks_Page SHALL show one Status_Badge on every task row. The badge text SHALL be the `column_name`, so a board with its own column names shows its own words (S13).
3. WHEN `is_done` is true, THE Status_Badge SHALL use the success style and a check icon, so that a done task is easy to see. WHEN `is_done` is false, THE Status_Badge SHALL use the neutral ghost style with no icon. The state SHALL NOT depend on color alone: the badge text is always present, and the icon marks done in a second way. The success color is the daisyUI semantic `success`, so no new color is added (FE-D1, S13).
4. THE row's accessible name SHALL include the status, in the form "<title>, <board name>, <column name>", because an `aria-label` replaces the row content and would otherwise hide the badge from a screen reader. The badge SHALL NOT be a control and SHALL NOT take focus.
5. THE Status_Badge SHALL NOT shrink or push the title out of its row: it SHALL keep its text on one line where it fits, SHALL wrap a long column name inside the row and SHALL NOT widen the page at 320 or 375 px (FE-S4). THE badge SHALL show in the Task_Group order and SHALL NOT change the order of the tasks (S1).
6. WHEN an Admin renames a column, moves the card, or changes the Done flag, THE next read of E21 SHALL return the new `column_name` and `is_done`. THE My_Tasks_Page SHALL ask the server for fresh data (`router.refresh()`) when it mounts and when the browser tab becomes visible again, so a render that the browser Back button restored from the router cache is replaced by the current status without a reload (S18). The refresh keeps the typed Task_Query.
7. THE feature SHALL NOT change a card's status from My Tasks. The row stays a link to its board (S9), so the user changes the status by moving the card on the board.

### Requirement 10: Search my tasks (Revision 2)

**User Story:** As a signed-in user with many assigned cards, I want to search my tasks by title, so that I find one without scrolling through every board.

#### Acceptance Criteria

1. WHILE the caller has at least one My_Task, THE My_Tasks_Page SHALL show the Task_Search above the groups, below the page title. THE field SHALL have a visible label, such as "Search my tasks", `type="search"`, a 100-character limit and a text size of at least 16 px (S14).
2. THE Task_Search SHALL filter the Task_Items already loaded on the page. It SHALL send no request, call no E21 or E22 route, and need no debounce, so the list updates on every change of the Task_Query (S14, S15).
3. THE filter SHALL keep a task whose title contains the normalized Task_Query, compared case-insensitively as a literal substring. It SHALL treat `%`, `_`, `\`, `*` and other characters as literal text. It SHALL match the title only, never the description, the board name or the status (S14).
4. WHILE the normalized Task_Query is empty, THE My_Tasks_Page SHALL show every task, as Revision 1 does, and a whitespace-only query SHALL count as empty (S15).
5. WHEN a Task_Query matches no task, THE My_Tasks_Page SHALL show a no-match state with the text `No tasks match "<query>".`, with a control that clears the query. It SHALL differ in text from the empty state of Requirement 4.4, which stays for a user with no task, and SHALL keep the Task_Search visible so the user can edit the query (S16).
6. THE My_Tasks_Page SHALL show only the matching tasks and SHALL hide a Task_Group with no matching task. It SHALL keep the API order of groups and of tasks (S1). The summary SHALL read "<shown> of <all> tasks on <shown boards> boards" while a query filters and "<all> tasks on <boards> boards" otherwise, with `tabular-nums` and correct singular forms (FE-D5, S16).
7. THE number of tasks and the no-match message SHALL be available as text in a live region, so a screen reader hears the result of a change. The filtered tasks SHALL render as plain text, never as HTML.
8. THE Task_Query SHALL live in client state only. It SHALL NOT go into the URL, a cookie or storage, and a reload or a visit through a link SHALL show an empty field and the full list (S17).
9. THE clear control SHALL empty the field, return focus to it and restore the full list. THE field's own native clear control, where a browser adds one, SHALL do the same.
10. THE Task_Search and the filter SHALL work at 375 px and wider with no horizontal page scroll, with the field and the clear control at least 44 by 44 CSS px and a 16 px field font (FE-S5, Requirement 7). A user SHALL be able to type, reach every row link with Tab, and clear the query with the keyboard.

## Approved decisions

The user approved S1–S11 on 2026-11-14. The table records the outcome and the clarification the user added.

| ID | Decision | Outcome | Where |
|---|---|---|---|
| S1 | E21 scope and order | Approved. All active tasks assigned to the signed-in user on boards they can currently access, unpaginated. Sort by case-insensitive board name, board ID, column order, card order and card ID. The page keeps that order when it groups. | 1.1, 1.3, 1.4, 4.1 |
| S2 | Done cards | Approved. Include active cards in the Done column. Exclude soft-deleted cards and cards in soft-deleted columns. | 1.2 |
| S3 | Query strictness | Approved. A missing, repeated, invalid or unknown query parameter returns `400 VALIDATION_ERROR`, with `fields.assignee` or `fields.q` for the known parameters and the standard message for an unknown one. `q` is trimmed and checked at 1 to 100 characters. The Next.js E22 handler preserves duplicate and unknown parameters so Flask validates them. | 1.7, 2.5, 8.1 |
| S4 | Search order and cap | Approved. Up to 20 matches in board order with the card ID as tie-breaker. At 20 results the UI shows "Showing 20 results." A board of 100 cards is a performance measurement target. | 2.3, 5.6, 8.9 |
| S5 | Read-only | Approved. No board write lock, event, notification or `position_version` update. | 3.3 |
| S6 | Debounce | Approved. 300 ms. Results clear at once when the query becomes blank. Superseded requests are aborted and a late response cannot overwrite the current results. | 5.2–5.4 |
| S7 | Open from a result | Approved. Selecting a result opens the existing Card_Detail_Modal from the current card state. | 5.7 |
| S8 | Search and the board gate | Approved. Search is independent of the Kanban gate. Returned IDs are resolved against the live board state. The current title and column show. A card that is gone, or whose edited title no longer matches, is omitted. Visibility derives from live state, so a rolled-back delete restores a result. A newly matching card appears on the next search. | 5.8–5.10 |
| S9 | My Tasks row link | Approved. Both the task row and the group heading link to the board. Card deep links stay outside this slice. | 4.2, 4.5 |
| S10 | Mobile navigation | Approved. Boards and My tasks are reachable at every width. Below 1024 px the AppHeader shows them in the wrapping row. Both links are verified at 375 px with 44 by 44 CSS px targets and no horizontal overflow. | 6.1–6.3, 7.2 |
| S11 | Browser reads | Approved. E21 is read by the Server Component through the server-only helper. E22 goes through a same-origin GET handler. The existing board access rules apply, including the generic 404 for a nonmember (C1). | 3.2, 8.1, 8.2 |

### Revision 2 decisions (approved 2026-11-20)

S12 and S14 follow the user's request directly. The rest were defaults chosen to complete the draft. The user approved all six as written in chat on 2026-11-20 ("approve and write design.md"). The alternatives are kept as the record.

| ID | Decision | Default in this draft | Alternative | Where |
|---|---|---|---|---|
| S12 | Where the status comes from | The status is the card's column. E21 adds `column_name` and `is_done` to each item (additive; the query already joins `board_columns`). This is a shared-contract change (E21 item, `docs/API.md`, API specs). | A frontend-only status would need a second request per board and would break the "no client request" rule (4.7). Not recommended. | 1.1, 1.6, 9.1 |
| S13 | Badge content and style | Every row shows a badge with the column name. A Done column (`is_done`) is success-colored with a check icon. Other columns are ghost. | (a) Fixed text "Done" for a done task, whatever the column is called. (b) Badge only on done tasks, none on open ones. (a) hides the board's own wording and (b) shows no status for open work. | 9.2, 9.3 |
| S14 | Search scope | Local filter of the loaded tasks, by title only, as the board search does (S3 of Rev 1 uses titles). No API change and no `q` on E21. | Also match description or board name. More hits, but a board name match shows a whole group and a description match is harder to explain. | 10.2, 10.3 |
| S15 | Matching rules | Trimmed, case-insensitive literal substring, 100 characters, no debounce (it is local and instant). Blank means no filter. | A 300 ms debounce like E22: not needed without a request. | 10.3, 10.4 |
| S16 | Result and empty states | Hide groups with no match. Summary "1 of 3 tasks on 1 board". A no-match state with a clear control. The field is hidden when the user has no task at all. | Show the empty groups with a "no match" line. More noise on a long list. | 4.3, 4.4, 10.5, 10.6 |
| S17 | Query persistence | Client state only, not in the URL. A reload clears it. | `?q=` in the URL so a filtered list can be bookmarked. It needs the Server Component to read `searchParams` and a router update per change. More code for a personal list. | 10.8 |

### Revision 2 follow-up decision (2026-11-20)

| ID | Decision | Outcome | Where |
|---|---|---|---|
| S18 | Stale status after the Back button | The user asked for the fix ("A refresh when the page becomes visible would fix it. => you can do it."). `MyTasks` calls `router.refresh()` on mount and on `visibilitychange` to visible. Visibility alone would not fix Back inside the app, because Back does not change visibility, so the mount refresh is what fixes Back and the visibility refresh covers a tab left open. Cost: one extra E21 read per visit. | 4.7, 9.6 |

## Revision 2 scope notes

- **Files expected to change (for design, not edited here):** `backend/app/blueprints/cards/service.py` (`my_tasks`) and `schema.py` (`TaskItemSchema`), `frontend/lib/types.ts` (`TaskItem`), `frontend/lib/tasks.ts` (parser and a filter helper), `frontend/components/tasks/MyTasks.tsx` (becomes a client component with the query state; the page stays a Server Component) and `TaskGroup.tsx` (badge and accessible name), plus their tests, the shared documents (`docs/API.md` E21 row and the "E21 item" shape, `backend/specs/api-contract.md`, `frontend/specs/*`, `specs/requirements.md` AC06.2, `specs/traceability.md`, `docs/TEST-PLAN.md`) and the changelogs. No table, migration, dependency or new route.
- **Reuse:** `BaseBadge` (needs a `success` variant, or a `className`: a shared-part change to decide in design), `Icon` (has `check`), `FormField` (has the `search` type and `maxLength` from Revision 1), the board chip color and the existing `TaskGroup` markup.
- **Risk to flag:** the E21 parser throws on a missing key, so the frontend and backend must ship together. A frontend that expects `column_name` against an older Flask would show the error state of Requirement 4.6.

## Dependency note

The kanban slice is verified (root T07 to T09 are checked, `evidence/kanban-T07-T09.md`) and the comments slice is verified (T10, `evidence/comments-T10.md`). The prerequisite in `specs/FEATURE-QUEUE.md` is Kanban. No prerequisite blocks this slice.

Revision 2 edits working code. T11 is implemented and verified (`evidence/my-tasks-search-T11.md`; the Playwright journey passed locally in T15) and root T11 is checked in `specs/tasks.md`. The working tree was clean at the start of this revision (HEAD `dbc699c`). Root T11 stays checked while Revision 2 is open, with the open revision noted at finalize, as T12 does for its Revision 2.
