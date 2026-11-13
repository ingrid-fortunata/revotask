# Requirements · authentication (T03–T04)

**Status:** Implemented and verified locally. Revision 4 runs one Gunicorn worker locally so the rate limits are exact (AUTH-AC6.6). Revision 3 changes the password policy (decision P11, change C11): register now needs 8 to 128 characters with an uppercase letter, a lowercase letter and a special character. Decisions P1–P10 and changes C1–C10 are applied ("Decisions confirmed in review", "Changes to review"). The shared documents were updated in the spec round and are recorded in `specs/CHANGELOG.md`. Results, findings and open items are in `evidence/authentication-T03-T04.md`. Rate-limit results prove local behavior only.

**Root tasks:** T03 (Flask auth, public DTO, validation and errors, JWT guard, revocation) and T04 (Next server-only API client, same-origin auth Route Handlers, safe cookie, public-user `AuthContext`, typed `ApiError`, error feedback helper, login and register forms, protected shell).

**Baseline:** 0.4.0. Sources: `PROJECT-BRIEF.md`, `specs/FEATURE-QUEUE.md`, `specs/requirements.md` (R01, R02, AC13.3), `specs/design.md` (D2, D5, D6), `specs/tasks.md`, `specs/traceability.md`, `docs/API.md` (E02–E04, E30), `docs/TEST-PLAN.md` (V01, V02, V13), `backend/specs/*`, `frontend/specs/*`, `guidelines/*` (BE01–BE08, DB04, FE-C1–C4, FE-N1–N9, FE-S1–S3, FE-A1, FE-A2, FE-A4), and the foundation spec in `.kiro/specs/foundation/`.

## Introduction

After this slice a visitor can register, sign in, see a protected page, and sign out. The Flask API issues a 60-minute JWT and can revoke it. The Next.js app keeps the token in an HttpOnly cookie that browser JavaScript never reads, and exposes only the public user (`id`, `name`, `email`) to the UI.

Foundation already provides the factory, request IDs, the JSON error envelope, the `users` and `revoked_tokens` tables with their constraints, and Flask-JWT-Extended initialized with the secret only. This slice adds no table and no migration.

**Actors.** A *visitor* has no session and can reach `/login`, `/register`, `POST /api/auth/register`, `POST /api/auth/login` and `GET /api/health`. A *signed-in user* has a valid, unrevoked, unexpired token and can reach every other route. Board roles (member, admin) do not exist yet and arrive with T05. This slice's only role boundary is public versus authenticated.

## Scope

**In scope**

- Flask: E02 register, E03 login, E04 logout, the `@token_required` guard, the revocation blocklist, the public user DTO, Marshmallow validation, typed auth errors, JSON error handling for malformed (400), unsupported (415) and oversized (413) request bodies, rate limits on E02 and E03, `Cache-Control: private, no-store` on private responses, and the actor ID in request logs.
- Flask: `GET /api/users/me` (E30, read only). Decision P1: T03 builds the read half of E30 because T04's protected shell needs it. T12 keeps E31 and the profile UI.
- Next.js: server-only Flask client, same-origin Route Handlers for E02–E04, the `revotask_session` cookie, Origin validation, one set of field rules shared by the forms and the API schemas, `AuthContext`, `ApiError`, `useErrorHandler`, `lib/toast.ts`, `/register`, `/login`, and a protected shell around `/`.
- Tests for all of the above, a local integration smoke against a running Flask and Next, and the documentation checkpoint.

**Out of scope (owned elsewhere or excluded by the brief)**

- Boards, dashboard content, membership (T05–T06). The protected `/` page stays a placeholder inside the shell.
- E31 profile update, the `/profile` page, and `AuthContext` refresh after a profile save (T12).
- Password reset, email verification, refresh tokens, sliding sessions, "remember me", MFA, social login, account lockout beyond rate limits, account deletion.
- A periodic job that deletes expired `revoked_tokens` rows. The blocklist is a primary-key lookup, so stale rows cost space only.
- Playwright installation and the V09 auth suite (T15). Live Render and Vercel checks, trusted-proxy settings, a shared limiter store, and cookie flags on the deployed origin (T16).
- A Next `proxy.ts`, CORS (the browser never calls Flask), and any change to the nine-table schema.

## Requirements

Feature-local IDs use `AUTH-R<n>` and `AUTH-AC<n>.<m>`. Root IDs are unchanged. No new root IDs are proposed.

### AUTH-R1 · Registration API (T03, E02)
_As a visitor, I can create an account through the Flask API._

- **AUTH-AC1.1** WHEN `POST /api/auth/register` receives `name`, `email` and `password` that pass AUTH-AC1.3, THEN it returns 201 with `{"data": {"id", "name", "email"}}`. The stored name is trimmed and the stored email is trimmed and lowercased. The body contains no password, hash or token field.
- **AUTH-AC1.2** The password is stored only as an Argon2id hash (a value starting `$argon2id$`). The plain password is never stored, returned or logged. (D2, BE04)
- **AUTH-AC1.3** Invalid input returns 400 `VALIDATION_ERROR` with `fields` mapping each bad field to one fixed message that does not echo the submitted value:
  - `name`: required, 1–80 characters after trimming.
  - `email`: required, valid address, at most 254 characters after trimming and lowercasing.
  - `password`: required, 8–128 characters, with at least one uppercase letter, one lowercase letter and one ASCII special character (see DD15). Whitespace is kept and counts toward the length, but a space is not a special character. Login applies none of these rules (AUTH-AC2.4).
  - The body holds exactly `name`, `email` and `password`. A missing field is `Required.`, a non-string value is `Must be text.` and any other key is `Unknown field.` (BE03)
  - The UI applies these same rules (AUTH-AC10.7). The messages in `design.md` §4.4 are the single table.
