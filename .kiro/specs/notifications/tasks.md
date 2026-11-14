# Implementation Plan: notifications (T13)

## Overview

This plan implements persisted assignment and comment notifications, the recipient APIs E27 and E28 and the notification bell with its 30-second poll described in `design.md` (root T13). Order of work: the schema, service and routes of the new blueprint, the three writers, the backend tests and a backend checkpoint, the frontend foundation (types, parsers, client allowlist, Next handlers), the polling hook, the row, panel and bell, the AppHeader integration, the measured mobile check with the journey, the full verification checkpoint, and the documentation checkpoint.

**Status:** Done locally (2026-11-14). Requirements and design were approved (decisions B1–B10 with clarifications, design review items R1–R8), and the user's `implement notification T13` invocation for all tasks approved this plan. Every group is verified; see `evidence/notifications-T13.md`. Open outside this plan: Playwright (V10), real-device checks (T15), deployment (T16) and a limit on notification volume per user (T16).

**Root task:** T13. Existing root IDs are preserved and no new root ID is proposed. Root T13 stays unchecked in `specs/tasks.md` until its checks pass.

**Inputs:** `requirements.md` (Requirements 1 to 10, B1–B10), `design.md` (DD1–DD15, Properties 1–15, C28–C33, R1–R8).

## Dependency gates

| Gate | Rule | Enforced by |
|---|---|---|
| A | Root T10 is verified (checked in `specs/tasks.md`). No gate blocks the start. | Verified at spec time |
| B | The backend triggers, E27 and E28 checks pass before any frontend task that calls them. | 2.10 |
| C | The frontend and the full suites pass before the mobile record is final. | 7 |
| D | Root T13 is checked only after the backend, frontend, measured mobile check, journey and documentation pass. Unverified work stays open with the actual reason. | 8.5 |

## Test conventions (all groups)

