# Requirements Document

## Introduction

This slice covers root tasks T07 (ordered column API, E13–E16), T08 (card API and position service, E17–E20) and T09 (Kanban UI on `/boards/[id]`). It implements R05 (AC05.1–AC05.2), R06 (AC06.1), R07 (AC07.1–AC07.2) and the mobile criterion AC13.1 (FE-S4–S6) for every new control and dialog. Verification covers V04 (pytest), V05 (React and browser), V10 (the Playwright journey, delivered in T15) and V11 (375 px and wider).

Boards and membership (T05–T06) already provide `authorize_board` (check, lock, recheck), the 404 and 403 rules, the error envelope, the `BoardShell` island, `ConfirmDialog`, `BaseModal` and the members list. The database already has `board_columns`, `cards` and `board_events` with the finite-positive `order` check, the one-active-Done-column index and the event kinds `card_created`, `card_moved`, `column_reordered` and `entered_done`. E07 already returns active columns with nested active cards in `(order, id)` order. No table or migration is added and E07 does not change.

Out of scope: comments and the card detail modal (T10), My Tasks E21 and board search E22 (T11), assignment and comment notifications (T13), analytics (T14), Playwright automation (T15) and deployment (T16). The T13 notification writes will extend the E17 and E18 transactions later, so this slice leaves them unchanged.

Decisions K1–K12 were approved on 2026-11-13, with the clarifications recorded in "Resolved decisions" at the end. Each is stated as a requirement below.

## Glossary

- **Columns_API**: The Flask blueprint serving E13–E16 (`columns_bp`).
- **Cards_API**: The Flask blueprint serving E17–E20 (`cards_bp`).
- **Board_Page**: The Next.js page at `/boards/[id]`.
- **Kanban_Board**: The client island on the Board_Page that shows columns and cards and runs every Kanban action.
- **Kanban_Region**: The horizontally scrollable area that holds the columns.
- **Participant**, **Admin**, **Member**, **Nonmember**, **Active_Board**, **Board_Lock**: As defined in the boards-membership spec.
- **Active_Column**: A column of an Active_Board whose `deleted_at` is null.
- **Active_Card**: A card in an Active_Column whose `deleted_at` is null.
- **Done_Column**: An Active_Column with `is_done` true.
- **Position_Version**: The board's `position_version`. It changes on every column or card create, delete or move.
- **Anchor**: The sibling an item is placed before. Null means the end of the list.
- **Position_Request**: E16 or E20.
- **Move_Function**: The single client function that sends E20 and applies its outcome. Drag and the Move control both call it.
- **Move_Control**: The visible Move button on each card and the dialog it opens.
- **Snapshot**: The affected column and card lists, saved before an optimistic change.
- **Test_Database**: The database named by `TEST_DATABASE_URL`.

## Requirements

### Requirement 1: Manage columns

**User Story:** As an admin, I want to add, rename and remove workflow columns, so that the board matches how my team works.

#### Acceptance Criteria