- **AUTH-AC1.4** WHEN the normalized email already exists, including a case or whitespace variant of it, THEN the response is 409 `EMAIL_ALREADY_EXISTS` and no second row exists. (Root AC01.2, DB04)
- **AUTH-AC1.5** WHEN eight requests register the same normalized email at once, THEN exactly one returns 201, the others return 409, none returns 500, and `users` holds one row for that email. (Root AC01.2, V01)
- **AUTH-AC1.6** Registration issues no token and sets no cookie.

### AUTH-R2 · Login API (T03, E03)
_As an account holder, I can exchange credentials for an expiring token._

- **AUTH-AC2.1** WHEN `POST /api/auth/login` receives an existing email (matched after trim and lowercase) and the correct password, THEN it returns 200 with `{"data": {"access_token", "expires_in": 3600, "user": {"id", "name", "email"}}}`. The token is an HS256 JWT with a UUID-string `sub` equal to the user ID, an `exp` 3600 seconds after issue, and a UUID-string `jti`. The token carries no name, email or password data. Registration, login and the per-email limit key all normalize email the same way (trim, lowercase). (Root AC02.1, D2)
- **AUTH-AC2.2** A wrong password and an unknown email return the same 401 `INVALID_CREDENTIALS` response: same status, code, message, no `fields`. (Root AC02.2)
- **AUTH-AC2.3** WHEN the email is unknown, THEN the service still verifies the submitted password against a dummy Argon2id hash, so the two failures cost about the same time.
- **AUTH-AC2.4** The body holds exactly `email` and `password`. `email` must be a string of at most 254 characters and `password` a string of 1–128 characters with no composition rule. Anything else, a missing field or an unknown field returns 400 `VALIDATION_ERROR`. Login does not apply register's 12-character minimum or its email-format check.
- **AUTH-AC2.5** Responses and logs never contain a password, hash or, on failure, a token.

### AUTH-R3 · JWT guard (T03)
_As the API owner, I can protect any route with one decorator that rejects every unacceptable credential._

- **AUTH-AC3.1** WHEN a protected route receives `Authorization: Bearer <token>` with a valid signature, a future `exp`, a `jti` that is not revoked, and a `sub` that names an existing user, THEN the handler runs with that user available.
- **AUTH-AC3.2** Each of these returns 401 `AUTH_REQUIRED` in the standard envelope: no `Authorization` header, a scheme other than `Bearer`, a malformed token, a bad signature, an expired token, a revoked `jti`, a token missing `sub`, `exp` or `jti`, a `sub` that is not a UUID, and a `sub` with no user row. None of them returns the library's default body or a 422.
- **AUTH-AC3.3** The 401 message is one fixed string. It does not say which check failed. (BE05)
- **AUTH-AC3.4** For an authenticated request the request log line includes the user ID as `actor_id`. No log line contains a token. (BE05)

### AUTH-R4 · Logout and revocation API (T03, E04)
_As a signed-in user, I can end the session so its token stops working._

- **AUTH-AC4.1** WHEN an authenticated `POST /api/auth/logout` succeeds, THEN it returns 200 `{"data": null}` and `revoked_tokens` holds a row with the token's `jti` and its `exp` as `expires_at`. The token value is not stored. (Root AC02.3, D2)
- **AUTH-AC4.2** The revoked token then gets 401 `AUTH_REQUIRED` on every protected route, including a second logout and `GET /api/users/me`. (Root AC02.3)
- **AUTH-AC4.3** Logout revokes only the presented token. Another unexpired token for the same user keeps working.
- **AUTH-AC4.4** WHEN two logout requests with the same token pass the guard at once, THEN neither returns 500 and one revocation row exists.
- **AUTH-AC4.5** WHEN the revocation write fails, THEN the response is a sanitized 5xx envelope, the session is rolled back, and the token stays valid. The API never reports success for a revocation that did not persist.

### AUTH-R5 · Current user (T03 under P1, E30 read)
_As the protected shell, I can load the public user for a session._

- **AUTH-AC5.1** WHEN an authenticated `GET /api/users/me` runs, THEN it returns 200 `{"data": {"id", "name", "email"}}` with exactly those keys.
- **AUTH-AC5.2** Without a valid session it returns 401 `AUTH_REQUIRED` (AUTH-AC3.2). `PATCH /api/users/me` stays unimplemented until T12 and returns 405 with `Allow`.

### AUTH-R6 · Abuse limits and private caching (T03)
_As the API owner, I limit guessing attempts and keep private responses out of shared caches._

