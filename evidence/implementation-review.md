# Implementation and Documentation Review

Record actual code or documentation locations and findings. Use Pass, Finding or Pending for each check. Refine with the REVIEW prompt and report the outcome. Record where the project uses a documented design alternative.

| Review slice | Check against | Actual files and results |
|---|---|---|
| T02–T03 models and auth | Each applicable database rule for User, Board, BoardColumn, Card, CardComment and auth integration | Pending |
| T05/T08 boards and cards | Backend rule IDs, route guards, CardPositionSchema, FLOAT ordering and atomic writes | Pending |
| T04/T06/T09/T10 frontend | AuthContext, component boundaries, inline styling, BaseButton and modal composition | Pending |
| T07/T10 columns and comments | Marshmallow, auth, ownership, error envelope and observed fixes | Pending |
| T13/T14 notifications and analytics | Pagination, recipient scope, SQLAlchemy aggregates and response format | Pending |
| T15 test review | Coverage, assertion strength and fixture independence | Pass for V01–V08 and V13 with two gaps stated below (no line-coverage tool, no prior-schema migration). See [Test review: V01–V08 and V13](#test-review-v01v08-and-v13). |

## Test review: V01–V08 and V13

Run on 2026-11-15, branch `t15-local-acceptance`, local PostgreSQL 16 on 127.0.0.1:5432 (`revotask_test`, the `TEST_DATABASE_URL` guard in `backend/tests/db_guard.py`). The existing suite already covered most of V01–V08, so this pass audited it against `docs/TEST-PLAN.md`, then added only what was missing.

### Commands and results

| Command | Result |
|---|---|
| `cd backend && pytest -q` (baseline, before changes) | 2050 passed, 1 skipped |
| `cd backend && pytest -q` (after) | **2058 passed, 1 skipped** (+5 reorder, +3 secret exposure) |
| `cd backend && pytest tests/test_reorder_scenarios.py tests/test_secret_exposure.py -q` | 8 passed |
| `cd backend && ruff check .` and `ruff format --check` on the two new files | clean |
| `cd frontend && npx vitest run` (baseline) | 98 files, 2035 passed |
| `cd frontend && npx vitest run` (after) | **98 files, 2038 passed** (+2 CommentList, +1 BoardCard) |
| `cd frontend && npx eslint` on the two edited tests, `npx tsc --noEmit` | clean |

The one skip is the deliberate E05 skip (`tests/test_boards_properties_writes.py:671`: E05 has no error response for an authenticated caller). Per-area counts from `pytest -k`: auth and validation 257, boards and members 740 (1 skip), kanban, cards and columns 493, comments 145, my tasks, search, profile and users 221, notifications and analytics 151, headers, migrations, bootstrap, config and db guard 51.

### Added scenarios and expected outcomes

| File | Scenario | Expected outcome |
|---|---|---|
| `backend/tests/test_reorder_scenarios.py` | 1 · same column: X1 moves after X2 in Todo | 200, `position_version` 0 to 1, stored titles X2, X1 with orders 2048.0 and 3072.0, one `card_moved` event by the admin |
| same | 2 · different column: X1 moves from Todo to Doing before Y1 | 200, Todo keeps X2 at 2048.0, Doing stores X1 at 512.0 then Y1 at 1024.0, version 1, one `card_moved` |
| same | 3 · missing card: random card ID | 404 `NOT_FOUND`, no `fields`, rows, version 0 and events unchanged |
| same | 4 · unauthorized board: a stranger and another board's admin | 404 with the same envelope as scenario 3, rows, version and events unchanged |
| same | 5 · FLOAT order: a card moves between 1024.0 and 2048.0, then another between 1024.0 and 1536.0 | stored orders exactly 1536.0, then 1280.0, so X1, X2, X3 order numerically as floats, version 2 |
| `backend/tests/test_secret_exposure.py` | V13 repository check: the real JWT key and DB passwords from the ignored `backend/.env` | present in no tracked file (failure names the file, never the value) |
| same | V13 only `.env.example` files tracked | exactly the three example files |
| same | V13 bundle check: the same values against `frontend/.next/static` | present in no bundle file |
| `frontend/components/kanban/BoardCard.test.tsx` | Two cards in one render | card one text is exactly "Fix loginGraceMove", card two exactly "Write docsUnassignedMove", labels "Open Write docs" and "Move Write docs", one "Unassigned" |
| `frontend/components/kanban/CommentList.test.tsx` | Mixed list: Mia unedited, Omar edited | Mia and "Looks good", `datetime` 2026-11-13T09:00:00+00:00, no Edited; Omar, `datetime` 2026-11-13T10:00:00+00:00, Edited, content "Ship it\nafter review" intact; exactly one Edited |
| same | `disabled` list | Edit and Delete on the author's comment are both disabled |

The five reorder scenarios are the ones listed in `docs/RUBRIC.md` (QA row). They had existing coverage spread over `test_cards_move.py`, `test_kanban_access.py` and `test_positions.py`. The new file names each one in one place and adds exact stored order values, which the older tests did not assert for cross-column and midpoint moves.

### Check that the new tests can fail

| Mutation | Result |
|---|---|
| Expected Doing order for X1 changed from 512.0 to 513.0 | `test_2_different_column_...` failed, others passed; reverted |
| `isEdited(comment)` forced false in `CommentItem.tsx` and the Unassigned text changed to "None" in `BoardCard.tsx` | 3 tests failed (both new ones and the existing Unassigned test); reverted with `git checkout` |
| The real JWT key written into `frontend/.next/static/zz_probe.js` | `_leaks()` returned that path; probe file removed |

### Score

Scale: 5 requirement fully asserted, 3 partly, 1 missing. Scores are my judgment from reading the files, not a tool measurement.

| Criterion | Score | Basis |
|---|---|---|
| Coverage | 4 / 5 | Every V01–V08 clause has at least one named test (counts above). V13 has Origin (`lib/server/origin.test.ts`: absent, `null`, empty, other scheme, port, host, slash, suffix, case), `no-store` (`test_response_headers.py`, `test_kanban_access.py`) and now secrets and migrations. Minus one for the gaps below. |
| Assertion strength | 4 / 5 | Tests assert statuses, error codes, stored rows read back from PostgreSQL, exact order values, event kinds, versions and rendered text. The new tests were mutation-checked. Minus one: some older RTL tests assert only presence (`toBeInTheDocument`). |
| Independence | 5 / 5 | Every database test builds its own users, board and rows through `board_tracker` and removes only those, with sentinels where the plan asks. Concurrency tests (`test_kanban_concurrency.py`, `test_comments_concurrency.py`, `test_notifications_concurrency.py`, `test_users_profile_concurrency.py`) run each racer in its own thread and session. The suite passed in full twice, in file order, on a shared database. No test order dependence was found, but random order (`pytest-randomly`) was not run. |

### Unsupported or not verified

- **Line coverage is not measured.** Neither `pytest-cov` nor `@vitest/coverage-v8` is installed, and adding them changes dependencies and lockfiles. The coverage score above is requirement coverage, not a percentage.
- **Prior-schema migration (V13) is not testable.** `backend/migrations/versions/` holds one revision (`a265fb5e7047_initial_schema.py`), so there is no earlier schema to upgrade from. `test_migration.py` covers fresh upgrade, single head, second upgrade as a no-op, downgrade to base, re-upgrade and no autogenerate drift. A prior-schema test needs a second revision.
- **Bundle secret check reads the existing `frontend/.next/static`.** It does not rebuild, so it reflects the last build and skips when no build exists. The sentinel build of native task 11.3 was run later in the T15 pass (`evidence/local-acceptance-T15.md`), in an isolated copy with `--webpack`.
- **No assertion on server-only variables by name.** The secret checks match values from `backend/.env`. A secret that is not in that file is not checked.
- **V09–V11 Playwright and V12 timing** are outside this QA pass. They ran in the T15 pass (`evidence/local-acceptance-T15.md`).
- **E05 authenticated error case** stays skipped: the contract defines none.
- **Random test order** was not tried.

## Finding and refinement

| Finding ID | File and line | Guideline ID or criterion | Problem and requested fix | Actual prompt or diff | Verification |
|---|---|---|---|---|---|
| F-T15-01 | `frontend/components/boards/MembersPanel.tsx` (the "Members (n)" button) | FE-S5 | The avatar stack made the button 40 px wide, under the 44 px rule, at every width. Add `min-w-11 justify-center` | Found by `frontend/e2e/mobile.spec.ts` (LA-8, `/boards/[id]`). Fixed in the working tree, uncommitted | `MembersPanel.test.tsx` "gives the Members button a 44 by 44 px tappable area". `npx playwright test` 54 passed |
| F-T15-02 | `frontend/components/shared/AppHeader.tsx` (the brand link) | FE-S5 | Below 400 px only the glyph shows, so the link was 28 px wide. Add `min-w-11` | Found by the same matrix (every signed-in route at 320 and 375 px). Fixed in the working tree, uncommitted | `AppHeader.test.tsx` brand assertion. `npx playwright test` 54 passed |
| Pending | | | | | |

## Documentation corrections

Record the before/after, source used to verify the correction and actual diff for each document. The handbook targets two corrections per document.

| Document | Original claim and location | Corrected claim | Source in code or test | Result |
|---|---|---|---|---|
| README | | | | Pending |
| API | | | | Pending |
| USER_GUIDE | | | | Pending |
| DEVELOPMENT | | | | Pending |