1. WHEN an Admin submits E13 with `name` of 1 to 80 trimmed characters and an optional boolean `is_done`, THE Columns_API SHALL create an Active_Column at the end of the board (order of the last column plus 1024, or 1024 for the first), increase the Position_Version by 1 under the Board_Lock, and return 201 with `{column, position_version}`.
2. IF the E13 body has a missing or blank name, a name over 80 characters, a non-boolean `is_done` or an unknown field, THEN THE Columns_API SHALL return 400 `VALIDATION_ERROR` with field errors and create no column.
3. IF E13 sets `is_done` true while the board already has a Done_Column, THEN THE Columns_API SHALL return 409 `STATE_CONFLICT` and create no column.
4. WHEN an Admin submits E14 with `name`, `is_done` or both, THE Columns_API SHALL update only the submitted fields and return 200 with the column. E14 SHALL NOT change the Position_Version.
5. IF the E14 body is empty, has an unknown field or has an invalid value, THEN THE Columns_API SHALL return 400 `VALIDATION_ERROR`.
6. IF E14 changes `is_done` on a column that has Active_Cards, THEN THE Columns_API SHALL return 409 `STATE_CONFLICT` and change nothing, including any other field in the same request. An E14 that submits the column's current `is_done` value is not a change and succeeds on a nonempty column, and the Columns_API SHALL apply any other valid change in that request, such as a rename.
7. IF E14 sets `is_done` true while another Active_Column is the Done_Column, THEN THE Columns_API SHALL return 409 `STATE_CONFLICT`. Two simultaneous requests that each try to create or set a Done_Column SHALL leave at most one Done_Column.
8. WHEN an Admin calls E15 on a column with no Active_Cards, THE Columns_API SHALL soft-delete the column, increase the Position_Version by 1 and return 200 with `{"data": {"position_version": n}}`.
9. IF E15 targets a column that has Active_Cards, THEN THE Columns_API SHALL return 409 `STATE_CONFLICT` and change nothing.
10. IF a Member calls E13, E14, E15 or E16, THEN THE Columns_API SHALL return 403 `FORBIDDEN` and change nothing.
11. IF a column does not exist, is soft-deleted, or belongs to a board where the caller is not a Participant, THEN THE Columns_API SHALL return 404 `NOT_FOUND` with the same envelope as a missing board.
12. THE Columns_API SHALL authenticate first, then validate path IDs and the body shape without a database lookup, then resolve the board and check the caller's access (404 for a Nonmember, 403 for a Member on an admin-only action), then take the Board_Lock, then recheck membership, role and the addressed column under the lock.

### Requirement 2: Reorder columns

**User Story:** As an admin, I want to change the order of columns, so that the workflow reads left to right.

#### Acceptance Criteria

1. WHEN an Admin submits E16 with `column_id`, an explicit `before_column_id` (a column ID or null for the end) and `expected_position_version`, THE Columns_API SHALL, under the Board_Lock and in one transaction, place the column before the anchor following the ordering rule in design D4, increase the Position_Version by 1 when the position changes and return 200 with `{columns, position_version}`, where `columns` lists every Active_Column in the authoritative order.
2. WHEN an E16 request changes the column's position, THE Columns_API SHALL record one `column_reordered` event for the actor in the same transaction.
3. WHEN E07 is read after a successful E16, THE Boards_API SHALL return the columns in the new order.
4. IF `expected_position_version` differs from the board's Position_Version, THEN THE Columns_API SHALL return 409 `POSITION_CONFLICT` and change nothing.
5. IF a well-formed `column_id` is not an Active_Column of the URL's board (missing, soft-deleted or on another board), THEN THE Columns_API SHALL return 404 `NOT_FOUND`. The Columns_API SHALL check this under the Board_Lock before the version check, and the response SHALL be the same for a missing column and a column of another board.
6. IF `before_column_id` is the moved column itself or is not an Active_Column of the same board, THEN THE Columns_API SHALL return 400 `VALIDATION_ERROR` with the generic message "Choose a valid destination." and change nothing. The check SHALL run after the version check.
7. IF `expected_position_version` is missing, negative or not an integer, or `before_column_id` is missing, THEN THE Columns_API SHALL return 400 `VALIDATION_ERROR`.
8. WHEN E16 places the column between two neighbors whose order values leave no strictly ordered midpoint, THE Columns_API SHALL rebalance all Active_Columns of the board to 1024, 2048, … in the same transaction and return the rebalanced list.
9. WHEN two E16 requests carry the same `expected_position_version`, THE Columns_API SHALL commit at most one and return `POSITION_CONFLICT` to the other.
10. WHEN the column is placed where it already is, THE Columns_API SHALL return 200 with the authoritative `columns` and the unchanged Position_Version, and SHALL write nothing and record no event.

### Requirement 3: Create, edit, assign and remove cards

**User Story:** As a participant, I want to create, edit, assign and remove cards, so that the board shows the work and who owns it.

