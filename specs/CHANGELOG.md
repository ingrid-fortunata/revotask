# Specification Changelog

Spec versioning tracks review rounds independently of application releases. Record the old behavior, the agreed change, why it changed, the refinement prompt, and what was checked. Record the commit and link evidence when available.

## [Unreleased]

- Record agreed specification changes as implementation proceeds.

### Changed
- **authentication (T03–T04) · local rate limit runs one Gunicorn worker (revision 4, configuration and contract clarification):** the local Compose backend uses `GUNICORN_WORKERS=1`, and a 401 no longer carries `Retry-After`.
  - **Before:** the image default of two workers kept two sets of login and register counters, so the limit was not exact (`evidence/spec-review.md` F-AUTH-11). Flask-Limiter put `Retry-After` on every response, including 401 (F-AUTH-13).
  - **After:** `compose.yaml` sets `GUNICORN_WORKERS: "1"` for local runs. The Render default stays 2 until T16, and `docs/DEPLOYMENT.md` now says to set 1. `response_headers.py` removes `Retry-After` from non-429 responses. Native spec: AUTH-AC6.6, open item 2, DD11, the task 2.11 rate-limit check.
  - **Reason:** The local limit must match AUTH-AC6.2 (five invalid logins per minute per email, then 429). Shared limiter storage is a larger change and stays in T16.
  - **Verification:** Live check on the rebuilt container: `401, 401, 401, 401, 401, 429` for one normalized email, one worker, and no `Retry-After` on the 401s. Pytest fresh process: 17 rate-limit tests passed, and the full backend suite passed 431. Negative controls failed as expected. The smoke rerun passed 75 of 75 with a restart before each group, and the Chrome check passed 96 of 96. Evidence: `evidence/authentication-T03-T04.md`, revision 4.
- **authentication (T03–T04) · register password rule (revision 3, requirement change, P11):** the minimum drops from 12 to 8 characters, and register needs an uppercase letter, a lowercase letter and an ASCII special character.
  - **Before:** register accepted 12 to 128 characters with no character-class rule (`specs/design.md` D2, `docs/API.md` E02, `.kiro/specs/authentication/requirements.md` AUTH-AC1.3).
  - **After:** register accepts 8 to 128 characters with at least one `A–Z`, one `a–z` and one ASCII special character (`0x21–0x2F`, `0x3A–0x40`, `0x5B–0x60`, `0x7B–0x7E`). A space and a non-ASCII symbol do not count. The length message is reported first when both rules fail. Login accepts 1 to 128 characters with no composition rule, so existing or mistyped passwords get a normal 401. The register form shows the rules as visible help text linked to the input. Native spec: P11, C11, DD15, AUTH-AC1.3, AUTH-AC2.4, AUTH-AC10.8. Updated `specs/design.md` D2, `docs/API.md` E02 and E03, `docs/USER_GUIDE.md`, `docs/TEST-PLAN.md` V01, `backend/specs/api-contract.md`, `frontend/specs/pages-and-components.md`.
  - **Reason:** The owner judged the 12-character minimum too long. The composition rule keeps a short password from being a single kind of character. Limiting the rule to ASCII keeps Python and TypeScript identical. Keeping login free of the rule means an existing or mistyped password never gets a policy message.
  - **Verification:** Backend pytest 428 passed (Ruff passes). Frontend lint, typecheck and Vitest 446 passed in 31 files. The shared case file ran in both suites, 61 cases. `next build` with sentinel values passed. The HTTP smoke passed 73 of 73, including Next and Flask rejections and a login with a short password. The Chrome check passed 96 of 96, including the hint link and the composition message. Evidence: `evidence/authentication-T03-T04.md`, revision 3.
