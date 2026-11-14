# Application Changelog

Track notable user-facing changes using [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and version releases using [Semantic Versioning](https://semver.org/). Move actual changes out of Unreleased when the release commit and its evidence are known.

## [Unreleased]

- Added handbook review and submission evidence for Kiro, Claude Code, Postman and Playwright.

### Added

- Notifications slice (T13, local only): a new assignment (create or edit a card) to a user other than you, or a new comment on a card assigned to a user other than its author, creates one in-app notification for that assignee in the same transaction, so a rolled-back change leaves none. Each qualifying event creates its own notification, and the assigner's own actions create none. A bell in the header (every width) shows the exact unread count in its name, a badge hidden at 0 and capped at `99+`, and refreshes every 30 seconds with one request at a time. It opens a Notifications dialog with board links, "Newer" and "Older" paging at 20 per page, an Unread marker and a "Mark as read" button. Following an unread row's link marks it read without waiting. `GET /api/notifications` (E27) and `PATCH /api/notifications/{id}/read` (E28, idempotent, no body) return `actor_name`, `board_name` and `card_title` beside the existing fields. Notifications for a board, column or card you can no longer access are hidden from the list and both counts and return, with their read status, if your access does. Backend 1986 passed and 1 skipped. Frontend 1958 tests in 93 files pass and `next build` succeeds. A 205-check Chrome run (device emulation, no real phone) passed at 320, 375, 768 and 1280 px. Playwright (T15), real-device checks and deployment (T16) are open. Evidence: `evidence/notifications-T13.md`.
- Profile slice (T12, local only): a Profile page (`/profile`) lets you change your name, your email or both (`PATCH /api/users/me`, E31). Only changed fields are sent, a value equal to the stored one is a no-op, a taken email shows an error under Email and changes nothing (not even a name sent with it), and the header shows the new name at once. Reached from your name in the header at every width. There is no password field, and password changes are not available yet. An email change keeps you signed in, and you sign in with the new email next time. Local checks: backend 1907 tests passed and 1 skipped, frontend 1845 tests passed and `next build` succeeds, and a 376-check Chrome run (device emulation) at 320, 375, 768 and 1280 px passed. Reauthentication, new-address confirmation, an old-address notice and an E31 rate limit are tracked in T16. Evidence: [profile evidence](evidence/profile-T12.md).
- My Tasks and board search slice (T11, local only): a My tasks page (`/my-tasks`) lists every card assigned to you on boards you can access, grouped by board (case-insensitive board name order), with Done cards included. Each group and row links to its board. The board page has a Search cards field that matches card titles after a 300 ms pause, shows up to 20 results with their current column, opens the card from a result, and follows the live board (a renamed or deleted card drops out and a rolled-back delete brings it back). Boards and My tasks links show in the header at every width, including a second row on a phone. `GET /api/cards?assignee=me` (E21) and `GET /api/boards/{id}/cards/search?q=` (E22) are read-only and reject a missing, repeated or unknown query parameter with 400. Local checks: backend 1808 passed, frontend 1733 passed, a 359-check Chrome run at 320 to 1280 px, E22 p95 and E21 p95 under 10 ms on 100 cards. Evidence: `evidence/my-tasks-search-T11.md`.
- Comments slice (T10, local only): any participant reads and adds comments on a card in a Card details dialog that also holds the card's edit form. Only a comment's author may edit or delete it (an admin gets 403 for another user's comment; a removed author gets 404). Comments are plain text of 1 to 2,000 characters with their line breaks kept, listed in creation order, and a new comment records a `comment_created` event. An edit with the same text changes nothing, and a new comment shows no Edited marker. A comment write never changes the board's position version. If a post may have been saved while its response was lost, the dialog keeps the draft, refreshes the list, says the comment may have been posted and lets you retry by hand. Backend: E23–E26. Frontend: `CardDetailModal`, `CommentList`, `useCardComments` and same-origin handlers. Local checks: backend 1706 passed (1 skipped), frontend 1571 tests, `next build`, and a 480-check Chrome run at 320 to 1280 px (device emulation). Playwright, a real-device check and deployment are pending. Evidence: `evidence/comments-T10.md`.
- Kanban slice (T07–T09, local only): Admins add, rename, reorder and delete columns and mark one Done column. Any participant adds, edits, assigns, deletes and moves cards, by desktop drag or by a visible Move button that works with a keyboard and by touch. Moves are versioned and ordered by a float position with automatic rebalancing: a stale move returns 409 and the board refetches, a failed move rolls back, and a move to the same place changes nothing. Create, move and Done events are audited for later analytics. After a member removal the board refetches so cleared assignments show Unassigned. Local checks: backend 1570 passed and 1 skipped, frontend 1362 passed, and a 418-check Chrome run at 320 to 1280 px (device emulation, no real phone, synthetic drag events). Pointer drag in Playwright (T15) and real-device checks are pending. Evidence: `evidence/kanban-T07-T09.md`.
- Boards and membership slice (T05–T06, local only): board list, create, detail, rename and delete (E05–E09), and member list, add and remove (E10–E12). Only Admins manage boards and members. Non-members and removed members get the same 404 as a missing board. Removing a member also clears that member's card assignments on that board, in one transaction (AC04.2). Dashboard at `/`, board page at `/boards/[id]` with confirmation dialogs for delete and remove. Known limits: `USER_NOT_FOUND` reveals whether an email belongs to a registered user, visible only to board Admins (accepted for v1). The per-admin rate limit for adding members is T16. Local verification: backend tests and frontend tests, lint and typecheck pass. The mobile check at 320, 375, 768 and 1280 px and the manual journey are pending. Evidence: [boards and membership](evidence/boards-membership-T05-T06.md).
- Authentication slice (T03–T04, local only): register, login, logout and `GET /api/users/me` in Flask with Argon2id (register password: 8 to 128 characters with an uppercase letter, a lowercase letter and a special character), JWT revocation, a shared `AUTH_REQUIRED` guard and login and register rate limits. Same-origin Next.js Route Handlers keep the token in an HttpOnly `revotask_session` cookie and return only the public user. Register and login pages, a protected shell with sign out, a typed `ApiError`, and one set of field rules shared by the forms and the API. Mobile rules (AC13.1) apply to every page and are measured in a real browser. Local verification: [evidence](evidence/authentication-T03-T04.md). Real-phone checks, Playwright (T15) and production rate limiting (T16) are pending.
- Foundation slice (T01–T02, local only): backend Flask factory with validated settings, shared JSON error envelope with `X-Request-ID`, `GET /api/health`, nine SQLAlchemy models, the first Alembic revision and a `bootstrap-schema` command. Frontend Next.js scaffold with Tailwind CSS, daisyUI and Vitest tests. Backend Docker image and local Compose service, on port 5001, with a Render Docker Web Service procedure.
- Added the Kiro Feature Spec workflow and detailed backend and frontend implementation specs.
- Local implementation prompts, placeholder environment files and repository ignore rules.
- Project requirements, design, API contract and acceptance baseline.

### Changed

- The header's brand block now sizes to its content, the account name is shorter below 640 px and the RevoTask wordmark is visually hidden below 400 px (it stays the link's accessible name), so the new bell, Profile and Sign out fit one row at 320 px (T13).
- Pressing Escape on a confirmation dialog inside another dialog (Delete card, Delete comment) now closes only the confirmation. Before, it also closed the dialog behind it (found by the comments browser check, F-CMT-1). The card button is now named "Open <title>" and its dialog "Card details".
- Removing a board member (E12) now clears their assignments only on active cards in active columns of that board. Cards in soft-deleted columns, soft-deleted cards and other boards keep their assignments (kanban review L7). Backend suite: 1147 passed, 1 skipped.
- Frontend redesign: the dashboard, board page, login and register screens use a work-dashboard look (ink sidebar, white panels, teal accent) that stays mobile first. The rules are FE-D1 to FE-D9 in `guidelines/frontend.md` and are read by the `revotask-feature` skill. No behavior, API or data change.

- Local Compose runs one Gunicorn worker so the login and register rate limits are exact. Shared limiter storage (T16) is required before more production workers. A 401 no longer carries `Retry-After`.
- Request-body failures use the JSON envelope: 400 malformed JSON, 415 `UNSUPPORTED_MEDIA_TYPE`, 413 `CONTENT_TOO_LARGE`. `docs/API.md` lists both new statuses. `GET /api/users/me` (E30 read) moved from T12 to T03.
- Mobile responsiveness is a standing rule for every UI slice (AC13.1, FE-S4–S6): 375 px and wider, 44 by 44 px tappable areas, 16 px inputs, `min-h-dvh`.
- Simplified implementation to two reusable prompts per feature with synchronized task status and documentation.
- Added a documentation checkpoint to each implementation task so README facts and applicable changelogs can be updated with the code change.
- The implementation workflow starts from the included spec. Local acceptance precedes GitHub connection and live deployment. Foundation (T01–T02), authentication (T03–T04) and boards and membership (T05–T06) are implemented locally. Browser and mobile verification of the boards screens, later slices, live deployment and submission evidence are pending.
- Shared error envelope gains `405 METHOD_NOT_ALLOWED` with an `Allow` header (`docs/API.md`).

## Release entry template

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added

- User-visible capability and related AC or PR.

### Changed

- Behavior that changed and who is affected.

### Fixed

- Observable issue and fix.

### Security

- Security-relevant change where applicable.

- Backend/frontend versions: …
- Tested commit and environment: …
- Test and deployment evidence: …
```