#### Acceptance Criteria

1. WHEN a Participant submits E17 with `title` of 1 to 160 trimmed characters, an optional nullable `description` of at most 2,000 characters and an optional nullable `assignee_id`, THE Cards_API SHALL create an Active_Card at the end of the column (order of the last card plus 1024, or 1024 for the first), increase the Position_Version by 1 under the Board_Lock, record a `card_created` event, and return 201 with `{card, position_version}`.
2. WHEN E17 creates a card in a Done_Column, THE Cards_API SHALL also record an `entered_done` event for that card in the same transaction.
3. WHEN a Participant submits E18 with any of `title`, `description` or `assignee_id`, THE Cards_API SHALL update only the submitted fields, keep the current value of an omitted `description`, and return 200 with the card. An explicit null SHALL clear `description` and `assignee_id`. E18 SHALL NOT change the column, the order or the Position_Version.
4. IF the E17 or E18 body has a missing or blank title, an over-long title or description, an invalid UUID, an unknown field, or (for E18) no field, THEN THE Cards_API SHALL return 400 `VALIDATION_ERROR` with field errors and change nothing.
5. IF `assignee_id` names a user who is not an active Participant of the card's board, THEN THE Cards_API SHALL return 400 `VALIDATION_ERROR` with `fields.assignee_id` and change nothing. The membership check SHALL run inside the transaction after the Board_Lock.
6. WHEN a Participant calls E19, THE Cards_API SHALL soft-delete the card, increase the Position_Version by 1 and return 200 with `{"data": {"position_version": n}}`.
7. WHEN E07 is read after E17, E18 or E19, THE Boards_API SHALL return the card with its title, description and `assignee_name` (null when unassigned), or omit the card after E19.
8. THE Cards_API SHALL let any Participant, Admin or Member, create, edit and delete any card on the board.
9. IF the target column or card is missing, is soft-deleted, sits under a deleted column or board, or belongs to a board where the caller is not a Participant, THEN THE Cards_API SHALL return 404 `NOT_FOUND` with the same envelope as a missing board.
10. THE Cards_API SHALL authenticate first, then validate path IDs and the body shape without a database lookup, then resolve the board and check the caller's access (404 for a Nonmember), then take the Board_Lock, then recheck membership and the addressed card or column under the lock.
11. THE Cards_API SHALL return only the documented Card fields: `id`, `column_id`, `title`, `description`, `assignee_id`, `assignee_name` and `order`.
12. WHEN a Participant submits a `description` that is blank or whitespace-only after trimming, THE Cards_API SHALL store null.

### Requirement 4: Move cards

**User Story:** As a participant, I want to move a card within a column or to another column, so that the board shows where work stands.

#### Acceptance Criteria

