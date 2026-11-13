# Requirements Document

## Introduction

This slice covers root tasks T05 (Flask boards and membership API, endpoints E05–E12) and T06 (dashboard, board shell and membership controls in Next.js). It implements R03 (AC03.1–AC03.3), R04 (AC04.1–AC04.2) and the mobile criterion AC13.1 (FE-S4–S6) for every new page and dialog. Verification covers V03 (pytest and UI), V10 (Playwright) and V11 (375 px and wider).

Authentication (T03–T04) already provides the JWT guard, the public user DTO, the error envelope and the protected shell. The database already has the `boards`, `board_members`, `board_columns` and `cards` tables with soft deletion. No table or migration is added.

Decisions confirmed during clarification:

- E12 removes the membership and clears the removed user's active card assignments on that board in one transaction under the existing board lock, implemented in T05. Tests seed cards on two boards and confirm that assignments on the other board are preserved.
- Authenticated Nonmembers receive the same 404 status and error envelope as a missing board on board-scoped endpoints in this slice (contract clarification C1, approved).
- Request authentication runs first. Request-body validation then runs and may return 400 before board authorization. Body validation is independent of board and user lookups.
- E10 orders participants Admin first, then name, then `user_id`. Name sorting uses the database collation, which the design documents. Deterministic tests use collation-neutral names.
- Duplicate board names are allowed.
- E11 returns 404 with the distinct code `USER_NOT_FOUND` for an unknown email, only after the caller is confirmed as an Admin of the target board. This reveals whether an email is registered to board Admins (account-enumeration risk, accepted for v1). A per-admin E11 rate limit using shared storage is tracked in T16 before public release. Inaccessible-board errors stay generic.
- Server Components read E05, E07 and E10 through a server-only helper. Browser writes use Next Route Handlers.
- Tests use the existing stack: parameterized pytest and Vitest tests with deterministic database fixtures. Hypothesis and fast-check are not added.
- Generic string and email validators needed by both the auth and boards blueprints move to a shared validation module with behavior preserved.
- Database-writing tests use `TEST_DATABASE_URL`. Automatic teardown removes only the data created by that run, including related rows, even when assertions fail. Development and production data are never touched.
- The members list refreshes after each successful local mutation. A later board-access 404 shows the access error and navigates to the boards list (accepted for v1).
- The board shell shows a name header, a role badge, a members panel and an empty-columns placeholder. Admins also see add-by-email, remove, and rename and delete board controls. Kanban columns and cards are out of scope (T07–T09).
- Delete board and remove member each use a daisyUI modal confirm dialog that names the target, offers Cancel and Confirm, is keyboard accessible, and works at 375 px and wider.
- E07 returns empty `columns` until T07 creates columns, and empty `cards` until T08 creates cards. The query and serializer still read active columns and nested cards in deterministic order, so T07 and T08 need no change to E07.
- The existing contracts in `docs/API.md` are preserved, including the membership DTO `{user_id, name, role}`.

## Glossary

- **Boards_API**: The Flask blueprint serving E05–E12.
- **Dashboard_Page**: The Next.js page at `/` that lists the signed-in user's boards.
- **Board_Page**: The Next.js page at `/boards/[id]` that shows the board shell.
- **Members_Panel**: The section of the Board_Page that lists participants and, for admins, offers membership controls.
- **Confirm_Dialog**: The daisyUI modal used to confirm board deletion or member removal.
- **Participant**: A user with an active (not soft-deleted) membership on an active board.
- **Admin**: A Participant whose board role is `admin`.
- **Member**: A Participant whose board role is `member`.
- **Nonmember**: An authenticated user with no active membership on the board.
- **Active_Board**: A board whose `deleted_at` is null.
- **Membership_DTO**: The public membership shape `{user_id, name, role}`.
- **BoardSummary**: The public shape `{id, name, role, position_version}`.
- **BoardDetail**: BoardSummary plus `columns`, each column carrying its nested `cards`.
- **Mobile_Viewport**: A browser viewport 375 px wide or wider.
- **Board_Lock**: The existing board-level row lock that serializes board writes.
- **Shared_Validators**: The shared validation module holding the generic string and email validators used by both the auth and boards blueprints.
- **Server_Helper**: The server-only Next.js module that calls Flask with the cookie token for Server Component reads.
- **Test_Database**: The database named by `TEST_DATABASE_URL`.

