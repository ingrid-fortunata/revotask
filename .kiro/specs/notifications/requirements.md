# Requirements Document

## Introduction

This slice covers root task T13: the persisted notifications for a new assignment and a new comment on an assigned card (written inside the existing E17, E18 and E24 transactions), the recipient read APIs (E27 list, E28 mark read), and the notification bell in the shared header with its 30-second poll. It implements R10 (AC10.1, AC10.2) and the mobile criterion AC13.1 (FE-S4–S6) for every new control and dialog. Verification covers V08 (pytest and React Testing Library) and V11 (375 px and wider). The automated Playwright journey (V10) is delivered in T15.

The kanban and comments slices already provide `authorize_board` (check, lock, recheck), `record_event`, the 404 and 403 rules, the error envelope, `_require_participant` (an assignee is always an active participant, checked under the lock), `BaseModal`, `BaseButton`, `BaseBadge`, `FormField`, the same-origin helpers `handlePrivateRead` and `handlePrivateWrite`, `apiClient`, `useErrorHandler` and the `AppHeader`. The database already has the `notifications` table (`recipient_id`, `actor_id`, `board_id`, `card_id`, `kind` limited to `assigned` and `commented`, `created_at`, nullable `read_at`), its two indexes (`(recipient_id, created_at, id)` and a partial unread index) and the `User.notifications` relationship. The model file and the E24 service each carry a note that T13 completes them. `docs/API.md` already lists E27, E28 and the `Notification` shape. No table, migration or dependency is added. The only contract change is the additive display fields in B1 below.

Out of scope: a "mark all as read" action and its endpoint, deleting a notification, notification preferences, email, push and real-time delivery (sockets), notifications for unassigning, moving, editing or deleting a card or a comment, mentions, a notification for the assignee's own actions, a deep link that opens a card from a notification, grouping or collapsing several notifications, and a limit on notification volume per actor (tracked in T16 with the other abuse limits). Analytics (T14) is separate.

Decisions B1–B10 were approved on 2026-11-14 with the clarifications recorded in "Approved decisions" at the end. Each is stated as a requirement below.

## Glossary

- **Notifications_API**: The Flask blueprint serving E27 and E28 (`notifications_bp`). The write side is a function in the notifications service that the card and comment services call.
- **Recipient**: The user in `recipient_id`. A notification is private to its Recipient.
- **Actor**: The user in `actor_id`, who caused the notification.
- **Assignee**: The user in `cards.assignee_id` of an Active_Card.
- **Active_Card**, **Active_Board**, **Participant**, **Board_Lock**: As defined in the kanban and boards-membership specs.
- **Visible_Notification**: A notification whose board is an Active_Board, whose card is an Active_Card in an active column of that board, and whose Recipient is an active member of that board. E27, E28 and every count use this one filter (D3).
- **Notification**: The wire shape `{id, kind, board_id, card_id, actor_id, created_at, read_at}` plus the display fields `actor_name`, `board_name` and `card_title` (B1). The display fields hold current values.
- **Unread**: A notification with `read_at` null.
- **Notification_Bell**: The client control in the AppHeader that shows the unread count and opens the Notification_Panel.
- **Notification_Panel**: The dialog (`BaseModal`) that lists the Recipient's notifications.
- **useNotifications**: The client hook that fetches, polls and refreshes the notifications.
- **Poll**: One E27 request that the hook sends on its 30-second timer.
- **Test_Database**: The database named by `TEST_DATABASE_URL`.

## Requirements

### Requirement 1: Notify on assignment

**User Story:** As a participant, I want to be told when someone assigns a card to me, so that I know what the team expects from me.

#### Acceptance Criteria