- **AUTH-AC6.1** `POST /api/auth/register` allows 5 requests per minute per client address, counted in process memory. (P2)
- **AUTH-AC6.2** `POST /api/auth/login` allows 20 requests per minute per client address and 5 per minute per normalized email taken from the body. Successful and failed attempts both count. A body without a usable email counts against the address limit only. (P2)
- **AUTH-AC6.3** WHEN a limit is exceeded, THEN the response is 429 `RATE_LIMITED` in the standard envelope with a non-empty `request_id` and a `Retry-After` header in seconds. The request is not processed, and the next request after the window succeeds.
- **AUTH-AC6.4** Limits are on by default. `RATE_LIMIT_ENABLED=false` turns them off for tests. IF `APP_ENV` is `production` and `RATE_LIMIT_ENABLED` is false, THEN `create_app()` raises a configuration error that names the variable and not its value. (BE08)
- **AUTH-AC6.5** Every response under `/api/` except E01 carries `Cache-Control: private, no-store`, including error responses. E01 is unchanged. (Root AC13.3, D2)
- **AUTH-AC6.6** The limiter checks prove local behavior only. Shared limiter storage and trusted client address handling are open production-release items in root T16 and `docs/DEPLOYMENT.md`. This slice does not claim them done. Counters are per Gunicorn worker. Local Compose runs one worker, so the stated limit is exact locally, and a live check on that stack records five 401s then 429 (evidence F-AUTH-11). With more workers the effective limit can be up to a multiple of the stated number, so more workers wait for shared storage (T16). Responses other than 429 carry no `Retry-After` (RFC 9110). (P2)

### AUTH-R7 · Request parsing and error envelope (T03)
_As a client developer, I get the same JSON envelope for every auth failure._

- **AUTH-AC7.1** A body that is not valid JSON, is not a JSON object, or is empty returns 400 `VALIDATION_ERROR` without `fields`. (P3)
- **AUTH-AC7.2** Domain, JWT and limiter errors use the shared envelope with `request_id`, and the log line carries the error code. Typed errors for this slice are `RequestValidationError` (400), `InvalidCredentialsError` and `AuthRequiredError` (401), `EmailAlreadyExistsError` (409), `ContentTooLargeError` (413), `UnsupportedMediaTypeError` (415) and `RateLimitedError` (429). (BE05)
- **AUTH-AC7.3** A database failure other than the known email uniqueness conflict returns the sanitized 500 envelope after a rollback. The response and the logs contain no SQL, driver message or parameter value.
- **AUTH-AC7.4** Other framework 4xx responses outside AUTH-AC7.1, 7.5 and 429 keep Flask's default response (see Open items).
- **AUTH-AC7.5** A JSON endpoint called without a `Content-Type` of `application/json` (parameters such as `charset=utf-8` are allowed) returns 415 `UNSUPPORTED_MEDIA_TYPE`. A body over 64 KiB returns 413 `CONTENT_TOO_LARGE`. The size check runs before field validation. Both use the JSON envelope with `request_id`. (P3, resolves foundation open item 4)

### AUTH-R8 · Browser session handlers (T04, E02–E04 on the Next origin)
_As the browser, I reach auth through same-origin handlers and never see the token._

- **AUTH-AC8.1** `POST /api/auth/register` on the Next origin forwards the JSON object to E02 and returns Flask's status and body (201, 400, 409 or 429). It sets no cookie.
- **AUTH-AC8.2** `POST /api/auth/login` forwards to E03. WHEN Flask returns 200, THEN the handler sets `revotask_session` and returns 200 `{"data": {"user": {...}}}`. The cookie value is the access token. The cookie is host-only: HttpOnly, `SameSite=Lax`, `Path=/`, no `Domain`. Its `Max-Age` is the smaller of `expires_in` and the whole seconds left until the token's `exp`, so it does not outlive the token. It is `Secure` whenever `APP_ORIGIN` is https (P4). The token appears in no response body and no header other than `Set-Cookie`. WHEN Flask returns 401, THEN the handler returns 401 `INVALID_CREDENTIALS` and leaves cookies unchanged. (Root AC02.1, AC02.2, D2)
- **AUTH-AC8.3** `POST /api/auth/logout`:
  - With a cookie and Flask 200: respond 200 `{"data": null}` and clear the cookie.
  - With a cookie and Flask 401: clear the cookie and respond 200 `{"data": null}`.
  - Without a cookie: respond 200 `{"data": null}`, clear the cookie, and make no upstream call (P9).
  - With an unreachable Flask, a timeout, a 5xx or a malformed reply: respond 503 `SERVICE_UNAVAILABLE`, keep the cookie, and report no completed logout. (Root AC02.3, D2)
