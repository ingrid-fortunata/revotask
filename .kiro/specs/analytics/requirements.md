# Requirements Document

## Introduction

This slice covers root task T14: the board analytics read (E29), the analytics panel on the board page and the pytest and React tests for them. It implements AC11.1 and the mobile criterion AC13.1 (FE-S4–S6) for the new panel. Verification covers V08 (pytest and React Testing Library), V11 (375 px and wider) and V10 (the Playwright journey, delivered in T15).

The kanban and comments slices already provide everything E29 reads. `board_events` is append-only, has the index `ix_board_events_board_occurred (board_id, occurred_at)` and a `kind` check that already allows `card_created`, `card_moved`, `column_reordered`, `comment_created` and `entered_done`. The write paths record those events in the same transaction as their change (E13–E20, E24). `authorize_board` returns the generic 404 for a nonmember (C1), and the error envelope, `token_required`, `parse_uuid`, the same-origin Route Handler helpers and the shared UI parts exist. No table, migration or dependency is added. `docs/API.md` already lists E29 with its response keys and the two item shapes. This slice keeps every path, method and key and records the behavior the contract leaves open as clarifications (Requirement 5.6).

Out of scope: a history of earlier weeks, a date range or week picker, a chart library, per-card or per-column drill-down, export, analytics across boards, real-time or polled updates, new event kinds (for example column create, rename or delete events), backfilling events, caching or a materialized aggregate, and an admin-only restriction (the brief gives analytics to every participant).

Decisions A1–A10 were approved on 2026-11-14 with the clarifications recorded in "Approved decisions" at the end. Each is stated as a requirement below.

> **Revision 2 (2026-11-18, sprint date range).** A board can have a sprint (`sprint_start`, `sprint_end`). When it does, the Week below is replaced by the Sprint_Window for Requirements 2, 3, 4 and 6.2 and A2, and E29 adds the key `window` (`"sprint"` or `"week"`). A board without a sprint keeps every criterion in this file unchanged. The rules are Requirements 8 and 9 of [boards-membership](../boards-membership/requirements.md) (C39–C41). The text below is kept as approved on 2026-11-14. "Out of scope: a date range" refers to a range chosen in the panel and stays out of scope. The range is now set on the board.

## Glossary

- **Analytics_API**: The Flask handler for E29 (`GET /api/boards/{id}/analytics`), in a new `analytics` blueprint.
- **Participant**, **Admin**, **Member**, **Nonmember**, **Active_Board**: As defined in the boards-membership spec.
- **Active_Card**, **Active_Column**: As defined in the kanban spec. A card or column with `deleted_at` null on an Active_Board.
- **Board_Event**: A row of `board_events` for the board.
- **Week**: The UTC calendar week that contains the moment the request is handled. It starts on Monday at 00:00:00 UTC, inclusive, and ends on the next Monday at 00:00:00 UTC, exclusive (A2).
- **Counted_Event**: A Board_Event of the kind `card_created`, `card_moved`, `column_reordered` or `comment_created` (A1). An `entered_done` event is not a Counted_Event.
- **Analytics_Result**: The wire shape of E29: `{week_start, week_end, cards_per_column, completed_cards, member_activity}`.
- **Column_Count**: `{column_id, name, count}`.
- **Activity_Count**: `{user_id, name, count}`.
- **Analytics_Panel**: The client component on the board page that shows the Analytics_Result.
- **Analytics_Hook**: The hook that reads E29 through the same-origin handler and holds its states.
- **Board_Page**, **Kanban_Board**: As defined in the kanban spec.
- **Test_Database**: The database named by `TEST_DATABASE_URL`.

## Requirements

### Requirement 1: Cards per column

**User Story:** As a participant, I want to see how many cards each column holds, so that I can see where work is piling up.

#### Acceptance Criteria

1. WHEN a Participant calls E29, THE Analytics_API SHALL return `cards_per_column` with one Column_Count for every Active_Column of the board, in board order (column order, then column ID), and `count` SHALL be the number of Active_Cards in that column (AC11.1, D6).
2. THE Analytics_API SHALL return `count` 0 for an Active_Column that holds no Active_Card. It SHALL return the Done column like any other column.
3. THE Analytics_API SHALL NOT count a soft-deleted card, and SHALL NOT list a soft-deleted column or the cards in it.
4. WHILE the board has no Active_Column, THE Analytics_API SHALL return an empty `cards_per_column` list, and the rest of the result SHALL still be returned.
5. THE Analytics_API SHALL count cards with a left join from the Active_Columns, with the active-card filter in the join condition, so that an empty column keeps its row with a count of 0 and a deleted card is not counted (D6).
6. THE Analytics_API SHALL count only the cards of the requested board.