1. WHEN a Participant submits E20 with `column_id`, an explicit `before_card_id` (a card ID or null for the end) and `expected_position_version`, THE Cards_API SHALL, under the Board_Lock and in one transaction, place the card in the destination column before the anchor following the ordering rule in design D4, increase the Position_Version by 1, record a `card_moved` event and return 200 with `{card, columns, position_version}`.
2. THE Cards_API SHALL return in `columns` only the affected Active_Columns with their Active_Cards in authoritative order: the source and the destination column, or the one column when both are the same. Rebalanced siblings are part of the destination list.
3. WHEN a card moves into a Done_Column from a column that is not a Done_Column, THE Cards_API SHALL also record an `entered_done` event in the same transaction. A move within a Done_Column or out of one SHALL NOT record `entered_done`.
4. WHEN the card is placed where it already is (the same column and the anchor is its next sibling, or null while it is last), THE Cards_API SHALL return 200 with the authoritative column list and the unchanged Position_Version, and SHALL write nothing and record no event. A reorder inside one column that changes the position is a move.
5. IF `expected_position_version` differs from the board's Position_Version, THEN THE Cards_API SHALL return 409 `POSITION_CONFLICT`, change nothing and record no event. The Cards_API SHALL compare the version after the Board_Lock and after rechecking the card under the lock (a card that is no longer active returns 404), and before it checks the destination and anchor.
6. IF the destination column is not an Active_Column of the card's board, or the anchor is the card itself, is not an Active_Card, or is not in the destination column, THEN THE Cards_API SHALL return 400 `VALIDATION_ERROR` with the generic message "Choose a valid destination.", change nothing, and expose nothing about any other board. The check SHALL run after the version check.
7. IF `expected_position_version` is missing, negative or not an integer, or `before_card_id` is missing, THEN THE Cards_API SHALL return 400 `VALIDATION_ERROR`.
8. WHEN E20 places the card between two neighbors that leave no strictly ordered midpoint, THE Cards_API SHALL rebalance the destination column's Active_Cards to 1024, 2048, … in the same transaction and return the rebalanced list.
9. WHEN two E20 requests carry the same `expected_position_version`, THE Cards_API SHALL commit at most one and return `POSITION_CONFLICT` to the other.
10. WHEN E07 is read after a successful E20, THE Boards_API SHALL return the card in the destination column at the new position, and the source column without it.
11. IF the E20 write fails after the transaction starts, THEN THE Cards_API SHALL roll back and leave order, version and events unchanged.

### Requirement 5: Position versioning and audit events

**User Story:** As a reviewer, I want every order change to be versioned and audited, so that concurrent edits stay consistent and analytics have data.

#### Acceptance Criteria

1. THE Boards_API SHALL return the current Position_Version in E07 and every response of E13, E15, E16, E17, E19 and E20 SHALL carry the new version.
2. THE Columns_API and Cards_API SHALL, before any write, take the Board_Lock, recheck membership, role and the addressed resource under the lock, and only then compare the version where one is sent.
3. THE Columns_API and Cards_API SHALL write order values only as finite positive numbers and SHALL rely on the database check as a backstop.
4. THE Cards_API SHALL record `card_created` on E17, `card_moved` on an E20 that changes the position, and `entered_done` only for a card created in a Done_Column or moved from a column that is not a Done_Column into a Done_Column. THE Columns_API SHALL record `column_reordered` on an E16 that changes the position. Each event carries the board, the actor, the card where one exists and a UTC timestamp, and is written in the same transaction as the change.
5. THE Columns_API and Cards_API SHALL create no event, and keep the Position_Version, for a request that fails, conflicts or leaves the position unchanged.
6. IF a position write races with a member removal that clears assignments, THEN THE services SHALL serialize on the Board_Lock so each sees the other's committed result.
7. IF the Position_Version is 2147483647 and a request would change it, THEN THE Columns_API and Cards_API SHALL return 409 `STATE_CONFLICT` with a fixed message, write nothing and record no event. An E16 or E20 that carries `expected_position_version` 2147483647 SHALL still pass the version check, and a request above 2147483647 or a boolean SHALL return 400.

### Requirement 6: Show the board

**User Story:** As a participant, I want to see columns and cards on the board page, so that I can read the work at a glance.

#### Acceptance Criteria

1. WHEN a Participant opens the Board_Page, THE Kanban_Board SHALL show each Active_Column in order with its name, its card count and its Active_Cards in order, inside the Kanban_Region.
2. THE Kanban_Board SHALL show for each card its title and its assignee name, or the text "Unassigned". The description SHALL appear in the card edit dialog.
3. WHEN a column is a Done_Column, THE Kanban_Board SHALL mark it with a visible "Done" badge that carries text, not color alone.
4. WHILE a column has no cards, THE Kanban_Board SHALL show an empty-column message.
5. WHILE the board has no columns, THE Kanban_Board SHALL show an empty state. An Admin SHALL see "Add your first column" with the add-column form. A Member SHALL see that an admin must add columns first, and no card controls.
6. THE Kanban_Board SHALL keep every control it adds inside the Board_Page layout, with the members panel unchanged (FE-D4).
7. WHEN the Board_Page loads, THE Board_Page SHALL read E07 on the server and pass the columns, cards, `position_version` and the members list to the Kanban_Board. No token SHALL reach browser code.
8. WHEN an Admin removes a member through the members panel and E12 succeeds, THE Board_Page SHALL refetch the board and the members list so cards that lost their assignee show "Unassigned". IF a Kanban request is pending, THEN THE Kanban_Board SHALL start that refetch after the request settles, and a response that started before a later change SHALL NOT replace newer state.

