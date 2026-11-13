# Specification Changelog

Spec versioning tracks review rounds independently of application releases. Record the old behavior, the agreed change, why it changed, the refinement prompt, and what was checked. Record the commit and link evidence when available.

## [Unreleased]

- Record agreed specification changes as implementation proceeds.

### Changed

- **foundation (T01) · Docker image and local Compose (scope change, revision 2):** added the backend container and pinned Gunicorn in T01.
  - **Before:** Docker and Gunicorn were planned for T16 (`requirements.md` A6). Render was a native Python runtime with `pip install` and `gunicorn` commands (`docs/DEPLOYMENT.md` section 3).
  - **After:** `backend/Dockerfile` (`python:3.14.5-slim`, non-root, Gunicorn on `0.0.0.0:$PORT`), `backend/.dockerignore`, root `compose.yaml` (service `backend`, `127.0.0.1:5001:5001`, `DATABASE_URL` from `DOCKER_DATABASE_URL`) and root `.env.example` are T01 deliverables. Tasks 1.8 to 1.10 and requirement FND-R10 cover them. Design DD11 and §4.7 record the decision. `gunicorn==27.0.1` is pinned in `backend/requirements.txt`.
  - **Reason:** Run the same image locally before the release phase, so the Render build is not the first container run. Gunicorn is needed for that image.
  - **Verification:** `docker compose config --quiet` passes with the root `.env` and fails without `DOCKER_DATABASE_URL`. The image builds and runs as uid 999 on Python 3.14.5 with Gunicorn 27.0.1. `PORT=8055` binds `0.0.0.0:8055`. On `127.0.0.1:5001`, `GET /api/health` returns 200 and the container reaches the host PostgreSQL. `db current` reports `a265fb5e7047`. `docker compose down` leaves the 10 host objects unchanged. Evidence: `evidence/foundation-T01-T02.md`, revision 2.
- **foundation (T01–T02) · Render deployment procedure (documentation, revision 2):** `docs/DEPLOYMENT.md` section 3 describes a Docker Web Service.
  - **Before:** A native Python web service with `pip install -r requirements.txt` and `gunicorn --bind 0.0.0.0:$PORT 'app:create_app()'` as commands.
  - **After:** Language Docker, Root Directory `backend`, Dockerfile Path `./Dockerfile`. Render supplies `PORT`. Health check `/api/health`. Migrations run as a separate one-off step with the migration role. Render's build copies secret files into the build context, so `supabase-ca.crt` is in `.dockerignore`.
  - **Reason:** One image for local and Render builds. Keeping migrations out of the container start preserves the separate migration role (DB07).
  - **Verification:** The Render behaviour in the runbook was checked against Render's Docker deploy, web-service port binding and secret-file pages on 2026-11-13. The live Render service is not created until T16.
- **root (T01, T16 and D1) · Docker deployment wording:** `specs/design.md` D1 and `specs/tasks.md` now name `backend/Dockerfile` for local and Render runs. T01 lists the local image and Compose service. T16 deploys Render as a Docker Web Service.
  - **Reason:** Matches the foundation revision 2 scope.
  - **Verification:** Text review against the native spec tasks 1.8 to 1.10.
- **foundation (T01–T02) · local API port:** Flask runs on port 5001, not 5000. This applies to `flask run`, the `GET /api/health` check and the Next.js `API_BASE_URL`.
  - **Before:** Specs and docs used `127.0.0.1:5000`. macOS AirPlay Receiver answers that port with 403 (`Server: AirTunes`) on the development machine, so Flask cannot be reached there.
  - **After:** `127.0.0.1:5001` for local Flask and `API_BASE_URL`. AirPlay Receiver stays enabled. This is local development configuration only. The deployed port is set by Render's `PORT`.
  - **Reason:** The project keeps AirPlay Receiver on and needs a free local port.
  - **Verification:** Native checks for tasks 1.7 and 2.9 are rerun on port 5001 (`evidence/foundation-T01-T02.md`, revision 2).
- **foundation (T01–T02) · API error conventions:** added `405 METHOD_NOT_ALLOWED`.
  - **Before:** The status list in `docs/API.md` and the error table in `backend/specs/api-contract.md` had no 405 entry. Flask's default 405 response is HTML, which conflicts with "use the same JSON envelope for framework, JWT and domain errors".
  - **After:** A known path called with an unsupported method returns 405 in the standard JSON envelope with code `METHOD_NOT_ALLOWED`, and the response keeps the `Allow` header. Updated `docs/API.md` (status conventions) and `backend/specs/api-contract.md` (error table).
  - **Reason:** Foundation introduces the shared error envelope and its handlers (E01 needs the 503 form). An unsupported method on `/api/health` is the first case that reaches the 405 path, and later routes would hit it too.
  - **Verification:** Backend tests `tests/test_errors.py::test_unsupported_method_returns_405_with_allow_header` and `tests/test_health.py::test_post_to_health_returns_405_with_allow_header` pass. A live `flask run` on port 5001 returned 405 with code `METHOD_NOT_ALLOWED` and `Allow: GET, HEAD, OPTIONS` for `POST /api/health`. Port 5000 was blocked on this machine (see the foundation evidence file).