### Requirement 2: Cards completed this week

**User Story:** As a participant, I want to know how many cards reached Done this week, so that I can see the team's progress.

#### Acceptance Criteria

1. THE Analytics_API SHALL return `completed_cards` as an integer: the number of distinct card IDs that have an `entered_done` Board_Event in the Week for the requested board and that are still active cards in an active Done column now (AC11.1, D6, A3).
2. WHEN one card has several `entered_done` events in the Week, for example after it left Done and entered it again, THE Analytics_API SHALL count that card once (A3).
3. THE Analytics_API SHALL NOT count a card that has an `entered_done` event in the Week but was soft-deleted later, was moved out of Done later, or sits in a column that was soft-deleted later or is no longer the Done column. The event history says the card completed in the Week, and the card's current place says it is still done (A3, revised 2026-11-17).
4. THE Analytics_API SHALL count a card created directly in the Done column, and a card moved into the Done column from a column that is not Done. A card moved from the Done column to the same Done column, or edited, assigned, commented on or deleted, SHALL NOT add a count (E17, E20).
5. THE Analytics_API SHALL NOT count an `entered_done` event that lies before the start or at or after the end of the Week, or that belongs to another board.
6. WHILE no card entered Done in the Week, THE Analytics_API SHALL return `completed_cards` 0.

### Requirement 3: Activity by member

**User Story:** As a participant, I want to see who did how much on the board this week, so that I can see how the work is shared.

#### Acceptance Criteria

1. THE Analytics_API SHALL return `member_activity` with one Activity_Count for every user who is the actor of at least one Counted_Event in the Week for the requested board. `count` SHALL be the number of that user's Counted_Events (AC11.1, A1).
2. THE Analytics_API SHALL NOT count an `entered_done` event in `member_activity`. A card created in Done therefore adds 1 (`card_created`) and a card moved into Done adds 1 (`card_moved`), while both still add to `completed_cards` (A1).
3. THE Analytics_API SHALL list a user who was removed from the board after acting in the Week, because the events happened. `name` SHALL be the user's current name (A4).
4. THE Analytics_API SHALL NOT list a user without a Counted_Event in the Week, including an active member with no activity, and SHALL return an empty list when the Week has no Counted_Event.
5. THE Analytics_API SHALL sort `member_activity` by `count` descending, then by lower-cased `name`, then by `user_id`, so the order is the same on every call (A4).
6. THE Analytics_API SHALL count the events of the requested board only, and SHALL NOT let the card join of Requirement 1 inflate the counts. It SHALL compute the three aggregates in separate statements, so that a column with many cards or a card with many events does not multiply another figure (D6).
7. THE Analytics_API SHALL return only the documented Activity_Count fields, and SHALL NOT return an email address or any other user field.

### Requirement 4: Week window

> Revision 2: applies to a board without a sprint. With a sprint, the window is the Sprint_Window (boards-membership Requirement 9.1–9.3). `week_start` and `week_end` keep their names and format.

**User Story:** As a participant, I want "this week" to mean the same thing for everyone, so that the numbers do not depend on a time zone.

#### Acceptance Criteria

1. THE Analytics_API SHALL return `week_start` and `week_end` as ISO 8601 UTC timestamps that end in `Z`, for example `2026-11-09T00:00:00Z` and `2026-11-16T00:00:00Z`. `week_start` is a Monday at 00:00:00 and `week_end` is exactly seven days later (A2).
2. THE Analytics_API SHALL treat an event at exactly `week_start` as inside the Week, and an event at exactly `week_end` as outside it, so each instant belongs to one Week only.
3. THE Analytics_API SHALL take the Week from the server clock in UTC when the request is handled, and SHALL NOT use the caller's time zone, a client-supplied date or a database session time zone.
4. WHEN a request arrives at 23:59:59 UTC on a Sunday, THE Analytics_API SHALL return the Week that ends at the next minute, and WHEN a request arrives at 00:00:00 UTC on the following Monday, THE Analytics_API SHALL return the new Week with its counts from 0 (A2).
5. THE tests SHALL fix the clock through one injectable time source and SHALL NOT depend on the real date.

### Requirement 5: Access, check order and read safety

**User Story:** As a board admin, I want analytics to respect board access, so that nobody learns about a board they cannot open.

#### Acceptance Criteria

