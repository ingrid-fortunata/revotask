# RevoTask Implementation Tasks · Baseline 0.4.0

Mark complete only after code review and verification. Every task that adds UI also meets AC13.1 at 375 px and wider (FE-S4–S6) and records that check before it is checked. Tasks are grouped by dependency. Use the [feature queue](FEATURE-QUEUE.md) to generate and review a native Kiro Feature Spec for each slice. Link each root task to its active native spec when available. Keep the root tracker and native task statuses aligned as verification completes. Use the handbook evidence checklist in docs/RUBRIC.md. Links to acceptance criteria and API IDs are in [traceability.md](traceability.md).

| ID | Depends on | Task and completion check |
|---|---|---|
| T01 | — | Create local app scaffolds, pin runtime/dependency versions, use the included environment examples, and add local lint/type/test commands. Empty Next build and Flask factory imports pass. Local backend Docker image and Compose service (foundation tasks 1.8–1.10). Native spec: [foundation](../.kiro/specs/foundation/tasks.md). |
| T02 | T01 | Create SQLAlchemy models and first migration. Apply to clean PostgreSQL and inspect constraints and indexes. Implement bounded DB readiness. Native spec: [foundation](../.kiro/specs/foundation/tasks.md). |
| T03 | T02 | Implement Flask auth, public DTO, validation/errors, JWT guard and revocation, plus the read-only current-user endpoint (E30 GET) that the protected shell loads. Test registration, duplicate race, exact request fields, invalid/expired/revoked tokens and logout. Native spec: [authentication](../.kiro/specs/authentication/tasks.md). |
| T04 | T03 | Implement Next server-only API client, same-origin auth Route Handlers, safe cookie, public-user AuthContext, typed ApiError, error feedback helper, login/register forms and protected shell. Verify all auth states before proceeding. Native spec: [authentication](../.kiro/specs/authentication/tasks.md). |
| T05 | T03 | Implement boards and membership APIs. Test role and parent scoping plus membership removal in one transaction. |
| T06 | T04, T05 | Implement dashboard, board shell and membership controls using real API. Test user visibility and admin controls. |
| T07 | T05 | Implement ordered column CRUD and reorder; enforce Done constraints and stale version handling. |
| T08 | T07 | Implement card CRUD, assignment and position service; test both move directions, rebalance, concurrent moves and invalid targets. |
| T09 | T06, T08 | Add Kanban controls, desktop drag and Move action, optimistic state, rollback and refresh. Test reload and mobile/keyboard use. |
| T10 | T08, T09 | Implement comments routes and modal, tests for auth and ownership, and React tests for display components. |
| T11 | T08, T09 | Implement My Tasks and board search, including 300 ms debounce and stale-response guard. |
| T12 | T04 | Implement the profile update API (E31; the E30 read exists from T03) and the profile UI with conflict and forbidden-field tests. |
| T13 | T10 | Add transactional notifications for assignment/comment, recipient read APIs and 30-second bell polling. |
| T14 | T08, T10 | Implement analytics SQLAlchemy aggregates and UI. Validate zero columns, UTC week boundaries and distinct completions. |
| T15 | T04, T09, T10, T11, T12, T13, T14 | Complete the local integration and Playwright suites. Run local acceptance, capture warm timing, a 375 px check of every route and the core flow, error and rollback evidence, and record readiness for publishing. |
| T16 | T15 | When ready to publish, connect GitHub and configure CI with isolated PostgreSQL. Migrate Supabase once, deploy Render as a Docker Web Service from backend/Dockerfile and Vercel, verify the live API, record warm deployed timing, run live Playwright, save the sanitized full report and record tested revisions. Before production traffic, choose shared rate-limit storage and trusted client address handling for the login and register limits. Local limiter checks prove local behavior only. |
| T17 | T16 | Verify the four documentation files, real review corrections and submission evidence. Update changelogs and tag the verified deployed application revision. Record the evidence revision. |

## Completion tracker

- [x] T01
- [x] T02
- [x] T03
- [x] T04
- [ ] T05
- [ ] T06
- [ ] T07
- [ ] T08
- [ ] T09
- [ ] T10
- [ ] T11
- [ ] T12
- [ ] T13
- [ ] T14
- [ ] T15
- [ ] T16
- [ ] T17