### Requirement 7: Column controls (Admin)

**User Story:** As an admin, I want column controls on the board, so that I can shape the workflow without leaving the page.

#### Acceptance Criteria

1. WHILE the viewer is an Admin, THE Kanban_Board SHALL show an add-column form with a name field and a "Done column" checkbox that is disabled, with a text hint, while a Done_Column exists.
2. WHILE the viewer is an Admin, THE Kanban_Board SHALL show on each column an Edit control, a Delete control, and "Move left" and "Move right" controls. The Edit dialog SHALL hold the name field and the Done-flag toggle. Move left SHALL be disabled on the first column and Move right on the last, and each control SHALL have an accessible label that names the column (for example "Move In progress left").
3. WHEN an Admin selects Delete on a column that has cards, THE Kanban_Board SHALL explain that the column must be emptied first and SHALL NOT send E15.
4. WHEN an Admin selects Delete on an empty column, THE Kanban_Board SHALL open the `ConfirmDialog` naming the column, with Cancel and Confirm. WHEN Confirm succeeds, THE Kanban_Board SHALL remove the column.
5. WHEN an Admin selects Move left or Move right, THE Kanban_Board SHALL send E16 with the neighbor as anchor, apply the change optimistically and follow Requirement 9.
6. WHILE the viewer is a Member, THE Kanban_Board SHALL hide every control in criteria 1 and 2.
7. IF E13, E14 or E15 returns 409 `STATE_CONFLICT`, THEN THE Kanban_Board SHALL show the matching message next to the control, keep the entered name, and refresh the board.
8. WHEN a column is added, renamed, toggled or deleted, THE Kanban_Board SHALL show the result without a page reload, and a reload SHALL show the same result.
9. THE Kanban_Board SHALL reorder columns with the Move left and Move right controls only. Columns SHALL NOT be draggable.

### Requirement 8: Card controls

**User Story:** As a participant, I want to add, edit, assign and delete cards from the board, so that I can maintain the work in one place.

#### Acceptance Criteria

1. WHILE the board has at least one column, THE Kanban_Board SHALL show in each column an add-card form with a title field and an "Add card" button.
2. WHEN a Participant submits a valid title, THE Kanban_Board SHALL add the card at the end of that column, clear the field and keep focus in the form. IF E17 returns 400, THEN THE Kanban_Board SHALL show the error next to the field and keep the title.
3. WHEN a Participant opens a card's edit dialog, THE Kanban_Board SHALL show title, description and an assignee select that lists "Unassigned" and each active participant by name. The dialog SHALL use `BaseModal` and SHALL close on Escape and return focus to the control that opened it.
4. WHEN a Participant saves valid changes, THE Kanban_Board SHALL send E18, show the updated card without a page reload and close the dialog. IF E18 returns 400, THEN THE dialog SHALL stay open, show the field error and keep the entered values.
5. WHEN a Participant selects Delete card, THE Kanban_Board SHALL open the `ConfirmDialog` naming the card. WHEN Confirm succeeds, THE Kanban_Board SHALL remove the card.
6. IF a card action returns 404 for the board, THEN THE Board_Page SHALL show the access error and navigate to the dashboard, as in boards-membership Requirement 2.10. IF it returns 404 for the card or column only, THEN THE Kanban_Board SHALL show a toast and refresh the board.
7. THE edit dialog SHALL be a card edit and delete dialog only. Comments and the detail modal belong to T10 and may wrap this dialog.

