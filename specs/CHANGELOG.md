# Specification Changelog

Spec versioning tracks review rounds independently of application releases. Record the old behavior, the agreed change, why it changed, the refinement prompt, and what was checked. Record the commit and link evidence when available. Newest date first. Each `## YYYY-MM-DD` heading groups the commits made that day, and each commit has a `### <short-sha> <subject>` entry. Release labels from 2026-11-13 stay under that date.

## 2026-11-18

### (commit pending) test: cover board sprint dates in the Playwright suite

- **local-acceptance (T15) · LA-3, task 5.3 (requested by the user: add the sprint date steps to Playwright, the open item DR5 of boards-membership Revision 2):**
  - **Before:** LA-3 covered create, open, add member, remove member, delete board and `USER_NOT_FOUND`. The boards-membership journey did not touch the sprint dates, and the T15 row, the traceability rows and the boards-membership evidence listed the Playwright date steps as open.
  - **After:** LA-3 also requires the sprint journey: create with dates (one date only and an end before the start refused), the header line kept after a reload, analytics with the sprint line and labels, a member's read-only view, an edit (refused and valid) and Clear dates back to the week. Native task 5.3 was added to `.kiro/specs/local-acceptance/tasks.md`, the design table row and the requirement text were extended, and the open notes in `specs/tasks.md`, `specs/traceability.md`, the boards-membership and analytics specs, the README and `evidence/boards-membership-T05-T06.md` were closed. No product behavior or contract changed.
  - **Reason:** A recorded follow-up (DR5, TR4) so the automated journey covers the sprint, not only the unit and emulator checks.
  - **Prompt/run:** a chat request to do the Playwright sprint steps in T15 (Claude Code, 2026-11-18). The spec text and the test were changed in one pass, so the spec review is after the fact.
  - **Verification:** `npx playwright test e2e/boards-membership.spec.ts` passed on desktop and on viewport-320, mobile-375 and viewport-768. `npm run e2e`: 58 passed, 0 failed (54 before). Each run's cleanup count was 0. Chromium emulation, native Flask on the test database and a production Next server. `npx tsc --noEmit` and `eslint e2e` are clean. Open: a real phone and a manual walk (T16).

### (commit pending) docs: align analytics spec with the sprint window

- **analytics (T14) · requirements, design and tasks revised for decision A11 (requested by the user: "spec analytics T14 juga disesuaikan dengan perubahan ini"):**
  - **Before:** `.kiro/specs/analytics/` described a UTC-week-only window and carried only a "Revision 2" note that said the text below it was kept as approved. Requirements 2, 3 and 4, the panel text of 6.2 and 6.3, the key list of 5.7, the parser of 8.2, the test lists of 8.3 to 8.5 and decision A2 all said "week". The design and tasks had no sprint decisions, tests or tasks.
  - **After:** The spec states the window as a Window: the Sprint_Window when the board has a sprint, else the Week. Requirement 4 is now "Counting window" with the sprint criteria (4.3, 4.6, 4.7) and the week fallback (4.4, 4.5). Requirements 2, 3, 5.6, 5.7, 6.2, 6.3, 6.10 (a read again when the sprint changes), 7.5, 8.2 to 8.5 and 8.8 follow it. Decision A2 is marked revised and A11 is added. The design adds DD13 (`board_window`), DD14 (`sprintKey`), DD15 (panel text from `window`), Properties 15 and 16, C40, the `test_analytics_sprint.py` row, the new key in the schema and the wire shape, and risk rows. The tasks add group 8 (8.1 to 8.6), all checked, each pointing to the files and evidence that prove it. The earlier "kept as approved" notes are replaced by the integrated text. Approved history is kept in the decision tables.
  - **Also corrected (stale since 2026-11-17):** design C35, Property 2 and the `test_analytics_completed.py` row still said a deleted or moved card keeps counting. They now match A3 as revised on 2026-11-17 and `docs/API.md`.
  - **Reason:** The sprint window changed what T14 counts and shows. The analytics spec should say so itself and not only point to the boards-membership spec. The decisions are the already approved SP1–SP8 and the implementation is verified, so no new product decision was made.
  - **Prompt/run:** `/revotask-feature spec analytics T14 juga disesuaikan dengan perubahan ini.` (Claude Code, 2026-11-18). Done in one pass over the three files, so the review below is after the fact.
  - **Verification:** Spec review only: no code, test or application changelog changed and no test was run. The text was checked against the implemented behavior (`backend/app/blueprints/analytics/service.py`, `frontend/lib/sprint.ts`, `AnalyticsFigures.tsx`, `useBoardAnalytics.ts`) and the recorded results (backend 2173 passed and 1 skipped, frontend 2170 passed, 140 browser checks, p95 12.4 ms on a 90-day sprint).

### bf181b6 docs: update specs, guides and evidence for board sprint range

- **boards-membership (T05–T06) and analytics (T14) · R03 AC03.1, R11 AC11.1, E06, E08, E29, `boards` table, C39–C41 (requested by the user: "Week of 16 Nov, 07:00 to 23 Nov, 07:00" had no matching setting when creating a board):**
  - **Before:** A board had only a name. E06 and E08 accepted `name`. BoardSummary was `{id, name, role, position_version}`. E29 always used the current UTC calendar week (Monday to Monday), and the panel showed it as "Week of …, 07:00 to …, 07:00 (local time)". The slice added no migration.
  - **After:** A board has an optional sprint, `sprint_start` and `sprint_end` (`YYYY-MM-DD`, both or neither, end on or after start, at most 90 days inclusive), set when the board is created and changed or cleared by its Admin through E08 (at least one of `name`, the pair; only submitted fields change). BoardSummary and BoardDetail carry the two keys. With a sprint, E29 counts inside `[sprint_start 00:00Z, day after sprint_end 00:00Z)` and adds `window` (`"sprint"` or `"week"`). Without one E29 keeps the UTC week. The UI shows "Sprint 16 Nov to 22 Nov" and "this sprint" labels for a sprint. One migration adds two nullable `date` columns and `ck_boards_sprint_range_valid`. Native decisions SP1–SP8, DS1–DS15, DR1–DR5, TR1–TR4 (kept T05, T06 and T14 checked with a Revision 2 note). Contract clarifications C39 (board shapes and E06/E08 rules), C40 (E29 window and `window` key, C34 now applies to boards without a sprint), C41 (columns and constraint).
  - **Reason:** The analytics panel showed a week that no user could set. A sprint range makes the window a user choice and keeps the old behavior for boards that have none, so existing boards and the T14 tests keep their meaning.
  - **Files:** `.kiro/specs/boards-membership/requirements.md` (Revision 2, Requirements 8 and 9), `design.md` (Revision 2), `tasks.md` (groups 10 to 16), `.kiro/specs/analytics/requirements.md` and `design.md` (Revision 2 notes, history kept), `specs/requirements.md` (AC03.1, AC11.1), `specs/design.md` (D3 `boards` row, analytics line), `specs/traceability.md` (AC03.x and AC11.1 rows), `specs/tasks.md` (T05, T06, T14 notes), `docs/API.md` (E06, E08, E29, shapes, C39–C41), `backend/specs/api-contract.md`, `backend/specs/data-model.md`.
  - **Prompt/run:** `/revotask-feature spec boards-membership` with the sprint request; requirements, design and tasks each approved in chat on 2026-11-18 (Claude Code). Details in `evidence/spec-review.md`.
  - **Verification:** The spec change itself was a review (no test). Implemented and verified the same day in native tasks 11 to 16: `pytest` 2173 passed and 1 skipped, `ruff` clean, `vitest` 2170 passed, `lint`, `typecheck` and `build` clean, a Chromium emulation run with 140 checks and 0 failed at 320, 375, 768 and 1280 px, and E29 on a 90-day sprint with p95 12.4 ms locally. Open: the Playwright date steps (T15) and a real-device check. `docs/USER_GUIDE.md` and `docs/TEST-PLAN.md` were updated with the implementation. Implementation details that the design left open are recorded in `evidence/spec-review.md`.

## 2026-11-17

### 23ac801 fix: drop analytics completed count when a card leaves done

