# RevoTask Test Plan

All results are **Pending** until executed. Record commands, environment, revision and observed results in the [evidence log](../evidence/README.md). Use an isolated PostgreSQL test database for schema, row locks and concurrency.

| ID | Layer | Verification |
|---|---|---|
| V01 | pytest | Registration returns 201 and omits password fields, invalid input returns 400, normalized duplicates return 409, and only one insert succeeds during concurrent registrations. |
| V02 | pytest and Next integration | Valid/invalid login, 401 for absent/expired/revoked JWTs, logout revocation, cookie flags, upstream logout failure, SSR 401 redirect and BFF 401 cleanup. |
| V03 | pytest and UI | Admin/member/nonmember access, board list/detail, nested IDs from other boards, rename/delete, member reactivation and assignment clearing on removal. |
| V04 | pytest | Column/card CRUD, Done uniqueness and nonempty rules, moves within/across columns, unauthorized and missing resources, FLOAT precision, invalid anchors, concurrent version conflict and rebalance. |
| V05 | React/Playwright | Optimistic move, rollback on 500, refresh on 409 or uncertain network outcome, and synchronization with canonical order. |
| V06 | pytest and RTL | Comment creation returns 201/400/401/403 in the planned scenarios. Edit/delete is author-only. Assert updated timestamp, comment text/author and card title/assignee. |
| V07 | pytest and RTL | Grouped My Tasks, board-scoped search, 300 ms debounce, stale response handling, profile success and 400/409. |
| V08 | pytest and RTL | Atomic assignment/comment notifications, recipient isolation, pagination, idempotent mark-read, zero analytics counts, distinct completions, UTC boundaries and access checks. |
| V09 | Playwright | Four auth scenarios below. |
| V10 | Playwright | Eight-step Kanban journey below. |
| V11 | Browser/RTL/Playwright | 375 px viewport, keyboard Move, modal focus, search debounce, 30-second polling and cleanup, real fetch integration and visible errors. |
| V12 | Performance | Warm up with a demo account. Time 30 sequential E07 requests against a board with ≤100 cards. Document the environment and fixture size. Nearest-rank p95 is the 29th sorted value. Target ≤800 ms. Record local and warm deployed measurements independently. |
| V13 | Integration/local checks | Valid, cross-origin and absent Origin behavior, private no-store caching, repository and bundle secret checks, fresh and prior-schema migrations. |
| V14 | Live Postman and smoke | Verify Render health/register/login and one endpoint per Blueprint with a test account. |
| V15 | Review | Validate documentation against the code and observed results, traceability, changelogs and submission evidence. |

## Playwright acceptance

**Auth suite.** Verify successful login redirects to the dashboard, invalid credentials show a generic message, unauthenticated access redirects to login, and private access after logout redirects to login. Run anonymous scenarios with empty storage state. Keep authenticated state files local and ignored by Git.

**Kanban journey.**

1. Create a uniquely named board.
2. Add two columns.
3. Create a card in the source column.
4. Open its details.
5. Add a comment and assert its text.
6. Move the card to the other column with desktop `dragTo()`.
7. Call `page.reload()` and assert that the card appears in the destination column and is absent from the source column.
8. Edit and delete the comment, asserting both changes.

Use `baseURL`, accessible locators, stable test IDs for drop zones when necessary, and assertions that wait for visible or persisted state. Give each run unique fixtures. Intercept the move request only in the local controlled rollback test. Run the main journey against real endpoints locally and repeat it against the live app after deployment. Review HTML reports, traces and screenshots for credentials or sensitive test data before sharing. Score coverage, assertion quality and test independence.

References: [Playwright authentication](https://playwright.dev/docs/auth), [best practices](https://playwright.dev/docs/best-practices), [dragTo](https://playwright.dev/docs/api/class-locator#locator-drag-to).

## V14 · Live Postman checks

Run these against the Render URL. Register and sign in with a new dummy account. Use it to create a disposable board with E06, add a column with E13 and create a card with E17. Use those IDs for the remaining requests. Record request path, observed status and response shape. Keep the bearer token and password out of shared collections and screenshots.

| Scope | Request | Expected result |
|---|---|---|
| Health | E01 GET /api/health | 200 and healthy data |
| Auth | E02 register, E03 login | 201 and 200 with the documented shapes |
| Boards | E05 GET /api/boards | 200 and accessible boards |
| Columns | E13 POST /api/boards/{id}/columns | 201 for a board admin |
| Cards | E21 GET /api/cards?assignee=me | 200 and current-user assignments |
| Comments | E23 GET /api/cards/{id}/comments | 200 and visible comments |
| Notifications | E27 GET /api/notifications?page=1&per_page=20 | 200 and pagination/unread metadata |
| Analytics | E29 GET /api/boards/{id}/analytics | 200 and board-scoped aggregates |
| Users | E30 GET /api/users/me | 200 and public user fields |

See [Submission](SUBMISSION.md) for the full sanitized Playwright report and screenshot list.
