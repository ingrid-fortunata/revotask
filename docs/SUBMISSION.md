# Submission Checklist

Complete local acceptance before setting up a GitHub remote or live services. Use the [rubric checklist](RUBRIC.md) and record actual evidence in [evidence](../evidence/README.md). The project keeps the local guides `START-HERE.md`, `PROMPTS.md` and `EXTRA-PROMPTS.md` available for development. If you exclude them locally, keep the submitted AI workflow and actual refinement prompts in README and the evidence files.

## Repository contents

- Source, tests, migrations, pinned dependencies and both placeholder `.env.example` files.
- Native Kiro requirements, design and tasks under each relevant `.kiro/specs/<slug>/`; reviewed requirements, design, tasks, traceability and changelog under `specs/`.
- `guidelines/frontend.md`, `guidelines/backend.md` and `guidelines/database.md`.
- README and the three docs `docs/API.md`, `docs/USER_GUIDE.md` and `docs/DEVELOPMENT.md`; evidence of their review and corrections.
- Links to public Flask and Next.js, migration revision, verified application commit/tag, and sanitized local and live results. Include the full sanitized HTML Playwright report, with the assets necessary to open it, under `evidence/playwright-final/`.

## Final evidence

| Deliverable | Verify and record |
|---|---|
| Kiro work | Project brief, native artifacts, actual review, focused refinements, spec versions, and comparative evidence if completed. |
| Postman | Public health/register/login and one route per Blueprint. Capture URL, status and expected envelope without sharing JWTs or credentials. |
| App screenshots | Dashboard, board detail with columns/cards, card modal with comments, My Tasks, Profile, Register, Login, desktop drag, unread notification badge and mobile walkthrough. |
| Integration | Network entries or correlated server request IDs for board list/detail, notifications and comments. Show invalid-session redirects, 404 feedback and optimistic rollback. |
| Playwright | Four auth cases and eight-step Kanban journey against the live URL. Record browser, time, command, results and deployed commit. Include an HTML report screenshot as well as the report files. |
| Docs and history | Verify README overview, implementation status/features, stack, local commands, test commands, AI workflow and evidence. Document actual corrections for all four docs. |

Run Playwright with dedicated dummy accounts and disposable data. Check the report, traces and screenshots for credentials or private state. If a report contains sensitive information, regenerate it with safe fixtures or report settings before committing the shareable copy. Keep raw `playwright-report/`, `test-results/` and `playwright/.auth/` outside Git. An evidence-only commit can reference the prior verified deployment SHA. Record both revisions so the report remains traceable to the deployed code.
