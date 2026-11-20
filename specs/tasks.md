# RevoTask Implementation Tasks · Baseline 0.4.0

Mark complete only after code review and verification. Every task that adds UI also meets AC13.1 at 375 px and wider (FE-S4–S6) and records that check before it is checked. Tasks are grouped by dependency. Use the [feature queue](FEATURE-QUEUE.md) to generate and review a native Kiro Feature Spec for each slice. Link each root task to its active native spec when available. Keep the root tracker and native task statuses aligned as verification completes. Use the handbook evidence checklist in docs/RUBRIC.md. Links to acceptance criteria and API IDs are in [traceability.md](traceability.md).

| ID | Depends on | Task and completion check |
|---|---|---|
| T01 | — | Create local app scaffolds, pin runtime/dependency versions, use the included environment examples, and add local lint/type/test commands. Empty Next build and Flask factory imports pass. Local backend Docker image and Compose service (foundation tasks 1.8–1.10). Native spec: [foundation](../.kiro/specs/foundation/tasks.md). |
| T02 | T01 | Create SQLAlchemy models and first migration. Apply to clean PostgreSQL and inspect constraints and indexes. Implement bounded DB readiness. Native spec: [foundation](../.kiro/specs/foundation/tasks.md). |
| T03 | T02 | Implement Flask auth, public DTO, validation/errors, JWT guard and revocation, plus the read-only current-user endpoint (E30 GET) that the protected shell loads. Test registration, duplicate race, exact request fields, invalid/expired/revoked tokens and logout. Native spec: [authentication](../.kiro/specs/authentication/tasks.md). |
| T04 | T03 | Implement Next server-only API client, same-origin auth Route Handlers, safe cookie, public-user AuthContext, typed ApiError, error feedback helper, login/register forms and protected shell. Verify all auth states before proceeding. Native spec: [authentication](../.kiro/specs/authentication/tasks.md). |
| T05 | T03 | Implement boards and membership APIs. Test role and parent scoping, nonmember 404, and membership removal with assignment clearing in one transaction (seeded cards on two boards). Native spec: [boards-membership](../.kiro/specs/boards-membership/tasks.md). Revision 2 (sprint, 2026-11-18) implemented and verified locally, see [boards-membership tasks 10 to 16](../.kiro/specs/boards-membership/tasks.md). The Playwright sprint steps pass (T15, 2026-11-18). Open: a real-device check. |
| T06 | T04, T05 | Implement dashboard, board shell and membership controls using real API. Test user visibility and admin controls. Native spec: [boards-membership](../.kiro/specs/boards-membership/tasks.md). Revision 2 (sprint, 2026-11-18) implemented and verified locally, see [boards-membership tasks 10 to 16](../.kiro/specs/boards-membership/tasks.md). The Playwright sprint steps pass (T15, 2026-11-18). Open: a real-device check. |
| T07 | T05 | Implement ordered column CRUD and reorder; enforce Done constraints and stale version handling. Native spec: [kanban](../.kiro/specs/kanban/tasks.md). |
| T08 | T07 | Implement card CRUD, assignment and position service; test both move directions, rebalance, concurrent moves and invalid targets. Native spec: [kanban](../.kiro/specs/kanban/tasks.md). |
| T09 | T06, T08 | Add Kanban controls, desktop drag and Move action, optimistic state, rollback and refresh. Test reload and mobile/keyboard use. Native spec: [kanban](../.kiro/specs/kanban/tasks.md). |
| T10 | T08, T09 | Implement comments routes and modal, tests for auth and ownership, and React tests for display components. Native spec: [comments](../.kiro/specs/comments/tasks.md). |
| T11 | T08, T09 | Implement My Tasks and board search, including 300 ms debounce and stale-response guard. Native spec: [my-tasks-search](../.kiro/specs/my-tasks-search/tasks.md). Revision 2 (2026-11-20, status badge per task and My Tasks search, E21 item gains `column_name` and `is_done`) is done locally and verified on 2026-11-20 (`evidence/my-tasks-search-T11.md`, Revision 2); Playwright steps and a real-device check stay open (T15). |
| T12 | T04 | Implement the profile update API (E31; the E30 read exists from T03) and the profile UI with forbidden-field tests. **Revision 2 (2026-11-19, done locally):** the email is read-only and the profile gains an optional password change with the current password (groups 11 to 17 of the native spec). Native spec: [profile](../.kiro/specs/profile/tasks.md). |
| T13 | T10 | Add transactional notifications for assignment/comment, recipient read APIs and 30-second bell polling. Native spec: [notifications](../.kiro/specs/notifications/tasks.md). |
| T14 | T08, T10 | Implement analytics SQLAlchemy aggregates and UI. Validate zero columns, UTC week boundaries and distinct completions. Native spec: [analytics](../.kiro/specs/analytics/tasks.md). Revision 2 (sprint, 2026-11-18) implemented and verified locally, see [boards-membership tasks 10 to 16](../.kiro/specs/boards-membership/tasks.md). The Playwright sprint steps pass (T15, 2026-11-18). Open: a real-device check. |
| T15 | T04, T09, T10, T11, T12, T13, T14 | Complete the local integration and Playwright suites, including the automated boards-membership journey (create board, open, add member, remove member, delete board) carried from T05–T06 and the automated Kanban journey (add column, add card, edit and assign, desktop `dragTo()` and the Move button, reload, a forced 409, delete) carried from T07–T09, using stable selectors for the V10 card interactions: the card's accessible name for the open control, and the drag source scoped to the fixture card in its source column (drop zones `dropzone-<columnId>-before-<cardId>` and `dropzone-<columnId>-end`), and the comments journey carried from T10 (open a card, add, edit and delete a comment, reload, a second user who cannot edit it, using the names "Open <title>" and "Card details"). Run local acceptance, capture warm timing, a 375 px check of every route and the core flow, error and rollback evidence, and record readiness for publishing. Native spec: [local-acceptance](../.kiro/specs/local-acceptance/tasks.md). The journey also covers the sprint dates of boards-membership Revision 2 (added and passing 2026-11-18, 58 tests in all). |
| T16 | T15 | When ready to publish, connect GitHub and configure CI with isolated PostgreSQL. Migrate Supabase once, deploy Render as a Docker Web Service from backend/Dockerfile and Vercel, verify the live API, record warm deployed timing, run live Playwright, save the sanitized full report and record tested revisions. Before production traffic, choose shared rate-limit storage and trusted client address handling for the login and register limits. Keep `GUNICORN_WORKERS=1` on Render (and locally, as Compose sets it) until the limiter uses shared storage, and do not run more workers before then. Local limiter checks prove local behavior only. Also add a per-admin rate limit on E11 using the shared storage, and note that E11 `USER_NOT_FOUND` lets a board admin test whether an email is registered (account enumeration, accepted for v1). Also decide a limit on the notifications one user can cause (T13 leaves comments and assignments unlimited). |
| T17 | T16 | Verify the four documentation files, real review corrections and submission evidence. Update changelogs and tag the verified deployed application revision. Record the evidence revision. |

## Completion tracker

- [x] T01
- [x] T02
- [x] T03
- [x] T04
- [x] T05
- [x] T06
- [x] T07
- [x] T08
- [x] T09
- [x] T10
- [x] T11
- [x] T12
- [x] T13
- [x] T14
- [x] T15
- [ ] T16
- [ ] T17