- **analytics (T14) · A3 distinct completions, C35 (reversal of an approved decision, requested by the user):**
  - **Before:** `completed_cards` counted distinct cards with an `entered_done` event in the Week and kept a card that later left Done or was deleted (A3, C35).
  - **After:** It counts distinct cards with an `entered_done` event in the Week that are still active cards in an active Done column. A card moved out of Done, deleted, or in a column that stops being Done is no longer counted. Updated in `.kiro/specs/analytics/requirements.md` (2.1, 2.3, A3), `design.md` (DD5), `docs/API.md` (E29, C35), `specs/design.md` and AC11.1 in `specs/requirements.md`.
  - **Reason:** A card dragged from Done back to a not-done column still raised the "completed" figure, so the panel disagreed with the board.
  - **Verification:** `pytest` 2059 passed and 1 skipped, `ruff` clean. The frontend already re-reads E29 when `position_version` rises, so no frontend change.

### 29144c6 docs: kanban end drop strip is card-sized while dragging

- **kanban (T07–T09) · end drop strip height (native design only):**
  - **Before:** `.kiro/specs/kanban/design.md` set the end drop strip to at least 44 px high.
  - **After:** At least 44 px at rest, `min-h-32` (about one card) while a card is dragged. Root specs unchanged.
  - **Reason:** 44 px was too narrow to hit when dropping at the end of a lane.
  - **Verification:** `npx vitest run components/kanban hooks/useDragAndDrop` passed.

## 2026-11-15

### 8033a55 docs: close T15 in specs, changelogs and setup guide

- **local-acceptance (T15) · login budget, token spike and matrix audit rules (native design and tasks only, for the record):**
  - **Before:** `.kiro/specs/local-acceptance/design.md` section 4 budgeted 3 owner logins and 1 member login per run, task 3.1 expected 3 `jti` values in the run file, and the matrix audited the whole page with a dialog open.
  - **After:** The owner logs in 4 times (setup, LA-2a, LA-2b, LA-2d, a fresh sign-in so other suites keep their session), the run file holds 4 `jti` values, and a dialog row audits the dialog alone after its open transition finishes. The shared root specs are unchanged. Root T15 is checked.
  - **Reason:** LA-2d must not revoke the session the other specs use, and a box read during the modal's scale transition measured 43 px instead of 44.
  - **Verification:** `npx playwright test` 54 passed on 2026-11-15 and the cleanup count was 0. Evidence: `evidence/local-acceptance-T15.md`.

## 2026-11-14

### f06c24f docs: add analytics spec and update contracts

- **analytics (T14) · analytics shown in a modal from the board header (presentation and read timing change, for review):**
  - **Before:** `design.md` DD10 placed the panel below the Kanban region, and A8 read E29 on mount, after a successful local card or column change that advances `position_version`, and on Refresh.
  - **After:** An Analytics button sits at the right end of the board header and opens a `BaseModal` with the figures, Refresh and Close. The hook mounts only while the dialog is open, so a closed dialog sends no read. A card or column change made while the dialog is closed triggers no read; the next open reads fresh figures. Close and Escape abort the read in flight.
  - **Reason:** The user asked for a pop-up so the board stays uncluttered. Mounting the hook only with the dialog keeps the closed state free of requests.
  - **Verification:** `evidence/analytics-T14.md` ("Browser check", rerun on the modal build): 153 checks, 2 failed, both on the shared header brand link (FE-S5), recorded open. Frontend 2035 tests pass. The version-rise re-read is covered by the next-open read, not by a test while closed.
  - **Open:** Approval is needed for the A8 wording (read on open rather than at the change). Until approved, A8 remains the reference.

- **analytics (T14) · implementation deviations from the approved design (no behavior or contract change):**
  - **Before:** `design.md` named a "secondary" `BaseButton` for Refresh and Retry, gave `useBoardAnalytics` a `status` of "loading" or "ready" with no error case, and did not mention how the mount read flags itself in flight. The `BoardShell` tests counted every `apiGet` call.
  - **After:** Refresh and Retry use the existing `ghost` variant with `border border-base-300`, because `BaseButton` has no `secondary` variant and no new variant was added (FE-D1). `status` is "loading" only while there are neither figures nor an error, so a first-read failure shows the error and not the loading text. The mount effect carries one `eslint-disable-next-line react-hooks/set-state-in-effect` for the in-flight flag. `BoardShell.test.tsx` counts only non-analytics reads in its member-removal tests (`mockGets`, `otherGets`), because the panel reads E29 through the same client.
  - **Reason:** The shared button has two variants. A failed first read must not stay on "Loading analytics…". The lint rule reports a state update that starts an external request. The panel is a new reader on the board page.
  - **Verification:** `evidence/analytics-T14.md`: backend 2050 passed and 1 skipped, frontend 2031 passed, `next build` succeeds, and a 128-check Chrome run passed with 0 failed. Four mutation checks made the matching backend tests fail.

- **analytics (T14) · task plan approved and shared documents finalized (2026-11-14):** the user's `implement analytics T14` invocation (all tasks) approved the plan. `specs/tasks.md` T14 links `.kiro/specs/analytics/tasks.md`; `specs/traceability.md` (AC11.1 and the E29 row), `frontend/specs/pages-and-components.md` (the `/boards/[id]` row and `useBoardAnalytics`), `frontend/specs/api-integration.md` and `guidelines/frontend.md` (the component table) carry the approved design wording. No behavior change beyond the entry for C34–C38. Verification: spec review at this step.

- **analytics (T14) · E29 contract clarifications C34–C38 and the analytics panel (requirements and design review, decisions A1–A10, approved 2026-11-14):**
  - **Before:** `docs/API.md` said E29 returned `{week_start,week_end,cards_per_column,completed_cards,member_activity}` and "End is exclusive". D6 said activity counts "all recorded board events in the week grouped by actor", and AC11.1 said "event counts by actor". It did not say how the week is chosen or formatted, what counts as a completion when a card re-enters Done or is deleted later, which event kinds count, whether a removed member appears, how the lists are sorted, whether a query parameter is allowed, or when the board page reads E29. Because `entered_done` is written beside `card_created` and `card_moved`, counting all events gave 2 for one completion.
  - **After:** The Week is the UTC week of the server clock, Monday 00:00 inclusive to the next Monday 00:00 exclusive, with `week_start` and `week_end` as ISO 8601 timestamps ending in `Z` (C34). `completed_cards` counts distinct cards with an `entered_done` event in the Week and keeps a card that later left Done or was deleted (C35). `member_activity` counts `card_created`, `card_moved`, `column_reordered` and `comment_created`, leaves `entered_done` to `completed_cards`, includes former members under the current name and sorts by count descending, lower-cased name and user ID (C36, D6 and AC11.1 reworded). `cards_per_column` lists every active column with a count, 0 when empty (C37). E29 accepts no query parameter, checks 401, ID 400, query 400 and then 404, is read-only and is open to every participant (C38). The board page shows a client analytics panel that reads E29 on mount, when the Kanban `position_version` rises and on Refresh, with no polling, and keeps its errors inside the panel.
  - **Reason:** The contract left the week window, the format, the distinct and historical rules, the counted kinds and the access rules open. A user who completes one card must not look twice as active, a week boundary must not move with the caller's time zone, and an analytics failure must not make the board unusable.
  - **Verification:** Spec review only. No tests were run and no source code was changed. The planned checks are the UTC week boundaries with a fixed clock, the same card entering Done twice, a removed member's activity, an E29 failure that leaves the board usable, figures not inflated by joins, read-only behavior, access and check order, and the panel at 320, 375, 768 and 1280 px. Database-writing tests use `TEST_DATABASE_URL` through `db_guard` and clean up the rows each run created. Decision record: `evidence/spec-review.md` ("Analytics review record (T14)"). Root `specs/tasks.md`, `specs/traceability.md`, `guidelines/frontend.md`, the layer specs, the README and the application changelogs are unchanged until finalize.

### 3403d4b docs: update specs, guides and changelogs for notifications

