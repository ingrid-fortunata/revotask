# Requirements: local-acceptance (T15)

**Status:** Draft. Pending user approval. Drafted by Claude Code (`spec local-acceptance T15`).

**Root task:** T15. Root IDs are preserved and no new root ID is proposed.

**Scope:** Local acceptance of the baseline built by T01–T14. This slice adds no product behavior. It adds the Playwright suites and the test code needed to run them, the local checks the test plan lists for T15, and the evidence record. Deployment, live checks and real-device checks stay with T16–T17.

**Prerequisites (checked in `specs/tasks.md`):** T04, T09, T10, T11, T12, T13 and T14 are checked. Their upstream roots T01–T08 are checked too. No prerequisite blocks this slice.

**Known gap at drafting time:** `frontend/` has no Playwright configuration and no e2e directory. V09, V10, the boards-membership journey and the comments journey have not run. The V05 and V11 Playwright parts are pending (`specs/traceability.md`).

## Roles under test

| Role | Used by |
|---|---|
| Visitor | Auth scenarios (LA-2) |
| Signed-in user (board creator and admin) | All journeys |
| Registered second user, board member | Membership removal (LA-3), comment permission (LA-5) |
| Removed member | LA-3 |

Every account, board and card is created by the test run with a unique name. The run removes only the data it created.

## Acceptance criteria

Each criterion is observable and independently verifiable. The Source column gives the existing AC or V ID the criterion carries.

| ID | Criterion | Source |
|---|---|---|
| **LA-1** Integration suites | Given an isolated PostgreSQL database (`TEST_DATABASE_URL`), the backend pytest suite and the frontend Vitest and React Testing Library suite pass. Database-writing tests run only on `TEST_DATABASE_URL`. The record lists the command, the revision and the pass and skip counts. | V01–V08, V13 (local part) |
| **LA-2** Auth scenarios | Playwright, with empty storage state for anonymous cases: (a) valid login opens the dashboard; (b) invalid credentials show one generic message; (c) an unauthenticated visit to a private route redirects to `/login`; (d) after logout, a private route redirects to `/login`. | V09, AC02.1–AC02.3 |
| **LA-3** Boards and membership journey | Playwright: create a uniquely named board; open it; add the registered second user by email; the user appears in the participant list; remove the user; the removed user's access ends (404 shown as for a missing board); delete the board; the board returns 404. An unregistered email shows `USER_NOT_FOUND` to the admin. **Sprint dates (added 2026-11-18, boards-membership Revision 2, DR5):** create a board with a sprint (one date only and an end before the start are refused in the dialog with no navigation); the header shows "Sprint 16 Nov to 22 Nov" with no time and keeps it after a reload; the analytics dialog shows the sprint line and the "this sprint" labels; a second user, a member, sees the sprint and has no Edit board button and no date field; an Admin edit with an end before the start is refused and a valid edit shows at once and after a reload; Clear dates removes the line and analytics shows the week again. The test runs on every project (it is tagged `@matrix`). | AC03.1, AC03.3, AC04.1, AC04.2, boards-membership 8.10–8.13 |
| **LA-4** Kanban journey | Playwright, eight steps from V10 plus the carried T07–T09 steps: create a board; add two columns; create a card in the source column; edit the card and assign the second user; move it with desktop `dragTo()` and then with the Move control; `page.reload()`; the card is in the destination column and absent from the source column; delete the card. Test IDs are `card-<id>`, `dropzone-<columnId>-before-<cardId>` and `dropzone-<columnId>-end`. | V10, AC05.1, AC05.2, AC06.1, AC07.1 |
| **LA-5** Comments journey | Playwright: open a card with "Open <title>" in the "Card details" dialog; add a comment and assert its text; edit it; delete it; reload; the second user, a non-author member, cannot edit or delete the author's comment. | T10, AC08.1, AC08.2 |
| **LA-6** Error and rollback evidence | Local controlled tests, with route interception used only here: (a) a forced 409 on move shows feedback and reloads the server board; (b) a forced 500 on move restores the prior order and shows feedback; (c) an uncertain network outcome on move refetches the canonical board. Each result records the observed message and final order. | V05, AC07.2 |
| **LA-7** Warm local timing | After a warm-up, 30 sequential E07 requests against one board with at most 100 cards, from one client. The record gives the environment, the fixture size, all raw timings, and the nearest-rank p95 (the 29th sorted value). Target: p95 ≤ 800 ms. The record states that this is local timing only. | V12, AC13.2 (local part) |
| **LA-8** 375 px check | At 375 px, every route and dialog (`/login`, `/register`, `/`, `/boards/[id]`, `/my-tasks`, `/profile`, the card dialog, the board analytics dialog, the notification bell) has no horizontal page scroll outside the Kanban region, touch targets of at least 44 px, and inputs at 16 px. The core flow (LA-4) completes at 375 px. Move is available by keyboard and by a visible control. 320, 768 and 1280 px are checked for the same routes where the earlier slices recorded them. Results are emulated. | V11, AC13.1 |
| **LA-9** Security and privacy checks | The V13 local run covers: valid, cross-origin and absent `Origin` on mutations; `no-store` on private responses; a bundle and repository scan finds no secrets. | V13, AC13.3 (local part) |
| **LA-10** Readiness record | `evidence/local-acceptance-T15.md` lists each LA check with command, environment, revision and actual result. Failed, blocked or unverified checks stay open with the reason. The record ends with a readiness statement for publishing, without any deployment claim. | V15, T15 |
| **LA-11** Artifact hygiene | Playwright storage-state files are git-ignored. HTML reports, traces and screenshots are reviewed for credentials and sensitive data before they are shared or committed. | TEST-PLAN Playwright section |