### Requirement 9: Move cards and columns in the UI

**User Story:** As a participant, I want to move a card by dragging it on a desktop or with a visible control on any device, so that I can change its place without a mouse.

#### Acceptance Criteria

1. WHEN a user drags a card onto a column or between cards on a desktop pointer, THE Kanban_Board SHALL call the Move_Function with the destination column, the anchor card, or null for the end of the column. Drop zones SHALL be stable and show where the card will land.
2. WHEN a user selects the Move_Control on a card, THE Kanban_Board SHALL open a dialog with a destination column select and a position select ("At the end of the column" and "Before <card title>" for each other card in that column). The dialog SHALL default to the card's current column and place. Confirm SHALL call the same Move_Function.
3. THE Move_Control SHALL be visible without hover on every card for every Participant, work with the keyboard alone and work by touch.
4. WHEN a move starts, THE Kanban_Board SHALL save a Snapshot, show the card in its new place immediately and send the request with the board's current Position_Version.
5. WHEN the request succeeds, THE Kanban_Board SHALL replace the affected column lists and the Position_Version with the server's authoritative response.
6. IF the request fails with a 5xx status, a transport failure or a 400 for an invalid destination, THEN THE Kanban_Board SHALL restore the Snapshot, show an error toast that says the card was not moved, and refetch the board before it accepts another move. IF it fails with 403, THEN THE Kanban_Board SHALL restore the Snapshot and show the access message.
7. IF the request returns 409 `POSITION_CONFLICT`, THEN THE Kanban_Board SHALL restore the Snapshot, refetch the board, replace its state with the authoritative board and show a message that the board changed. IF the refetch fails, THEN THE Kanban_Board SHALL keep every position control disabled and show a Reload board action.
8. WHILE a Kanban request is pending (E13–E20) or a board refetch is running, THE Kanban_Board SHALL start no other Kanban request or refetch, except that a request MAY run its own recovery refetch before it releases control. The refresh after a member removal and the Reload board action SHALL follow the same rule, and a response older than a later change SHALL be ignored. WHILE that holds, THE Kanban_Board SHALL ignore a new drag, SHALL disable the Move_Control, the column controls and the add, edit and delete controls, and SHALL mark the region as busy for assistive technology.
9. WHEN the destination equals the card's current place, THE Kanban_Board SHALL send no request. THE Move dialog SHALL disable Confirm and show "Choose a different column or position." while its selection equals the current place, and SHALL disable Confirm while the gate in criterion 8 is held, so that Confirm never closes the dialog without a request.
10. WHEN the page is reloaded after a successful move, THE Board_Page SHALL show the card in its new place.
11. IF a position request returns 404 for the board, THEN THE Board_Page SHALL show the access error and navigate to the dashboard.
12. THE announcement of a finished or failed move SHALL be available in text, in a live region, so that it does not depend on seeing the card move.

### Requirement 10: Mobile and accessible UI

**User Story:** As a user on a phone, I want the Kanban board to work at 375 px and wider, so that I can run the core flow on mobile.

#### Acceptance Criteria

1. WHILE the viewport is 375 px wide or wider, THE Board_Page and every new dialog SHALL show no horizontal page scroll. Only the Kanban_Region MAY scroll sideways (FE-S2, FE-S4).
2. THE Kanban_Region SHALL be reachable and scrollable by keyboard and SHALL have an accessible name.
3. THE Board_Page SHALL render every interactive control added by this slice with a rendered box of at least 44 by 44 CSS px, including the Move_Control, the column controls, the add forms and every dialog control, confirmed with `elementFromPoint` at the control's center (FE-S5).
4. THE Board_Page SHALL render every text input added by this slice, and the select controls, at a font size of at least 16 px.
5. WHILE a dialog of this slice is open, THE dialog SHALL move focus inside, keep Tab focus inside, close on Escape without calling the API and return focus to the control that opened it.
6. WHEN a user opens the Board_Page with columns and cards at 320, 375, 768 and 1280 px, THE Board_Page SHALL keep the header, forms, dialogs and Move_Control usable. The screens SHALL follow the Visual Design System (FE-D1 to FE-D9): `.surface` panels, daisyUI semantic colors, `BaseButton`, `BaseBadge`, `BaseModal`, `ConfirmDialog` and `FormField`, and no new color or font.
7. WHEN a user on a 375 px viewport adds a column as Admin, adds a card, moves it with the Move_Control to another column and reloads, THE Board_Page SHALL show the card in the new column.
8. WHEN this slice is handed off, THE evidence log SHALL record the screenshot and measured check at 320, 375, 768 and 1280 px, whether the browser was an emulator or a real device, and the manual journey of add column, add card, edit and assign, drag, Move_Control move, reload, and delete.