1. WHEN a Participant creates a card (E17) with an `assignee_id` that is not the caller, THE Notifications_API SHALL create one Notification of kind `assigned` for that Assignee, with the caller as Actor and the new card and its board, in the same transaction as the card (AC10.1, B2).
2. WHEN a Participant edits a card (E18) and the submitted `assignee_id` is a user who is not the card's current Assignee and not the caller, THE Notifications_API SHALL create one Notification of kind `assigned` for the new Assignee in the same transaction as the change. The current Assignee SHALL be read under the Board_Lock, so two concurrent edits to the same new Assignee create one Notification, not two (AC10.1, B2).
3. WHEN the caller assigns a card to the caller, THE Notifications_API SHALL create no Notification (AC10.1, B2).
4. WHEN E18 submits the card's current Assignee again, clears the assignee (null) or changes only the title or description, THE Notifications_API SHALL create no Notification (AC10.1, D6).
5. WHEN a card moves from one Assignee to another, THE Notifications_API SHALL notify only the new Assignee. The previous Assignee, an unassigned card, a card move (E20), a card delete (E19) and the removal of a member (E12, which clears assignments) SHALL create no Notification (B2).
6. WHEN a card goes from unassigned to A, then to B, then to A again, and a user other than A and B makes all three changes, THE Notifications_API SHALL create one Notification for A, one for B and a second one for A. It SHALL NOT remove duplicates by card or by user. A change that the caller makes to the caller is excluded by criterion 3 (B3).
7. THE Notifications_API SHALL set `created_at` from one clock reading in the same transaction as the triggering change, so the order of notifications follows the order of commits per card.
8. IF the triggering request fails for any reason after the transaction starts (validation, access, a database error), THEN no Notification SHALL be stored. IF the Notification write fails, THEN the card change SHALL roll back with it, and the caller SHALL receive the sanitized error of the shared handlers.

### Requirement 2: Notify on comment

**User Story:** As an assignee, I want to be told when someone comments on my card, so that I can answer without watching every card.

#### Acceptance Criteria

1. WHEN a Participant adds a comment (E24) on an Active_Card whose Assignee is not the comment's author, THE Notifications_API SHALL create one Notification of kind `commented` for the Assignee, with the author as Actor and the card and its board, in the same transaction as the comment and its `comment_created` event (AC10.1, B2).
2. WHEN the author of the comment is the Assignee, or the card has no Assignee, THE Notifications_API SHALL create no Notification.
3. THE Notifications_API SHALL create one Notification for each qualifying comment. Two comments by the same author on the same card create two Notifications (B3).
4. THE Notifications_API SHALL create no Notification when a comment is edited (E25) or deleted (E26), and a deleted comment SHALL NOT remove an earlier Notification (B2).
5. THE Notifications_API SHALL read the Assignee under the Board_Lock, in the transaction that creates the comment, so a comment that races with a reassignment notifies the Assignee that the committed state shows at that moment.
6. IF E24 fails after the transaction starts, THEN neither the comment, the event nor the Notification SHALL be stored (Requirement 1.8 applies).
7. THE Notifications_API SHALL NOT change `position_version` and SHALL record no `board_events` row for a Notification.

### Requirement 3: List my notifications (E27)

**User Story:** As a signed-in user, I want to read my notifications, newest first, so that I can see what changed.

#### Acceptance Criteria