## Role and permission boundaries

- LA-3 verifies that a removed member and a nonmember get the same 404 as for a missing board.
- LA-5 verifies that a non-author member gets 403 on edit or delete, while the author can do both.
- Board admin rights are tested only as the board creator. Column writes by a member are covered by V04 and are not repeated in Playwright.

## Error cases covered

- Invalid credentials (LA-2b).
- Unregistered email on add member, `USER_NOT_FOUND` (LA-3).
- Forced 409, forced 500, uncertain outcome on move (LA-6).
- Nonmember or removed-member access returns 404 (LA-3).
- Non-author comment edit or delete returns 403 (LA-5).

## Decisions needed before design

These choices change the design. Each has a recommended default.

1. **Playwright dependency.** Add `@playwright/test` as a pinned dev dependency, with `frontend/playwright.config.ts` and specs under `frontend/e2e/`. No runtime dependency is added. *Recommended.*
2. **Browser scope.** Chromium only, locally. WebKit and Firefox are out of scope. The existing evidence used Chrome device emulation, and the test plan does not require more. *Recommended.*
3. **Server startup.** Start the Flask API (port 5001) and the Next dev server manually, using the commands in `docs/DEVELOPMENT.md`. Playwright only runs the tests. This avoids a hidden `webServer` setup. *Recommended.* The alternative is a Playwright `webServer` block.
4. **Timing fixture.** A seed script creates one board with 100 cards on `TEST_DATABASE_URL` and removes them after the run. *Recommended.*
5. **Real device and on-screen keyboard.** Out of T15 scope. The record keeps them open for T16 and states that T15 is emulation only. *Recommended.*
6. **Route interception.** Limited to LA-6 (forced 409, 500, uncertain outcome), as TEST-PLAN V10 allows. *Recommended.*

## Assumptions

- Local PostgreSQL is running and `TEST_DATABASE_URL` points to a disposable database.
- The local stack matches the completed slices: the API on `127.0.0.1:5001`, the frontend dev server, and Alembic at head.
- Warm local timing is measured on this machine. The number is not a deployment claim.
- The working-tree change to `frontend/next-env.d.ts` is not part of this slice and is left as it is.