### Requirement 11: Contracts, scoping and verification

**User Story:** As a reviewer, I want contracts, scoping and open work recorded, so that the slice can be verified honestly.

#### Acceptance Criteria

1. THE Columns_API and Cards_API SHALL require a valid bearer token and add `Cache-Control: private, no-store` to every E13–E20 response, success and error.
2. THE Columns_API and Cards_API SHALL scope every lookup through the parent chain (card to column to board) and the caller's active membership. A column or card ID from another board SHALL behave as missing.
3. THE slice SHALL keep every path, method, request field and response shape in `docs/API.md` unchanged. The behavior that the contract leaves open SHALL be recorded as contract clarifications in the design, `docs/API.md` and `specs/CHANGELOG.md`: the E15 and E19 body `{"position_version": n}`, `STATE_CONFLICT` for the column conflicts, the 400 for an invalid assignee and an invalid destination, the 404 for a moved column that is not on the board, the order of the checks, the unchanged-position result and the event rules.
4. WHEN the browser writes through E13–E20, THE Next.js app SHALL use same-origin Route Handlers that verify the exact Origin, forward only declared paths, methods and fields, and keep the token in the HttpOnly cookie. THE Kanban_Board SHALL refetch the board through a same-origin read handler.
5. WHEN V04 runs, THE pytest suite SHALL cover column and card CRUD, Done uniqueness and nonempty rules (including a concurrent Done race), moves within and across columns in both directions, member and admin roles, nonmember and cross-board 404, invalid anchors and destinations without mutation, FLOAT precision and rebalance, version conflict with two concurrent moves, event rows, and rollback on a failure.
6. WHEN V05 runs, THE frontend tests SHALL cover optimistic placement, rollback on 500, refetch on 409 and on a transport failure, the single Move_Function behind drag and the Move_Control, the busy state, and role-based controls, by asserting rendered text, roles and requests, not only that the component mounts.
7. Database-writing tests SHALL write only to the Test_Database and remove only the data created by the run, even when assertions fail.
8. THE slice SHALL use the existing test stack: parameterized pytest, Vitest and React Testing Library, without Hypothesis or fast-check. The automated Playwright journey (V10) is delivered in T15.
9. WHEN the slice is handed off, THE documentation SHALL record the status in `specs/traceability.md`, the README, the changelogs and the evidence log, with real-device checks and Playwright left open where they have not run.
10. THE Boards_API SHALL, on E12, clear `assignee_id` only on active cards in active columns of the affected board, in the same transaction as the membership removal, and SHALL leave soft-deleted cards, cards in soft-deleted columns and other boards unchanged. A regression test SHALL cover each case.

## Resolved decisions

The user approved K1–K12 on 2026-11-13. The table records the outcome and the clarification the user added.