- **all UI slices · mobile responsiveness is a standing rule (requirement and guideline change):**
  - **Before:** AC13.1 required only the core flow to work at 375 px. `guidelines/frontend.md` had FE-S2 (mobile-first, horizontal scroll only in the Kanban region) and nothing on touch targets, input size, viewport height or when to check. The foundation scaffold uses `min-h-screen` in `app/layout.tsx` and `app/page.tsx`.
  - **After:** AC13.1 covers every page, dialog and control at 375 px and wider, with 44 px touch targets and 16 px inputs. New rules FE-S4 (layout, `min-h-dvh`, wrapping, no zoom lock), FE-S5 (touch targets and input size) and FE-S6 (each UI slice has a 375 px criterion, a build task and a recorded check at 320, 375, 768 and 1280 px). The workflow steering, the feature queue, the root task tracker, `docs/TEST-PLAN.md` V11 and the frontend page spec say so. The 44 px size is stricter than WCAG 2.2 AA (24 px) and is a project choice, confirmed in review. It is measured as the element's rendered tappable box (`getBoundingClientRect()` plus an `elementFromPoint` check), not from class names.
  - **Reason:** Responsiveness has to hold in every feature, so each slice checks it instead of leaving it to final acceptance.
  - **Verification:** Text review, then applied in the authentication slice (AUTH-R13). A Chrome 157 run (device emulation, no real phone) measured `/login`, `/register`, `/` signed in, and the error state at 320, 375, 768 and 1280 px: no horizontal page scroll, every control at least 44 by 44 from `getBoundingClientRect()` with `elementFromPoint` hitting it, inputs at 16 px, toasts inside the screen. 90 of 90 checks passed twice. `lib/mobileGuard.test.ts` keeps `h-screen`, `100vh` and zoom locks out. Real-phone and on-screen-keyboard checks remain open (T15, T16). Evidence: `evidence/authentication-T03-T04.md`.
- **authentication (T03–T04) · E30 read moves to T03 (task-scope change, P1):** the current-user read endpoint ships with T03.
  - **Before:** E30–E31 belonged to T12, which depends on T04. The T04 protected shell needs the user (D2: load `AuthContext` "using the session/profile endpoint"), so T04 could not be built or verified.
  - **After:** T03 implements `GET /api/users/me`. T04 consumes it. T12 implements E31 and the profile UI. `specs/tasks.md` (T03, T04, T12) and `specs/traceability.md` (AC12.1 tasks, endpoint ownership) are updated. `docs/API.md` E30 is unchanged.
  - **Reason:** The dependency order T03 → T04 → T12 left the shell without a session read.
  - **Verification:** `backend/tests/test_users_me.py` (6 tests) and a real-HTTP check: `GET /api/users/me` returns exactly `id`, `name`, `email`, returns 401 without a valid session or after logout, and the Next shell loads it on every protected render. `docs/API.md` E30 is unchanged. Root `specs/tasks.md` and `specs/traceability.md` carry the new ownership. Evidence: `evidence/authentication-T03-T04.md`.
- **authentication (T03–T04) · request-body error statuses (contract addition, P3 revised):** malformed JSON, unsupported content type and oversized body get distinct statuses.
  - **Before:** `docs/API.md` listed 400, 401, 403, 404, 405, 409, 429, 503 and had no rule for these cases. Foundation kept Flask's default HTML for them.
  - **After:** malformed JSON or a non-object body returns 400 `VALIDATION_ERROR`. A missing or non-JSON `Content-Type` returns 415 `UNSUPPORTED_MEDIA_TYPE`. A body over 64 KiB returns 413 `CONTENT_TOO_LARGE`. All use the JSON envelope. Updated `docs/API.md` (conventions), `backend/specs/api-contract.md` (error table), `frontend/specs/error-handling.md` (413/415 row) and `docs/TEST-PLAN.md` (V01).
  - **Reason:** The statuses describe the failures accurately, and foundation left them open (foundation open item 4).
  - **Verification:** `tests/test_validation.py` (14 tests) and `tests/test_errors.py` cover 400, 413 and 415 in the Flask envelope. The Next handler tests cover the same three statuses before any upstream call. The HTTP smoke confirmed 415 and 413 at Next and 415 at Flask. The bare `abort(400)` test replaces the foundation HTML test. `docs/API.md`, `backend/specs/api-contract.md`, `frontend/specs/error-handling.md` and `docs/TEST-PLAN.md` V01 were updated in the same round.
