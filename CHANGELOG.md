# Application Changelog

Newest date first. Each `## YYYY-MM-DD` heading groups the commits made that day. Each commit has a `### <short-sha> <subject>` entry with its notes. Follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) style.

## 2026-11-18

### 6b504d0 test: cover board sprint dates in the Playwright suite

- The local acceptance journey `boards-membership › sprint dates` creates a board with a sprint, checks the header line and the analytics dialog, a member's read-only view, an edit (refused and valid), and Clear dates. It runs on all four projects. Full suite: 58 passed (54 before), 0 failed, cleanup count 0 (emulation, production Next server).

### 9f49570 feat: add sprint dates to board forms, header and analytics

- A board can have a sprint. The create-board dialog has optional "Sprint start" and "Sprint end" date fields, an Admin changes or clears them from "Edit board" (formerly "Rename board", now also the dates and a "Clear dates" button), and the board header shows "Sprint 16 Nov to 22 Nov". A sprint is both dates or neither, ends on or after its start and is at most 90 days. Invalid or partial ranges show a field error.
- Verified locally: `pytest` 2173 passed and 1 skipped, `ruff` clean, `vitest` 2170 passed, `lint`, `typecheck` and `build` clean, and a Chromium check at 320, 375, 768 and 1280 px with 140 checks and 0 failed (emulator). E29 on a 90-day sprint with 5000 extra events: p95 12.4 ms locally. Not done: a real-device check and the Playwright date steps (T15).

### 0f58d2c feat: add board sprint range and sprint-based analytics window

- Analytics counts inside the board's sprint (start day 00:00 UTC to the end day's 24:00 UTC) and shows "Sprint 16 Nov to 22 Nov" with "this sprint" labels. A board without a sprint keeps the UTC week and the "Week of … (local time)" line. Editing or clearing the sprint changes only the next read and rewrites no event.
- Run `flask db upgrade` once: the migration adds `boards.sprint_start` and `boards.sprint_end`.

### 4240cf0 feat: add global error boundary and app-wide not found page

- A crash in the root layout now shows a "Something went wrong" screen with Try again (`global-error.tsx`), and an unknown URL shows a "Page not found" screen with a link back to the app (`not-found.tsx`), instead of the default Next.js pages.

## 2026-11-17

### 23ac801 fix: drop analytics completed count when a card leaves done

- Analytics "Cards completed this week" no longer keeps a card that was dragged back out of Done (or deleted). It counts only cards that entered Done this week and are still in the Done column.

### 29144c6 style: make kanban end drop zone card-sized while dragging

- The "Drop here to move to the end" strip grows from 44 px to about one card high (`min-h-32`) while a card is dragged.

### 84a7238 style: make profile panel full width

- The Profile panel fills the width of the page content instead of stopping at `max-w-xl`.

### 29c7c3b style: add pointer cursor to notification bell

- The notification bell button shows a pointer cursor on hover.

### 38281f1 feat: show analytics week range in local time

- The Analytics dialog shows the week start and end in the viewer's time zone, for example `Week of 9 Nov, 07:00 to 16 Nov, 07:00 (local time)`. The counted week is still the UTC week.

### 4cb298f fix: disable move card confirm when nothing would change

- The Move card dialog disables Confirm, with a hint, while the choice is the card's present place or a Kanban request is pending. Before, Confirm closed the dialog with no request.

## 2026-11-15

### 8033a55 docs: close T15 in specs, changelogs and setup guide

- Local acceptance (T15, local only): a Playwright suite in `frontend/e2e/` runs 54 tests in Chromium against the real local stack. It covers the four auth scenarios, the boards and membership journey, the eight-step Kanban journey with a real `dragTo()` and the Move button at 375 px, the comments journey, a real 409, a forced 500 and an uncertain-outcome move, 30 warm E07 requests (p95 7.1 ms), and a 40-row route and dialog matrix at 320, 375, 768 and 1280 px. A preflight refuses to write unless Flask is proven connected to the `_test` database, and each run deletes its own rows and verifies zero are left. The matrix found two touch-target defects, fixed: the 40 px Members button and the 28 px brand link below 400 px. Evidence: `evidence/local-acceptance-T15.md`. Real-device checks and everything deployed stay with T16.

