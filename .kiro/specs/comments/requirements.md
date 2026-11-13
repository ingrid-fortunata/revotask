# Requirements Document

## Introduction

This slice covers root task T10: the comments API (E23–E26), the card detail modal on `/boards/[id]` and the React tests for the display components. It implements R08 (AC08.1–AC08.2) and the mobile criterion AC13.1 (FE-S4–S6) for every new control and dialog. Verification covers V06 (pytest and React Testing Library), V05 (browser, for the modal), V10 (the Playwright journey, delivered in T15) and V11 (375 px and wider).

The kanban slice already provides `authorize_board` (check, lock, recheck), the 404 and 403 rules, the error envelope, the `useKanbanBoard` gate, the `CardEditDialog` (K5: T10 adds the comments and the detail modal and reuses its edit behavior), `BaseModal`, `ConfirmDialog` and `FormField`. The database already has the `card_comments` table (soft-deletable, `(card_id, created_at, id)` active index) and the `comment_created` event kind. The API contract already lists E23–E26 and the `Comment` shape. No table, migration or dependency is added, and no path, method, request field or response field in `docs/API.md` changes.

Out of scope: comment notifications (T13), a comment count on the board card or in E07, comment search, mentions, rich text, attachments, reactions and threads (outside the first submission, per the project brief). The T13 notification write will extend the E24 transaction later, so this slice leaves a clear place for it and writes no notification.

Decisions M1–M13 were approved on 2026-11-13, with the clarifications recorded in "Resolved decisions" at the end. Each is stated as a requirement below.

## Glossary

- **Comments_API**: The Flask blueprint serving E23–E26 (`comments_bp`).
- **Participant**, **Admin**, **Member**, **Nonmember**, **Active_Board**, **Board_Lock**: As defined in the boards-membership spec.
- **Active_Card**: A card with `deleted_at` null in a column with `deleted_at` null on an Active_Board. Defined in the kanban spec.
- **Active_Comment**: A comment with `deleted_at` null on an Active_Card.
- **Author**: The user in `author_id` of a comment. The author never changes.
- **Comment**: The wire shape `{id, card_id, author_id, author_name, content, created_at, updated_at}`. `author_name` is the author's current name.
- **Content_Rule**: `content` is text, trimmed, 1 to 2,000 characters.
- **Card_Detail_Modal**: The client dialog that opens from a card on the Board_Page. It shows the card edit form and the comments. It composes `BaseModal`, the existing edit behavior of `CardEditDialog` and `CommentList`.
- **CommentList**: The props-only component that renders the comments it receives.
- **Comment_Form**: The form in the Card_Detail_Modal that adds a comment.
- **Board_Page**, **Kanban_Board**: As defined in the kanban spec.
- **Test_Database**: The database named by `TEST_DATABASE_URL`.

## Requirements

### Requirement 1: List the comments of a card

**User Story:** As a participant, I want to read the discussion on a card, so that I know what the team has said.

#### Acceptance Criteria

1. WHEN a Participant calls E23 for an Active_Card, THE Comments_API SHALL return 200 with the Active_Comments of that card, sorted by `created_at` ascending and then `id` ascending, each as a Comment.
2. WHILE the card has no Active_Comment, THE Comments_API SHALL return 200 with an empty list.
3. THE Comments_API SHALL NOT paginate or cap the E23 list in v1 (M2).
4. IF the card does not exist, is soft-deleted, sits under a soft-deleted column or board, or belongs to a board where the caller is not a Participant, THEN THE Comments_API SHALL return 404 `NOT_FOUND` with the same envelope as a missing board.
5. THE Comments_API SHALL return only the documented Comment fields. `author_name` SHALL be the author's current name, so a renamed author appears under the new name (M1).
6. WHEN an Admin has removed an author from the board, THE Comments_API SHALL still return that author's Active_Comments to the remaining Participants.

### Requirement 2: Add a comment

**User Story:** As a participant, I want to comment on a card, so that I can discuss the work with the team.

#### Acceptance Criteria

