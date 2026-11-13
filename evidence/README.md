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
| Implementation reviews and refinement prompts | | | Pending |
| Local pytest, React Testing Library and Playwright | | | Pending |
| Browser requests, 401, 404, mobile flow and optimistic rollback | | | Pending |
| Live Postman checks and eight Blueprint routes | | | Pending until deployment |
| Full sanitized live Playwright HTML report under evidence/playwright-final/, auth and Kanban flow | | | Pending until deployment |
| GitHub repo/tag, public URLs and migration revision | | | Pending until release |