- **authentication (T03–T04) · exact auth fields (clarification):** register accepts exactly `name`, `email`, `password`. Login accepts exactly `email`, `password`.
  - **Before:** `docs/API.md` E02 and E03 listed the fields and a global rule to reject unknown fields. The UI rules were not tied to the API rules.
  - **After:** E02 and E03 state "exactly" and the normalization (trim name and email, lowercase email, keep password as entered). The UI validates with the same rules, and the Next handlers also reject unexpected fields. `frontend/specs/pages-and-components.md` is updated.
  - **Reason:** One field contract for the form, the same-origin handler and Flask.
  - **Verification:** The Flask schema tests and the `authRules.ts` tests each ran the 61 shared cases in `specs/fixtures/auth-field-cases.json` (42 register, 19 login) and agreed. Revision 3 changed the password cases only. Component tests assert the rendered input names and the request body keys. The smoke confirmed an extra field is rejected at Next and at Flask, and a missing field at Next.
- **authentication (T03–T04) · session cookie and Origin boundaries (design clarification, P4–P5):**
  - **Before:** D2 said "Secure in production" and "exact same-origin validation". A missing `Origin` and plain-http deployments were not addressed.
  - **After:** the host-only `revotask_session` cookie is HttpOnly, `SameSite=Lax`, `Path=/`, has no `Domain`, and expires no later than the JWT. It is `Secure` on https. `APP_ORIGIN` must be https, or an http loopback origin for local development only. A missing or mismatched `Origin` on a browser auth mutation returns 403. Updated `specs/design.md` D2, `frontend/specs/api-integration.md`, `docs/API.md` (E03, E04) and `docs/DEPLOYMENT.md` (section 4).
  - **Reason:** Make the plain-http exception explicit and local-only, and remove the `NODE_ENV` ambiguity.
  - **Verification:** Unit tests cover every cookie attribute, `Secure` on https, loopback-only http, the `Max-Age` bound by the token, a missing or mismatched `Origin`, and a bad `APP_ORIGIN`. The HTTP smoke read the real `Set-Cookie` (`Path=/; Max-Age=3599; HttpOnly; SameSite=Lax`, no `Domain`, no `Secure` on loopback http). Chrome confirmed a host-only HttpOnly cookie that page JavaScript cannot read. A test found that `NextResponse.cookies` would copy the token into a second header, so the header is written by hand. The live `Secure` flag on https is open for T16.
- **authentication (T03–T04) · safe `next` and logout (clarification, P9–P10):** `frontend/specs/api-integration.md` states that server redirects go to plain `/login`, that `next` is used only when it resolves to a same-origin path (otherwise `/`), and that browser logout is idempotent. `docs/API.md` E04 records the Next behavior.
  - **Reason:** Close an open-redirect risk and define logout with a missing or invalid session.
  - **Verification:** `safeRedirectPath` and `LoginPage` tests cover `//host`, `/\host`, absolute URLs, `javascript:`, control characters, `/login`, `/register` and over-long values. The smoke showed the login form receiving `redirectTo` of `/` for each unsafe value, and Chrome landed on `/` for `next=//evil.example`. Logout was checked with no cookie, an already revoked cookie, a valid cookie, and Flask stopped (503, cookie kept, retry works in the browser).
- **authentication (T03–T04) · rate limits are local-only (production tracking, P2):** `specs/design.md` D2, `specs/tasks.md` T16 and `docs/DEPLOYMENT.md` section 3 record that in-memory limiter storage proves local behavior only, and that shared storage and trusted client address handling are decided before production traffic.
  - **Reason:** Browser traffic reaches Flask through Vercel and Render, so the address Flask sees is not the end user's, and counters are per process.
  - **Verification:** Text review. The notes are in place. The decision itself and its live check stay open until T16. Revision 3 found the limit is per Gunicorn worker: 14 direct attempts gave a mix of 401 and 429. The earlier five-then-429 result was a lucky split. Open item 8 in the evidence file.

- **authentication (T03–T04) · server load failures retry with `retry()` (layer-spec clarification):** `frontend/specs/error-handling.md` now says a route error boundary recovers from a failed server load with `retry()`.
  - **Before:** The spec said to use route error boundaries and a visible error state, and did not name the recovery call.
  - **After:** In Next.js 16.4, `reset()` clears the error and re-renders without re-fetching, so a "Try again" button must call `retry()`.
  - **Reason:** A real-browser run showed the first implementation (`reset()`) could not recover after Flask came back.
  - **Verification:** `app/error.test.tsx` asserts `retry` is called and `reset` is not. The Chrome run then recovered to the signed-in shell after Flask restarted. Next.js 16.4 docs, `error.md`, sections `retry` and `reset`.
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