- **AUTH-AC8.4** WHEN a handler receives a POST whose `Origin` header is absent or not exactly equal to `APP_ORIGIN`, THEN it returns 403 `FORBIDDEN` before any upstream call and without touching cookies. (P5, Root AC13.3, V13)
- **AUTH-AC8.5** The register and login handlers check the request before any upstream call. A `Content-Type` other than `application/json` returns 415 `UNSUPPORTED_MEDIA_TYPE`. A body over 64 KiB returns 413 `CONTENT_TOO_LARGE`. A body that is not a JSON object returns 400 `VALIDATION_ERROR`. A body with the wrong key set returns 400 `VALIDATION_ERROR` with `fields` (`Unknown field.` for an extra key, `Required.` for a missing one). Login accepts exactly `email` and `password`, and register accepts exactly `name`, `email` and `password`. The handlers check the key set only. Flask checks the values. Each handler calls one fixed Flask path from `API_BASE_URL`. It forwards no caller-supplied URL, `Authorization`, `Cookie` or other header. It forwards `X-Request-ID`, and the handler's response carries the same value. Upstream redirects are not followed and count as an upstream failure.
- **AUTH-AC8.6** Every handler response carries `Cache-Control: private, no-store`, and every upstream fetch uses `cache: 'no-store'`.
- **AUTH-AC8.7** WHEN Flask is unreachable, does not answer within 10 seconds, redirects, or returns a non-envelope or 5xx reply, THEN the handler returns 503 `SERVICE_UNAVAILABLE` with a fixed message and no upstream text. A Flask 429 passes through with its `Retry-After`.
- **AUTH-AC8.8** IF `API_BASE_URL` or `APP_ORIGIN` is missing or malformed, THEN the request returns the sanitized 500 envelope and the server log names the variable and not its value. `APP_ORIGIN` must be an https origin, or an http origin whose host is `localhost`, `127.0.0.1` or `[::1]` for explicitly configured loopback development. Any other http origin is malformed (P4). `next build` does not need either variable.

### AUTH-R9 · Typed errors and feedback (T04)
_As a form author, I handle every API failure through one typed path._

- **AUTH-AC9.1** `ApiError` carries `statusCode` (null for transport failures), `code`, `message`, optional `fields`, optional `requestId` and optional `retryAfterSeconds`. A helper builds it from any Next or Flask envelope. Network errors, timeouts and malformed replies get safe fixed copy. (error-handling.md)
- **AUTH-AC9.2** `useErrorHandler` maps errors as follows. Nothing is reported twice.

| Condition | Result |
|---|---|
| 400 with `fields` | Inline field errors. The first invalid field gets focus. Entered values stay. |
| 400 without `fields` | Form-level message. |
| 401 `INVALID_CREDENTIALS` | Generic form-level message. |
| 401 `AUTH_REQUIRED` | Clear client session state and hard-navigate to `/login?next=<current safe path>`. |
| 409 `EMAIL_ALREADY_EXISTS` | Inline error on the email field. |
| 413, 415 | Toast with fixed retry copy. These are client defects and the user cannot fix them. |
| 429 | Toast that states the wait from `retryAfterSeconds` when present. |
| 5xx, 503, transport failure | Toast with safe retry copy. |
| Aborted request | No feedback. |

- **AUTH-AC9.3** `lib/toast.ts` wraps react-hot-toast. One `Toaster` mounts at the app boundary, and the live region announces toasts.

### AUTH-R10 · Register and login pages (T04)
_As a visitor, I can register and sign in from forms that explain what went wrong._

- **AUTH-AC10.1** `/register` is a Server Component page with a client `RegisterForm`. It has exactly three labeled fields (name, email, password), a pending state, and inline errors. WHEN registration returns 201, THEN a success toast shows and the app navigates to `/login`. No cookie is set and the user stays signed out (A11). (Root AC01.1, AC01.2)
- **AUTH-AC10.2** `/login` is a Server Component page with a client `LoginForm` that has exactly two fields (email, password). A 401 shows the generic error and keeps the entered email. A 200 hard-navigates to the safe `next` path or `/`. (Root AC02.1, AC02.2)
- **AUTH-AC10.3** `safeRedirectPath()` resolves the value against a placeholder origin and accepts it only when the result stays on that origin and the raw value starts with a single `/`. It rejects `//host`, `/\host`, any scheme, control characters, values over 2,048 characters, and `/login` or `/register` targets. It keeps path and query, drops the fragment, and returns `/` for anything else. The login page validates `next` on the server before passing it to the form. The client 401 handler validates the path it writes. (P10)
- **AUTH-AC10.4** Forms use `noValidate` so the app's own messages show and not native browser bubbles. Every input has a label, an error is linked with `aria-describedby`, an invalid input has `aria-invalid`, and a form-level error uses `role="alert"`. While pending, the submit button is disabled and the form has `aria-busy`. (FE-C4, FE-S3)
- **AUTH-AC10.5** `/login` and `/register` never read the cookie and never redirect, so a stale cookie cannot cause a loop. A signed-in visitor who opens them sees the form. (D2)
- **AUTH-AC10.6** The pages are single-column and meet AUTH-R13 at 320, 375, 768 and 1280 px. (FE-S2, FE-S4)
- **AUTH-AC10.7** The UI validates before sending with one rules module that mirrors `design.md` §4.4: the same limits counted in Unicode code points, the same trim for `name` and `email`, the same lowercase for `email`, no trimming of `password`, and the same fixed messages. The request body has exactly the form's fields. A passing client check never replaces the API check, and server field errors still display. The same boundary cases run against the UI rules and the API schemas.
- **AUTH-AC10.8** The register password field shows the rules as visible help text linked to the input with `aria-describedby`. A password that breaks the rules shows the fixed message in the same place as the API's message and takes focus. The login form shows no password rules. (Revision 3, DD15)

### AUTH-R11 · Protected shell and session lifecycle (T04)
_As a signed-in user, I see private pages only while my session is valid._

