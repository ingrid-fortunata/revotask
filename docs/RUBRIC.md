# RevoTask Handbook Checklist

Source: the attached *FSSE Handbook - AI tasks(2).pdf*, pp. 1–13. This checklist maps the assignment to [the two feature prompts](../PROMPTS.md), [extra prompts](../EXTRA-PROMPTS.md) and observable evidence. Every grading item starts pending until you have actual evidence. See [Submission](SUBMISSION.md) for the hand-in package.

## Requirements engineering and specifications · pp. 7–8

| Check | Evidence and workflow |
|---|---|
| Project brief has five sections and at least two measurable non-functional requirements | [Project brief](../PROJECT-BRIEF.md), Prompt 1. Include scope, format, technical context, constraints and reasoning in the actual prompt. |
| Kiro generates requirements, design and tasks | Prompt 1. Keep the three native artifacts in `.kiro/specs/<slug>/` and record the actual path and phase evidence. |
| Design verifies JWT register/login and SQLAlchemy FLOAT ordering | Prompt 1 and spec review. Check E02/E03 and the Card model mapping and migration. |
| Task dependencies and traceability | Prompt 1 and spec review. Check requirement → acceptance criterion → Flask route or Next.js surface in design → task → test. Root `specs/` includes requirements, design, tasks and changelog. |
| Vague vs structured brief, at least five specific differences | COMPARE A. Use real Kiro outputs in an isolated comparison and record five differences with references. This criterion is pending if you skip the comparison. |
| Requirements review across completeness, clarity, testability and feasibility | Prompt 1 and spec review. Target at least two actual findings per dimension. Cite the native file/section and affected AC. |
| Design review with alternatives | Prompt 1 and spec review. Evaluate at least three decisions, with problem, trade-off and alternative. |
| Task review | Prompt 1 and spec review. Check for at least two sequencing issues and three oversized tasks. Cite dependencies and proposed smaller tasks. Record actual findings and counts. |
| Targeted refinement and version history | Prompt 1 and REVIEW. Save at least five targeted gap prompts when supported by actual findings. Each points to a section, precise problem and requested output. Record before/after, reason and verification in `specs/CHANGELOG.md`. |

## Steering and AI-assisted code generation · pp. 8–10

| Check | Evidence and workflow |
|---|---|
| Complete rule/rationale/example steering and measurable comparison | [Guidelines](../guidelines/frontend.md) plus backend and database rules. Review at least five rules in that format. COMPARE B scores an actual steering on/off experiment if you are collecting this criterion. |
| Four component definitions, four frontend sections and eight or more naming rules | Prompt 2 and REVIEW. Check BoardCard, ColumnHeader, AddCardForm and CommentList boundaries and responsibilities. Check BaseButton reuse and styling conventions. |
| Blueprint folder structure and route handler size | Prompt 2 and REVIEW. Cover all eight Blueprints in the project. Verify `routes.py`, `service.py`, `schema.py` and the handler target in the backend guideline. Record deviations with rationale. |
| Typed backend errors and data model | Prompt 2. Trace CardNotFoundException, UnauthorizedBoardAccessError and InvalidCredentialsError through Flask to the envelope. Verify Card UUID, timestamps, FLOAT and both sides of its column relationship. |
| Model/auth review | Prompt 2 and REVIEW. Annotate User, Board, BoardColumn, Card, CardComment and auth files against applicable DB rules. Handbook targets at least one actual violation. |
| Board/card review and refinement | Prompt 2 and REVIEW. Review boards/cards and CardPositionSchema. Handbook targets three concrete violations with guideline IDs and fixes. Save targeted prompts for critical findings. |
| Frontend boundary review | Prompt 2 and REVIEW. Review AuthContext, the four named components, shared UI reuse and inline styling. Cite actual source. |
| Reorder unit tests and frontend render tests | QA. Reorder tests cover same column, different column, missing card, unauthorized board and correct FLOAT order. RTL tests assert rendered card title/assignee and comment content or count. |

## Implementation, integration and testing · pp. 2–5 and 10–11

| Check | Evidence and workflow |
|---|---|
| Columns/comments and validation | Prompt 2 and REVIEW. Verify auth and schemas per route and documented fixes. Flask test client verifies comment create 201/400/401/403. Score coverage, assertions and test independence. |
| Notifications, analytics, profile | Prompt 2. Verify pagination, SQLAlchemy join-based aggregates and forbidden password fields. Check controlled profile inputs, success toast and BaseButton usage. |
| Dashboard, board detail, modal and My Tasks | Prompt 2. Dashboard and board detail are Server Components. Client CardDetailModal composes BaseModal and CommentList. My Tasks groups by board. |
| Interaction hooks | Prompt 2. Demonstrate native desktop drag, optimistic rollback on failure, 30-second notification polling and 300 ms search debounce. |
| Typed API and errors | Prompt 2 and QA. Demonstrate ApiError and useErrorHandler, 401 on client and server paths, a visible 404 response, no unhandled rejection and real API requests for boards, board detail, notifications and comments. |
| Playwright | QA and RELEASE B. Verify baseURL and isolated storageState, four auth scenarios and the eight-step Kanban journey, including dragTo and post-reload assertions. Use getByRole or stable test IDs. Avoid waitForTimeout. |

## Submission and deployment · pp. 5–7 and 11–12

| Check | Evidence and workflow |
|---|---|
| Repository and environments | Prompt 2 and RELEASE A. Commit source, migrations, tests, lockfiles, both placeholder env examples, meaningful Git history and reviewed documentation. Check Git history for actual env values. |
| Live backend | RELEASE A–B. Record migration revision, HTTPS health/register/login and one request per Blueprint from Postman. |
| Live frontend | RELEASE B. Verify all pages, core flows, desktop and mobile. Capture search, notification bell, comments and persistence. |
| Full production Playwright report | RELEASE B and SUBMIT. Include the sanitized report in `evidence/playwright-final/` and record the verified URL and application revision. |
| Four reviewed docs and README evidence | SUBMIT. README, API, USER_GUIDE and DEVELOPMENT reflect the actual app and AI workflow. Record before/after changes with source locations. Handbook targets two real corrections per document. |
| Final version and evidence | SUBMIT. Tag verified code, record deployment and migration revisions, link sanitized screenshots/reports and disclose remaining deviations or unmet criteria. |

## Project decisions that differ from literal rubric wording

| Handbook item | Project decision and evidence |
|---|---|
| Railway and `FLASK_ENV` | Render hosts Flask using the app's explicit `APP_ENV`; Supabase provides PostgreSQL and Vercel hosts Next.js. Show real environment names, migration revision and live checks. |
| JWT in AuthContext and browser API base URL | Next stores the JWT in an HttpOnly cookie and calls Flask with a server-only `API_BASE_URL`. AuthContext exposes the public user DTO. Test SSR and browser paths, 401 and logout. |
| Client sends a positive float for position | Flask computes the positive FLOAT value from a stable anchor and version. Show persisted FLOAT values and concurrency tests. |
| ORM backref, password dump-only wording and route line count | Use explicit bidirectional `back_populates`, a public field allowlist, explicit password-input rejection, and a five-executable-line route target. Record actual implementation and any exceptions. |
| 404 demonstrated by deleting a database row | Use an isolated missing-resource fixture and capture the real error chain. |
| Comparing outputs | The main workflow uses reviewed feature specs and a shared project baseline. COMPARE A–B provide an isolated evidence route for the handbook's comparison items. Record them as pending if you choose to skip them. |

Approval of deviations and actual grading remain with the instructor.