1. THE Analytics_API SHALL check in this order: authentication (401), the path ID (400, a malformed UUID), the query (400), then board access (404) (A5).
2. THE Analytics_API SHALL accept no query parameter. IF the request carries any query parameter, THEN THE Analytics_API SHALL return 400 `VALIDATION_ERROR` with the standard message "Check the submitted fields." and no field entry, and SHALL read no board data (A5).
3. THE Analytics_API SHALL return the same 404 `NOT_FOUND` envelope for a missing board, a soft-deleted board, a Nonmember and a removed member (C1). Any Participant, Admin or Member, may read analytics (brief, role table).
4. THE Analytics_API SHALL be read-only. It SHALL write no row, record no event, create no notification, take no board lock and leave every `position_version` unchanged.
5. THE Analytics_API SHALL require a valid bearer token and add `Cache-Control: private, no-store` to every E29 response, success and error. IF a database read fails, THEN THE Flask error handlers SHALL return the sanitized 500 envelope and no partial result.
6. THE slice SHALL keep the path, method and response keys of E29 in `docs/API.md` unchanged. The behavior that the contract leaves open SHALL be recorded as contract clarifications (C34 onward) in the design, `docs/API.md` and `specs/CHANGELOG.md`: the exact week window and timestamp format, the four counted event kinds (`card_created`, `card_moved`, `column_reordered`, `comment_created`) listed in D6 and `docs/API.md`, with `entered_done` used for `completed_cards` only (A1), the distinct-card rule, the treatment of removed members and deleted cards, the sort orders, and the strict query rule.
7. THE Analytics_API SHALL return only the documented keys, `week_start`, `week_end`, `cards_per_column`, `completed_cards` and `member_activity`, and no event ID, card ID or comment text.

### Requirement 6: Analytics panel

> Revision 2: criterion 2 and the labels "this week" apply when `window` is `"week"`. When it is `"sprint"` the panel shows "Sprint 16 Nov to 22 Nov" (dates only, no local time) and "this sprint" labels (boards-membership Requirement 9.6–9.8).

**User Story:** As a participant, I want an analytics panel on the board, so that I can read the three figures without leaving the board.

#### Acceptance Criteria

1. THE Board_Page SHALL show the Analytics_Panel to every Participant, with the heading "Analytics" (AC11.1, A8).
2. THE Analytics_Panel SHALL show, as text, the Week as a date range with times in the viewer's local time zone ("Week of 9 Nov, 07:00 to 16 Nov, 07:00 (local time)"; the Week itself stays the UTC week of Requirement 4, only its two bounds are converted for display), the number of cards completed this week, one row per column with its name and card count, and one row per active member with name and action count (A9). A figure SHALL NOT be conveyed by length or color alone, so any bar is decorative and the number is always present.
3. WHILE the result has no column, THE Analytics_Panel SHALL show "No columns yet." in place of the column list. WHILE `member_activity` is empty, it SHALL show "No activity this week." The completed count SHALL show 0 when nothing was completed. An empty board SHALL show zeros or these empty states and no error (AC11.1).
4. THE Analytics_Hook SHALL read E29 through a same-origin Route Handler when the panel mounts, and SHALL show a loading state until the first response. It SHALL NOT use the Kanban gate, so a pending analytics read does not disable a card move, an edit or a comment, and a pending move does not disable the panel (A8).
5. WHEN a successful card or column create, move or delete by the user advances the Kanban `position_version` above the highest version the Analytics_Hook has read for, THE Analytics_Hook SHALL read E29 again, so the column counts match the board without a reload. A version that does not advance (an unchanged position, a rolled-back move, a refetch that returns the same version) SHALL NOT start a read. The panel SHALL also offer a "Refresh" button that reads E29 again. It SHALL NOT poll in this slice. A comment, or a change made by another user, appears after the next read (A8).
6. WHEN a newer read starts, THE Analytics_Hook SHALL abort the earlier request and SHALL ignore a late response of an earlier read, so a slow earlier response cannot replace newer figures. WHEN the board ID changes or the panel unmounts, it SHALL abort its request, drop the held figures and ignore any response for the earlier board (FE-A2, A8).
7. WHEN a refresh is running, THE Analytics_Panel SHALL keep showing the last figures and mark the panel busy, and SHALL NOT replace them with the loading state.
8. IF E29 returns 404, THEN THE Analytics_Panel SHALL follow the board-access outcome of the existing board 404 handling (access toast and redirect to the dashboard). IF E29 returns 401, THEN THE app SHALL clear the session and go to `/login`, as for other private requests. IF E29 returns 400, 5xx or fails in transport, THEN THE Analytics_Panel SHALL show an error message in the panel and a Retry control, keep the last good figures when it has them, and leave the rest of the board usable.
9. THE Analytics_Panel SHALL render every name as plain text, never as HTML.