## Requirements

### Requirement 1: Create and list boards

**User Story:** As a participant, I want to create boards and see only the boards I belong to, so that my dashboard lists the work I can access.

#### Acceptance Criteria

1. WHEN an authenticated user submits E06 with a name of 1 to 100 trimmed characters, THE Boards_API SHALL create an Active_Board and an admin membership for that user in one transaction and return 201 with a BoardSummary whose role is `admin`.
2. IF the E06 name is missing, empty after trimming, longer than 100 characters, or the body contains an unknown field, THEN THE Boards_API SHALL return 400 with `VALIDATION_ERROR` and create no board.
3. WHEN an authenticated user calls E05, THE Boards_API SHALL return 200 with the BoardSummary of each Active_Board on which that user has an active membership, sorted by name using the database collation and then by ID.
4. THE Boards_API SHALL omit from E05 every board on which the caller has no active membership and every soft-deleted board.
5. WHEN the Dashboard_Page loads, THE Dashboard_Page SHALL show each BoardSummary name with its role badge as a link to the Board_Page.
6. WHILE the caller has no accessible board, THE Dashboard_Page SHALL show an empty-state message and the create-board form.
7. WHEN a user submits the create-board form with a valid name, THE Dashboard_Page SHALL show the new board in the list and open its Board_Page.
8. IF the create-board form value is invalid or E06 fails, THEN THE Dashboard_Page SHALL show the field or request error and keep the entered name.
9. WHEN an authenticated user submits E06 or E08 with a name already used by another Active_Board, THE Boards_API SHALL accept the name.

### Requirement 2: Open board details

**User Story:** As a participant, I want to open a board and see its details, so that I know my role and who else is on it.

#### Acceptance Criteria

1. WHEN a Participant calls E07, THE Boards_API SHALL return 200 with a BoardDetail containing the caller's role, the `position_version` and the active columns, each with its nested active cards.
2. THE Boards_API SHALL order the E07 columns and cards by their stored `order`, then by ID.
3. WHILE no column or card writer exists (before T07 and T08), THE Boards_API SHALL return an empty `columns` array from E07.
4. IF the caller is a Nonmember, THEN THE Boards_API SHALL return for E07 through E12 the same 404 status and error envelope as for a missing board.
5. IF the board is soft-deleted or does not exist, THEN THE Boards_API SHALL return 404 for E07 through E12 with the same error envelope as for a Nonmember.
6. IF the board ID is not a valid UUID, THEN THE Boards_API SHALL return 400 with `VALIDATION_ERROR`.
7. WHEN a Participant opens the Board_Page, THE Board_Page SHALL show the board name as a header, a role badge reading Admin or Member, the Members_Panel and an empty-columns placeholder.
8. IF E07 returns 404, THEN THE Board_Page SHALL show a not-found state with a link back to the Dashboard_Page.
9. WHEN an unauthenticated visitor requests the Dashboard_Page or the Board_Page, THE Next.js app SHALL redirect the visitor to `/login`.
10. WHEN a Board_Page action returns a board-access 404 after the page has loaded, THE Board_Page SHALL show the access error and navigate to the Dashboard_Page.

### Requirement 3: Rename and delete a board

**User Story:** As an admin, I want to rename and delete my board, so that I can keep my boards accurate and remove obsolete ones.

#### Acceptance Criteria

1. WHEN an Admin submits E08 with a name of 1 to 100 trimmed characters, THE Boards_API SHALL update the board name and return 200 with the updated BoardSummary.
2. IF a Member calls E08 or E09, THEN THE Boards_API SHALL return 403 and leave the board unchanged.
3. IF a current board Member attempts any Admin-only action, THEN THE Boards_API SHALL return 403.
4. IF the E08 body is empty, contains an unknown field or has an invalid name, THEN THE Boards_API SHALL return 400 with `VALIDATION_ERROR`.
5. WHEN an Admin calls E09, THE Boards_API SHALL soft-delete the board and return 200 with `{"data": null}`.
6. WHEN E09 succeeds, THE Boards_API SHALL return 404 for later E05 listings of that board and for E07 through E12 on that board.
7. WHEN an Admin submits a new name from the Board_Page, THE Board_Page SHALL show the updated name in the header.
8. WHEN an Admin selects Delete board, THE Board_Page SHALL open the Confirm_Dialog naming the board, with Cancel and Confirm buttons.
9. WHEN an Admin selects Confirm on the board-deletion Confirm_Dialog and E09 succeeds, THE Board_Page SHALL navigate to the Dashboard_Page, where the board no longer appears.
10. WHILE the viewer is a Member, THE Board_Page SHALL hide the rename and delete controls.