1. WHEN the caller sends E27, THE Notifications_API SHALL return 200 with `{items, page, per_page, total, unread_count}` for the caller's Visible_Notifications only, sorted by `created_at` descending and then by the notification `id` descending as the final tie-breaker (newest first), so two requests with no change in between return the same order, and consecutive pages neither repeat nor skip a row (AC10.2, B5).
2. THE Notifications_API SHALL accept `page` (an integer, 1 to 2,147,483,647, default 1) and `per_page` (an integer, 1 to 50, default 20), each sent once. A missing parameter takes its default. THE Notifications_API SHALL compute the offset `(page - 1) * per_page` with arithmetic that holds the largest accepted values (2,147,483,646 × 50 is above the 32-bit range) and SHALL pass it to the database as a 64-bit value, so `page=2147483647&per_page=50` returns an empty list with 200 and no database error (B5).
3. THE Notifications_API SHALL return `total` as the number of the caller's Visible_Notifications, read and unread, and `unread_count` as the number of them that are Unread. Both counts SHALL NOT depend on `page` or `per_page`, and SHALL be present, with the true values, on an empty page (B6).
4. WHEN `page` is past the last page, THE Notifications_API SHALL return 200 with an empty `items` list and the true `total` and `unread_count`.
5. THE Notifications_API SHALL return each item as a Notification with the documented fields and the display fields `actor_name`, `board_name` and `card_title` as current values from `users`, `boards` and `cards`, and no other field (B1).
6. IF a query parameter is not an integer in range, a boolean-like or numeric-looking text such as `1.5`, `0x1` or an empty value, a known parameter is repeated, or an unknown parameter is sent, THEN THE Notifications_API SHALL return 400 `VALIDATION_ERROR`, with `fields.page` or `fields.per_page` for a known parameter and the standard message "Check the submitted fields." with no field entry for an unknown one, before any database read, as E21 and E22 do (B5).
7. WHEN the caller has no Visible_Notification, THE Notifications_API SHALL return 200 with an empty list and `total` and `unread_count` of 0.
8. THE Notifications_API SHALL be read-only: E27 SHALL NOT take the Board_Lock, write a row, record an event or change `position_version`.
9. THE Notifications_API SHALL check in this order: authentication (401), query (400), then the read.

### Requirement 4: Mark a notification read (E28)

**User Story:** As a signed-in user, I want to mark a notification read, so that the bell shows only what I have not seen.

#### Acceptance Criteria

1. WHEN the Recipient sends E28 for an Unread Visible_Notification, THE Notifications_API SHALL set `read_at` to the current time and return 200 with the Notification item (the same shape as an E27 item, with `read_at` set) in `data` (AC10.2, B7).
2. WHEN the Recipient sends E28 for a notification that is already read, THE Notifications_API SHALL return 200 with the Notification, write nothing and keep the original `read_at` (B7).
3. WHEN two E28 requests for the same Unread notification run at the same time, THE Notifications_API SHALL commit one `read_at`, return 200 to both and keep the first committed value. The write SHALL be one conditional update scoped to a row that the caller owns, that is Unread and that passes the Visible_Notification filter (`read_at IS NULL`), not a read followed by a write. An update that matches no row SHALL NOT be reported as a success unless the notification is a visible, already read row of the caller.
4. IF the notification does not exist, belongs to another user, or is not a Visible_Notification (its board, card or column is deleted, or the Recipient is no longer a member), THEN THE Notifications_API SHALL return 404 `NOT_FOUND` with the same envelope in each case and change nothing. A notification of another user SHALL behave as missing (B7).
5. IF the path ID is not a UUID, THEN THE Notifications_API SHALL return 400. E28 SHALL read no request body. The check order is authentication (401), path ID (400), lookup (404), then the write.
6. THE Notifications_API SHALL change only `read_at` of that row. It SHALL NOT take the Board_Lock, write an event, create a Notification or change `position_version`.
7. THE slice SHALL add no endpoint to mark all notifications read, and no endpoint to delete or mark a notification unread (B7).

### Requirement 5: Visibility, privacy and role boundary

**User Story:** As a user, I want my notifications to stay mine and to follow my access, so that nothing leaks from boards I left.

#### Acceptance Criteria