- Backend database-writing tests run on `TEST_DATABASE_URL` through `db_guard` and the `board_tracker` fixture (`BoardTracker`, which extends `Tracker`). Every user, board and card a test creates, directly or through the API, is tracked. Teardown deletes only those rows and the rows that reference them, in foreign-key order, whether the test passes or fails. No `TRUNCATE`, no name patterns, never `DATABASE_URL`. An untracked sentinel notification survives (task 2.9).
- Concurrency tests use `race(app, jobs)` from `tests/kanban_helpers.py`. Each thread has its own client and session on the guarded database.
- Frontend tests use Vitest and React Testing Library, with fake timers for the poll. They assert rendered text, roles and the requests sent, not only that a component mounts.
- No Hypothesis or fast-check. Properties are parameterized tests over fixed tables.
- Every UI task meets Requirement 9: 44 by 44 CSS px controls (rendered box, `elementFromPoint` at the center), a visible focus ring, no horizontal page scroll, checked at 375 px and recorded at 320, 375, 768 and 1280 px (FE-S4 to FE-S6, FE-D9). For UI work read FE-D1 to FE-D9 in `guidelines/frontend.md` and `frontend/app/globals.css` first. Add no color, font or second accent.
- Backend command (from `backend/`): `.venv/bin/python -m pytest <files> -v -p no:cacheprovider`. Frontend commands (from `frontend/`): `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Record the exact commands and real counts in `evidence/notifications-T13.md`.
- The working tree holds uncommitted T11 and T12 changes in `AppHeader.tsx`, `apiClient.ts`, `flask.ts`, `privateRoute.ts`, `types.ts`, `cards/service.py`, `validation.py` and others. Edit only the lines this plan names, and run the T11 and T12 tests with the notification tests.
- The wire object is called `Notification` in the contract. In TypeScript the type is `NotificationItem`, so it does not shadow the browser's `Notification` global.
- Do not write real passwords, tokens or connection strings into specs, evidence, logs or shell arguments.

## Tasks

- [x] 0. Record review outcomes and align contracts (spec phase)
  - [x] 0.1 Decisions B1–B10 and shared docs
    - Done with the design: `docs/API.md` (E17, E18, E24, E27, E28, the Notification shape and C28–C33), `backend/specs/api-contract.md` (`notifications_bp`), `specs/requirements.md` AC10.1 and AC10.2, `docs/TEST-PLAN.md` V08 and V11, `guidelines/frontend.md` FE-S3, `specs/CHANGELOG.md` and `evidence/spec-review.md`.
    - _Requirements: 5.8, 6.2, 10.8; Root: T13_
  - [x] 0.2 Finalize the spec after this plan is approved
    - Link root T13 in `specs/tasks.md` to `.kiro/specs/notifications/tasks.md` ("Native spec: ..."). Synchronize `specs/traceability.md` (AC10.1, AC10.2, E27–E28 and the bell rows), `frontend/specs/pages-and-components.md` (the header row and `useNotifications`), `frontend/specs/api-integration.md`, `backend/specs/data-model.md` (the visibility note) and `guidelines/frontend.md` FE-D2 and its component table with the approved design. Record the plan approval in `evidence/spec-review.md` and the changes in `specs/CHANGELOG.md`. Do not check T13.
    - Acceptance: the link resolves, `specs/tasks.md` shows T13 unchecked, and the shared documents say the same as `design.md`.
    - _Root: T13_

- [x] 1. Backend: schema, service, routes and writers (WP-B1)
  - [x] 1.1 Add the schemas
    - Create `backend/app/blueprints/notifications/__init__.py` (`notifications_bp`, imports `routes`) and `schema.py`: `QueryInt(minimum, maximum, message)` accepting only `0` or `[1-9][0-9]*` of at most 10 ASCII digits and then the range; `NotificationListQuerySchema` with `page` (1 to 2,147,483,647, default 1) and `per_page` (1 to 50, default 20), messages "Must be a whole number from 1 to 2147483647." and "Must be a whole number from 1 to 50."; and a dump-only `NotificationSchema` allowlist of the ten fields (`id`, `kind`, `board_id`, `card_id`, `actor_id`, `actor_name`, `board_name`, `card_title`, `created_at`, `read_at`). No message echoes the input.
    - Acceptance: `QueryInt` rejects `0`, `-1`, `1.5`, `+1`, `01`, ` 1`, `0x1`, `1e2`, an empty value, 11 digits and a value above the maximum, and accepts `1`, `20` and `2147483647`.
    - _Requirements: 3.2, 3.5, 3.6; Root: T13; Decisions: B1, B5; Design: DD4, DD8, R1_
  - [x] 1.2 Add the service
    - Create `backend/app/blueprints/notifications/service.py` with `add_notification(recipient_id, actor_id, board_id, card_id, kind)` (adds a `Notification` with `created_at = utcnow()` to the session, no flush or commit), `_visible(stmt, user_id)` (Notification → Card → BoardColumn → Board, the recipient's active `BoardMember`, `deleted_at IS NULL` on card, column and board, `recipient_id = :user`), `list_notifications(user_id, page, per_page)` (items ordered `created_at DESC, id DESC`, `limit` and a Python-integer `offset`, one counts statement with `count(*)` and `count(*) FILTER (WHERE read_at IS NULL)`, counts present on an empty page) and `mark_read(notification_id, user_id)` (one conditional `UPDATE` with `recipient_id`, `read_at IS NULL` and the visible subquery with `.correlate(None)`, `synchronize_session=False`, then the visible item select; no row means rollback and `NotFoundError`; otherwise `commit_or_rollback()`). Import only models, `app.extensions` and `boards.service` helpers, so there is no import cycle.
    - Acceptance: a direct service call returns the documented shape. The module imports without importing `cards.service` or `comments.service`.
    - _Requirements: 3.1, 3.3, 3.4, 4.1–4.4, 4.6, 5.4; Root: T13; Decisions: B4, B6, B7; Design: DD1, DD3, DD5, DD6_
  - [x] 1.3 Add the routes and register the blueprint
    - Create `backend/app/blueprints/notifications/routes.py`: `GET /api/notifications` (`@token_required`, `load_query_args(NotificationListQuerySchema())`, `list_notifications`) and `PATCH /api/notifications/<notification_id>/read` (`@token_required`, `parse_uuid` → 400, `mark_read`, no `load_json_body`). Register `notifications_bp` in `backend/app/__init__.py`. Add `notifications.list_notifications` and `notifications.mark_read_view` to the route list in `backend/tests/test_factory.py`.
    - Acceptance: both routes answer through the app factory. `GET` with a repeated or unknown parameter is 400 and `PATCH` with a non-UUID is 400, each without a database read. `test_factory.py` passes.
    - _Requirements: 3.1, 3.9, 4.5, 5.1, 5.2; Root: T13; Design: DD7, check order_
  - [x] 1.4 Wire the three writers
    - `backend/app/blueprints/cards/service.py`: in `create_card` after the flush, `add_notification(assignee_id, user_id, board_id, card_id, "assigned")` when `assignee_id is not None and assignee_id != user_id`. In `update_card`, read `previous = card.assignee_id` after `load_card` and before the `setattr` loop, and after the flush add the notification when the submitted `assignee_id` is not null, differs from `previous` and differs from `user_id`. `backend/app/blueprints/comments/service.py`: keep the card returned by `load_card` in `create_comment` and, after `record_event`, add a `commented` notification for `card.assignee_id` when it is not null and differs from `user_id`; remove the "T13 adds the assignee notification here" comment. Update the T13 comment in `backend/app/models/notification.py` to say that the queries join explicitly and no relationship is added. Leave `create_card` and `update_card` otherwise unchanged.
    - Acceptance: the existing card, comment and kanban test files pass unchanged, and a manual call creates the expected rows.
    - _Requirements: 1.1–1.5, 1.7, 1.8, 2.1–2.5; Root: T13; Decisions: B2, B3; Design: DD1, DD2_

- [x] 2. Backend tests (V08)
  - [x] 2.1 Test helpers
    - Create `backend/tests/notification_helpers.py`: assign through E17 or E18, comment through E24, `rows(app, recipient_id)` read in its own app context with the session removed afterwards, `list_as(client, tracker, user, **query)` and `mark_as(client, tracker, user, id)`. Users, boards and cards come from `board_tracker` and `make_kanban`.
    - Acceptance: a helper-only smoke test creates tracked rows and reads them back.
    - _Requirements: 10.4, 10.6; Root: T13_
  - [x] 2.2 Trigger rules
    - Create `backend/tests/test_notifications_triggers.py`. E17 with another assignee (one `assigned` row with the right recipient, actor, board, card and kind), self-assignment, no assignee. E18 with a new assignee, the same assignee again, clearing, a title-only edit, reassignment (only the new assignee), and unassigned → A → B → A by a third user (A twice, B once). E24 with a different author (one `commented`), the assignee as author, an unassigned card, two comments (two rows), an edit and a delete (none). E12, E19 and E20 write none. `created_at` is set and follows commit order.
    - Acceptance: every case asserts the stored rows and the response status. Property 1 holds.
    - _Requirements: 1.1–1.7, 2.1–2.4, 10.4; Root: T13; Decisions: B2, B3_
  - [x] 2.3 Atomicity
    - Create `backend/tests/test_notifications_atomicity.py`. For E17, E18 and E24: a failing commit after the notification is staged leaves no notification and no card or comment change; a failing `add_notification` leaves no card change, no comment and no event; a 400, 403 and 404 request writes no notification. A notification does not change `position_version` and writes no `board_events` row.
    - Acceptance: after each injected failure the stored card, comment, event and notification rows equal the rows before the request. Properties 2 and 10 hold.
    - _Requirements: 1.8, 2.6, 2.7, 10.4; Root: T13; Decisions: B2_
  - [x] 2.4 Concurrency
    - Create `backend/tests/test_notifications_concurrency.py`. Two concurrent E18 requests that assign the same new user create one notification. A comment racing with a reassignment creates one `commented` row whose recipient is the assignee that the commit order shows (compare `created_at` with the `assigned` row). Two concurrent E28 requests for one row both return 200 and keep one `read_at`.
    - Acceptance: the tests pass in repeated runs with `race(...)`. Properties 3 and 8 hold.
    - _Requirements: 1.2, 2.5, 4.3, 10.4; Root: T13; Decisions: B2, B7_
  - [x] 2.5 E27 list
    - Create `backend/tests/test_notifications_list.py`. Newest first with the `id` tie-break (rows with one `created_at`), the defaults, `per_page` 1 and 50, `total` and `unread_count` identical on every page and on an empty page, a page past the end (200, empty items, true counts), the largest `page` with `per_page=50` (200, empty, no database error), an empty account, and a page boundary that neither repeats nor skips a row. Query validation, parameterized: `page=0`, `-1`, `1.5`, `+1`, `01`, ` 1`, `1 `, `0x1`, `1e2`, `true`, an empty value, a value above 2,147,483,647, 11 digits, `per_page=0` and `51`, a repeated parameter, an unknown parameter (the standard message, no field entry), each 400 before any read. Display fields are current values after a rename of the actor, board and card. The response allowlist.
    - Acceptance: Properties 6 and 7 hold. No invalid query reaches the database (asserted with a query counter or a patched service).
    - _Requirements: 3.1–3.9, 10.4; Root: T13; Decisions: B1, B5, B6_
  - [x] 2.6 E28 read
    - Create `backend/tests/test_notifications_read.py`. The first call sets `read_at` and returns the item with the E27 shape. A repeat returns 200 with the original `read_at` and writes nothing. A non-UUID path is 400. A missing, foreign (another user, a board admin included) and hidden ID each return an identical 404 envelope. A malformed JSON body is ignored. No event and no lock (the board row is not locked, checked with a second session that holds the lock).
    - Acceptance: Properties 8 to 10 hold.
    - _Requirements: 4.1–4.7, 10.4; Root: T13; Decisions: B7_
  - [x] 2.7 Visibility
    - Create `backend/tests/test_notifications_visibility.py`. A member removed through E12 loses the rows from the items, `total` and `unread_count`, and E28 returns 404. After E11 adds the member again, the same rows return with their original `read_at`, read and Unread, and the counts match on every page. A soft-deleted board, column and card each hide the row from all three reads and from E28. Another user's rows and another board's rows are unaffected.
    - Acceptance: Properties 4, 5 and 9 hold.
    - _Requirements: 5.4, 5.5, 5.6, 10.4; Root: T13; Decisions: B4_
  - [x] 2.8 Privacy
    - Create `backend/tests/test_notifications_privacy.py`. 401 on both routes for no, malformed, expired and revoked tokens, and nothing changes. `Cache-Control: private, no-store` on every response, success and error. A user never reads or marks another user's row. No actor name, card title or notification content appears in the log output.
    - Acceptance: every assertion reads the real response or log capture.
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 10.4; Root: T13_
  - [x] 2.9 Cleanup isolation
    - Create `backend/tests/test_notifications_cleanup.py`: it creates tracked users, boards, cards and notifications, fails on purpose after a notification is written, and proves that the finalizer removed exactly the tracked notifications and that an untracked sentinel notification survived.
    - Acceptance: the sentinel row is present after teardown and is removed by the test itself.
    - _Requirements: 10.6; Root: T13_
  - [x] 2.10 Backend checkpoint (gate B)
    - Run the new files and the full backend suite from `backend/`. Fix any failure before the frontend calls the endpoints. Record the exact command and counts.
    - Acceptance: the suite passes with no new skip. The earlier counts (1907 passed, 1 skipped at the T12 handoff) only grow.
    - _Requirements: 10.4, 10.6; Root: T13_

- [x] 3. Frontend foundation (WP-F1)
  - [x] 3.1 Types and helpers
    - Add `NotificationItem` and `NotificationPage` to `frontend/lib/types.ts`. Create `frontend/lib/notifications.ts`: `NOTIFICATIONS_PER_PAGE = 20`, `POLL_INTERVAL_MS = 30_000`, `notificationsPath(page)`, `notificationReadPath(id)`, `parseNotification`, `parseNotificationPage` (copy only the allowed fields, check types, throw `malformedApiError()` otherwise), `notificationText(item)`, `badgeText(count)`, `bellLabel(count)` (exact count) and `pageCount(total)`. Create `frontend/lib/notifications.test.ts`.
    - Acceptance: tests cover accepting a valid item, rejecting a missing or extra shape, copying only allowed fields, the text for each kind, `badgeText` for 0, 1, 99 and 100, `bellLabel` with the exact count above 99, `pageCount` and both paths.
    - _Requirements: 6.2, 7.2, 10.3, 10.5; Root: T13; Decisions: B1, B10; Design: lib/notifications.ts_
  - [x] 3.2 Server routes and the shared message
    - In `frontend/lib/server/flask.ts` add `notifications` and `notificationRead` (`/api/notifications/:notificationId/read`) to `FLASK_PATHS`, and `notificationId` to `FlaskParamName` and `FLASK_PARAM_NAMES`. In `frontend/lib/server/privateRoute.ts` change "The board ID is not valid." to "The ID is not valid." in both places.
    - Acceptance: the existing `flask` and `privateRoute` tests pass, and a new case proves a `notificationId` that is not a UUID is rejected.
    - _Requirements: 10.1, 10.2; Root: T13; Design: R8_
  - [x] 3.3 Client allowlist
    - In `frontend/lib/apiClient.ts` add `^/api/notifications\?page=[1-9][0-9]*&per_page=[1-9][0-9]*$` to `DECLARED_GETS` and `PATCH ^/api/notifications/<uuid>/read$` to `DECLARED_BOARD_REQUESTS`. Extend `frontend/lib/apiClient.test.ts`.
    - Acceptance: both pairs pass, a PATCH without a body sends no `Content-Type`, no other `/api/notifications` pair or method is declared, and a non-UUID segment throws before `fetch`.
    - _Requirements: 10.3; Root: T13_
  - [x] 3.4 Next handlers
    - Create `frontend/app/api/notifications/route.ts` (`GET` → `handlePrivateRead` with `route: "notifications"` and `forwardQuery: true`) and `frontend/app/api/notifications/[id]/read/route.ts` (`PATCH` → `handlePrivateWrite` with `route: "notificationRead"`, `params: { notificationId: id }` and no `allowedKeys`). Create `frontend/app/api/notificationsRoutes.test.ts`.
    - Acceptance: GET forwards the query unchanged (a repeated and an unknown key reach Flask untouched), 401 clears the cookie, no token in the response, `private, no-store`. PATCH forwards no body, answers 403 for a wrong Origin, 401 clears the cookie, 400 for a non-UUID path before any upstream call, and passes a Flask 404 through.
    - _Requirements: 10.1, 10.2, 10.5; Root: T13; Design: DD7_

- [x] 4. Polling hook (WP-F2)
  - [x] 4.1 `useNotifications`
    - Create `frontend/hooks/useNotifications.ts` as in `design.md`: `latestRef` guard (increases on every E27 request, every completed E28 and every page change), `controllerRef` (a new request aborts the previous), one timer restarted by every E27 request, a tick skipped when a request is in flight or an E28 is pending, background and foreground requests (DD11), `open()`, `close()`, `goToPage(n)`, `retry()` and `markRead(id, { quiet })` with one E28 at a time (success replaces the row, lowers the badge only for an Unread row, aborts and invalidates any E27 in flight and sends one foreground refresh; 404 sends a foreground refresh; any other failure keeps the row Unread, announces the failure and, unless quiet, sets a row notice and a toast), moving to the last page when the shown page empties, `stoppedRef` after a 401 through `useErrorHandler`, and cleanup (timer, request, `mountedRef`) on unmount.
    - Acceptance: see 4.2.
    - _Requirements: 7.5, 7.7–7.9, 7.12, 8.1–8.8; Root: T13; Decisions: B8, B9; Design: DD9–DD13_
  - [x] 4.2 Hook tests
    - Create `frontend/hooks/useNotifications.test.tsx` with fake timers: a request on mount, one Poll per 30 seconds, no second request while one is in flight (the tick is skipped), a tick skipped while an E28 is pending, a mark success that aborts a Poll in flight and sends one refresh (the old response is dropped and the count does not move back), a response for an earlier page dropped, the timer reset by a refresh, a background failure that keeps the list and count and shows nothing, a foreground failure that sets the error state and keeps rows, 401 handled once and the timer stopped, abort and no state update after unmount, `open()` loading then page 1, `close()` back to page 1, a page that empties moves to the last page, `markRead` success (row read, count lowered then replaced by the refresh), 404 refetch, failure keeps Unread with a row notice and a toast, a `quiet` failure with no toast, and one E28 at a time.
    - Acceptance: Properties 11 to 13 hold, and each case asserts the requests sent and the state read.
    - _Requirements: 8.1–8.8, 10.5; Root: T13_

- [x] 5. Components (WP-F3)
  - [x] 5.1 `NotificationRow` and `NotificationPanel`
    - Create `frontend/components/notifications/NotificationRow.tsx` (a `next/link` to `/boards/<board_id>` with `notificationText(item)`, `break-words min-w-0`, a 44 px box and `onClick → onFollow(item)`; the board name and `formatCommentTime(created_at)`; an "Unread" `BaseBadge` for an Unread row; a "Mark as read" `BaseButton` with `aria-label="Mark as read: <text>"`, disabled while `markingId` is set and loading while it is this row; a `role="alert"` row notice) and `NotificationPanel.tsx` (props only, a `BaseModal` named "Notifications", the "<unread> unread of <total>" line, the loading, error with Retry, empty and list states, "Newer" and "Older" with "Page n of m" only when `pageCount > 1`, and a hidden `aria-live="polite"` region). Use `BaseModal`, `BaseButton` and `BaseBadge` only. Create `NotificationPanel.test.tsx`.
    - Acceptance: tests cover loading, empty, error with Retry and rows kept, the sentence for each kind, the Unread text marker, markup rendered as text, the link target, the Mark as read name and its disabled and loading states, the row notice, paging controls and their disabled states, no paging at one page, and the live region text.
    - _Requirements: 7.2–7.11, 9.1–9.6, 10.5; Root: T13; Decisions: B8; Design: DD15_
  - [x] 5.2 `NotificationBell`
    - Create `frontend/components/notifications/NotificationBell.tsx`: a `button` (`aria-haspopup="dialog"`, `aria-label={bellLabel(unread)}`, `min-h-11 min-w-11`, the nav-link hover and focus classes, an `aria-hidden` icon, a `BaseBadge` with `aria-hidden` only when `badgeText` is not empty, and no badge before the first response). It owns the open state, calls `open()` and `close()`, closes with focus returned to the button, and passes `onFollow` that calls `markRead(item.id, { quiet: true })` for an Unread row and `close()` without `preventDefault`. Create `NotificationBell.test.tsx`.
    - Acceptance: tests cover no badge before the first response and at 0, the count, `99+`, the exact count in the accessible name, opening the panel, focus returning to the bell on close, an Unread row's link that navigates although E28 fails, a read row's link that sends no request, and the target size classes.
    - _Requirements: 6.1–6.3, 6.6, 7.1, 7.4, 10.5; Root: T13; Decisions: B8, B10; Design: DD13_

- [x] 6. AppHeader integration (WP-F4)
  - [x] 6.1 Place the bell
    - In `frontend/components/shared/AppHeader.tsx` change the brand block to `<div className="flex min-w-0 flex-1 items-center justify-between gap-2 lg:flex-none lg:px-3">` holding the brand link and `<NotificationBell />`. Change nothing else in the header.
    - Acceptance: the header renders the bell, the Profile link, Boards, My tasks and Sign out, and keeps its wrap and truncation classes.
    - _Requirements: 6.1, 6.4, 6.6; Root: T13; Design: DD14_
  - [x] 6.2 Header tests
    - Extend `frontend/components/shared/AppHeader.test.tsx`: the bell is in the header with the brand, all five controls are present, and the header still wraps and truncates. Update the `@/lib/apiClient` mock (and any other test that renders `AppHeader` or the protected layout) to supply `apiGet` and `apiRequest`, so the bell's mount request does not break them.
    - Acceptance: the whole frontend suite passes, including the T11 and T12 tests.
    - _Requirements: 6.1, 6.4, 10.5; Root: T13_

- [x] 7. Mobile check, journey and full verification (WP-V)
  - [x] 7.1 Measured browser check
    - Create `evidence/notifications-mobile-measure.mjs` (Chrome with device emulation, modeled on the T11 and T12 scripts) and run it at 320, 375, 768 and 1280 px against the local app with seeded data: the header with no count, a count and `99+`; the panel loading, with Unread and read rows, empty, error and on the last page. Measure every control with `getBoundingClientRect` and `elementFromPoint` at its center, Tab through the header and the panel for a visible focus ring, check Escape and the focus return, and confirm no horizontal overflow and no overlap with the content below the header. Measure the Profile link, Boards, My tasks and Sign out together with the bell at 320 and 375 px. Take screenshots into `evidence/notifications-screenshots/`. Record the real results and that the browser was an emulator, not a real device. If the header needs the wrap fallback at 320 px, record it.
    - Acceptance: every measured control is at least 44 by 44 CSS px, with no horizontal page scroll. A failure is fixed and rerun, or recorded open.
    - _Requirements: 6.4, 9.1–9.6, 9.8; Root: T13; Decisions: B8, B10; Design: DD14, R3_
  - [x] 7.2 Manual journey
    - With two users on a local board: the second user assigns a card to the first and comments on it. The first user's bell shows the count within 30 seconds. They open the panel, mark one read, follow another, reload, and the count matches the stored state. Also remove the first user from the board and confirm the count drops, then add them again and confirm the rows return with their read status. Record the real result.
    - Acceptance: each step matches the expectation, or the difference is recorded as open.
    - _Requirements: 9.7, 9.8, 5.4, 5.5; Root: T13_
  - [x] 7.3 Full verification checkpoint (gate C)
    - From `backend/` run the full pytest suite. From `frontend/` run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. Record exact commands and counts in `evidence/notifications-T13.md`, with review findings and what each changed.
    - Acceptance: all pass with no new skip, or any failure is recorded open with its reason.
    - _Requirements: 10.4–10.7; Root: T13_

- [x] 8. Documentation checkpoint and root task (WP-D)
  - [x] 8.1 Review the diff
    - Review the actual diff against the spec and the guideline IDs (FE-D1 to FE-D9, FE-S3 to FE-S6, FE-A1, FE-A2). Confirm no new color, font, accent or dependency, and that the T11 and T12 changes are intact. Record findings and outcomes in `evidence/notifications-T13.md`.
    - Acceptance: every finding is fixed, or recorded open with its reason.
    - _Requirements: 6.5, 9.4; Root: T13_
  - [x] 8.2 Update the shared specs and guidelines
    - Update `guidelines/frontend.md` FE-D2 (the bell in the shell) and its component table, `frontend/specs/pages-and-components.md`, `frontend/specs/api-integration.md`, `backend/specs/data-model.md` and `specs/traceability.md` (AC10.1, AC10.2, E27–E28, the bell), and record any deviation from the approved design in `specs/CHANGELOG.md` with before, after, reason and verification.
    - Acceptance: the documents match the implementation, and each deviation has an entry.
    - _Requirements: 5.8, 6.5, 10.8; Root: T13_
  - [x] 8.3 README, USER_GUIDE and changelogs
    - Update `README.md` (status, the notification feature, verified facts), `docs/USER_GUIDE.md`, and `[Unreleased]` in `CHANGELOG.md`, `backend/CHANGELOG.md` and `frontend/CHANGELOG.md`. Keep entries concise and without duplicates.
    - Acceptance: each file names only verified behavior, with Playwright, real-device checks and deployment left open.
    - _Requirements: 10.8; Root: T13_
  - [x] 8.4 Evidence record
    - Write `evidence/notifications-T13.md` (commands, counts, the measured table, the journey, findings) and add an implementation record to `evidence/spec-review.md`.
    - Acceptance: the record names the tool that produced each phase and states what stayed open.
    - _Requirements: 9.8, 10.8; Root: T13_
  - [x] 8.5 Check root T13
    - Check T13 in `specs/tasks.md` only when 1 to 7 and 8.1 to 8.4 pass. Keep it open, with the reason, for any unverified or blocked item.
    - Acceptance: `specs/tasks.md` and the native checkboxes agree.
    - _Root: T13_

## Notes

- Test sub-tasks are not marked optional. Root completion in `specs/tasks.md` needs V08 and V11, so they are required here.
- Each backend test file covers one concern, as listed in `design.md` ("Backend test files").
- All database-writing tests clean up automatically through `BoardTracker` and run only on `TEST_DATABASE_URL` (tasks 2.1 to 2.9).
- Local checks prove local behavior only. Playwright (V10), real-device checks and deployment stay open for T15 and T16.
- Mark-all, delete, notification preferences, email, push, sockets, notifications for other events, a card deep link and a limit on notification volume are out of scope. The volume limit is tracked in T16.
- Attach `guidelines/backend.md`, `guidelines/database.md` or `guidelines/frontend.md` when creating a file with no matching file context.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "3.2"] },
    { "id": 2, "tasks": ["1.3", "3.3"] },
    { "id": 3, "tasks": ["1.4", "2.1"] },
    { "id": 4, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8"] },
    { "id": 5, "tasks": ["2.9"] },
    { "id": 6, "tasks": ["2.10"] },
    { "id": 7, "tasks": ["3.4", "4.1"] },
    { "id": 8, "tasks": ["4.2", "5.1"] },
    { "id": 9, "tasks": ["5.2"] },
    { "id": 10, "tasks": ["6.1"] },
    { "id": 11, "tasks": ["6.2"] },
    { "id": 12, "tasks": ["7.1", "7.2"] },
    { "id": 13, "tasks": ["7.3", "8.1"] },
    { "id": 14, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 15, "tasks": ["8.5"] }
  ]
}
```