### Requirement 4: Add and list members

**User Story:** As an admin, I want to add registered users to my board by email, so that my team can see it.

#### Acceptance Criteria

1. WHEN a Participant calls E10, THE Boards_API SHALL return 200 with the Membership_DTO of each active participant, ordered with the Admin first, then by name using the database collation, then by `user_id`.
2. WHEN an Admin submits E11 with the email of a registered user who has no active membership, THE Boards_API SHALL create an active membership with role `member` and return 201 with its Membership_DTO.
3. WHEN an Admin submits E11 for a user whose earlier membership on the same board was removed, THE Boards_API SHALL reactivate that membership with role `member` and return 201.
4. IF the E11 email belongs to a user who already has an active membership on the board, THEN THE Boards_API SHALL return 409.
5. IF the E11 email matches no registered user and the caller is an Admin of the target board, THEN THE Boards_API SHALL return a 404 error envelope with code `USER_NOT_FOUND` and a message that does not expose other users' data.
6. IF the E11 email is malformed or the body contains an unknown field, THEN THE Boards_API SHALL return 400 with `VALIDATION_ERROR` after authentication and before board authorization, using validation that does not depend on board or user lookups.
7. IF a Member calls E11 or E12, THEN THE Boards_API SHALL return 403 and change no membership.
8. THE Boards_API SHALL serialize memberships with an explicit allowlist of `user_id`, `name` and `role`, and expose no email, password hash or timestamp.
9. WHEN the Members_Panel loads, THE Members_Panel SHALL list each participant's name and role.
10. WHILE the viewer is an Admin, THE Members_Panel SHALL show an add-by-email form.
11. WHEN an Admin submits the add-by-email form and E11 succeeds, THE Members_Panel SHALL list the new member without a page reload and clear the email field.
12. IF E11 returns 400, 409 or 404 with code `USER_NOT_FOUND`, THEN THE Members_Panel SHALL show the matching error next to the email field and keep the entered email. THE Members_Panel SHALL map only the code `USER_NOT_FOUND` to the email field.
13. WHILE the viewer is a Member, THE Members_Panel SHALL hide the add-by-email form and every remove control.
14. IF E11 returns 404 without code `USER_NOT_FOUND`, THEN THE Board_Page SHALL show the generic board-access error and navigate to the Dashboard_Page.
15. WHEN a local E11 or E12 mutation succeeds, THE Members_Panel SHALL refresh the members list.

### Requirement 5: Remove a member

**User Story:** As an admin, I want to remove a member, so that they lose access to the board.

#### Acceptance Criteria

1. WHEN an Admin calls E12 for an active Member, THE Boards_API SHALL, under the Board_Lock and in one transaction, soft-delete that membership, clear the removed user's active card assignments on that board and return 200 with `{"data": null}`.
2. WHEN E12 succeeds, THE Boards_API SHALL return the Nonmember 404 to the removed user for E07 through E12 on that board and omit the board from that user's E05 listing.
3. IF the E12 target is the board's admin, THEN THE Boards_API SHALL return 409 and keep the membership active.
4. IF the E12 target has no active membership on the board, THEN THE Boards_API SHALL return 404.
5. IF E12 fails after the transaction starts, THEN THE Boards_API SHALL roll back and leave the membership active and the card assignments unchanged.
6. WHEN an Admin selects Remove for a member, THE Members_Panel SHALL open the Confirm_Dialog naming that member, with Cancel and Confirm buttons.
7. WHEN an Admin selects Confirm on the member-removal Confirm_Dialog and E12 succeeds, THE Members_Panel SHALL remove that member from the list.
8. THE Members_Panel SHALL omit the remove control for the board's admin.
9. WHEN E12 clears the removed user's assignments on one board, THE Boards_API SHALL preserve that user's card assignments on every other board.

### Requirement 6: Mobile and accessible UI

**User Story:** As a user on a phone, I want every new page and dialog to work at 375 px and wider, so that I can manage boards on mobile.

#### Acceptance Criteria

