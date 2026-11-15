# Evidence: local acceptance (T15)

Status: **In progress. T15 is open.** Requirements and design were approved 2026-11-15, and tasks were approved the same day. Spec: `.kiro/specs/local-acceptance/`. Review record: `evidence/spec-review.md`. This file is filled as checks run. The readiness statement is written in task 12.1.

## Group 1 · tooling and read-only preflight (2026-11-15)

| Check | Command or source | Result |
| --- | --- | --- |
| Pinned dependency | `frontend/package.json`: `@playwright/test` 1.64.1, exact | Pass. Released 2026-10-14, at least two weeks old |
| Lockfile | `npm ci` in `frontend/` | Completed with install-script warnings only |
| Chromium | `npx playwright install chromium` | Pass. Chrome Headless Shell 156.0.8078.4 |
| `psql` helper unit tests | `npm run e2e:unit` (`frontend/e2e/support/psql.unit.ts`) | 9 passed |
| Retry helper unit tests | `npm run e2e:unit` (`frontend/e2e/support/retry.unit.ts`) | 4 passed |
| Typecheck and lint | `npx tsc --noEmit`; `npm run lint` | Pass |
| Preflight 1 · psql | Live run of `preflight-steps.live.unit.ts` | Pass. `/opt/homebrew/bin/psql` |
| Preflight 2 · test database | Same run | Pass. `revotask_test` on 127.0.0.1:5432 |
| Preflight 3 · connectivity | Same run | Pass. `select 1` returned 1 |
| Preflight 4 · services | Same run | Pass. Flask health 200; Next `/login` 200 at localhost:3000 |
| Preflight 5 · one listener | Same run | Pass. One listener on 5001 |
| Preflight 6 · database proof | `proof.live.unit.ts` against each origin | See below |

### Preflight 6 · database proof (task 1.6, open)

| Origin | Process on the port | Result |
| --- | --- | --- |
| 127.0.0.1:5002 | Native Flask with the test database | PASS. 1 backend in `revotask_test` |
| 127.0.0.1:5003 | Native Flask with the dev database (negative control) | FAIL, as designed. Writes nothing |
| 127.0.0.1:5001 | Docker container `revotask-backend-1` (pid 2092, `com.docker.backend`) | FAIL. Connections go to a database other than `revotask_test`. Writes nothing |

The run needs native Flask on 5001 connected to the test database. Until that is set up, gate B stays closed and no writing task runs. The two control processes were stopped after the checks.

## Groups 2 to 11 · code written, not run (2026-11-15)

Written and checked by typecheck and lint only. None of these has run against the stack, because the global setup stops at preflight step 6 on port 5001. Test IDs, selectors and seeded response shapes are unconfirmed until the first live run.

| Area | Files | Checks run |
| --- | --- | --- |
| Run identity, tokens, cleanup | `e2e/support/run.ts`, `tokens.ts`, `cleanup.ts`, `api.ts`, `seed.ts`, `ui.ts` | `tsc`, lint |
| Global setup and teardown | `e2e/preflight.ts`, `e2e/global-teardown.ts` | `tsc`, lint |
| Manual cleanup | `e2e/cleanup.unit.ts`, `npm run e2e:cleanup` | `LA_CLEANUP_RUN=00000000 npm run e2e:cleanup`: pass, every count 0. Ran the cleanup SQL and count against `revotask_test`. No run data existed. |
| LA-2 auth | `e2e/auth.spec.ts` | Listed only |
| LA-3 boards and membership | `e2e/boards-membership.spec.ts` | Listed only |
| LA-4 Kanban journey | `e2e/kanban.spec.ts` | Listed only |
| LA-5 comments | `e2e/comments.spec.ts` | Listed only |
| LA-6 rollback | `e2e/kanban-rollback.spec.ts` | Listed only |
| LA-7 timing | `e2e/timing.spec.ts` | Listed only |
| LA-8 matrix | `e2e/mobile.spec.ts` | Listed only |
| Projects | `playwright.config.ts` (desktop, viewport-320, mobile-375, viewport-768) | `--list`: 46 tests |

Budget change: the owner logs in four times per run (setup, LA-2a, LA-2b, LA-2d), not three. That is within the limit of 5 per minute per email. Record it in the design when the run starts.

## Open

- **Task 1.6 and every live check (LA-1 to LA-11): blocked.** Port 5001 is held by Docker container `revotask-backend-1`. The run needs native Flask on 5001 connected to `TEST_DATABASE_URL`. Choose option (a), (b) or (c) in `evidence/spec-review.md`.
- T15 stays open.