- Added QA tests for the five reorder scenarios, the BoardCard and CommentList rendered values and the repository and bundle secret checks, with a scored review in `evidence/implementation-review.md`.

## 2026-11-14

### fc6e18f docs: update changelogs, readme and user guide for analytics

- Analytics slice (T14, local only): every board page has an Analytics panel below the columns. It shows, for the current UTC week (Monday 00:00 to the next Monday 00:00), the cards completed (distinct cards that entered Done, kept if a card later leaves Done or is deleted), the active card count per column (0 for an empty column) and the activity per member (cards created or moved, columns reordered and comments; a card created in or moved into Done adds one event; former members stay listed under their current name). `GET /api/boards/{id}/analytics` (E29) is open to every participant, accepts no query parameter, answers the generic 404 to a nonmember and is read-only. The panel reads on open, after your own card or column change and on Refresh, does not poll, and keeps its loading and error states inside itself so a failed read never blocks the board. Local checks: backend 2050 passed and 1 skipped, frontend 2031 passed, and a 128-check Chrome run (emulation) at 320, 375, 768 and 1280 px. E29 p95 6.2 ms on a 100-card board, direct to Flask (a measurement). See `evidence/analytics-T14.md`. Real-device, Playwright and deployed checks are pending (T15, T16).

### 3403d4b docs: update specs, guides and changelogs for notifications

- Notifications slice (T13, local only): a new assignment (create or edit a card) to a user other than you, or a new comment on a card assigned to a user other than its author, creates one in-app notification for that assignee in the same transaction, so a rolled-back change leaves none. Each qualifying event creates its own notification, and the assigner's own actions create none. A bell in the header (every width) shows the exact unread count in its name, a badge hidden at 0 and capped at `99+`, and refreshes every 30 seconds with one request at a time. It opens a Notifications dialog with board links, "Newer" and "Older" paging at 20 per page, an Unread marker and a "Mark as read" button. Following an unread row's link marks it read without waiting. `GET /api/notifications` (E27) and `PATCH /api/notifications/{id}/read` (E28, idempotent, no body) return `actor_name`, `board_name` and `card_title` beside the existing fields. Notifications for a board, column or card you can no longer access are hidden from the list and both counts and return, with their read status, if your access does. Backend 1986 passed and 1 skipped. Frontend 1958 tests in 93 files pass and `next build` succeeds. A 205-check Chrome run (device emulation, no real phone) passed at 320, 375, 768 and 1280 px. Playwright (T15), real-device checks and deployment (T16) are open. Evidence: `evidence/notifications-T13.md`.

- The header's brand block now sizes to its content, the account name is shorter below 640 px and the RevoTask wordmark is visually hidden below 400 px (it stays the link's accessible name), so the new bell, Profile and Sign out fit one row at 320 px (T13).

### a067359 docs: update specs, api docs and changelogs for profile, my tasks and search

- Profile slice (T12, local only): a Profile page (`/profile`) lets you change your name, your email or both (`PATCH /api/users/me`, E31). Only changed fields are sent, a value equal to the stored one is a no-op, a taken email shows an error under Email and changes nothing (not even a name sent with it), and the header shows the new name at once. Reached from your name in the header at every width. There is no password field, and password changes are not available yet. An email change keeps you signed in, and you sign in with the new email next time. Local checks: backend 1907 tests passed and 1 skipped, frontend 1845 tests passed and `next build` succeeds, and a 376-check Chrome run (device emulation) at 320, 375, 768 and 1280 px passed. Reauthentication, new-address confirmation, an old-address notice and an E31 rate limit are tracked in T16. Evidence: [profile evidence](evidence/profile-T12.md).