- **AUTH-AC11.1** WHEN `/` is requested with no cookie, or with a token that Flask rejects with 401 (expired, revoked, malformed, unknown user), THEN the response redirects to `/login` before any private content renders. The cookie is not modified, because a Server Component cannot set cookies. (Root AC02.2, D2)
- **AUTH-AC11.2** WHEN the session is valid, THEN `/` renders the shell: the app name, the user's name, a Sign out control, and the placeholder body. `AuthContext` holds the public user `{id, name, email}` only. It holds no token, hash or other field. (P7)
- **AUTH-AC11.3** WHEN Flask is unreachable or returns 5xx during the session check, THEN the app does not redirect to login. A visible error state with a retry action renders. The cookie stays.
- **AUTH-AC11.4** Sign out calls the logout handler. On success the app hard-navigates (replace) to `/login`. On failure a toast shows, the user stays signed in on the page, and Sign out can be retried. (Root AC02.3)
- **AUTH-AC11.5** After a successful sign out, Back does not reveal private content. A protected request with no cookie redirects to `/login`, and a page restored from the browser's back-forward cache is re-checked on `pageshow`. (Root AC02.3)
- **AUTH-AC11.6** The JWT is never readable by browser code. It is absent from `AuthContext`, local and session storage, the DOM, any non-HttpOnly cookie and the client bundle. (Root AC13.3, FE-A1)
- **AUTH-AC11.7** A sentinel value set as `API_BASE_URL` or `APP_ORIGIN` at build time does not appear under `.next/static`. A client module cannot import a `lib/server/*` module.
- **AUTH-AC11.8** The shell header stays usable on a phone: the app name, user name and Sign out wrap or truncate and meet AUTH-R13. (FE-S2, FE-S4)
- **AUTH-AC11.9** The `(protected)` layout renders the shell and is not the authorization boundary. Every protected page and every server-side data or action helper verifies the session through `lib/server/session.ts`. A repository test fails when a page under `(protected)` does not. (P8)

### AUTH-R12 · Verification and handoff (T03, T04)
_As the project owner, I can see which checks ran and which documents changed._

- **AUTH-AC12.1** From `backend/`, `ruff check .`, `ruff format --check .` and `pytest -v` pass. The foundation tests still pass. Two foundation tests changed because this slice changes the behavior they asserted (the bare 400 in `test_errors.py`, the route list in `test_factory.py`), each with its reason in the test.
- **AUTH-AC12.2** From `frontend/`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass.
- **AUTH-AC12.3** A local run of Flask on port 5001 and Next on port 3000 shows each auth state with real HTTP: exact form fields (extra and missing fields rejected at Next and at Flask), register, invalid credentials, login with cookie flags, protected render, protected redirect, expired and revoked tokens, logout with replay rejected, unsafe `next` values, and cross-origin and absent-Origin rejection. Rate-limit results are recorded as local behavior only. The sanitized results are in `evidence/authentication-T03-T04.md`.
- **AUTH-AC12.4** The documentation checkpoint covers every file named in design §10, uses only verified facts, and records pending items as pending.
- **AUTH-AC12.5** T03 is checked in `specs/tasks.md` only when AUTH-R1 to AUTH-R7 are verified, and T04 only when AUTH-R8 to AUTH-R11 are verified. Anything partial or blocked stays open.

### AUTH-R13 · Mobile responsiveness (T04)
_As a user on a phone, I can register, sign in, see the shell and sign out without zooming or sideways scrolling._

- **AUTH-AC13.1** At viewport widths of 320, 375, 768 and 1280 px, `/login`, `/register`, `/` (the shell), the error state and a visible toast cause no horizontal page scroll: `document.documentElement.scrollWidth` is not greater than `clientWidth`. (Root AC13.1, FE-S4)
- **AUTH-AC13.2** Every interactive control (inputs, submit buttons, Sign out, Try again, and any link) has a tappable area of at least 44 by 44 CSS px. The area is the element's rendered box from `getBoundingClientRect()`, measured at 320, 375, 768 and 1280 px, and `document.elementFromPoint` at its center returns that element or one of its children. Text inputs compute to a font size of at least 16 px. Class names alone do not satisfy this criterion. (FE-S5)
- **AUTH-AC13.3** Pinch zoom stays enabled: the viewport metadata has no `maximum-scale` and no `user-scalable=no`. (FE-S4)
- **AUTH-AC13.4** Classes are mobile-first, with wider-screen rules behind `sm:` and `md:`. Full-height containers use `min-h-dvh`, and the foundation's `min-h-screen` in `app/layout.tsx` and the placeholder page is replaced. A long name, a long email and a long server message wrap or truncate and do not widen the page. (FE-S4)
- **AUTH-AC13.5** At 320 px a toast fits inside the viewport, and a field focused after a validation error is visible on screen. (FE-S4)
- **AUTH-AC13.6** A repository test fails when a source file under `app/`, `components/` or `hooks/` contains `h-screen`, `min-h-screen`, `100vh`, `user-scalable`, `maximum-scale`, or an unprefixed fixed width above 320 px (`w-[…px]`, `min-w-[…px]`). This guard is a heuristic that catches regressions in later slices, and it does not prove a layout works.
- **AUTH-AC13.7** The evidence file records each width-by-route result, the browser and version, and whether the run used a device emulator or a real device. (FE-S6)

