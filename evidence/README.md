# Evidence Log

Record actual Kiro prompts, reviewed diffs, guideline IDs, local test results and verified release artifacts. Useful filenames include `review-T01.md`, `review-T08.md`, `local-acceptance.md` and `release-v1.0.0.md`. Remove tokens, connection strings, account data and Playwright authentication state before sharing evidence. Start with the [spec review](spec-review.md) and [implementation review](implementation-review.md) templates. Use [comparison evidence](comparisons.md) for isolated rubric experiments. Follow the [submission checklist](../docs/SUBMISSION.md) for live proof.

## Review record

| Task or finding | File and location | Original behavior | Rule or acceptance criterion | Change | Prompt and diff | Verification |
|---|---|---|---|---|---|---|
| Fill in during review | | | | | | Pending |

Use the same record for a confirmed correction or a reviewed rule that passed. Record the relevant file and observed result. Put agreed specification changes in the specification changelog.

## Verification index

| Evidence | Commit or version | Environment and command | Result or link |
|---|---|---|---|
| Foundation T01–T02 local checks (backend pytest 186 passed, frontend lint/typecheck/test/build, migrations, live 127.0.0.1:5001) | Uncommitted working tree | Clean-environment commands listed in the file | `evidence/foundation-T01-T02.md` |
| Foundation revision 2: port 5001, Docker image and Compose, container health and database, npm advisory investigation | Uncommitted working tree | Commands listed in revision 2 of the file | `evidence/foundation-T01-T02.md` (revision 2) |
| Authentication T03–T04 local checks, revision 3 (backend pytest 431 passed, frontend 446 tests, build with sentinel, 75-check HTTP smoke on one Gunicorn worker, 96-check Chrome run at 320–1280 px with measured 44×44 tappable areas and the register password hint) | Uncommitted working tree | Commands listed in the file. Flask in Docker on 127.0.0.1:5001, Next production server on localhost:3100, Chrome 157 headless with device emulation (no real phone) | `evidence/authentication-T03-T04.md`, `authentication-T03-T04-http-smoke.txt`, `authentication-T03-T04-browser-check.txt`, scripts `authentication-http-smoke.py` and `authentication-mobile-measure.mjs` |
| Kanban T05 close-out (E12 scope fix, L7) and T07 to T09 (columns and cards API, Kanban UI): backend pytest 1570 passed and 1 skipped, ruff clean; frontend lint, typecheck, 1362 Vitest tests and `next build`; a 418-check Chrome run at 320 to 1280 px (device emulation, scripted 375 px journey, synthetic drag) | Uncommitted working tree | Commands listed in the file, Python 3.14.5, pytest 9.2.0, `TEST_DATABASE_URL` | `evidence/kanban-T07-T09.md` |
| Comments T10 (comments API E23 to E26, card detail modal): backend pytest 1706 passed and 1 skipped, ruff clean; frontend lint, typecheck, 1571 Vitest tests and `next build`; a 480-check Chrome run at 320 to 1280 px (device emulation, scripted 375 px journey, real-server lost-response case) | Uncommitted working tree | Commands listed in the file, Python 3.14.5, pytest 9.2.0, `TEST_DATABASE_URL`, Chrome 157 headless | `evidence/comments-T10.md`, `comments-mobile.json`, `comments-screenshots/`, script `comments-mobile-measure.mjs` |
| Profile T12 (E31 profile update, `/profile`, header account link): backend pytest 1907 passed and 1 skipped, ruff clean; frontend lint, typecheck, 1845 Vitest tests and `next build`; a 376-check Chrome run at 320 to 1280 px (device emulation, scripted 375 px journey). Open: Playwright, real device, T16 security items | Uncommitted working tree | Commands listed in the file, `TEST_DATABASE_URL`, Chrome 157 headless | `evidence/profile-T12.md`, `profile-mobile.json`, `profile-screenshots/`, script `profile-mobile-measure.mjs` |
| Implementation reviews and refinement prompts | | | Pending |
| Local pytest and React Testing Library (QA review V01–V08 and V13: five reorder scenarios, BoardCard and CommentList values, repository and bundle secret checks, scored coverage, assertions and independence) | Uncommitted working tree on `t15-local-acceptance` | `cd backend && pytest -q`; `cd frontend && npx vitest run`; mutation checks in the file | Backend 2058 passed and 1 skipped, frontend 2038 passed. Gaps (no line-coverage tool, no prior-schema migration, bundle not rebuilt) in [implementation-review.md](implementation-review.md#test-review-v01v08-and-v13) |
| Local acceptance T15 (V09–V12 local parts, V13 local security checks): 54 Playwright tests, p95 7.1 ms, 40-row mobile matrix, bundle sentinel and secret scan, cleanup count 0 | Uncommitted working tree on `t15-local-acceptance` (base `09833f8`) | `cd frontend && npx playwright test`; commands in the file | 54 passed, 0 failed. [local-acceptance-T15.md](local-acceptance-T15.md), [timing](local-acceptance-T15-timing.json), [mobile matrix](local-acceptance-T15-mobile.json) |
| Browser requests, 401, 404, mobile flow and optimistic rollback | | | Pending |
| Live Postman checks and eight Blueprint routes | | | Pending until deployment |
| Full sanitized live Playwright HTML report under evidence/playwright-final/, auth and Kanban flow | | | Pending until deployment |
| GitHub repo/tag, public URLs and migration revision | | | Pending until release |