1. WHILE the viewport is a Mobile_Viewport, THE Dashboard_Page, Board_Page (including its not-found state), Members_Panel and Confirm_Dialog SHALL show no horizontal page scroll.
2. THE Dashboard_Page, Board_Page (including its not-found state and the app header brand link), Members_Panel and Confirm_Dialog SHALL render every interactive control with a rendered box of at least 44 by 44 CSS px.
3. THE Dashboard_Page, Board_Page and Members_Panel SHALL render every text input (create-board, rename and add-by-email) at a font size of at least 16 px.
4. WHILE the Confirm_Dialog is open, THE Confirm_Dialog SHALL move focus into the dialog, keep Tab focus inside it, close on Escape without calling the API, and return focus to the control that opened it.
5. WHEN a user opens the Dashboard_Page and Board_Page at 320, 375, 768 and 1280 px, THE Dashboard_Page and Board_Page SHALL keep the header, forms and member list usable.
6. WHEN this slice is handed off, THE evidence log SHALL record the measured mobile check at the widths checked, whether the browser was an emulator or a real device, and the manual browser journey of create, open, add member, remove member and delete board.
7. WHEN a Mobile_Viewport user creates a board, opens it, adds a member and removes a member through the Confirm_Dialog, THE Dashboard_Page and Board_Page SHALL complete that flow.

### Requirement 7: Contracts, scoping and verification

**User Story:** As a reviewer, I want contracts, scoping and open work recorded, so that the slice can be verified honestly.

#### Acceptance Criteria

1. THE Boards_API SHALL scope every board, member and nested-ID lookup by the board in the URL and the caller's active membership.
2. THE Boards_API SHALL add `Cache-Control: private, no-store` to E05–E12 responses and require a valid bearer token on each.
3. THE Boards_API SHALL return only fields in the documented BoardSummary, BoardDetail and Membership_DTO shapes.
4. WHEN the browser writes through E06, E08, E09, E11 or E12, THE Next.js app SHALL use same-origin Next Route Handlers that verify the exact Origin and keep the token in the HttpOnly cookie. WHEN a Server Component reads E05, E07 or E10, THE Next.js app SHALL call Flask through the Server_Helper with the cookie token, and no token SHALL reach browser code.
5. WHEN V03 runs, THE pytest suite SHALL cover Admin, Member and Nonmember access, board list and detail, rename, delete, member reactivation, admin-removal conflict, removal atomicity, member ordering, duplicate board names, the `USER_NOT_FOUND` ordering after admin authorization, and E12 assignment clearing with seeded cards on two boards where assignments on the other board are preserved.
6. WHEN this slice is handed off, THE evidence log SHALL record the measured mobile check and the manual browser journey of create, open, add member, remove member and delete board, and THE Playwright suite for that journey (V10) SHALL be delivered in T15, with the slice carrying the automated journey into T15.
7. WHEN the slice is handed off, THE documentation SHALL record in `specs/traceability.md` and the evidence notes the AC04.2 clearing verification, the account-enumeration risk of `USER_NOT_FOUND`, and the per-admin E11 rate limit with shared storage tracked in T16 before public release.
8. THE slice SHALL keep every endpoint path, method, request field and response shape in `docs/API.md` unchanged, except the added `USER_NOT_FOUND` error code for E11. Behavior the contract leaves open or states differently (Nonmember 404 identical to the missing-board 404 instead of 403 as approved in C1, `{"data": null}` for E09 and E12, E11 and E12 error cases, E12 assignment clearing) SHALL be recorded as contract clarifications C1–C5 in `design.md`, `docs/API.md` and `specs/CHANGELOG.md`, with D2, Requirement 7.8, the API contract and the tests updated together.
9. THE Boards_API SHALL authenticate each request first, then validate the request body, then authorize the caller against the board, with body validation independent of board and user lookups.
10. WHEN the Vitest and pytest suites cover properties, THE suites SHALL use parameterized tests and deterministic database fixtures from the existing test stack, without adding Hypothesis or fast-check.
11. THE Boards_API and the auth blueprint SHALL import the generic string and email validators from the Shared_Validators module, with auth behavior preserved and the auth regression tests passing.
12. WHEN a database-writing test runs, THE test suite SHALL write only to the Test_Database and, after the test passes or fails, SHALL remove only the data created by that run, including related rows.