## Traceability

Native task numbers refer to `tasks.md`. Verification IDs are defined in design §8. Root test IDs cover the whole project, and this slice contributes only the parts noted.

| Requirement | Acceptance criteria | API / UI surface | Native tasks | Verification | Root test (partial) |
|---|---|---|---|---|---|
| AUTH-R1 | 1.1–1.6 | E02 Flask | 1.5, 1.6, 1.11 | AUTH-V1 | V01 |
| AUTH-R2 | 2.1–2.5 | E03 Flask | 1.5, 1.7, 1.11 | AUTH-V1 | V02 |
| AUTH-R3 | 3.1–3.4 | `@token_required` | 1.3, 1.11 | AUTH-V2 | V02 |
| AUTH-R4 | 4.1–4.5 | E04 Flask, `revoked_tokens` | 1.8, 1.11 | AUTH-V2 | V02 |
| AUTH-R5 | 5.1–5.2 | E30 read | 1.9, 1.11 | AUTH-V2 | V07 (read part) |
| AUTH-R6 | 6.1–6.6 | E02, E03 limits, all `/api/` headers | 1.4, 1.10, 1.11, 3.1 | AUTH-V3, AUTH-V9 | V13 (no-store) |
| AUTH-R7 | 7.1–7.5 | Shared envelope | 1.2, 1.11 | AUTH-V3 | V02 |
| AUTH-R8 | 8.1–8.8 | Next `/api/auth/*` | 2.3, 2.4, 2.5, 2.10 | AUTH-V4, AUTH-V6 | V02, V13 |
| AUTH-R9 | 9.1–9.3 | `ApiError`, `useErrorHandler`, toast | 2.2, 2.6, 2.10 | AUTH-V4, AUTH-V5 | V02 |
| AUTH-R10 | 10.1–10.8 | `/register`, `/login` | 1.5, 2.6, 2.7, 2.8, 2.10, 2.11 | AUTH-V5, AUTH-V7 | V01, V02 |
| AUTH-R11 | 11.1–11.9 | Protected shell on `/` | 2.9, 2.10, 2.11 | AUTH-V5, AUTH-V6, AUTH-V7, AUTH-V8 | V02, V13 |
| AUTH-R12 | 12.1–12.5 | Evidence, docs | 1.11, 2.10, 2.11, 3.1, 3.2 | AUTH-V9 | V15 (partial) |
| AUTH-R13 | 13.1–13.7 | `/login`, `/register`, `/` shell, `app/error.tsx`, toasts | 2.6, 2.7, 2.8, 2.9, 2.10, 2.11 | AUTH-V5, AUTH-V7 | V11 |

**Root acceptance criteria touched.**

| Root AC | This slice delivers | Stays open |
|---|---|---|
| AC01.1, AC01.2 | AUTH-R1, AUTH-AC10.1 | none after verification |
| AC02.1 | AUTH-AC2.1, 8.2, 10.2 | The dashboard content (T06). Login opens the protected shell at `/`. |
| AC02.2 | AUTH-AC2.2, R3, 11.1 | none after verification |
| AC02.3 | AUTH-R4, 8.3, 11.4, 11.5 | Playwright back-navigation proof (T15, V09) |
| AC12.1 | AUTH-R5 (read) | E31, the profile UI and context refresh (T12) |
| AC13.1 | AUTH-R13 for the auth surface, in this slice | The same check in every later UI slice (FE-S6), the Playwright 375 px run (T15), the live mobile walkthrough (T16) |
| AC13.3 | AUTH-AC6.5, 8.4, 8.6, 11.6, 11.7 for the auth surface | The same checks on later handlers (T05+), V13 full run (T15), live cookie flags and the shared limiter decision (T16) |
| AC14.1 | Local register and login (E02, E03) | Live Render checks (T16) |

## Decisions confirmed in review