| ID | Decision | Outcome | Where |
|---|---|---|---|
| K1 | Body of E15 and E19 | Approved. 200 with `{"data": {"position_version": n}}`. | 1.8, 3.6, 5.1 |
| K2 | Open error codes | Approved. 409 `STATE_CONFLICT` for Done conflicts and a nonempty column. 400 `VALIDATION_ERROR` with `fields.assignee_id` for an invalid assignee. "Choose a valid destination." for an invalid destination or anchor. | 1.3, 1.6, 1.9, 2.6, 3.5, 4.6 |
| K3 | Order of checks | Approved with a clarification: authenticate, validate the request shape, resolve the board and check access, take the board lock, recheck membership, role and the source resource under the lock, compare the version (409 `POSITION_CONFLICT`), then validate destination and anchor (400). 404 for nonmembers and 403 for members on admin-only actions stay. Applied to E16 as a 404 for a moved column that is not on the board. | 1.12, 2.5, 3.10, 4.5, 4.6, 5.2 |
| K4 | Column reorder in the UI | Approved. Move left and Move right. The unavailable direction is disabled at each edge, with accessible labels. | 7.2, 7.9 |
| K5 | Card edit, assign and delete | Approved. A small `CardEditDialog` in T09. T10 adds comments and the detail modal and reuses the edit behavior. | 8.3, 8.7 |
| K6 | Audit events | Approved, with the rule that events are written in the same transaction and only when the position changes. A same-column reorder is a move. An unchanged position keeps its version and records no event. `entered_done` only for creation in a Done column or a move from a non-Done column into a Done column. | 2.2, 2.10, 3.1, 3.2, 4.3, 4.4, 5.4, 5.5 |
| K7 | New board | Approved. No columns at first. Admins see Add column. Members see a clear message. | 6.5 |
| K8 | One request at a time | Approved, widened to every Kanban write (E13–E20) and refetches, because an edit that finishes during an optimistic move could be undone by that move's rollback. After a stale version or an uncertain outcome, the board refetches before another move. | 9.7, 9.8 |
| K9 | `is_done` unchanged | Approved. Allowed on a nonempty column. Other valid changes in the request still apply. | 1.6 |
| K10 | Move control | Approved. A dialog with destination column and position selects ("At the end", "Before <card>"), including same-column reorder. 44 by 44 px targets, checked at 375 px. | 9.2, 10.3, 10.7 |
| K11 | Limits | Approved. The 100-card figure is a measurement target only. No product cap on columns or cards in v1. | None |
| K12 | Member removal refresh | Approved. After a successful E12, refetch the board and the members list. A pending move finishes first, and an older response never overwrites newer state. | 6.8 |

### Design review clarifications (2026-11-13)

| ID | Clarification | Where |
|---|---|---|
| L1 | E16: a well-formed `column_id` that is missing, soft-deleted or on another board returns the same generic 404. A malformed ID is 400. Version is checked before destination and anchor. | 2.5, 2.6 |
| L2 | The per-board gate covers all Kanban writes and board refetches that can replace the same UI state, including the member-removal refresh. A write may finish its own recovery refetch. Stale responses are ignored. | 6.8, 9.8 |
| L3 | One `ColumnEditDialog` for rename and the Done toggle. | 7.2 |
| L4 | `SelectField` and multiline `FormField` are approved. Existing `FormField` behavior is preserved. Labels and messages stay accessible. | design |
| L5 | `useKanbanBoard` owns state, gate, rollback and refetch. `useDragAndDrop` owns drag interaction state only. | design |
| L6 | Blank or whitespace-only description is stored as null, an omitted one is kept. E16 and E20 accept integer versions 0 to 2147483647 and reject booleans. At the ceiling a version-changing write returns 409 `STATE_CONFLICT` and writes nothing. | 3.3, 3.12, 5.7 |
| L7 | E12 clears assignments only on active cards in active columns of the board. Soft-deleted cards, cards in soft-deleted columns and other boards are preserved. A T05 regression test covers it. | 11.10 |

Dependency note: boards-membership task 7.2 (the measured mobile check and the manual journey) is still in progress, and root T05 and T06 are unchecked. Verify T05 before T07, T07 before T08, and T06 and T08 before T09. Root T06 stays unchecked until that check and the journey pass. The spec phase does not depend on them.