1. WHEN a Participant submits E24 with `content` that meets the Content_Rule, THE Comments_API SHALL create an Active_Comment authored by the caller, record one `comment_created` event for the caller and the card in the same transaction, and return 201 with the Comment (M6).
2. IF the E24 body has a missing or blank (whitespace-only) `content`, a `content` that is not text, a `content` over 2,000 trimmed characters or an unknown field, THEN THE Comments_API SHALL return 400 `VALIDATION_ERROR` with `fields.content` where a field applies and create nothing (AC08.1).
3. THE Comments_API SHALL store the trimmed text, keep line breaks inside the text, and return it unchanged on later reads. It SHALL NOT interpret the text as HTML or Markdown (M8).
4. IF the card is missing, is soft-deleted, sits under a soft-deleted column or board, or belongs to a board where the caller is not a Participant, THEN THE Comments_API SHALL return 404 `NOT_FOUND` and create nothing and record no event.
5. THE Comments_API SHALL let any Participant, Admin or Member, comment on any Active_Card of the board.
6. THE Comments_API SHALL NOT change the board's Position_Version for any comment write (M5).
7. THE Comments_API SHALL create no event and no comment for a request that fails.
8. WHEN E24 creates a comment, THE Comments_API SHALL set `created_at` and `updated_at` from the same clock reading, so the two values are equal (N1).
9. THE Comments_API SHALL NOT remove duplicates: two E24 requests with identical content from the same author create two comments (N5).

### Requirement 3: Edit a comment

**User Story:** As a comment author, I want to correct my comment, so that the discussion stays accurate.

#### Acceptance Criteria

1. WHEN the Author, who is still a Participant, submits E25 with `content` that meets the Content_Rule and differs from the stored content after trimming, THE Comments_API SHALL update the content, refresh `updated_at` and return 200 with the Comment (AC08.2).
2. WHEN the submitted content equals the stored content after trimming, THE Comments_API SHALL return 200 with the Comment, write nothing and leave `updated_at` unchanged (M9).
3. IF the E25 body has a missing, blank, non-text or over-long `content`, or an unknown field, THEN THE Comments_API SHALL return 400 `VALIDATION_ERROR` and change nothing.
4. IF the caller is a current Participant but not the Author, THEN THE Comments_API SHALL return 403 `FORBIDDEN` and change nothing. This holds for an Admin too (M4).
5. IF the comment does not exist, is soft-deleted, sits on a card that is no longer an Active_Card, or belongs to a board where the caller is not a Participant (including a removed Author), THEN THE Comments_API SHALL return 404 `NOT_FOUND` with the same envelope as a missing board and change nothing.
6. THE Comments_API SHALL NOT change `author_id`, `card_id` or `created_at` and SHALL record no event on an edit.

### Requirement 4: Delete a comment

**User Story:** As a comment author, I want to remove my comment, so that a mistaken remark does not stay on the card.

#### Acceptance Criteria