| # | Decision | Effect on this spec |
|---|---|---|
| P1 | **Accepted.** The existing `GET /api/users/me` (E30) read moves to T03 so the protected frontend can load the current user. E31 and the profile UI stay in T12. | AUTH-R5, task 1.9. Root `specs/tasks.md` (T03, T04, T12) and `specs/traceability.md` updated. |
| P2 | **Accepted for local development.** The proposed Flask-Limiter thresholds with in-memory storage. Shared storage and trusted client address handling are tracked for the production release. Local checks prove local behavior only. | AUTH-R6, AUTH-AC6.6, A10, Open items 1–2. Root T16, `docs/DEPLOYMENT.md` and `specs/design.md` D2 updated. |
| P3 | **Revised.** 400 `VALIDATION_ERROR` for malformed JSON, 415 `UNSUPPORTED_MEDIA_TYPE` for an unsupported content type, 413 `CONTENT_TOO_LARGE` for an oversized body. JSON envelope kept. | AUTH-AC7.1, 7.5, AUTH-AC8.5, AUTH-AC9.2. `docs/API.md`, `backend/specs/api-contract.md`, `frontend/specs/error-handling.md` and `docs/TEST-PLAN.md` updated. |
| P4–P5 | **Accepted with boundaries.** Flask issues and verifies the JWT. The same-origin Route Handler stores it in the host-only `revotask_session` cookie (HttpOnly, `SameSite=Lax`, `Path=/`, expiry no later than the JWT). `Secure` is required on deployed https. Plain http is allowed only for an explicitly configured loopback origin. Browser responses and `AuthContext` carry only the public user. Next forwards the token to Flask as a bearer token on the server. A missing or mismatched `Origin` on a browser auth mutation returns 403 against `APP_ORIGIN`. | AUTH-AC8.2, 8.4, 8.8, AUTH-AC11.6. `specs/design.md` D2, `frontend/specs/api-integration.md` and `docs/DEPLOYMENT.md` updated. |
| P6–P8 | **Accepted.** Vitest, HTTP smoke checks and a manual browser check in this slice. Playwright stays in T15. `/` is protected, `/login` and `/register` are public, and session verification is centralized close to protected data and actions. The `(protected)` layout renders the shell. Authorization is checked at the data boundary. | AUTH-AC11.9, design DD6, tasks 2.9, 2.11. |
| P9–P10 | **Accepted.** Browser logout is idempotent when the cookie is absent or the session is already invalid. A valid JWT is revoked in Flask, then the cookie is cleared. If revocation fails upstream the session stays and retry feedback shows. Server redirects use `/login`. `next` is accepted only when it resolves to a safe same-origin path, otherwise login lands on `/`. | AUTH-AC8.3, AUTH-AC10.3, AUTH-AC11.4. `frontend/specs/api-integration.md` and `docs/API.md` updated. |
| Forms | **Decided.** Login accepts exactly `email` and `password`. Registration accepts exactly `name`, `email` and `password`, then redirects to `/login` with the user signed out. The UI and API schemas share field rules. Unexpected fields are rejected. Email is normalized the same way everywhere. The password is preserved as entered. | AUTH-AC1.3, 2.4, 8.5, AUTH-AC10.1, 10.2, 10.7. `docs/API.md` E02 and E03 updated. |
| P11 | **Revised (revision 3).** The register password policy is 8 to 128 characters with an uppercase letter, a lowercase letter and an ASCII special character. Before, it was 12 to 128 characters, which the owner judged too long. The 128 maximum is kept. Login accepts 1 to 128 characters and no composition rule, so existing or mistyped passwords get the normal 401. | AUTH-AC1.3, AUTH-AC2.4, AUTH-AC10.7, AUTH-AC10.8, DD15. `specs/design.md` D2, `docs/API.md` E02 and E03, `docs/USER_GUIDE.md`, `backend/specs/api-contract.md`, `frontend/specs/pages-and-components.md`, `docs/TEST-PLAN.md` V01 updated. Shared case file revised. |
| Layout | **Decided.** Follow the existing monorepo layout (no `src/` directory exists). Flask keeps `create_app()` in `backend/app/`, the auth Blueprint in `backend/app/blueprints/auth/` (`routes.py`, `service.py`, `schema.py`), and models, migrations and tests where they are. Next uses route groups for public and protected pages, `app/api/auth/` for Route Handlers and `lib/server/` for session and upstream helpers. | `design.md` §3. |

## Changes to review

New or refined items since the first draft that go beyond the decisions above. Each can be reversed in review.