### Requirement 7: Mobile and accessible UI

**User Story:** As a user on a phone, I want to read the analytics at 375 px and wider, so that I can use the core flow on mobile.

#### Acceptance Criteria

1. WHILE the viewport is 320 px wide or wider (375 px is the acceptance width), THE Analytics_Panel SHALL show no horizontal page scroll and stay usable. Long column names and member names SHALL wrap (`break-words`, `min-w-0`) and SHALL NOT widen the page. Only the Kanban column region scrolls sideways (FE-S2, FE-S4). Pinch zoom SHALL stay enabled.
2. THE "Refresh" and "Retry" controls SHALL render with a box of at least 44 by 44 CSS px, confirmed with `elementFromPoint` at the center (FE-S5).
3. THE panel SHALL follow the Visual Design System (FE-D1 to FE-D9): one `.surface` panel that is not nested in another, Figtree type, daisyUI semantic colors only, sentence case, `BaseButton`, section headings in `text-lg font-semibold`, and `tabular-nums` for every count. The slice SHALL add no color, font, second accent or dependency (FE-D1).
4. THE panel SHALL use a native heading, lists for the column and member rows, a live region for the loading, error and refreshed state, and a name for the Refresh and Retry controls. It SHALL keep a visible focus ring and SHALL work with a keyboard and with touch and no hover (FE-S3).
5. WHEN this slice is handed off, THE evidence log SHALL record a screenshot and measured check at 320, 375, 768 and 1280 px for the board page with the panel in its states (loading, figures, empty board, error), whether the browser was an emulator or a real device, and the manual journey: open a board, see the figures, complete and move a card, see the counts change, refresh (FE-S6, FE-D9).

### Requirement 8: Browser handler, client parsers and verification

**User Story:** As a reviewer, I want the token to stay server-side and the checks to be honest about what ran.

#### Acceptance Criteria

1. WHEN the browser reads analytics, THE Next.js app SHALL use the same-origin Route Handler `GET /api/boards/[id]/analytics`, which requires a UUID board ID, forwards only to the fixed E29 path with the session token from the HttpOnly cookie, and forwards the query string unchanged, so Flask returns the 400 for any parameter. It returns `Cache-Control: private, no-store`, clears the cookie on 401 and passes through the upstream status and error code. `FLASK_PATHS` gains the E29 route key and a path with a non-UUID segment throws before `fetch`.
2. THE client parser for E29 SHALL copy only the documented fields and throw a typed `ApiError` on any other shape, including a count that is not a non-negative integer, as the existing parsers do (FE-A1).
3. WHEN V08 runs on the backend, THE pytest suite SHALL cover E29 with 200, 400 (malformed ID, any query parameter), 401, 404 (nonmember, removed member, missing and soft-deleted board), the check order, and the response keys and allowlist. It SHALL cover with seeded data, on two boards and several users: zero columns, empty columns with count 0, a soft-deleted column and a soft-deleted card, the Done column listed, a board with many cards and many events whose figures are not inflated by the join, distinct completions (the same card entering Done twice, a card created in Done, a card deleted or moved out of Done after completing), the exclusion of `entered_done` from `member_activity`, a removed member's activity, the sort orders, events of another board and of earlier and later weeks, and no write, no event and no `position_version` change.
4. THE pytest suite SHALL cover the UTC week boundaries with a fixed clock: an event at `week_start` is inside, an event one microsecond before it is in the earlier week, an event at `week_end` is outside, a request on Sunday 23:59:59 and one on Monday 00:00:00, a year boundary, and the `week_start` and `week_end` format (Requirement 4).
5. WHEN V08 and V11 run on the frontend, THE Vitest and React Testing Library tests SHALL cover the Analytics_Hook with fake timers and deferred requests (a mount read, a refetch after a version change, no refetch without one, an earlier slow response cannot overwrite a later one, a response for an earlier board after a board switch is ignored, unmount aborts, a 404 follows the board-access outcome, an error keeps the last figures), a failed E29 that leaves the board usable (with E29 failing at mount and on a refetch, a card still moves, is added and is searched, the Kanban gate stays idle and the board shows no error state), the Analytics_Panel states (loading, figures, no columns, no activity, empty board with zeros, error with Retry, busy refresh), the Route Handler (valid request, bad ID, 401 clears the cookie, a query string forwarded unchanged with the Flask 400 passed through, no token in the response) and the parser, by asserting rendered text, roles and the requests sent, not only that a component mounts.
6. Database-writing tests SHALL write only to the Test_Database (`TEST_DATABASE_URL`, through `db_guard` and `BoardTracker`) and clean up automatically the records each run created, even when assertions fail. They SHALL remove only the data that run created, and a sentinel untracked board with events SHALL survive the cleanup.
7. THE slice SHALL use the existing test stack: parameterized pytest, Vitest and React Testing Library. The automated Playwright journey (V10) is delivered in T15.
8. THE evidence SHALL record a measured timing of E29 on a board of 100 cards with a week of events (30 sequential requests from one client, with the conditions and the raw timings). The brief's p95 target of 800 ms (NFR 1) is the reference value. It is a recorded measurement and not a new pass-or-fail gate for T14 (A10).
9. WHEN the slice is handed off, THE documentation SHALL record the status in `specs/traceability.md`, the README, the changelogs and the evidence log, with real-device checks and Playwright left open where they have not run.