- **notifications (T13) · implementation deviations from the approved design (no behavior or contract change):**
  - **Before:** `design.md` placed the bell in a brand block of `flex-1 min-w-0`, kept the account name at `max-w-[28vw]`, rendered the panel without a text color, wrote the row text as a `break-words` flex item and imported `UtcDateTime` from `comments/schema.py`. The hook called `load` from inside its own callback.
  - **After:** The brand block is `flex-auto`, the account name is `max-w-[18vw]` below 640 px and the RevoTask wordmark is visually hidden below 400 px (it stays the link's accessible name), so the bell, Profile, Boards, My tasks and Sign out fit a two-row header at 320 and 375 px. The panel content sets `text-base-content`, because the dialog renders inside the dark header and inherited its pale text. The row text sits in a span with `overflow-wrap: anywhere`. `UtcDateTime` lives in `app/validation.py`, because importing it from `comments/schema.py` made `cards.service → notifications.service → comments.schema → comments.service → cards.service` a cycle. The last-page step of `useNotifications` calls `load` through a ref. The TypeScript type is `NotificationItem`. `guidelines/frontend.md` FE-D2 and the component table, `frontend/specs/pages-and-components.md`, `frontend/specs/api-integration.md`, `backend/specs/data-model.md` and `specs/traceability.md` carry the same wording.
  - **Reason:** The browser check showed the bell overlapping the Profile link at 320 and 375 px, panel text that was almost invisible, and a long unbroken title running under the Unread badge. The import cycle and the lint rule are mechanical.
  - **Verification:** `evidence/notifications-T13.md`: backend 1986 passed and 1 skipped, frontend 1958 passed, `next build` succeeds, and a 205-check Chrome run passed with 0 failed after the fixes. Two mutation checks made the matching backend tests fail.

- **notifications (T13) · task plan approved and shared documents finalized (2026-11-14):** the user's `implement notification T13` invocation approved the plan. `specs/tasks.md` T13 links `.kiro/specs/notifications/tasks.md` and T16 notes the open limit on notification volume per user; `specs/traceability.md` AC10.1 and AC10.2 and the E27–E28 row carry the native spec. No behavior change beyond the entry for C28–C33. Verification: spec review at this step.

### a067359 docs: update specs, api docs and changelogs for profile, my tasks and search

- **notifications (T13) · E27 and E28 contract clarifications C28–C33 and the bell in the shared header (requirements and design review, decisions B1–B10, approved 2026-11-14):**
  - **Before:** `docs/API.md` said E27 returned `{items,page,per_page,total,unread_count}` newest first and E28 returned a "read item", with a `Notification` of IDs only. It did not say which events notify, how repeats count, what hides a notification, how the page numbers are validated, what `total` counts, what E28 returns for a hidden or foreign ID, or how the bell polls. AC10.1 and AC10.2 had no read-state, visibility or accessible-name wording, and FE-S3 said only "Bell label includes unread count."
  - **After:** A new assignment (E17, E18) notifies the new assignee when they differ from the caller and the previous assignee, and a new comment (E24) notifies the current assignee when they differ from the author, each in the same transaction under the board lock so a rolled-back change leaves none (C28). One notification per qualifying event, so `unassigned → A → B → A` by another user notifies A twice (C29). One visibility filter (active board, column and card, and the recipient's active membership) serves E27 items, `total`, `unread_count` and E28, rows are kept, and a rejoining member sees them with their original `read_at` (C30). E27 takes only `page` (1 to 2,147,483,647, default 1) and `per_page` (1 to 50, default 20), each once as strict digits, with a 400 before any read for a repeated, unknown or invalid one, a 64-bit offset, order `created_at` then `id` descending, counts that ignore the page and an empty 200 past the end (C31). E28 reads no body, takes no lock, runs one conditional update scoped to a visible notification of the caller, returns 200 with the item, keeps the original `read_at` on a repeat and answers one generic 404 for a missing, foreign or hidden ID (C32). The item gains `actor_name`, `board_name` and `card_title`, resolved on read for visible rows only, and every earlier field stays (C33). The bell sits in the AppHeader brand block at every width and opens a `BaseModal` panel with board links, "Newer" and "Older" paging at 20 per page and a "Mark as read" button per unread row. Following an unread row's link marks it read without blocking navigation. The hook polls every 30 seconds for the shown page, keeps one E27 request in flight, stays quiet on a failed poll, and drops a response for an earlier page or requested before a completed E28. The badge hides at 0 and caps at `99+`, and the accessible name keeps the exact count (FE-S3 updated). `docs/API.md` E17, E18, E24, E27, E28 and the data shapes, `backend/specs/api-contract.md`, `specs/requirements.md` AC10.1 and AC10.2, `docs/TEST-PLAN.md` V08 and V11, `guidelines/frontend.md` FE-S3 and `.kiro/specs/notifications/` carry the same wording. FE-D2 and the layer specs are updated with the implementation.
  - **Reason:** The contract left the triggers, repeat handling, visibility, paging, idempotence and polling open. A bell that shows only IDs cannot say who did what. Two overlapping marks, a poll that finishes after a mark and a member who leaves and returns must not leave a wrong count or a lost state.
  - **Verification:** Spec review only. No tests were run and no source code was changed. The planned checks are rollback of the notification with its change, concurrent assignments and marks, visibility after removal and rejoin, counts across pages and on an empty page, the largest `page`, idempotent E28, polling during a mark-as-read action, the link click that navigates although marking fails, and the header at 320 and 375 px with the bell added. Database-writing tests use `TEST_DATABASE_URL` and clean up the rows each run created.

- **profile (T12) · implementation deviations from the approved design (no behavior or contract change):**
  - **Before:** `design.md` listed E22 results among the reads that show a changed name, and did not say what `ProfileForm` does with a Flask 400 whose only keys are not Name or Email. `profileChanges` was written to take a `PublicUser`.
  - **After:** The names test covers E10 (`user_id`, `name`), E21 `assignee_name` and E23 `author_name`, because E22 returns no names, and `design.md` says so. `ProfileForm` shows such a message as a form-level `role="alert"` ("Check the submitted fields."), because no field can carry it. `profileChanges(values, saved)` takes the saved values as a `{name, email}` record, so the form passes its own `saved` state. The generic `validate` in `lib/authRules.ts` gained a `partial` option for `validateProfile`. `test_factory.py` lists `users.patch_me`, and `test_users_me.py` replaced its "PATCH returns 405 until T12" case with a PUT 405 case.
  - **Reason:** E22 has no name field. A server message with no field must still be visible. The form already holds the saved values as a plain record. The route now allows PATCH.
  - **Verification:** `evidence/profile-T12.md`: backend 1907 passed and 1 skipped, frontend 1845 passed, `next build` succeeds, and a 376-check Chrome run passed with 0 failed. The row-lock test fails when the lock is removed.

- **profile (T12) · task plan approved and shared documents finalized (2026-11-14):** the user's `implement profile T12` invocation approved the plan. `specs/tasks.md` T12 links `.kiro/specs/profile/tasks.md`; `specs/traceability.md` AC12.1, `frontend/specs/pages-and-components.md`, `frontend/specs/api-integration.md` and `guidelines/frontend.md` FE-D2 carry the approved design wording. No behavior change beyond the entry below. Verification: spec review only at this step.

- **profile (T12) · E31 contract clarifications C23–C27 and the AppHeader account link (requirements and design review, decisions P1–P11):**
  - **Before:** `docs/API.md` E31 said "`name` or `email` (E02 constraints) → 200 public user. `password` or unknown fields 400, duplicate email 409." It did not say whether both fields may be sent, what an empty body does, what an unchanged value does, whether a 409 undoes a valid name sent with it, how two overlapping updates of one account resolve, or what an email change does to sessions. AC12.1 named neither the no-op, the 409 rollback nor the header refresh. `AuthProvider` had no setter, and the header's name was not a link, so no screen led to `/profile`.
  - **After:** E31 is a partial update of `name`, `email` or both, with the E02 rules; `{}`, a non-object and any other key (`password` included, `Unknown field.`) are 400 (C23). A value equal to the stored one after normalization is a no-op: 200, no write, `updated_at` unchanged, and a case-only change of one's own email is not a 409 (C24). The update is all or nothing, and a duplicate email is 409 `EMAIL_ALREADY_EXISTS` from `uq_users_email` with the valid name not stored (C25). Last write wins per submitted field, an omitted field is never written, both fields apply together, and the service locks the user row (C26). An email change revokes no token and sends no mail, the 409 is an additional account-enumeration path next to E02, and the E31 rate limit, reauthentication, new-address confirmation and an old-address notice are deferred to T16 (C27). The AppHeader account block links to `/profile` at every width, and a save updates the safe user context, refreshes the route and shows "Profile updated." AC12.1, `docs/API.md` E31, `backend/specs/api-contract.md` `users_bp`, `docs/TEST-PLAN.md` V07 and V11 carry the same wording.
  - **Reason:** The contract left the partial-update, no-op, atomicity, concurrency and session behavior open. Two overlapping requests for one account must not lose a field. A user needs a visible way to reach the profile on a phone (AC13.1), and the header must not keep an old name after a save.
  - **Verification:** Spec review only. No tests were run and no source code was changed. The checks (the `profile` fixture in Flask and `authRules`, 400/401/409 cases, the duplicate email beside a name change, concurrent name-only and email-only updates, token and login behavior after an email change, later reads showing the new name, cleanup of test data on `TEST_DATABASE_URL`, mobile at 320, 375, 768 and 1280 px) are specified in `.kiro/specs/profile/design.md` and run during implementation. Decision record: `evidence/spec-review.md` ("Profile review record"). Root `specs/tasks.md`, `specs/traceability.md`, `guidelines/frontend.md` FE-D2 and the README are unchanged until the task plan is approved and implementation.

- **my-tasks-search (T11) · implementation deviations from the approved design (no behavior or contract change):**
  - **Before:** `design.md` described the search live region as `role="status"` and `KanbanBoard` without a board ID prop. `FormField` had no search type or length limit.
  - **After:** `CardSearch` announces through `aria-live="polite"` on a plain element, because the board already has one `role="status"` region and a second one made the board's own status lookups ambiguous. `KanbanBoard` takes a required `boardId` prop (passed by `BoardShell`) for the search path. `FormField` accepts `type="search"` and an optional `maxLength`, used only by the search field. A request with an unknown key and a missing known key reports the known field beside the standard message (`specs/fixtures/search-query-cases.json`). `guidelines/frontend.md` lists `CardSearch`, `useCardSearch`, `MyTasks` and `TaskGroup`.
  - **Reason:** Two status regions in one island break `getByRole("status")` in the existing board tests and are ambiguous for assistive technology. The search needs the board ID to build its request path. The field limit is a design requirement (Requirement 5.1) that the shared field could not express.
  - **Verification:** `evidence/my-tasks-search-T11.md`: backend 1808 passed and 1 skipped, frontend 1733 passed, `next build` succeeds, and a 359-check Chrome run passed with 0 failed.

- **my-tasks-search (T11) · E21 and E22 contract clarifications C18–C22 and the shared navigation change (requirements review, decisions S1–S11):**
  - **Before:** `docs/API.md` gave E21 and E22 one line each ("list of active cards assigned to current user", "up to 20 active title matches"). It did not say how a missing, repeated or unknown query parameter is handled, how the results are ordered, whether Done cards appear, how `%` and `_` are treated, whether the endpoints write, or that a nonmember gets the generic 404. AC06.2 and AC09.1 did not name order, the cap, validation or what the search shows after a card changes. `AppHeader` hid its navigation below 1024 px, so a phone had no link to `/my-tasks`. Design D6 sorted My Tasks groups by board name then ID.
  - **After:** E21 returns every active card assigned to the caller on active boards where the caller has an active membership, unpaginated, including Done cards, excluding soft-deleted cards and cards in soft-deleted columns, sorted by case-insensitive board name, board ID, column order, card order and card ID (C19). E22 matches the title only, case-insensitively, with `%`, `_` and `\` literal, returns at most 20 in board order with the card ID as tie-breaker and no total, and answers the generic 404 for a nonmember or removed member (C20). Both are read-only: no lock, event, notification or `position_version` change. Each accepts only its documented parameter, sent once. A missing, repeated, invalid or unknown parameter returns 400 `VALIDATION_ERROR`, with `fields.assignee` or `fields.q` for a known parameter and the standard message for an unknown one. `q` is trimmed, 1 to 100 characters, and a NUL character is rejected (C18). E22 has a same-origin browser GET handler that forwards the query string unchanged so Flask validates it, and E21 is read only by its Server Component (C21). The search UI clears results at once for a blank query, resolves results against the live board state (current title and column, omits a deleted or no-longer-matching card, restores a rolled-back delete) and shows "Showing 20 results." at the cap. AppHeader shows Boards and My tasks at every width (C22). AC06.2, AC09.1, design D5 and D6, `backend/specs/api-contract.md`, `frontend/specs/api-integration.md`, `frontend/specs/pages-and-components.md`, `guidelines/frontend.md` FE-D2, `docs/TEST-PLAN.md` V07 and V11 and `specs/traceability.md` carry the same wording.
  - **Reason:** The contract left the validation, order, scope and write behavior open. Other endpoints already reject unknown input, and C1 already makes a nonmember's answer a 404. A forwarding handler that rebuilt the query would hide a repeated or unknown parameter from Flask. A phone user could not reach My Tasks (AC13.1). A search result must not show a card that was deleted or renamed after the response.
  - **Verification:** Spec review only. No tests were run and no source code was changed. The checks (Done cards, query validation in Flask and through the Next handler, the 20-result cap, late responses, results after a rename or delete, mobile navigation at 375 px, cleanup of test data) are specified in `.kiro/specs/my-tasks-search/design.md` and run during implementation. Decision record: `evidence/spec-review.md` ("My Tasks and search review record"). Root `specs/tasks.md` is unchanged until the task plan is approved.

## 2026-11-13

### 1de7983 docs: update specs, api docs and test plan for comments

- **comments (T10) · implementation deviations from the approved design (no behavior or contract change):**
  - **Before:** `design.md` put the "Comments (n)" heading in `CommentList`, described a card detail modal with the edit form's own Cancel as its only close control, and did not mention nested dialogs. `frontend/specs/pages-and-components.md` and `guidelines/frontend.md` listed `CardEditDialog` and no comment parts.
  - **After:** `CommentList` shows only the empty text or the list, and the section heading sits in `CardDetailModal`, so it can show beside the loading and error states. The modal header has a Close button, so the close control stays reachable while the box scrolls. `CardEditForm` carries the name "Edit card" as a form. `CommentForm` focuses its field after a successful add. `BaseModal` stops `cancel` propagation and ignores Tab from a nested dialog, because React bubbles those events through the component tree and Escape on a nested confirmation closed the dialog behind it (this also fixes the Delete card confirmation from the kanban slice). The card button is "Open <title>" and its dialog "Card details" (N2). `useKanbanBoard` exports `FetchOutcome` and adds `refreshBoard()` and `hasCard()` (DD10). `guidelines/frontend.md`, `frontend/specs/pages-and-components.md`, `api-integration.md` and `error-handling.md` now describe the modal, the comment parts, the browser handlers, the 404 resolution and the uncertain add. `docs/USER_GUIDE.md` step 3 names Card details and the lost-response message.
  - **Reason:** The browser check found the nested Escape defect (F-CMT-1) and the missing focus after an add (F-CMT-2). The heading and Close button follow from Requirements 6.4 and 8.2 and the mobile check.
  - **Verification:** `evidence/comments-T10.md`: backend 1706 passed and 1 skipped, frontend 1571 passed, `next build` succeeds, and a 480-check Chrome run passed with 0 failed. The two defects failed their new tests before the fix.

- **comments (T10) · comment contract clarifications C14–C17 and AC08.2 rewording (requirements review, decisions M1–M13):**
  - **Before:** `docs/API.md` E23–E26 gave one line each: E25 and E26 "Author with access", E26 "200 soft-deleted comment", and no rule for a non-author, the check order, the lock, the version, events, content handling or an unchanged edit. AC08.2 said "A successful edit updates `updated_at`". `docs/TEST-PLAN.md` V06 and the handbook expected comment create to return 201/400/401/403. `specs/design.md` D5 described `CardDetailModal` as a separate dialog beside the card edit dialog.
  - **After:** E23 is an unpaginated list in creation order with the author's current name. E24 trims content (1 to 2,000, inner line breaks kept, plain text) and records one `comment_created` event in the same transaction. E25 and E26 are author-only: a participant who is not the author, an admin included, gets 403 `FORBIDDEN`, and a removed author or nonmember gets the generic 404 (C1). E25 with unchanged trimmed content returns 200 and leaves `updated_at`. E26 returns the pre-delete Comment, and a repeat returns 404. Check order: shape (400), board access (404), lock, recheck, reload under the lock (404), author (403). Comment writes never change `position_version`. AC08.2 now says `updated_at` changes when the normalized content changes. V06 tests create with 201, 400, 401 and 404, and the 403 on non-author edit and delete, an admin included. `docs/RUBRIC.md` records the create-path difference. D5 says one `CardDetailModal` replaces the card edit dialog and loads comments through a same-origin `GET` handler. Updated `docs/API.md`, `backend/specs/api-contract.md`, `specs/requirements.md`, `specs/design.md` D5, `docs/TEST-PLAN.md` V06 and `docs/RUBRIC.md`. Design review N1–N5 added: E24 sets `created_at` and `updated_at` from one clock reading and does not deduplicate identical posts (`docs/API.md` E24). UI-only decisions (names, `BaseModal wide`, the generic-404 resolution and the uncertain-add flow) live in the native spec.
  - **Reason:** The contract left the permission, order and edit behavior open. D2 already says the author check applies to admins, and C1 makes a nonmember's answer a 404, so create cannot return 403. A no-op edit must not show a false "Edited" marker. Comments do not reorder anything, so they must not bump the position version.
  - **Verification:** Spec review only. No tests were run and no source code was changed. The checks (author-only matrix, request order, no-op edit timestamp, event rules, lock races, atomicity, mobile) are specified in `.kiro/specs/comments/design.md` and run during implementation. Decision record: `evidence/spec-review.md` ("Comments review record"). Root `specs/tasks.md` and `specs/traceability.md` are unchanged until the task plan is approved.

### a77ffbc docs: update specs, api docs and changelogs for kanban

- **kanban (T07–T09) · implementation deviations from the approved design (no behavior or contract change):**
  - **Before:** `design.md` and `tasks.md` described `BoardShell` receiving a `membersPanel` element, `readJsonObject` requiring the exact key set, a shared `read_columns`, three shared parts (`SelectField`, `FormField` multiline), and kanban client tests extending `apiClientProperties.test.ts`.
  - **After:** `BoardShell` renders `MembersPanel` itself, because a server page cannot pass the `onMemberRemoved` function. `readJsonObject` and `PrivateWriteSpec` take `requiredKeys` (default: every allowed key), so E13, E14, E17 and E18 accept optional keys while the member and auth handlers keep the exact key set. `commit_or_rollback` is the public name of the boards commit helper. A fourth shared part, `CheckboxField` (a 44 px checkbox with a text hint), serves the add-column form and the column edit dialog. Kanban client tests are in `lib/kanbanClient.test.ts`. `guidelines/frontend.md` lists `SelectField`, `CheckboxField` and `FormField` with `multiline`.
  - **Reason:** A server component cannot pass a function to a client component. Optional request keys need their own rule. A 44 px checkbox needs the control itself at 44 px (FE-S5), and two screens use it.
  - **Verification:** `evidence/kanban-T07-T09.md`: backend 1570 passed and 1 skipped, frontend 1362 passed, `next build` succeeds, and a 418-check Chrome run passed with 0 failed.

- **kanban (T07–T09) · design review clarifications L1–L7 (contract and task-scope change):**
  - **Before:** E12 cleared a removed member's assignments on every card whose column belonged to the board, including cards in soft-deleted columns (open question in `specs/traceability.md`). The kanban design said E16 returned 404 only for a moved column "not active on the board", gave no rule for a full `position_version`, and gated the UI for writes and refetches without naming the member-removal refresh.
  - **After:** E12 clears assignments only on active cards in active columns of the board, in the same transaction as the removal. Soft-deleted cards, cards in soft-deleted columns and other boards keep their data (C12). A well-formed E16 `column_id` that is missing, soft-deleted or on another board returns the same generic 404, and a malformed ID returns 400 (C8, L1). A blank or whitespace-only card description is stored as null, and an omitted one is kept on E18. E16 and E20 accept integer versions 0 to 2147483647 and reject booleans. When `position_version` is 2147483647, a version-changing request returns 409 `STATE_CONFLICT`, writes nothing and records no event (C13, L6). The per-board UI gate covers every Kanban write and board refetch, including the refresh after member removal, and a write may finish its own recovery refetch. Stale responses are ignored (L2). Updated `docs/API.md` E12, `specs/requirements.md` AC04.2, `specs/traceability.md` (AC04.2 row and the soft-deleted-column risk), `docs/TEST-PLAN.md` V03, the boards-membership requirements (intro and Requirement 5.1) and DD6, and the kanban requirements and design.
  - **Reason:** Soft-deleted records stay as history and must not be edited by a later removal. A full version counter must fail cleanly, not with a database overflow. A refetch must not overwrite a newer board.
  - **Verification:** Spec review only. No tests were run and no source code was changed. T05 close-out (kanban `tasks.md` group 1) then added the E12 regression test and the code change: the new case failed before the fix and the full backend suite passed after it (1147 passed, 1 skipped; `evidence/kanban-T07-T09.md`). T07–T09 add the ceiling and gate tests. Decision record: `evidence/spec-review.md` ("Kanban design review clarifications").

- **kanban (T07–T09) · column and card contract clarifications C6–C11 (design review, decisions K1–K12):**
  - **Before:** `docs/API.md` E13–E20 gave no body for E15 and E19 beyond "new `position_version` in `data`", no error codes for the Done and nonempty-column 409s, no rule for an invalid assignee, no rule for an unchanged position, and no order between the version check and the destination check. `specs/design.md` D4 compared versions before locking and wrote an event for every move.
  - **After:** E15 and E19 return `{"data": {"position_version": n}}`. The Done and nonempty-column conflicts return 409 `STATE_CONFLICT`. An invalid assignee returns 400 with `fields.assignee_id`. An invalid destination or anchor returns 400 "Choose a valid destination." with no `fields`. Check order for E13–E20: shape (400), board access (404 or 403), board lock, recheck membership, role and the addressed resource under the lock (404), version (409 `POSITION_CONFLICT`), then destination and anchor (400). A `column_id` in the E16 body that is not an active column of the board returns 404. An unchanged position returns 200 with the same version and writes nothing, and records no event. Events are written in the same transaction and only for a real change. E14 ignores an unchanged `is_done` and applies other valid fields. A blank card description is stored as null. The browser gets same-origin `GET` handlers for E07 and E10 for board refetches. Updated `docs/API.md` (E13–E20 and the notes below the table), `backend/specs/api-contract.md` (409 row and the check-order paragraph), `specs/design.md` D4 steps 2 and 4, `specs/requirements.md` AC07.2, `docs/TEST-PLAN.md` V04 and V05, `frontend/specs/pages-and-components.md` (hooks), `frontend/specs/api-integration.md` and `frontend/specs/error-handling.md`.
  - **Reason:** A stale client must get a 409 and refetch whatever its anchor says. A no-op move must not force other clients into a 409. A nonmember and a missing ID must stay indistinguishable. The contract left these open (decisions K1, K2, K3, K6, K9).
  - **Verification:** Spec review only. No tests were run and no source code was changed. The checks (version conflicts, authorization, unchanged positions, audit events, keyboard and touch movement, assignment refresh) are specified in `.kiro/specs/kanban/design.md` and run during implementation. The decision record is in `evidence/spec-review.md` ("Kanban review record"). Root `specs/tasks.md` and `specs/traceability.md` are unchanged until the task plan is approved.

### e99eb8e docs(specs): add boards-membership spec, shared fixture and API contract updates

- **boards-membership (T05–T06) · nonmember 404, `USER_NOT_FOUND`, E12 assignment clearing in T05, test approach (revision 2, contract clarification C1–C5 and task-scope change):**
  - **Before:** `specs/design.md` D2 and `backend/specs/api-contract.md` gave authenticated nonmembers 403. `docs/API.md` E09 said "200 soft-deleted board", E11 listed only 201 and 409, and E12 had no 404 or `STATE_CONFLICT` wording. The native tasks deferred AC04.2 assignment clearing to T08, proposed Hypothesis and fast-check, and left decisions R1–R14 open.
  - **After:** Nonmembers and removed members get the same 404 as a missing board on board-scoped routes; 403 stays for participants with the wrong role (D2, api-contract 403/404 rows, `docs/API.md` conventions, root AC03.3). E09 and E12 return `{"data": null}`. E11: unregistered email 404 `USER_NOT_FOUND` (plain envelope, admin only), reactivation of a removed user as `member` 201, active user 409 `STATE_CONFLICT`. E12: 404 for a target without an active membership, 409 for the admin, and the removed user's active card assignments on that board are cleared in the same transaction (AC04.2 closed in T05; `specs/traceability.md`). T15 carries the automated boards-membership Playwright journey; T16 carries a per-admin E11 rate limit with shared storage and the account-enumeration note. Native tasks updated for R1–R14, DD1–DD16, Properties 1–17 and WP-B0 (validators move to `backend/app/validation.py`); properties are parameterized pytest and Vitest tests, no new library. The native `design.md` backend test-file list now matches `tasks.md` (separate files for access, roles, request order, member assignments and four property groups, instead of one `test_boards_properties.py`); the approach is unchanged (parameterized pytest and Vitest, no Hypothesis or fast-check, mobile check during implementation, Playwright in T15, cleanup scoped to records created by the run on `TEST_DATABASE_URL`). The user approved the plan on 2026-11-13 on the basis of R1–R14. Root T05 and T06 stay unchecked. `docs/TEST-PLAN.md` V03 now names the nonmember 404, `USER_NOT_FOUND` ordering, request order and `TEST_DATABASE_URL` teardown checks.
  - **Reason:** 404 hides which board IDs exist; a distinct code lets the UI tell "no such user" from "board gone"; `cards` already exists, so clearing needs no T08 dependency.
  - **Verification:** Spec review only. No tests were run and no source code was changed. Checks happen during implementation. The R1–R14 and C1–C5 record is in `evidence/spec-review.md` ("Boards-membership review record"). Items needing review because R1–R14 do not name them: E09 and E12 `{"data": null}` bodies, E11 reactivation as `member` with 201, `STATE_CONFLICT` on the E11 and E12 409s, the E12 404 for a target without an active membership, and the formatter re-alignment of `docs/TEST-PLAN.md`.

### 012b0b3 docs: record the password rule and one-worker rate limit in specs and API docs

- **authentication (T03–T04) · local rate limit runs one Gunicorn worker (revision 4, configuration and contract clarification):** the local Compose backend uses `GUNICORN_WORKERS=1`, and a 401 no longer carries `Retry-After`.
  - **Before:** the image default of two workers kept two sets of login and register counters, so the limit was not exact (`evidence/spec-review.md` F-AUTH-11). Flask-Limiter put `Retry-After` on every response, including 401 (F-AUTH-13).
  - **After:** `compose.yaml` sets `GUNICORN_WORKERS: "1"` for local runs. The Render default stays 2 until T16, and `docs/DEPLOYMENT.md` now says to set 1. `response_headers.py` removes `Retry-After` from non-429 responses. Native spec: AUTH-AC6.6, open item 2, DD11, the task 2.11 rate-limit check.
  - **Reason:** The local limit must match AUTH-AC6.2 (five invalid logins per minute per email, then 429). Shared limiter storage is a larger change and stays in T16.
  - **Verification:** Live check on the rebuilt container: `401, 401, 401, 401, 401, 429` for one normalized email, one worker, and no `Retry-After` on the 401s. Pytest fresh process: 17 rate-limit tests passed, and the full backend suite passed 431. Negative controls failed as expected. The smoke rerun passed 75 of 75 with a restart before each group, and the Chrome check passed 96 of 96. Evidence: `evidence/authentication-T03-T04.md`, revision 4.

- **authentication (T03–T04) · register password rule (revision 3, requirement change, P11):** the minimum drops from 12 to 8 characters, and register needs an uppercase letter, a lowercase letter and an ASCII special character.
  - **Before:** register accepted 12 to 128 characters with no character-class rule (`specs/design.md` D2, `docs/API.md` E02, `.kiro/specs/authentication/requirements.md` AUTH-AC1.3).
  - **After:** register accepts 8 to 128 characters with at least one `A–Z`, one `a–z` and one ASCII special character (`0x21–0x2F`, `0x3A–0x40`, `0x5B–0x60`, `0x7B–0x7E`). A space and a non-ASCII symbol do not count. The length message is reported first when both rules fail. Login accepts 1 to 128 characters with no composition rule, so existing or mistyped passwords get a normal 401. The register form shows the rules as visible help text linked to the input. Native spec: P11, C11, DD15, AUTH-AC1.3, AUTH-AC2.4, AUTH-AC10.8. Updated `specs/design.md` D2, `docs/API.md` E02 and E03, `docs/USER_GUIDE.md`, `docs/TEST-PLAN.md` V01, `backend/specs/api-contract.md`, `frontend/specs/pages-and-components.md`.
  - **Reason:** The owner judged the 12-character minimum too long. The composition rule keeps a short password from being a single kind of character. Limiting the rule to ASCII keeps Python and TypeScript identical. Keeping login free of the rule means an existing or mistyped password never gets a policy message.
  - **Verification:** Backend pytest 428 passed (Ruff passes). Frontend lint, typecheck and Vitest 446 passed in 31 files. The shared case file ran in both suites, 61 cases. `next build` with sentinel values passed. The HTTP smoke passed 73 of 73, including Next and Flask rejections and a login with a short password. The Chrome check passed 96 of 96, including the hint link and the composition message. Evidence: `evidence/authentication-T03-T04.md`, revision 3.

### 2b24ad2 docs: add authentication feature spec and record T03-T04 status

- **all UI slices · mobile responsiveness is a standing rule (requirement and guideline change):**
  - **Before:** AC13.1 required only the core flow to work at 375 px. `guidelines/frontend.md` had FE-S2 (mobile-first, horizontal scroll only in the Kanban region) and nothing on touch targets, input size, viewport height or when to check. The foundation scaffold uses `min-h-screen` in `app/layout.tsx` and `app/page.tsx`.
  - **After:** AC13.1 covers every page, dialog and control at 375 px and wider, with 44 px touch targets and 16 px inputs. New rules FE-S4 (layout, `min-h-dvh`, wrapping, no zoom lock), FE-S5 (touch targets and input size) and FE-S6 (each UI slice has a 375 px criterion, a build task and a recorded check at 320, 375, 768 and 1280 px). The workflow steering, the feature queue, the root task tracker, `docs/TEST-PLAN.md` V11 and the frontend page spec say so. The 44 px size is stricter than WCAG 2.2 AA (24 px) and is a project choice, confirmed in review. It is measured as the element's rendered tappable box (`getBoundingClientRect()` plus an `elementFromPoint` check), not from class names.
  - **Reason:** Responsiveness has to hold in every feature, so each slice checks it instead of leaving it to final acceptance.
  - **Verification:** Text review, then applied in the authentication slice (AUTH-R13). A Chrome 157 run (device emulation, no real phone) measured `/login`, `/register`, `/` signed in, and the error state at 320, 375, 768 and 1280 px: no horizontal page scroll, every control at least 44 by 44 from `getBoundingClientRect()` with `elementFromPoint` hitting it, inputs at 16 px, toasts inside the screen. 90 of 90 checks passed twice. `lib/mobileGuard.test.ts` keeps `h-screen`, `100vh` and zoom locks out. Real-phone and on-screen-keyboard checks remain open (T15, T16). Evidence: `evidence/authentication-T03-T04.md`.

- **authentication (T03–T04) · E30 read moves to T03 (task-scope change, P1):** the current-user read endpoint ships with T03.
  - **Before:** E30–E31 belonged to T12, which depends on T04. The T04 protected shell needs the user (D2: load `AuthContext` "using the session/profile endpoint"), so T04 could not be built or verified.
  - **After:** T03 implements `GET /api/users/me`. T04 consumes it. T12 implements E31 and the profile UI. `specs/tasks.md` (T03, T04, T12) and `specs/traceability.md` (AC12.1 tasks, endpoint ownership) are updated. `docs/API.md` E30 is unchanged.
  - **Reason:** The dependency order T03 → T04 → T12 left the shell without a session read.
  - **Verification:** `backend/tests/test_users_me.py` (6 tests) and a real-HTTP check: `GET /api/users/me` returns exactly `id`, `name`, `email`, returns 401 without a valid session or after logout, and the Next shell loads it on every protected render. `docs/API.md` E30 is unchanged. Root `specs/tasks.md` and `specs/traceability.md` carry the new ownership. Evidence: `evidence/authentication-T03-T04.md`.

- **authentication (T03–T04) · request-body error statuses (contract addition, P3 revised):** malformed JSON, unsupported content type and oversized body get distinct statuses.
  - **Before:** `docs/API.md` listed 400, 401, 403, 404, 405, 409, 429, 503 and had no rule for these cases. Foundation kept Flask's default HTML for them.
  - **After:** malformed JSON or a non-object body returns 400 `VALIDATION_ERROR`. A missing or non-JSON `Content-Type` returns 415 `UNSUPPORTED_MEDIA_TYPE`. A body over 64 KiB returns 413 `CONTENT_TOO_LARGE`. All use the JSON envelope. Updated `docs/API.md` (conventions), `backend/specs/api-contract.md` (error table), `frontend/specs/error-handling.md` (413/415 row) and `docs/TEST-PLAN.md` (V01).
  - **Reason:** The statuses describe the failures accurately, and foundation left them open (foundation open item 4).
  - **Verification:** `tests/test_validation.py` (14 tests) and `tests/test_errors.py` cover 400, 413 and 415 in the Flask envelope. The Next handler tests cover the same three statuses before any upstream call. The HTTP smoke confirmed 415 and 413 at Next and 415 at Flask. The bare `abort(400)` test replaces the foundation HTML test. `docs/API.md`, `backend/specs/api-contract.md`, `frontend/specs/error-handling.md` and `docs/TEST-PLAN.md` V01 were updated in the same round.

- **authentication (T03–T04) · exact auth fields (clarification):** register accepts exactly `name`, `email`, `password`. Login accepts exactly `email`, `password`.
  - **Before:** `docs/API.md` E02 and E03 listed the fields and a global rule to reject unknown fields. The UI rules were not tied to the API rules.
  - **After:** E02 and E03 state "exactly" and the normalization (trim name and email, lowercase email, keep password as entered). The UI validates with the same rules, and the Next handlers also reject unexpected fields. `frontend/specs/pages-and-components.md` is updated.
  - **Reason:** One field contract for the form, the same-origin handler and Flask.
  - **Verification:** The Flask schema tests and the `authRules.ts` tests each ran the 61 shared cases in `specs/fixtures/auth-field-cases.json` (42 register, 19 login) and agreed. Revision 3 changed the password cases only. Component tests assert the rendered input names and the request body keys. The smoke confirmed an extra field is rejected at Next and at Flask, and a missing field at Next.

- **authentication (T03–T04) · session cookie and Origin boundaries (design clarification, P4–P5):**
  - **Before:** D2 said "Secure in production" and "exact same-origin validation". A missing `Origin` and plain-http deployments were not addressed.
  - **After:** the host-only `revotask_session` cookie is HttpOnly, `SameSite=Lax`, `Path=/`, has no `Domain`, and expires no later than the JWT. It is `Secure` on https. `APP_ORIGIN` must be https, or an http loopback origin for local development only. A missing or mismatched `Origin` on a browser auth mutation returns 403. Updated `specs/design.md` D2, `frontend/specs/api-integration.md`, `docs/API.md` (E03, E04) and `docs/DEPLOYMENT.md` (section 4).
  - **Reason:** Make the plain-http exception explicit and local-only, and remove the `NODE_ENV` ambiguity.
  - **Verification:** Unit tests cover every cookie attribute, `Secure` on https, loopback-only http, the `Max-Age` bound by the token, a missing or mismatched `Origin`, and a bad `APP_ORIGIN`. The HTTP smoke read the real `Set-Cookie` (`Path=/; Max-Age=3599; HttpOnly; SameSite=Lax`, no `Domain`, no `Secure` on loopback http). Chrome confirmed a host-only HttpOnly cookie that page JavaScript cannot read. A test found that `NextResponse.cookies` would copy the token into a second header, so the header is written by hand. The live `Secure` flag on https is open for T16.

- **authentication (T03–T04) · safe `next` and logout (clarification, P9–P10):** `frontend/specs/api-integration.md` states that server redirects go to plain `/login`, that `next` is used only when it resolves to a same-origin path (otherwise `/`), and that browser logout is idempotent. `docs/API.md` E04 records the Next behavior.
  - **Reason:** Close an open-redirect risk and define logout with a missing or invalid session.
  - **Verification:** `safeRedirectPath` and `LoginPage` tests cover `//host`, `/\host`, absolute URLs, `javascript:`, control characters, `/login`, `/register` and over-long values. The smoke showed the login form receiving `redirectTo` of `/` for each unsafe value, and Chrome landed on `/` for `next=//evil.example`. Logout was checked with no cookie, an already revoked cookie, a valid cookie, and Flask stopped (503, cookie kept, retry works in the browser).

- **authentication (T03–T04) · rate limits are local-only (production tracking, P2):** `specs/design.md` D2, `specs/tasks.md` T16 and `docs/DEPLOYMENT.md` section 3 record that in-memory limiter storage proves local behavior only, and that shared storage and trusted client address handling are decided before production traffic.
  - **Reason:** Browser traffic reaches Flask through Vercel and Render, so the address Flask sees is not the end user's, and counters are per process.
  - **Verification:** Text review. The notes are in place. The decision itself and its live check stay open until T16. Revision 3 found the limit is per Gunicorn worker: 14 direct attempts gave a mix of 401 and 429. The earlier five-then-429 result was a lucky split. Open item 8 in the evidence file.

- **authentication (T03–T04) · server load failures retry with `retry()` (layer-spec clarification):** `frontend/specs/error-handling.md` now says a route error boundary recovers from a failed server load with `retry()`.
  - **Before:** The spec said to use route error boundaries and a visible error state, and did not name the recovery call.
  - **After:** In Next.js 16.4, `reset()` clears the error and re-renders without re-fetching, so a "Try again" button must call `retry()`.
  - **Reason:** A real-browser run showed the first implementation (`reset()`) could not recover after Flask came back.
  - **Verification:** `app/error.test.tsx` asserts `retry` is called and `reset` is not. The Chrome run then recovered to the signed-in shell after Flask restarted. Next.js 16.4 docs, `error.md`, sections `retry` and `reset`.

### bc8aa16 root: scaffolding foundation backend and frontend

- **foundation (T01) · Docker image and local Compose (scope change, revision 2):** added the backend container and pinned Gunicorn in T01.
  - **Before:** Docker and Gunicorn were planned for T16 (`requirements.md` A6). Render was a native Python runtime with `pip install` and `gunicorn` commands (`docs/DEPLOYMENT.md` section 3).
  - **After:** `backend/Dockerfile` (`python:3.14.5-slim`, non-root, Gunicorn on `0.0.0.0:$PORT`), `backend/.dockerignore`, root `compose.yaml` (service `backend`, `127.0.0.1:5001:5001`, `DATABASE_URL` from `DOCKER_DATABASE_URL`) and root `.env.example` are T01 deliverables. Tasks 1.8 to 1.10 and requirement FND-R10 cover them. Design DD11 and §4.7 record the decision. `gunicorn==27.0.1` is pinned in `backend/requirements.txt`.
  - **Reason:** Run the same image locally before the release phase, so the Render build is not the first container run. Gunicorn is needed for that image.
  - **Verification:** `docker compose config --quiet` passes with the root `.env` and fails without `DOCKER_DATABASE_URL`. The image builds and runs as uid 999 on Python 3.14.5 with Gunicorn 27.0.1. `PORT=8055` binds `0.0.0.0:8055`. On `127.0.0.1:5001`, `GET /api/health` returns 200 and the container reaches the host PostgreSQL. `db current` reports `a265fb5e7047`. `docker compose down` leaves the 10 host objects unchanged. Evidence: `evidence/foundation-T01-T02.md`, revision 2.

- **foundation (T01–T02) · Render deployment procedure (documentation, revision 2):** `docs/DEPLOYMENT.md` section 3 describes a Docker Web Service.
  - **Before:** A native Python web service with `pip install -r requirements.txt` and `gunicorn --bind 0.0.0.0:$PORT 'app:create_app()'` as commands.
  - **After:** Language Docker, Root Directory `backend`, Dockerfile Path `./Dockerfile`. Render supplies `PORT`. Health check `/api/health`. Migrations run as a separate one-off step with the migration role. Render's build copies secret files into the build context, so `supabase-ca.crt` is in `.dockerignore`.
  - **Reason:** One image for local and Render builds. Keeping migrations out of the container start preserves the separate migration role (DB07).
  - **Verification:** The Render behaviour in the runbook was checked against Render's Docker deploy, web-service port binding and secret-file pages on 2026-11-13. The live Render service is not created until T16.

- **root (T01, T16 and D1) · Docker deployment wording:** `specs/design.md` D1 and `specs/tasks.md` now name `backend/Dockerfile` for local and Render runs. T01 lists the local image and Compose service. T16 deploys Render as a Docker Web Service.
  - **Reason:** Matches the foundation revision 2 scope.
  - **Verification:** Text review against the native spec tasks 1.8 to 1.10.

- **foundation (T01–T02) · local API port:** Flask runs on port 5001, not 5000. This applies to `flask run`, the `GET /api/health` check and the Next.js `API_BASE_URL`.
  - **Before:** Specs and docs used `127.0.0.1:5000`. macOS AirPlay Receiver answers that port with 403 (`Server: AirTunes`) on the development machine, so Flask cannot be reached there.
  - **After:** `127.0.0.1:5001` for local Flask and `API_BASE_URL`. AirPlay Receiver stays enabled. This is local development configuration only. The deployed port is set by Render's `PORT`.
  - **Reason:** The project keeps AirPlay Receiver on and needs a free local port.
  - **Verification:** Native checks for tasks 1.7 and 2.9 are rerun on port 5001 (`evidence/foundation-T01-T02.md`, revision 2).

- **foundation (T01–T02) · API error conventions:** added `405 METHOD_NOT_ALLOWED`.
  - **Before:** The status list in `docs/API.md` and the error table in `backend/specs/api-contract.md` had no 405 entry. Flask's default 405 response is HTML, which conflicts with "use the same JSON envelope for framework, JWT and domain errors".
  - **After:** A known path called with an unsupported method returns 405 in the standard JSON envelope with code `METHOD_NOT_ALLOWED`, and the response keeps the `Allow` header. Updated `docs/API.md` (status conventions) and `backend/specs/api-contract.md` (error table).
  - **Reason:** Foundation introduces the shared error envelope and its handlers (E01 needs the 503 form). An unsupported method on `/api/health` is the first case that reaches the 405 path, and later routes would hit it too.
  - **Verification:** Backend tests `tests/test_errors.py::test_unsupported_method_returns_405_with_allow_header` and `tests/test_health.py::test_post_to_health_returns_405_with_allow_header` pass. A live `flask run` on port 5001 returned 405 with code `METHOD_NOT_ALLOWED` and `Allow: GET, HEAD, OPTIONS` for `POST /api/health`. Port 5000 was blocked on this machine (see the foundation evidence file).

- **foundation (T01–T02) · migration environment:** pinned the migration engine's `search_path` and removed the Alembic `include_name` filter.
  - **Before:** The foundation design §5.4 described an Alembic `include_name` filter limited to the `revotask` schema.
  - **After:** Migrations use a dedicated engine with `search_path=public`. Every RevoTask object is schema-qualified, so the empty default schema adds nothing. The app engine is unchanged. No filter is used.
  - **Reason:** The PostgreSQL role is named `revotask`, so its `"$user"` search path entry resolves to a schema named `revotask`. Filter-based attempts reported 31 phantom differences, then 15 foreign-key differences. The final filter also hid real drift: an injected column was not detected.
  - **Verification:** After the upgrade, `flask db migrate` reports "No changes in schema detected." and writes no revision. A negative control with an injected column detected `revotask.users.drift_probe`. The full lifecycle passes: upgrade, idempotent re-upgrade, `downgrade base`, re-upgrade.

- **foundation (T01–T02) · factory parameter:** `create_app` takes `env` (a mapping that replaces `os.environ` when given) instead of `overrides`.
  - **Before:** Design §4.2 named the parameter `overrides`, merged over the process environment.
  - **After:** `create_app(env=None)` and `Settings.from_env(env=None)`. An explicit mapping is the whole environment, so tests do not depend on the developer's shell.
  - **Reason:** Replacing the environment keeps tests independent of the developer's shell. The design's merge would have let an exported `DATABASE_URL` through. A related case did occur: `tests/conftest.py` reads `os.environ` before `backend/.env`, so an exported test URL matched the app URL, and the database guard refused the run before any schema change.
  - **Verification:** `tests/test_config.py::test_settings_do_not_read_the_process_environment_when_env_is_given`.

### 0.4.0 · 9a8f6d6 docs: initial references


#### Changed

- **Before:** Separate prompt blocks covered the project-wide spec phases and each implementation slice.
- **After:** Two reusable prompts create and implement one native Feature Spec per slice. The queue maps feature goals and dependencies to root tasks. Steering synchronizes task progress, approved contract changes, README and relevant changelogs. Detailed review, QA, comparisons and release prompts remain available.
- **Reason:** Reduce manual prompting and keep project-wide documentation current as features are delivered.
- **Verification:** Checked feature coverage, task and API references, links, prompt count and archive integrity. Execution in Kiro is pending.


### 0.3.1 · 9a8f6d6 docs: initial references


#### Changed

- **Before:** The kit generated a single native Kiro spec and supplied layer specs, but several handbook evidence items had no dedicated collection step.
- **After:** Added the full rubric checklist, submission runbook, isolated comparison prompts and evidence templates. The native Kiro workflow now calls for a design trace and targeted refinements. AuthContext, SearchBar, typed error proof and the complete live Playwright report have explicit prompts and task coverage.
- **Reason:** Make handbook criteria traceable through generation, implementation, verification and submission while keeping the main workflow local-first.
- **Verification:** Reviewed the attached handbook, checked Markdown links, prompt mappings, endpoint ownership, task dependencies, acceptance traceability and ZIP integrity. Kiro outputs, app tests, deployments and instructor approval of deviations remain pending.


### 0.3.0 · 9a8f6d6 docs: initial references


#### Added

- Backend data model, API contract and Flask architecture.
- Frontend page/component design, API integration and typed error-handling specs.
- Spec review evidence template covering handbook review dimensions and targeted refinements.

#### Changed

- **Before:** P01 scaffolded the app from the root specification baseline. App-level specs were indexes.
- **After:** P01A–C use Kiro Requirements-First to generate one native Feature Spec. P01D reviews and aligns the root submission files, and P01E starts local scaffolding. Layer specs now provide implementation details.
- **Reason:** Capture native Kiro output for the rubric and make backend and frontend decisions reviewable before coding.
- **Verification:** Cross-checked handbook pp. 2–5 and 8–11, prompt references, spec links and endpoint ownership. Native Kiro generation, app implementation and test execution are pending.


### 0.2.1 · 9a8f6d6 docs: initial references


#### Changed

- **Before:** Documentation updates were explicit at spec review and release, and the start guide called for changelog updates at milestones.
- **After:** Kiro loads a documentation checkpoint on every interaction. Write prompts direct the agent to update the relevant changelogs and README facts within the same task.
- **Reason:** Keep progress and version history current as each implementation task finishes.
- **Verification:** Checked steering front matter, prompt coverage, Markdown links and archive contents. Kiro execution is pending.


### 0.2.0 · 9a8f6d6 docs: initial references


#### Changed

- **Before:** Separate specification and steering comparison exercises came before implementation.
- **After:** P01 scaffolds the app directly from the included specification. Reviews use actual implementation diffs. GitHub, CI setup and deployment follow local acceptance.
- **Reason:** Use a single ready-to-prompt workspace and finish the app locally before publishing.
- **Verification:** Checked prompt-to-task mapping, English documentation, environment templates and archive integrity. App implementation and tests are pending.


### 0.1.0 · 9a8f6d6 docs: initial references


#### Added

- Initial RevoTask project brief, requirements, design, task plan, API contract and acceptance traceability from the attached assignment.
- Steering guidelines for frontend, backend and PostgreSQL.
- Workflow for collecting real AI review, tests and deployment evidence.

#### Decisions relative to the assignment

| Before                                     | After                                                                                       | Reason                                     | Verification                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------- |
| Flask deployment illustrated with Railway. | Flask on Render, data in Supabase PostgreSQL, UI on Vercel.                                 | Requested project stack.                   | Runbook written. Live verification pending. |
| JWT in frontend context.                   | HttpOnly cookie at Next, bearer validation and revocation in Flask, safe DTO in UI context. | Same session for server and browser paths. | D2 / AC02.1–3. Tests pending.               |
| Client submits a positive float.           | Flask allocates float order from anchors and checks board position version.                 | Keeps concurrent moves consistent.         | D4 / AC07.1–2. Tests pending.               |


## Entry template

Place the newest date first. Add the commit entry once the commit exists.

```markdown
## YYYY-MM-DD

### <short-sha> <commit subject>

- F-XX · AC/section: …
  - Before: …
  - After: …
  - Reason: …
  - Prompt/run: …
  - Verification: …
```