1. THE Notifications_API SHALL require a valid bearer token on E27 and E28. A missing, malformed, expired or revoked token SHALL return 401 `AUTH_REQUIRED` and change nothing.
2. THE Notifications_API SHALL add `Cache-Control: private, no-store` to every E27 and E28 response, success and error.
3. THE Notifications_API SHALL return and change only the caller's own rows. A board admin, a board member and a user with no board have the same rights: nobody reads or marks another user's notification, an admin of the board included (D3).
4. WHEN a Recipient is removed from a board, or the board, card or column of a notification is soft-deleted, THE Notifications_API SHALL exclude that notification from E27 items, `total` and `unread_count`, and E28 SHALL return 404 for it. Nothing is deleted (AC10.2, B4).
5. WHEN access returns (the Recipient is added again, or the Recipient's membership is reactivated on the same board and the card is still active), THE Notifications_API SHALL include those notifications again with their original `read_at` (a notification read before the removal stays read, an Unread one stays Unread). This follows from the filter and SHALL be covered by a test for removal and for rejoin (B4).
6. THE display fields of a Notification SHALL NOT disclose the name of a board, a card or a user that the caller cannot access, because a notification that fails the filter is not returned.
7. THE Notifications_API SHALL NOT log a notification's content or an actor name. Logs keep the request ID, route and outcome only.
8. THE slice SHALL keep every path, method and the wire status codes in `docs/API.md` unchanged. The additive display fields (B1) and the behavior that the contract leaves open SHALL be recorded as contract clarifications in the design, `docs/API.md` and `specs/CHANGELOG.md`: the trigger rules, one Notification per qualifying event, the shared visibility filter, the E27 query rule, the E28 idempotence, and the 404 for a hidden or foreign notification.

### Requirement 6: Notification bell in the header

**User Story:** As a signed-in user, I want a bell in the header that shows how many notifications I have not read, on every screen size.

#### Acceptance Criteria

1. THE AppHeader SHALL contain the Notification_Bell at every width, in the top bar below 1024 px and in the sidebar from 1024 px, as one control next to the account block. It SHALL be a button with an icon, built from the existing shared button styles, with no new color, font or accent (FE-D1, FE-S3, B8).
2. THE Notification_Bell SHALL show the Unread count from the latest successful E27 response as a badge, hide the badge while the count is 0, and show `99+` for a count above 99. THE accessible name SHALL include the exact count in plain text, also above 99 ("Notifications, 120 unread" while the badge shows `99+`), and SHALL be "Notifications" for 0. THE slice SHALL update FE-S3 in `guidelines/frontend.md` to say so (FE-S3, B10).
3. THE Notification_Bell SHALL NOT show a stale count as a fresh one: before the first response it shows no badge, and after a failed Poll it keeps the last count and shows no error badge (B9).
4. THE Notification_Bell SHALL render with a box of at least 44 by 44 CSS px, keep a visible keyboard focus ring and cause no horizontal overflow at 320 and 375 px. At 320 px and 375 px the Notification_Bell, the Account link, "Boards", "My tasks" and "Sign out" SHALL all be reachable, each at least 44 by 44 CSS px, with no overlap of the content below the header (FE-S4, FE-S5).
5. THE slice SHALL record the shell change in `guidelines/frontend.md` FE-D2 and in the design, as S10 and T12 did.
6. THE Notification_Bell SHALL render only inside the protected shell, where a signed-in user exists. It SHALL NOT appear on `/login` or `/register`.

### Requirement 7: Notification panel

**User Story:** As a signed-in user, I want to open my notifications, read what happened and mark them read, in one place.

#### Acceptance Criteria

1. WHEN the user activates the Notification_Bell, THE app SHALL open the Notification_Panel as a `BaseModal` named "Notifications", close it on Escape and on its close control, and return focus to the Notification_Bell. It SHALL trap focus while open (FE-C3, B8).
2. THE Notification_Panel SHALL list the notifications of the current page, newest first, each as one row that says in plain text who did what on which card of which board: "<actor_name> assigned you to <card_title>" for `assigned` and "<actor_name> commented on <card_title>" for `commented`, with the board name and the creation time (FE-D7).
3. THE Notification_Panel SHALL show an Unread row with a visible text marker ("Unread"), not color alone, and a read row without it (FE-D6).
4. THE title of each row SHALL be a link to `/boards/<board_id>` (there is no card deep link). WHEN the user follows the link of an Unread row, THE app SHALL attempt E28 for it, THE Notification_Panel SHALL close, and navigation SHALL happen at once and SHALL NOT wait for or depend on that request. IF the attempt fails, THEN the navigation SHALL still have happened, no toast SHALL interrupt the new page, and the row stays Unread until the next refresh shows it. Following the link of a read row sends no request (B8).
5. EACH Unread row SHALL also have a "Mark as read" button with an accessible name that names the row (for example "Mark as read: Ana assigned you to Fix login"). WHEN it is activated, THE useNotifications hook SHALL send E28, and on success THE row SHALL show as read, the count and the list SHALL refresh at once, and focus SHALL stay in the panel on a stable control. A read row SHALL show no such button (AC10.2, B8).
6. THE Notification_Panel SHALL page with "Newer" and "Older" controls, 20 items per page, disabled at the first and last page, and a text line "Page n of m". It SHALL show no paging controls when everything fits on one page (AC10.2, B8).
7. WHEN the panel opens, THE Notification_Panel SHALL show a loading state until the first response of that open, then the list. WHILE the list has no item, it SHALL show "You have no notifications." and what produces one (an assignment or a comment on an assigned card) (FE-D7).
8. IF E27 fails when the panel is open, THEN THE Notification_Panel SHALL show an error message with a Retry control and keep any rows already shown. IF E28 fails with a 5xx status or a transport failure, THEN THE row SHALL stay Unread, the row SHALL show a retry message in the panel (text, in the live region) and a toast SHALL say that marking failed and what to do, and the "Mark as read" button SHALL be enabled again to try again. IF E28 returns 404, THEN THE hook SHALL refetch the list, because the notification is hidden or gone. IF E27 or E28 returns 401, THEN THE app SHALL clear the session and go to `/login`, as for other private requests (FE-A1).
9. WHEN the page of the panel becomes empty after a refresh (the last item on the last page went away), THE hook SHALL move to the last page that exists.
10. THE Notification_Panel SHALL render content as plain text. A card title, a board name or an actor name that contains markup SHALL appear as that literal text.
11. THE announcement of a successful mark and of a failed request SHALL be available as text in a live region.
12. WHEN the panel closes, THE hook SHALL return to page 1 for the next Poll.

### Requirement 8: Polling and refresh

**User Story:** As a signed-in user, I want the bell to stay current without reloading, and I do not want it to flood the server.

#### Acceptance Criteria

1. WHILE the Notification_Bell is mounted, THE useNotifications hook SHALL send one E27 request on mount and then one Poll every 30 seconds, for the page that the panel shows (page 1 while it is closed) with `per_page=20` (AC10.1, B9).
2. THE hook SHALL NOT start a Poll while a previous E27 request is still pending. IF a tick arrives during a request, THEN that tick is skipped, not queued.
3. WHEN a mark-read succeeds, THE hook SHALL refresh the list and the count at once with one E27 request for the page the panel shows, and the next Poll SHALL be 30 seconds after that refresh. IF an E27 request is in flight when E28 succeeds, THEN THE hook SHALL abort it and send the refresh, so one E27 request is in flight at a time. WHILE an E28 request is pending, a Poll tick SHALL be skipped (B9).
4. WHEN the component unmounts (for example on sign-out), THE hook SHALL clear its timer and abort any in-flight request, and a response that arrives later SHALL NOT update state or show a toast (FE-A2).
5. THE hook SHALL discard an E27 response that was requested for an earlier page than the one now shown, and one that was requested before a completed E28 (a Poll that was in flight when the mark-read finished), so stale data never overwrites the list, the count or the page. A discarded response SHALL NOT show an error either (B9).
6. IF a Poll fails with a 5xx status, a rate limit or a transport failure, THEN THE hook SHALL keep the last list and count, show no toast and send the next Poll on schedule. A 401 SHALL follow Requirement 7.8.
7. THE hook SHALL add no push, socket or visibility-based catch-up request in v1. A tab that was in the background sends its next Poll on the normal timer (B9).
8. THE hook SHALL NOT send an E27 request on a route where the protected shell is not mounted.

### Requirement 9: Mobile and accessible UI

**User Story:** As a user on a phone, I want to read and clear my notifications at 375 px and wider.

#### Acceptance Criteria

1. WHILE the viewport is 375 px wide or wider, THE Notification_Bell and the Notification_Panel SHALL show no horizontal page scroll. A long card title, board name or actor name SHALL wrap (`break-words`, `min-w-0`) and SHALL NOT widen the dialog. Pinch zoom SHALL stay enabled (FE-S2, FE-S4).
2. WHEN the rows exceed the viewport height, THE Notification_Panel SHALL scroll inside itself and keep the close control reachable.
3. EVERY control added by this slice (the bell, the close control, each row link, each "Mark as read" button, "Newer", "Older" and Retry) SHALL render with a box of at least 44 by 44 CSS px, confirmed with `elementFromPoint` at its center, and SHALL show a visible keyboard focus ring. The same SHALL hold at 320 px and at 375 px for the controls that already exist in the header (the Account link, "Boards", "My tasks" and "Sign out") after the bell is added (FE-S5, B8).
4. THE new surfaces SHALL follow the Visual Design System (FE-D1 to FE-D9): `BaseModal`, `BaseButton`, `BaseBadge` where a badge is needed, `.surface` only where a panel is needed and never nested, daisyUI semantic colors, Figtree, sentence case, and no new color or font (FE-D3).
5. THE list SHALL be a list in the accessibility tree. THE panel heading SHALL show the Unread and total counts in text. Each control SHALL have an accessible name that names its row.
6. WHILE the panel is open, focus SHALL move inside it, Tab SHALL stay inside it, Escape SHALL close it without a request, and focus SHALL return to the Notification_Bell.
7. WHEN a user on a 375 px viewport opens the bell, reads a notification, marks it read, follows a link and reloads, THE flow SHALL be completable with touch and without hover, and the count SHALL show the stored state after the reload.
8. WHEN this slice is handed off, THE evidence log SHALL record a screenshot and measured check at 320, 375, 768 and 1280 px for the AppHeader (bell with no count, with a count and with `99+`) and for the Notification_Panel (loading, a list with Unread and read rows, empty, error, last page), whether the browser was an emulator or a real device, and the manual journey: a second user assigns me a card and comments on it, the bell shows the count within 30 seconds, I open the panel, mark one read, follow another, reload, and the count matches.

### Requirement 10: Browser handlers, client allowlist and verification

**User Story:** As a reviewer, I want the token to stay server-side and the checks to be honest about what ran.

#### Acceptance Criteria

1. WHEN the browser reads or marks notifications, THE Next.js app SHALL use same-origin Route Handlers: `GET /api/notifications` (E27, built on `handlePrivateRead` with the query string forwarded unchanged so Flask validates it) and `PATCH /api/notifications/[id]/read` (E28, built on the existing write helper with its exact Origin check, 403 for a wrong one). They SHALL check the session cookie (401, and clear it), validate the path UUID before any upstream call (400), forward only the declared path and method with the session token from the HttpOnly cookie, return `Cache-Control: private, no-store`, pass through the upstream status and error code, and forward no request body for E28 (B7).
2. THE handlers SHALL NOT forward a token to the browser and SHALL NOT forward any path other than the two above.
3. THE `apiClient` allowlist SHALL gain `GET /api/notifications` (with the `page` and `per_page` query) and `PATCH /api/notifications/<uuid>/read`, and no other `/api/notifications` path. A non-UUID segment SHALL throw before `fetch`. THE client parser SHALL copy only the documented Notification fields and the three display fields, and throw a typed `ApiError` on any other shape, as the existing parsers do (FE-A1).
4. WHEN V08 runs on the backend, THE pytest suite SHALL cover: E17 and E18 with a new assignee (one `assigned` notification with the right recipient, actor, card, board and kind), self-assignment, the same assignee again, clearing the assignee, a title-only edit, reassignment to a different user (only the new one is notified), and A→B→A (two for A); E24 with an assigned card and a different author (one `commented`), the Assignee as author, an unassigned card, two comments (two notifications), and an edit and a delete (none); atomicity in both directions (an injected failure after the card change leaves no notification, an injected failure in the notification write leaves no card change or comment, and a 400 or 404 request writes none); transaction rollback of the notification together with the change (a card change or a comment that fails after the notification is staged, and a notification write that fails, each leave neither row); the Board_Lock ordering (two concurrent assignments to the same user create one notification; a comment racing with a reassignment notifies the committed Assignee); recipient isolation (user B never reads or marks user A's notification, an admin included, and a foreign ID is 404); newest-first order with the `id` tie-break; pagination (defaults, `per_page` bounds, page past the end, `total` and `unread_count` independent of the page); the query validation cases of Requirement 3.6; idempotent mark-read (second call 200 with the original `read_at`, no write) and two concurrent mark-reads keeping one `read_at`; visibility (member removal, soft-deleted board, card and column each hide the row from items, `total` and `unread_count` and make E28 return 404, and a member who is removed and then added again sees the same rows again with their original `read_at`, read and Unread, and the counts follow on every page including an empty one); the display fields as current values (a renamed actor, board and card); the check orders; 401 on each route with no, malformed, expired and revoked tokens; `Cache-Control` on every response; no change to `position_version`; no `board_events` row from a notification; E27 and E28 write nothing apart from `read_at`; the largest accepted `page` with `per_page=50`; and that no actor name or notification content appears in the log output.
5. WHEN V08 and V11 run on the frontend, THE Vitest and React Testing Library tests SHALL cover: the Notification_Bell (no badge before the first response and at 0, the count, `99+`, the accessible name, target size classes), the Notification_Panel (loading, empty, error with Retry, rows with the right sentence for each kind, the Unread marker, plain-text rendering of markup, paging controls and their disabled states, the link target, "Mark as read" with its accessible name, closing returns focus), `useNotifications` with fake timers (mount request, one Poll per 30 seconds, no overlapping request, a skipped tick, a mark-read refresh that resets the timer, an older response ignored, silent failure of a Poll, 401 handling, abort and no state update after unmount, moving to the last page when the current one empties, page 1 after close), the AppHeader with the bell at every width (the five controls in one header, each reachable), the link of an Unread row that navigates although E28 fails, the "Mark as read" failure that keeps the row Unread and shows the retry message, a Poll in flight when E28 completes (its response is discarded and one refresh runs), a response for an earlier page that is discarded, a tick skipped while E28 is pending, the two handlers (a valid request, 403 for a wrong Origin on E28, 401 clears the cookie, 400 for a non-UUID path, query forwarded unchanged, no token in the response, no body forwarded), the `apiClient` allowlist and the parser, asserting rendered text, roles and the requests sent, not only that a component mounts.
6. Database-writing tests SHALL write only to the Test_Database (`TEST_DATABASE_URL`, through `db_guard` and `BoardTracker`) and remove only the data created by the run, even when assertions fail. The existing `BoardTracker` cleanup already removes the notifications of tracked boards and users, and a sentinel untracked notification SHALL survive it.
7. THE slice SHALL use the existing test stack: parameterized pytest, Vitest and React Testing Library, without a new dependency. The automated Playwright journey (V10) is delivered in T15.
8. WHEN the slice is handed off, THE documentation SHALL record the status in `specs/traceability.md` (AC10.1, AC10.2, E27–E28, the bell), `docs/API.md` (the Notification shape and the clarifications), `docs/TEST-PLAN.md` (V08 and V11), the README, the USER_GUIDE, the changelogs and the evidence log (`evidence/notifications-T13.md`), with real-device checks and Playwright left open where they have not run.

## Approved decisions

The user approved B1–B10 on 2026-11-14 with the clarifications in the table. The table records the outcome. The cited requirements state each one.

| ID | Decision | Outcome | Where |
|---|---|---|---|
| B1 | Notification shape | Approved. `actor_name`, `board_name` and `card_title` are added to E27 and E28. Their current values are resolved on read, only for items that pass the visibility filter. The fields are documented in the shared API contract and every existing field is kept. | 3.5, 5.6, 5.8, 10.3 |
| B2 | Triggers | Approved. On E17 and E18 the new assignee is notified when the assignment changes and the new assignee differs from the caller. On E24 the current assignee is notified when they differ from the comment author. Each notification is inserted in the same transaction as its triggering change, so a rolled-back change leaves no notification. The exclusions stay. | 1.1–1.5, 1.8, 2.1–2.7 |
| B3 | Duplicates | Approved. One notification per qualifying event. `unassigned → A → B → A` notifies A twice when a different user makes all three changes. Separate qualifying comments create separate notifications. | 1.6, 2.3 |
| B4 | Visibility | Approved. One filter for E27 items, both counts and E28: active board, column and card, and the recipient's active membership. Historical rows are kept. A rejoining recipient sees the rows again with their original read status. | 5.4, 5.5 |
| B5 | E27 query | Approved. Defaults and strict validation stay. Both ranges are stated (`page` 1 to 2,147,483,647, `per_page` 1 to 50). The offset is computed with arithmetic that holds the largest values. A page past the end is an empty 200. Order is `created_at` descending, then the notification `id` descending. | 3.1, 3.2, 3.4, 3.6 |
| B6 | Counts | Approved. `total` counts all visible notifications and `unread_count` all visible unread ones, whatever the page. Both stay on an empty page. | 3.3, 3.7 |
| B7 | E28 | Approved. No request body. 200 with the item in `data`. A conditional update scoped to a visible notification of the caller. A repeat keeps the original `read_at`. One generic 404 for a missing, foreign or hidden ID. No board lock, no mark-all. | 4.1–4.7, 10.1 |
| B8 | UI | Approved. `BaseModal`, board links, "Newer" and "Older" at 20 per page. Following an unread row's link attempts to mark it read and navigates even if that fails. The "Mark as read" button shows retry feedback on failure and keeps the row Unread. Keyboard focus, Escape and 44 by 44 CSS px targets are checked at 320 and 375 px, with the existing header controls. | 6.4, 7.1–7.9, 9.3, 9.6 |
| B9 | Polling | Approved. Every 30 seconds for the shown page (page 1 while closed). One E27 request in flight. Poll failures are quiet. After a successful E28 the list and badge refresh. A response for an earlier page, or one requested before a completed E28, is discarded. | 6.3, 8.1–8.8 |
| B10 | Badge | Approved. The visual badge is hidden at 0 and shows `99+` above 99. The exact count stays in the accessible name. FE-S3 is updated. | 6.2 |

## Dependency note

The prerequisites in `specs/FEATURE-QUEUE.md` are Kanban and comments. Both are verified: root T07 to T10 are checked in `specs/tasks.md`, with evidence in `evidence/kanban-T07-T09.md` and `evidence/comments-T10.md`. No prerequisite blocks this slice. The working tree holds uncommitted T11 and T12 changes in shared files (`AppHeader.tsx`, `lib/server/flask.ts`, `privateRoute.ts`, `apiClient.ts`, `lib/types.ts`, `cards/service.py`, `validation.py`). This slice must build on them and not overwrite them.