- **foundation (T01–T02) · migration environment:** pinned the migration engine's `search_path` and removed the Alembic `include_name` filter.
  - **Before:** The foundation design §5.4 described an Alembic `include_name` filter limited to the `revotask` schema.
  - **After:** Migrations use a dedicated engine with `search_path=public`. Every RevoTask object is schema-qualified, so the empty default schema adds nothing. The app engine is unchanged. No filter is used.
  - **Reason:** The PostgreSQL role is named `revotask`, so its `"$user"` search path entry resolves to a schema named `revotask`. Filter-based attempts reported 31 phantom differences, then 15 foreign-key differences. The final filter also hid real drift: an injected column was not detected.
  - **Verification:** After the upgrade, `flask db migrate` reports "No changes in schema detected." and writes no revision. A negative control with an injected column detected `revotask.users.drift_probe`. The full lifecycle passes: upgrade, idempotent re-upgrade, `downgrade base`, re-upgrade.
- **foundation (T01–T02) · factory parameter:** `create_app` takes `env` (a mapping that replaces `os.environ` when given) instead of `overrides`.
  - **Before:** Design §4.2 named the parameter `overrides`, merged over the process environment.
  - **After:** `create_app(env=None)` and `Settings.from_env(env=None)`. An explicit mapping is the whole environment, so tests do not depend on the developer's shell.
  - **Reason:** Replacing the environment keeps tests independent of the developer's shell. The design's merge would have let an exported `DATABASE_URL` through. A related case did occur: `tests/conftest.py` reads `os.environ` before `backend/.env`, so an exported test URL matched the app URL, and the database guard refused the run before any schema change.
  - **Verification:** `tests/test_config.py::test_settings_do_not_read_the_process_environment_when_env_is_given`.

## [0.4.0] - 2026-11-13

### Changed

- **Before:** Separate prompt blocks covered the project-wide spec phases and each implementation slice.
- **After:** Two reusable prompts create and implement one native Feature Spec per slice. The queue maps feature goals and dependencies to root tasks. Steering synchronizes task progress, approved contract changes, README and relevant changelogs. Detailed review, QA, comparisons and release prompts remain available.
- **Reason:** Reduce manual prompting and keep project-wide documentation current as features are delivered.
- **Verification:** Checked feature coverage, task and API references, links, prompt count and archive integrity. Execution in Kiro is pending.

## [0.3.1] - 2026-11-13

### Changed

- **Before:** The kit generated a single native Kiro spec and supplied layer specs, but several handbook evidence items had no dedicated collection step.
- **After:** Added the full rubric checklist, submission runbook, isolated comparison prompts and evidence templates. The native Kiro workflow now calls for a design trace and targeted refinements. AuthContext, SearchBar, typed error proof and the complete live Playwright report have explicit prompts and task coverage.
- **Reason:** Make handbook criteria traceable through generation, implementation, verification and submission while keeping the main workflow local-first.
- **Verification:** Reviewed the attached handbook, checked Markdown links, prompt mappings, endpoint ownership, task dependencies, acceptance traceability and ZIP integrity. Kiro outputs, app tests, deployments and instructor approval of deviations remain pending.

## [0.3.0] - 2026-11-13

### Added

- Backend data model, API contract and Flask architecture.
- Frontend page/component design, API integration and typed error-handling specs.
- Spec review evidence template covering handbook review dimensions and targeted refinements.

### Changed

- **Before:** P01 scaffolded the app from the root specification baseline. App-level specs were indexes.
- **After:** P01A–C use Kiro Requirements-First to generate one native Feature Spec. P01D reviews and aligns the root submission files, and P01E starts local scaffolding. Layer specs now provide implementation details.
- **Reason:** Capture native Kiro output for the rubric and make backend and frontend decisions reviewable before coding.
- **Verification:** Cross-checked handbook pp. 2–5 and 8–11, prompt references, spec links and endpoint ownership. Native Kiro generation, app implementation and test execution are pending.

## [0.2.1] - 2026-11-13

### Changed

- **Before:** Documentation updates were explicit at spec review and release, and the start guide called for changelog updates at milestones.
- **After:** Kiro loads a documentation checkpoint on every interaction. Write prompts direct the agent to update the relevant changelogs and README facts within the same task.
- **Reason:** Keep progress and version history current as each implementation task finishes.
- **Verification:** Checked steering front matter, prompt coverage, Markdown links and archive contents. Kiro execution is pending.

## [0.2.0] - 2026-11-13

### Changed

- **Before:** Separate specification and steering comparison exercises came before implementation.
- **After:** P01 scaffolds the app directly from the included specification. Reviews use actual implementation diffs. GitHub, CI setup and deployment follow local acceptance.
- **Reason:** Use a single ready-to-prompt workspace and finish the app locally before publishing.
- **Verification:** Checked prompt-to-task mapping, English documentation, environment templates and archive integrity. App implementation and tests are pending.

## [0.1.0] - 2026-11-13

### Added

- Initial RevoTask project brief, requirements, design, task plan, API contract and acceptance traceability from the attached assignment.
- Steering guidelines for frontend, backend and PostgreSQL.
- Workflow for collecting real AI review, tests and deployment evidence.

### Decisions relative to the assignment

| Before                                     | After                                                                                       | Reason                                     | Verification                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------- |
| Flask deployment illustrated with Railway. | Flask on Render, data in Supabase PostgreSQL, UI on Vercel.                                 | Requested project stack.                   | Runbook written. Live verification pending. |
| JWT in frontend context.                   | HttpOnly cookie at Next, bearer validation and revocation in Flask, safe DTO in UI context. | Same session for server and browser paths. | D2 / AC02.1–3. Tests pending.               |
| Client submits a positive float.           | Flask allocates float order from anchors and checks board position version.                 | Keeps concurrent moves consistent.         | D4 / AC07.1–2. Tests pending.               |

## Entry template

Place the next verified spec round above the previous version.

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Changed

- F-XX · AC/section: …
  - Before: …
  - After: …
  - Reason: …
  - Prompt/run: …
  - Verification: …
  - Commit/evidence: …
```