## Approved decisions

The user approved A1–A10 on 2026-11-14. The table records the outcome and the clarification the user added.

| ID | Decision | Outcome | Where |
|---|---|---|---|
| A1 | What `member_activity` counts | Approved. Count `card_created`, `card_moved`, `column_reordered` and `comment_created`. Use `entered_done` only for `completed_cards`. Creating a card in Done or moving a card into Done adds one activity event. D6 and `docs/API.md` list the four counted kinds explicitly. | 3.1, 3.2, 5.6 |
| A2 | Week window and format | Approved. Server clock, current UTC week, Monday 00:00 inclusive to the next Monday 00:00 exclusive. `week_start` and `week_end` are ISO 8601 timestamps ending in `Z`. | 4.1–4.4 |
| A3 | Distinct completions | Approved, revised 2026-11-17. A card ID counts once if it has an `entered_done` event in the week and is still an active card in an active Done column. The count drops if the card leaves Done, is deleted, or its column stops being Done. Original A3 kept such a card counted, which left a card dragged back to a not-done column in the figure. | 2.1–2.3 |
| A4 | Who appears in `member_activity` | Approved. Every actor with a counted event in the week, former board members included, under the current name. Sorted by count descending, lower-cased name, then user ID. Actors with zero counted events are omitted. | 3.1, 3.3–3.5 |
| A5 | Query and check order | Approved. Authenticate, then validate the board ID and reject any query parameter, then check board access. 401 for missing or invalid authentication, 400 for invalid input, the generic 404 for a missing or inaccessible board (C1). | 5.1–5.3 |
| A6 | Read-only | Approved. No board write lock, event, notification or version change. `Cache-Control: private, no-store` is kept through the same-origin handler. | 5.4, 5.5, 8.1 |
| A7 | Roles | Approved. Every current participant, member or admin, reads that board's analytics. | 5.3 |
| A8 | When the panel reads | Approved. Through a same-origin handler when the panel mounts, after a successful local card or column change that advances `position_version`, and on Refresh. No polling in this slice. Comment activity and other users' changes appear on the next read. Loading and errors stay inside the panel. Stale responses after a newer request or a board switch are ignored. | 6.4–6.8, 8.1, 8.5 |
| A9 | Presentation | Approved. One `.surface` panel, text figures, existing tokens, decorative bars only. Refresh uses the 44 by 44 CSS px target. Usable at 320 and 375 px. | 6.2, 7.1–7.3 |
| A10 | Timing | Approved. Record the observed E29 latency on a 100-card board. It is a measurement. | 8.8 |

User-requested verification (all in Requirement 8): UTC week boundaries (8.4), the same card entering Done twice (8.3), activity by a removed member (8.3), an E29 failure that leaves the board usable (8.5), and the dedicated test database with automatic cleanup of each run's records (8.6).

## Dependency note

The kanban slice is verified (root T07 to T09 are checked, `evidence/kanban-T07-T09.md`) and the comments slice is verified (T10, `evidence/comments-T10.md`). Root T14 depends on T08 and T10, both checked, and the queue prerequisite is Kanban and comments. The event writers for `card_created`, `card_moved`, `column_reordered`, `comment_created` and `entered_done` exist (`backend/app/positions.py`, `cards/service.py`, `columns/service.py`, `comments/service.py`). At the time of writing the `analytics` Blueprint and the board analytics panel did not exist. They were implemented on 2026-11-14 (`evidence/analytics-T14.md`). No prerequisite blocked this slice.