| # | Change | Why |
|---|---|---|
| C1 | The Next register and login handlers also return 413 and 415 before calling Flask, with the same 64 KiB constant. | The decision names the statuses for the API. The browser-facing handler should not need Flask to answer them. |
| C2 | The cookie `Max-Age` is the smaller of `expires_in` and the seconds left until the token's `exp`. The handler reads `exp` from the token payload without verifying it, because Flask already did. | "Expiry no later than the JWT" is not met by `Max-Age = expires_in` alone, since the response takes time to arrive. |
| C3 | A plain-http `APP_ORIGIN` is accepted only for `localhost`, `127.0.0.1` and `[::1]`. Any other http origin makes the handlers fail closed with a sanitized 500. | This is how "explicitly configured loopback development" becomes checkable. |
| C4 | `safeRedirectPath` resolves against a placeholder origin. The same function runs on the server and the client. | One rule for `next` that does not depend on environment variables. |
| C5 | The UI counts lengths in Unicode code points and does not use `minLength` or `maxLength` attributes. | HTML attributes count UTF-16 units and would reject a 128-character password that contains emoji, which the API accepts. |
| C6 | A repository test fails when a page under `(protected)` does not call the session helper. | Turns the "check at the data boundary" rule into something the build can enforce. |
| C7 | Password hashing lives in `auth/service.py`, not a fourth file. `app/(public)` replaces `app/(auth)`. Auth UI lives in `components/auth/`, shared UI in `components/shared/`. | Matches the folder instructions. |
| C8 | Root T16 gets a clause for the shared limiter store and trusted client address handling. | Tracks the P2 production items where the release work is planned. |
| C10 | AUTH-R13 is new, and it sets 44 px touch targets (stricter than WCAG 2.2 AA's 24 px) and 16 px inputs. A regex guard test scans for mobile-hostile patterns, and a manual width-by-route check records the rest. | You asked for mobile to hold in every feature. jsdom cannot measure layout, and Playwright stays in T15 (P6). The guard test keeps later slices from regressing in the meantime. |
| C11 | The password hint is visible help text under the register password field, linked with `aria-describedby`. Its wording lists the same rules as the messages. The composition rule is ASCII only, and a space is not special. The shared case file uses `Horse-Battery-42` as its valid base password. | The owner asked for the rule to be stated in the frontend. Visible text is the only way a user learns the rule before submitting. An ASCII-only rule makes the Python and TypeScript character sets identical, so no font or keyboard decides what counts. |
| C9 | A shared boundary-case file, `specs/fixtures/auth-field-cases.json`, is read by the Flask schema tests and the `authRules.ts` tests. | Keeps the two implementations of the field rules from drifting. Placing it under `specs/` marks it as part of the field contract. |

## Assumptions

Routine choices taken from project references and steering. Each can be reversed in review.

| ID | Assumption | Why |
|---|---|---|
| A1 | Password length counts Unicode code points (Python `len`). | `API.md` says 8–128 after revision 3 and "preserve password bytes as entered" without defining the unit. |
| A2 | Name keeps internal whitespace. Only the ends are trimmed. Email is lowercased in full. | `API.md` says trim, and D2 says trim and lowercase. The database `CHECK` requires `lower(btrim(email))`. |
| A3 | Password hashing uses `argon2-cffi` defaults (Argon2id, RFC 9106 low-memory profile). No tuning. | D2 asks for Argon2id through a maintained library without parameters. The parameters used are recorded in evidence. |
| A4 | Access token lifetime is the constant 3600 seconds. There is no refresh. | D2 sets 60 minutes. |
| A5 | A valid token whose `sub` has no user row is a 401. Users cannot be deleted in v1, but a reset development database leaves old cookies valid by signature. | Fails closed. |
| A6 | `MAX_CONTENT_LENGTH` is 64 KiB for the whole API. | A 2,000-character comment can reach about 12 KiB after JSON escaping. 64 KiB leaves room and bounds memory. |
| A7 | The Next handlers time out Flask calls after 10 seconds. | Render's cold start can take several seconds. No baseline number exists. |
| A8 | The Next side generates `X-Request-ID` as a UUID with hyphens. | It matches the 1–64 character rule in FND-AC7.7. |
| A9 | The session cookie stays until it expires, a login overwrites it, or logout clears it. A Server Component that sees a stale cookie leaves it. | Cookie writes belong to Route Handlers (D2). |
| A10 | Rate-limit keys use the address Flask sees (`request.remote_addr`). Trusted-proxy handling is not configured here. | Local behavior only. See Open items 1. |
| A11 | Registration does not sign the user in. | AC01.1: "the UI sends me to login". |
| A13 | The UI and the API use the same normalization: trim `name` and `email`, lowercase `email`, keep `password` untouched. The UI uses `trim()` and `toLowerCase()`, and Flask's returned user is what the UI displays afterwards. Flask is authoritative if the two differ on an unusual Unicode character. | Python and JavaScript define whitespace and case folding slightly differently. |
| A14 | The Next register and login handlers read the body with a byte cap equal to Flask's `MAX_CONTENT_LENGTH` and stop reading once it is exceeded. | A `Content-Length` header alone can be absent or wrong. |
| A15 | Loopback hosts for a plain-http `APP_ORIGIN` are `localhost`, `127.0.0.1` and `[::1]`. | These are the hosts the foundation setup and Docker Compose use for local runs. |
| A12 | New dependencies are `argon2-cffi`, `marshmallow` and `Flask-Limiter` (backend) and `react-hot-toast`, `server-only` and `@testing-library/user-event` (frontend, dev only for the last). Exact pins are set at install. A dry run with `--only-binary=:all:` on CPython 3.14.5 resolved argon2-cffi 25.1.0, marshmallow 4.4.0 and Flask-Limiter 4.1.1 from wheels. Nothing was installed. | Foundation A6 deferred these to T03 and T04. Marshmallow 4 and Flask-Limiter 4 were not exercised, so task 1.1 keeps the stop-and-report rule. |

## Open items

No unresolved decision blocks design or tasks. Seven items stay open and are tracked, not assumed away:

1. **Client address behind proxies (tracked, T16).** Browser traffic reaches Flask from Vercel's servers through Render's proxy. The per-address limits therefore act as a ceiling per egress address, and the per-email login limit is the real brute-force control. Trusted-proxy handling is a production-release decision.
2. **Limiter state per worker (tracked, T16).** In-memory counters reset on restart and are not shared between Gunicorn workers. Local Compose runs one worker, so the limits are exact there. The image default of two workers would admit up to ten attempts (F-AUTH-11). Shared storage is needed before more workers run in production.
3. **Revoked-token cleanup.** No job deletes expired rows. Add one when the table size matters.
4. **Other framework 4xx responses** (for example 406, 414) keep Flask defaults. Only the cases in AUTH-AC7.1, 7.5 and 429 are converted.
5. **Back-navigation behavior varies by browser.** `no-store` and the `pageshow` re-check are the design. Task 2.11 records what a real browser did. Playwright proof is T15.
6. **Marshmallow 4 and Flask-Limiter 4 behavior** (error message shape, `Retry-After` on error responses, `before_request` ordering) is verified in tasks 1.1, 1.5 and 1.10, not assumed.
7. **Live cookie flags and live rate limiting** are verified in T16.