- My Tasks and board search slice (T11, local only): a My tasks page (`/my-tasks`) lists every card assigned to you on boards you can access, grouped by board (case-insensitive board name order), with Done cards included. Each group and row links to its board. The board page has a Search cards field that matches card titles after a 300 ms pause, shows up to 20 results with their current column, opens the card from a result, and follows the live board (a renamed or deleted card drops out and a rolled-back delete brings it back). Boards and My tasks links show in the header at every width, including a second row on a phone. `GET /api/cards?assignee=me` (E21) and `GET /api/boards/{id}/cards/search?q=` (E22) are read-only and reject a missing, repeated or unknown query parameter with 400. Local checks: backend 1808 passed, frontend 1733 passed, a 359-check Chrome run at 320 to 1280 px, E22 p95 and E21 p95 under 10 ms on 100 cards. Evidence: `evidence/my-tasks-search-T11.md`.

## 2026-11-13

### f2db11d docs: update readme, changelogs and layer docs for comments

- Comments slice (T10, local only): any participant reads and adds comments on a card in a Card details dialog that also holds the card's edit form. Only a comment's author may edit or delete it (an admin gets 403 for another user's comment; a removed author gets 404). Comments are plain text of 1 to 2,000 characters with their line breaks kept, listed in creation order, and a new comment records a `comment_created` event. An edit with the same text changes nothing, and a new comment shows no Edited marker. A comment write never changes the board's position version. If a post may have been saved while its response was lost, the dialog keeps the draft, refreshes the list, says the comment may have been posted and lets you retry by hand. Backend: E23–E26. Frontend: `CardDetailModal`, `CommentList`, `useCardComments` and same-origin handlers. Local checks: backend 1706 passed (1 skipped), frontend 1571 tests, `next build`, and a 480-check Chrome run at 320 to 1280 px (device emulation). Playwright, a real-device check and deployment are pending. Evidence: `evidence/comments-T10.md`.

- Pressing Escape on a confirmation dialog inside another dialog (Delete card, Delete comment) now closes only the confirmation. Before, it also closed the dialog behind it (found by the comments browser check, F-CMT-1). The card button is now named "Open <title>" and its dialog "Card details".

### a77ffbc docs: update specs, api docs and changelogs for kanban

- Kanban slice (T07–T09, local only): Admins add, rename, reorder and delete columns and mark one Done column. Any participant adds, edits, assigns, deletes and moves cards, by desktop drag or by a visible Move button that works with a keyboard and by touch. Moves are versioned and ordered by a float position with automatic rebalancing: a stale move returns 409 and the board refetches, a failed move rolls back, and a move to the same place changes nothing. Create, move and Done events are audited for later analytics. After a member removal the board refetches so cleared assignments show Unassigned. Local checks: backend 1570 passed and 1 skipped, frontend 1362 passed, and a 418-check Chrome run at 320 to 1280 px (device emulation, no real phone, synthetic drag events). Pointer drag in Playwright (T15) and real-device checks are pending. Evidence: `evidence/kanban-T07-T09.md`.

- Removing a board member (E12) now clears their assignments only on active cards in active columns of that board. Cards in soft-deleted columns, soft-deleted cards and other boards keep their assignments (kanban review L7). Backend suite: 1147 passed, 1 skipped.

### ac7468f docs: record frontend design system rules and changelog

- Frontend redesign: the dashboard, board page, login and register screens use a work-dashboard look (ink sidebar, white panels, teal accent) that stays mobile first. The rules are FE-D1 to FE-D9 in `guidelines/frontend.md` and are read by the `revotask-feature` skill. No behavior, API or data change.

### 3b46afc docs: record boards status in changelogs, README and evidence

- Boards and membership slice (T05–T06, local only): board list, create, detail, rename and delete (E05–E09), and member list, add and remove (E10–E12). Only Admins manage boards and members. Non-members and removed members get the same 404 as a missing board. Removing a member also clears that member's card assignments on that board, in one transaction (AC04.2). Dashboard at `/`, board page at `/boards/[id]` with confirmation dialogs for delete and remove. Known limits: `USER_NOT_FOUND` reveals whether an email belongs to a registered user, visible only to board Admins (accepted for v1). The per-admin rate limit for adding members is T16. Local verification: backend tests and frontend tests, lint and typecheck pass. The mobile check at 320, 375, 768 and 1280 px and the manual journey are pending. Evidence: [boards and membership](evidence/boards-membership-T05-T06.md).

- The implementation workflow starts from the included spec. Local acceptance precedes GitHub connection and live deployment. Foundation (T01–T02), authentication (T03–T04) and boards and membership (T05–T06) are implemented locally. Browser and mobile verification of the boards screens, later slices, live deployment and submission evidence are pending.

### 012b0b3 docs: record the password rule and one-worker rate limit in specs and API docs

- Authentication slice (T03–T04, local only): register, login, logout and `GET /api/users/me` in Flask with Argon2id (register password: 8 to 128 characters with an uppercase letter, a lowercase letter and a special character), JWT revocation, a shared `AUTH_REQUIRED` guard and login and register rate limits. Same-origin Next.js Route Handlers keep the token in an HttpOnly `revotask_session` cookie and return only the public user. Register and login pages, a protected shell with sign out, a typed `ApiError`, and one set of field rules shared by the forms and the API. Mobile rules (AC13.1) apply to every page and are measured in a real browser. Local verification: [evidence](evidence/authentication-T03-T04.md). Real-phone checks, Playwright (T15) and production rate limiting (T16) are pending.

- Local Compose runs one Gunicorn worker so the login and register rate limits are exact. Shared limiter storage (T16) is required before more production workers. A 401 no longer carries `Retry-After`.

### 2b24ad2 docs: add authentication feature spec and record T03-T04 status

- Request-body failures use the JSON envelope: 400 malformed JSON, 415 `UNSUPPORTED_MEDIA_TYPE`, 413 `CONTENT_TOO_LARGE`. `docs/API.md` lists both new statuses. `GET /api/users/me` (E30 read) moved from T12 to T03.

- Mobile responsiveness is a standing rule for every UI slice (AC13.1, FE-S4–S6): 375 px and wider, 44 by 44 px tappable areas, 16 px inputs, `min-h-dvh`.

### bc8aa16 root: scaffolding foundation backend and frontend

- Foundation slice (T01–T02, local only): backend Flask factory with validated settings, shared JSON error envelope with `X-Request-ID`, `GET /api/health`, nine SQLAlchemy models, the first Alembic revision and a `bootstrap-schema` command. Frontend Next.js scaffold with Tailwind CSS, daisyUI and Vitest tests. Backend Docker image and local Compose service, on port 5001, with a Render Docker Web Service procedure.

- Shared error envelope gains `405 METHOD_NOT_ALLOWED` with an `Allow` header (`docs/API.md`).

### 9a8f6d6 docs: initial references

- Added handbook review and submission evidence for Kiro, Claude Code, Postman and Playwright.

- Added the Kiro Feature Spec workflow and detailed backend and frontend implementation specs.

- Local implementation prompts, placeholder environment files and repository ignore rules.

- Project requirements, design, API contract and acceptance baseline.

- Simplified implementation to two reusable prompts per feature with synchronized task status and documentation.

- Added a documentation checkpoint to each implementation task so README facts and applicable changelogs can be updated with the code change.

## Entry template

```markdown
## YYYY-MM-DD

### <short-sha> <commit subject>

- User-visible capability or change, with related AC or PR.
- Behavior that changed and who is affected.
- Observable issue and fix.
- Verification and evidence: …
```