1. WHEN the Author, who is still a Participant, calls E26, THE Comments_API SHALL soft-delete the comment and return 200 with the Comment as it was before the delete (the contract's "soft-deleted comment", M3).
2. WHEN E23 is read after E26, THE Comments_API SHALL omit the comment.
3. IF the caller is a current Participant but not the Author, THEN THE Comments_API SHALL return 403 `FORBIDDEN` and change nothing. This holds for an Admin too (M4).
4. IF the comment is missing, is already soft-deleted, sits on a card that is no longer an Active_Card, or belongs to a board where the caller is not a Participant, THEN THE Comments_API SHALL return 404 `NOT_FOUND` with the same envelope as a missing board. A second E26 on the same comment SHALL therefore return 404.
5. THE Comments_API SHALL record no event on a delete and SHALL NOT remove the earlier `comment_created` event (the event log is append-only).

### Requirement 5: Authorization order, transactions and contracts

**User Story:** As a reviewer, I want comment access checked in a fixed order and written atomically, so that no board ID leaks and no partial state remains.

#### Acceptance Criteria

1. THE Comments_API SHALL authenticate first (401 `AUTH_REQUIRED`), then validate path IDs and the body shape without a database lookup (400), then resolve the board from the addressed card or comment through the parent chain, then check the caller's membership (404 for a Nonmember), then, for E24–E26, take the Board_Lock, recheck membership, then reload the addressed card or comment under the lock and recheck that it is still active (404), and only then check authorship (403) and write. A removed author, a Nonmember and a missing resource give the same generic board-scoped 404 (C1).
2. THE Comments_API SHALL scope every lookup through the parent chain (comment to card to column to board) and the caller's active membership. A card or comment ID from another board SHALL behave as missing.
3. THE Comments_API SHALL return the same 404 envelope for a missing, soft-deleted, other-board and nonmember case, so the response does not reveal that an ID exists.
4. IF a comment write races with a member removal or a card delete, THEN THE Comments_API SHALL serialize on the Board_Lock so each sees the other's committed result. A write that loses the race returns 404.
5. IF a comment write fails after the transaction starts, THEN THE Comments_API SHALL roll back and leave the comment and the event unchanged.
6. THE Comments_API SHALL require a valid bearer token and add `Cache-Control: private, no-store` to every E23–E26 response, success and error.
7. THE slice SHALL keep every path, method, request field and response shape in `docs/API.md` unchanged. The behavior that the contract leaves open SHALL be recorded as contract clarifications in the design, `docs/API.md` and `specs/CHANGELOG.md`: the 403 for a non-author, the order of the checks, the content rules, the event rule, the unchanged-content edit and the E26 body.

### Requirement 6: Card detail modal and the comment list

**User Story:** As a participant, I want one dialog that shows a card and its discussion, so that I can read and write without leaving the board.

#### Acceptance Criteria

1. WHEN a Participant selects a card on the Board_Page, THE Kanban_Board SHALL open the Card_Detail_Modal for that card, using `BaseModal` with its optional `wide` prop. The card's title button SHALL have the accessible name "Open <title>" and the dialog SHALL be named "Card details" (N2, N3). The modal SHALL close on Escape and return focus to the control that opened it, as the `CardEditDialog` does (M10).
2. THE Card_Detail_Modal SHALL keep every behavior of `CardEditDialog` from kanban Requirement 8 (title, description, assignee, save, delete with confirmation, field errors, pending state) and add the comments section below the edit form.
3. WHEN the modal opens, THE Card_Detail_Modal SHALL load the comments through E23 and show a loading state, then the list.
4. THE CommentList SHALL show for each comment the author's name, the content with its line breaks, and the creation time. WHEN `updated_at` is later than `created_at`, THE CommentList SHALL also show an "Edited" text marker (not color alone). A comment that was just added, and a comment whose edit was unchanged, SHALL show no marker (N1).
5. WHILE the card has no comments, THE Card_Detail_Modal SHALL show "No comments yet." and the Comment_Form.
6. IF the E23 request fails, THEN THE Card_Detail_Modal SHALL show an error message with a Retry control inside the comments section, and the edit form SHALL stay usable.
7. IF a comment request (E23 to E26) returns 404, THEN THE Card_Detail_Modal SHALL treat the response as the same for a missing comment, a missing card and lost access, and SHALL refetch the board (N4). IF the refetch shows that access to the board is lost, THEN THE Board_Page SHALL show the access error and navigate to the dashboard, as in kanban Requirement 8.6. IF the board is still accessible and the card is gone, THEN THE Card_Detail_Modal SHALL close and show a toast that the card no longer exists. IF the board is still accessible and the card still exists, THEN THE Card_Detail_Modal SHALL reload the comments through E23. IF the board refetch fails, THEN THE Card_Detail_Modal SHALL show a message with a Retry control in the comments section and SHALL NOT change the list.
8. THE CommentList SHALL be a props-only component with no fetching and no state of its own (FE-C2). THE Card_Detail_Modal SHALL own the comment state and call the comments API.
9. THE Card_Detail_Modal SHALL render comment content as plain text. A comment that contains markup SHALL appear as that literal text.

### Requirement 7: Add, edit and delete comments in the UI

**User Story:** As a participant, I want to write, correct and remove my own comments from the modal, so that I can keep the discussion tidy.

#### Acceptance Criteria

1. THE Comment_Form SHALL have a multiline field with a visible label and an "Add comment" button. WHEN a Participant submits content that meets the Content_Rule, THE Card_Detail_Modal SHALL send E24, show the new comment at the end of the list without a reload, clear the field and keep focus in the field.
2. IF the submitted content is blank or over 2,000 characters, THEN THE Comment_Form SHALL show the message next to the field and send no request. IF E24 returns 400, THEN THE Comment_Form SHALL show the field error and keep the entered text.
3. WHILE an add, edit or delete request is pending, THE Card_Detail_Modal SHALL disable the controls of that action and SHALL NOT send a second request for it.
4. THE CommentList SHALL show Edit and Delete controls on a comment only WHEN the signed-in user is its Author. A Participant who is not the Author SHALL see neither control, and an Admin SHALL NOT see them on another user's comment (M4).
5. WHEN the Author selects Edit, THE Card_Detail_Modal SHALL replace that comment's text with a multiline field holding the current content, with Save and Cancel controls. Cancel SHALL restore the text and return focus to the Edit control. WHEN Save succeeds, THE Card_Detail_Modal SHALL show the updated comment with the "Edited" marker. IF E25 returns 400, THEN THE field error SHALL show and the entered text SHALL stay. WHEN the text is unchanged, Save SHALL send no request and close the editor.
6. WHEN the Author selects Delete, THE Card_Detail_Modal SHALL open the `ConfirmDialog` naming the action, with Cancel and Confirm. WHEN Confirm succeeds, THE Card_Detail_Modal SHALL remove the comment from the list and return focus to the comment field.
7. IF E25 or E26 returns 403, THEN THE Card_Detail_Modal SHALL show a message that only the author can change a comment and reload the list. IF E25 or E26 returns 404, THEN THE Card_Detail_Modal SHALL follow Requirement 6.7, and WHEN the reload shows that the card still exists, it SHALL also show a message that the comment no longer exists. IF the reload after a 404 returns 404 again, THEN THE Card_Detail_Modal SHALL stop, show the Retry message of Requirement 6.7 and send no further automatic request.
8. IF an edit (E25) or a delete (E26) fails with a 5xx status or a transport failure, THEN THE Card_Detail_Modal SHALL show a retry message, keep the entered text and leave the list as it was. A repeat of either request is safe, because an edit sets the same text and a delete of a removed comment returns 404.
9. THE comment requests SHALL NOT use the Kanban gate and SHALL NOT change the board state or the Position_Version (M12). WHILE a comment request is pending, THE Card_Detail_Modal SHALL disable Delete card and Save for the card so the card cannot be removed during a comment write.
10. THE announcement of an added, edited or deleted comment or of a failed request SHALL be available as text in a live region.
11. WHEN the modal closes or another card opens while a comment request is pending, THE Card_Detail_Modal SHALL ignore the response of the earlier card. It SHALL NOT show its comments, errors or announcements for the new card, and SHALL NOT write them to the list of the new card.
12. IF an add (E24) fails with a 5xx status or a transport failure, the outcome is uncertain, because the comment may have been saved while the response was lost. THEN THE Card_Detail_Modal SHALL keep the draft text, keep the current list visible, show a message that the comment may have been posted, and refetch the list through E23 (N5). WHILE that refetch runs and after it fails, THE Add comment button SHALL stay disabled. WHEN the refetch succeeds, THE Card_Detail_Modal SHALL replace the list with the refreshed one, keep the draft and the message so the user can review the list, and enable Add comment for a manual retry. THE Card_Detail_Modal SHALL NOT retry the add automatically and SHALL NOT compare comment text to hide a duplicate. IF the refetch fails, THEN THE Card_Detail_Modal SHALL show a Refresh comments control, and the retry SHALL stay disabled until a refresh succeeds. The edit and delete controls follow Requirement 7.3 meanwhile.

### Requirement 8: Mobile and accessible UI

**User Story:** As a user on a phone, I want to read and write comments at 375 px and wider, so that I can run the core flow on mobile.

#### Acceptance Criteria

1. WHILE the viewport is 375 px wide or wider, THE Card_Detail_Modal and every new control SHALL show no horizontal page scroll. A long unbroken comment SHALL wrap (`break-words`) and SHALL NOT widen the dialog. The `wide` dialog SHALL fit a 375 px viewport, with its box no wider than the viewport (N3, FE-S2, FE-S4).
2. WHEN the comments and the edit form together exceed the viewport height, THE Card_Detail_Modal SHALL scroll inside itself and keep the close control reachable. Pinch zoom SHALL stay enabled.
3. THE Card_Detail_Modal SHALL render every interactive control added by this slice with a rendered box of at least 44 by 44 CSS px, including Add comment, Edit, Delete, Save, Cancel, Retry and the confirm dialog controls, confirmed with `elementFromPoint` at the control's center (FE-S5).
4. THE Card_Detail_Modal SHALL render the comment fields at a font size of at least 16 px.
5. WHILE the modal is open, THE modal SHALL move focus inside, keep Tab focus inside, close on Escape without calling the API and return focus to the control that opened it. THE comment editor and the delete confirmation SHALL return focus to the control that opened them.
6. THE comments section SHALL have a heading with the comment count, each control SHALL have an accessible label that names its comment (for example "Edit your comment from 12 Nov"), and the list SHALL be a list in the accessibility tree.
7. WHEN a user opens the modal with comments at 320, 375, 768 and 1280 px, THE modal SHALL stay usable. The screens SHALL follow the Visual Design System (FE-D1 to FE-D9): `BaseModal`, `.surface` only where a panel is needed and never nested (FE-D3), daisyUI semantic colors, `BaseButton`, `ConfirmDialog` and `FormField`, and no new color or font.
8. WHEN a user on a 375 px viewport opens a card, adds a comment, edits it, deletes it and reloads, THE Board_Page SHALL show the card without that comment after the reload, and a kept comment SHALL still be there.
9. WHEN this slice is handed off, THE evidence log SHALL record the screenshot and measured check at 320, 375, 768 and 1280 px, whether the browser was an emulator or a real device, and the manual journey of open card, add comment, edit comment, delete comment, a second user who cannot edit it, and reload.

### Requirement 9: Browser handlers and verification

**User Story:** As a reviewer, I want comment calls to keep the token server-side and the checks to be honest about what ran.

#### Acceptance Criteria

1. WHEN the browser reads or writes comments, THE Next.js app SHALL use same-origin Route Handlers (E23 and E24 on `/api/cards/[id]/comments`, E25 and E26 on `/api/comments/[id]`) that verify the exact Origin on writes, forward only declared paths, methods and fields, and keep the token in the HttpOnly cookie (M13).
2. THE handlers SHALL return `Cache-Control: private, no-store`, clear the cookie on 401 and pass through the upstream status and error code.
3. THE `apiClient` allowlist SHALL gain the E23 read and the E24, E25 and E26 write pairs. A path with a non-UUID segment SHALL throw before `fetch`.
4. WHEN V06 runs, THE pytest suite SHALL cover E24 with 201 (success), 400 (invalid content), 401 (no authentication) and 404 (nonmember), and SHALL test 403 separately for a non-author edit and delete, including an Admin. It SHALL also cover E23 and E26 success and the response allowlist; nonmember, removed member and other-board 404 with one envelope; the `updated_at` change on a changed edit and its absence on an unchanged edit; soft delete and omission from E23; the order `created_at` then `id`; the `comment_created` event and the absence of an event on failure, edit and delete; no change to `position_version`; the check order; a race with a member removal and with a card delete; and rollback on an injected failure.
5. WHEN V05 and V06 run on the frontend, THE tests SHALL cover `CommentList` (author, content with line breaks, "Edited" marker, empty state, author-only controls), the modal (loading, error and retry, add, edit, delete, validation, 403 and 404 outcomes, pending disable, live region text), and the handlers, by asserting rendered text, roles and the requests sent, not only that a component mounts. The tests SHALL include the lost-response regression of Requirement 7.12: the server saves the comment and the response is lost, then the draft and the list stay visible, Add comment stays disabled until the refresh succeeds, exactly one POST is sent without a click, and a manual retry sends a second POST that creates a second comment, because no text matching hides it. They SHALL also cover the refresh failure branch, the 404 outcomes of Requirement 6.7 and the unchanged timestamps of Requirement 3.2.
6. Database-writing tests SHALL write only to the Test_Database (`TEST_DATABASE_URL`, through `db_guard` and `BoardTracker`) and remove only the data created by the run, even when assertions fail. The existing `BoardTracker` cleanup already removes comments of tracked cards and authors, and a sentinel untracked comment SHALL survive it.
7. THE slice SHALL use the existing test stack: parameterized pytest, Vitest and React Testing Library, without Hypothesis or fast-check. The automated Playwright journey (V10) is delivered in T15.
8. WHEN the slice is handed off, THE documentation SHALL record the status in `specs/traceability.md`, the README, the changelogs and the evidence log, with real-device checks and Playwright left open where they have not run.

## Resolved decisions

The user approved M1–M13 on 2026-11-13. The table records the outcome and the clarification the user added.

| ID | Decision | Outcome | Where |
|---|---|---|---|
| M1 | Author name | Approved. The author's current name from `users`. | 1.5 |
| M2 | E23 list | Approved. Unpaginated list of active comments ordered by creation time and ID. | 1.1, 1.3 |
| M3 | E26 body | Approved. 200 with the pre-delete Comment in `data`. Later reads omit it. | 4.1, 4.2 |
| M4 | Author-only | Approved. Only the author with current board access may edit or delete. A current participant who is not the author, including an Admin, gets 403 `FORBIDDEN`. A removed author or other nonmember gets the generic board-scoped 404 (C1). Controls show only on the current user's comments. | 3.4, 3.5, 4.3, 4.4, 7.4 |
| M5–M7 | Lock, version, event | Approved. Comment writes take the existing board lock and recheck membership, card availability and authorship where applicable. `position_version` is unchanged. E24 records one `comment_created` event in the same transaction. T14 reads that event for analytics. T13 owns notifications. | 2.1, 2.6, 5.1, 5.4 |
| M8–M9 | Content and edits | Approved. Trim, keep inner line breaks, 1 to 2,000 characters after trimming, wrapped plain text. An unchanged normalized edit returns 200 with the original `updated_at` and the UI skips the request. AC08.2 is reworded so `updated_at` changes when the normalized content changes. | 2.3, 3.1, 3.2, 7.5, `specs/requirements.md` AC08.2 |
| M10–M11 | Modal | Approved. One `CardDetailModal` opens from the card title, reuses the edit form above the comments and carries the existing edit tests forward. The card DTO and E07 stay unchanged. | 6.1, 6.2 |
| M12–M13 | Read path and pending | Approved. E23 loads through a same-origin Next `GET` handler when the modal opens. Comment writes use modal-local pending state. Card Save and Delete are disabled while a comment write is pending. Stale comment responses are ignored after the modal closes or the card changes. 44 by 44 px targets, verified at 375 px. | 6.3, 7.9, 7.11, 8.3, 9.1 |

### Design review clarifications (2026-11-13)

The user approved design points 1 to 4 and revised point 5. Applied to this file, `design.md` and `tasks.md`.

| ID | Clarification | Where |
|---|---|---|
| N1 | `created_at` and `updated_at` come from one clock reading on create. Verify no "Edited" marker on a new comment and an unchanged `updated_at` on a same-content edit. | 2.8, 3.2, 6.4 |
| N2 | The card button is "Open <title>" and the dialog is "Card details". The Kanban test selectors change, their behavioral assertions stay. | 6.1 |
| N3 | `BaseModal` gets the optional `wide` prop for Card details. Verify it fits a 375 px viewport with no horizontal overflow. | 6.1, 8.1 |
| N4 | A comment 404 is generic. The modal refetches the board. Lost access redirects through the existing path. A gone card closes the modal. An existing card reloads the comments. | 6.7, 7.7 |
| N5 | An uncertain add (5xx or transport failure): keep the draft and the list, show that the comment may have been posted, refetch E23, keep Add comment disabled until a refresh succeeds, then allow a manual retry after the user reviews the list. No automatic retry and no deduplication by text. Regression case: saved but the response lost. | 2.9, 7.12, 9.5 |

Create-path status difference from the handbook: the handbook's "comment create 201/400/401/403" assumes a 403 on create. Under C1 a nonmember gets 404 on E24, so V06 tests 201, 400, 401 and 404 for create, and 403 separately for a non-author edit and delete. The difference is recorded in `docs/RUBRIC.md` ("Project decisions that differ from literal rubric wording"), `docs/TEST-PLAN.md` V06 and `evidence/spec-review.md`.

Dependency note: the kanban slice is verified (root T07 to T09 are checked and the evidence is in `evidence/kanban-T07-T09.md`). Root T05 and T06 are checked. No prerequisite blocks this slice.
