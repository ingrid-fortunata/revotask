# Authentication evidence · T03–T04

**Scope:** Native spec `.kiro/specs/authentication/` (requirements, design, tasks). Root tasks T03 and T04.

**State:** Local implementation and verification. Revision 3 (password policy) and revision 4 (local rate limit, one worker) are below. Both were verified on the final code and stacks. The change is uncommitted in the working tree. No GitHub, Render, Vercel or Supabase step was run. Every live check used `127.0.0.1` or `localhost`.

**Environment:** macOS, zsh. Python 3.14.5 (`backend/.venv`). Node.js 24.22.1. PostgreSQL 16.14 on `127.0.0.1:5432`. Docker Desktop 29.9.2 (Flask ran as the Compose image on port 5001). Google Chrome 157.0.8103.51, headless, with device emulation. **No real phone was used.**

## Result summary

| Area | Result |
|---|---|
| Backend `ruff check .` and `ruff format --check .` | Pass (64 files formatted) |
| Backend `pytest` | **431 passed** in the final run (foundation had 186; 245 are new). The rate-limit file alone passed 17 of 17 in a fresh process |
| Backend race test (8 simultaneous registrations of one email) | Passed 5 of 5 consecutive runs, and again in the final full runs. The simultaneous-logout test passed too |
| Backend Docker image rebuilt with the new dependencies | Builds. `GET /api/health` 200. `POST /api/auth/register` with `{}` returns the 400 envelope. A `text/plain` body returns 415 |
| Frontend `npm run lint`, `typecheck` | Pass |
| Frontend `npm test` (Vitest) | **446 passed in 31 files** (foundation had 1) |
| Frontend `npm run build` | Pass. Routes: `/` (dynamic), `/login` (dynamic), `/register` (static), `/api/auth/{register,login,logout}` (dynamic), `/_not-found` |
| `npm audit --omit=dev` | 0 vulnerabilities. The seven dev-only moderate advisories from foundation are unchanged and untouched |
| HTTP smoke (`evidence/authentication-http-smoke.py`) | **75 of 75 checks pass** against real Flask (5001, one Gunicorn worker) and a production Next server (3100) |
| Real-browser check (`evidence/authentication-mobile-measure.mjs`) | **96 of 96 checks pass** in the final run (revision 4 stack) |
| Build checks | Sentinel absent from `.next`. Negative control fails as designed |

Raw outputs: `evidence/authentication-T03-T04-http-smoke.txt` and `evidence/authentication-T03-T04-browser-check.txt`. Throwaway emails and UUIDs are replaced. Tokens, passwords and cookie values were never printed.

## Commands and versions

Backend, from `backend/` with the venv active: `pip install argon2-cffi marshmallow Flask-Limiter`, `ruff check .`, `ruff format --check .`, `pytest -q`. Frontend, from `frontend/`: `npm install --save-exact react-hot-toast server-only`, `npm install --save-dev --save-exact @testing-library/user-event`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm audit --omit=dev`.

New backend pins in `requirements.txt`: `argon2-cffi==25.1.0`, `marshmallow==4.4.0`, `Flask-Limiter==4.1.1`. Their transitive additions in the venv: `argon2-cffi-bindings==26.1.0`, `cffi==2.1.1`, `Deprecated==3.0.1`, `limits==5.8.0`, `ordered-set==4.1.0`, `pycparser==3.12`, `wrapt==2.5.2`. All installed as cp314 wheels, so the stop-and-report rule in task 1.1 was not triggered. New frontend pins: `react-hot-toast@2.6.1`, `server-only@0.0.1`, `@testing-library/user-event@14.6.10` (dev).

Password hashing (task 1.5): `argon2-cffi` defaults, Argon2id, version 19, `m=65536, t=3, p=4`, 16-byte salt, 32-byte hash. One local sample: 41 ms to hash and 38 ms to verify.

## Acceptance criteria and where each was verified

| Criteria | Automated | Real HTTP or browser |
|---|---|---|
| AUTH-AC1.1–1.6 register | `test_auth_register.py` (35), `test_auth_schema.py` (62) | Smoke 1: 201 shape, padded mixed-case email, 409, no cookie |
| AUTH-AC2.1–2.5 login | `test_auth_login.py` (22), `test_auth_passwords.py` (7) | Smoke 2–3 |
| AUTH-AC3.1–3.4 guard | `test_auth_guard.py` (22) | Smoke 5 |
| AUTH-AC4.1–4.5 logout | `test_auth_logout.py` (8) | Smoke 6–7 |
| AUTH-AC5.1–5.2 `GET /api/users/me` | `test_users_me.py` (6) | Smoke 4 |
| AUTH-AC6.1–6.5 limits and caching | `test_rate_limit.py` (14), `test_response_headers.py` (5) | Smoke 10. **Local behavior only** (AUTH-AC6.6) |
| AUTH-AC7.1–7.5 body errors | `test_validation.py` (14), `test_errors.py` | Smoke 1 (400, 413, 415 at Next and at Flask) |
| AUTH-AC8.1–8.8 handlers | Three `route.test.ts` files (21 login, 15 logout, 13 register), and `bff` (30), `origin` (11), `sessionCookie` (24), `env` (21), `flask` (11) tests | Smoke 1, 3, 6, 8 |
| AUTH-AC9.1–9.3 errors | `errors` (21), `apiClient` (10), `useErrorHandler` (17), `ToasterHost` tests | Browser D (toast) |
| AUTH-AC10.1–10.7 forms | `LoginForm` (12), `RegisterForm` (14), `pages` (13), `authRules` (71, of which 61 are the shared cases), `public.guard` (4) tests | Browser B and C |
| AUTH-AC11.1–11.9 shell | `session` (13), `layout` (2), `AppHeader` (4), `LogoutButton` (3), `SessionRevalidator` (4), `error` (3), `AuthContext` (4), `pages.guard` (4) tests | Smoke 4–8, browser C–E |
| AUTH-AC13.1–13.7 mobile | `FormField` (4), `BaseButton` (4), `AppHeader`, `ToasterHost` (3) class tests, `mobileGuard.test.ts` (40) | Browser A and D |

## Exact form fields

- Flask register and login schemas use `unknown=RAISE`. Next handlers compare the key set before calling Flask. The forms render exactly three (register) and two (login) inputs, and a test asserts the input `name` attributes and the request body keys.
- Shared cases: `specs/fixtures/auth-field-cases.json` holds 42 register and 19 login cases (61 in all). The Flask schema tests and the `authRules.ts` tests each ran all 61, and they agreed on every case. Revision 3 changed the password cases and needed no other correction.
- Smoke 1 confirmed extra and missing fields are rejected at Next (`Unknown field.`, `Required.`) and extra fields at Flask.

## Cookie flags (smoke 3 and browser C)

`Set-Cookie: revotask_session=<redacted>; Path=/; Max-Age=3599; HttpOnly; SameSite=Lax`. No `Domain`. No `Secure` on the loopback http origin. Chrome reported: `httpOnly: true`, `sameSite: Lax`, `path: /`, `domain: localhost` (host-only), `secure: false`. `document.cookie` did not show the session cookie, and `localStorage` and `sessionStorage` were empty. The token appeared in no response body and in no header except `Set-Cookie`, and not in the signed-in page HTML or DOM. Unit tests cover `Secure` on https, the clearing cookie, and the lifetime bound by the token's `exp`.

## Mobile (AUTH-R13), measured in Chrome 157 headless with device emulation

Measured per control with `getBoundingClientRect()`, plus `document.elementFromPoint` at the center of each control, as FE-S5 and AUTH-AC13.2 require.

| Route | 320 px | 375 px | 768 px | 1280 px | Controls measured | Smallest tappable area |
|---|---|---|---|---|---|---|
| `/login` | scroll 320/320 | 375/375 | 768/768 | 1280/1280 | 4 | 44 px |
| `/register` | 320/320 | 375/375 | 768/768 | 1280/1280 | 5 | 44 px |
| `/` signed in, 80-character name | 320/320 | 375/375 | 768/768 | 1280/1280 | 1 | 44 px |
| `/` error state (Flask stopped) | 320/320 | 375/375 | 768/768 | 1280/1280 | 1 | 44 px |

The cells are `scrollWidth/clientWidth`. At every width and route: no horizontal page scroll, every control at least 44 by 44, `elementFromPoint` at each center returned the control, text inputs computed to at least 16 px, the 80-character name truncated inside the viewport, and a toast stayed inside the viewport (at 320 px it spanned left 68 to right 269). The 64-character email was used in the account. Tab order on `/login` was email, password, Sign in, Create an account. An empty submit moved focus to the email field, which was inside the visible area. **Not covered:** the on-screen keyboard (needs a real device) and any real phone.

## Session flows (smoke and browser)

- **Invalid credentials:** a wrong password and an unknown email returned the same 401 body apart from `request_id`, with no `Set-Cookie`.
- **Expired and revoked sessions:** a minted expired token returned 401 at Flask and a 307 to `/login` at Next. A tampered cookie gave a 307 on `/` and a 200 on `/login` and `/register`. After logout the old token returned 401 at Flask and 307 at Next.
- **Logout:** without `Origin` 403 with the session intact. With `Origin`, 200 `{"data": null}` and the cookie cleared (empty value, `Max-Age=0`, `Path=/`, no `Domain`). With no cookie, and with an already revoked cookie, 200 and cleared.
- **Upstream failure:** with Flask stopped, `GET /` returned 500 with no redirect and no internals in the HTML, logout returned 503 with the cookie kept, and login returned 503 with no cookie. After Flask returned, the same cookie worked. In the browser the failed sign out left the user on the page with the button enabled and a toast, and the cookie stayed.
- **Unsafe redirects:** for `next` of `//evil.example`, `https://evil.example`, `/\evil.example` and `/login`, the form received `redirectTo` of `/`. For `/boards/abc` it received that path. In Chrome, signing in with `next=//evil.example` landed on `/` of this site, and `next=/?from=next` landed there.
- **Back after sign out:** the sign out did a full load of `/login`, no private content showed, and Back to an earlier private URL ended on `/login` with the cookie gone.
- **Rate limit (corrected in revision 3, fixed in revision 4):** the earlier note said five wrong-password logins returned 401 and the sixth returned 429. That was a lucky split of requests between two Gunicorn workers. Each worker keeps its own in-memory counter, so the real limit with the image default of two workers is up to 10 attempts before a 429 is certain. Revision 3 measured 14 direct attempts that returned a mix of 401 and 429. The smoke now requires a 429 within 12 attempts. See finding F-AUTH-11 and open item 8. Revision 4 fixed the local limit (below).

## Build checks (task 2.10)

- `API_BASE_URL` and `APP_ORIGIN` were set to sentinel values at build time. The sentinel string was found nowhere under `.next`, and a control search found known page text, so the search covered the output. No server variable name or `revotask_session` appears under `.next/static`.
- Negative control: a client component importing `lib/server/flask` made `next build` fail with the `server-only` error. After removing it the build passed.

## Findings from the checks

| ID | Where | Finding | Resolution | Verified by |
|---|---|---|---|---|
| F-T03-01 | `app/auth_guard.py` | Flask-JWT-Extended returns 422 and its own body for an invalid token | All five library callbacks return 401 `AUTH_REQUIRED` | `test_auth_guard.py` (22 cases) |
| F-T03-02 | `app/auth_guard.py` | PyJWT does not require `exp`, so a token without one never expires | The guard rejects a token with no numeric `exp`. A non-UUID `jti` counts as revoked | `test_token_missing_a_required_claim...`, `..._non_uuid_jti...` |
| F-T03-03 | `tests/conftest.py` | The session-scoped `schema_at_head` ran once, early (auth tests sort first). The foundation migration tests then dropped the schema and 26 later tests failed | The fixture checks the Alembic version for every test (one query) and rebuilds only when needed | Full suite, 382 passed |
| F-T03-04 | Design DD11 | I had claimed the limiter must be initialized after the request-ID hook. A negative control showed Flask-Limiter checks decorator limits in the view wrapper, so the order does not matter for them | DD11 and the code comment corrected. The order is kept for default limits | `test_rate_limit.py`, negative control run |
| F-T03-05 | `test_factory.py`, `test_errors.py` | Two foundation tests asserted behavior this slice changes (only the health route exists, and HTML for a bare 400) | Updated, with the reason in each test | Full suite |
| F-T04-01 | `lib/server/bff.ts` | A body with a `__proto__` key slipped past the key-set check, because assigning that key sets the prototype. The same risk was in `authRules.ts` | Both use entries and `Object.fromEntries`, and both have a test | `bff.test.ts`, `authRules.test.ts` |
| F-T04-02 | Login handler | `NextResponse.cookies.set` also copies the token into an `x-middleware-set-cookie` header | `Set-Cookie` is written by hand, and a test asserts exactly one header carries the token | `login/route.test.ts`, smoke 3 |
| F-T04-03 | `lib/navigation.ts` | Found in self-review before testing: `hardRedirect` used the validator that rejects `/login`, so every session-expired redirect would have gone to `/` | Split into `safeLocalPath` (for navigation) and `safeRedirectPath` (for `next`, rejecting login and register) | `safeRedirect.test.ts`, `navigation.test.ts`, `useErrorHandler.test.tsx` |
| F-T04-04 | `app/error.tsx` | In Next 16.4, `reset()` re-renders without re-fetching, so Try again could not recover from a failed server load. Found by the real-browser run, where the script timed out waiting for the shell | The button calls `retry()`. A test asserts `retry` and not `reset`. The browser run then passed, including recovery | `error.test.tsx`, browser D |
| F-T04-05 | `app/error.tsx` | The error state renders client-side. The server returns 500 with an empty HTML shell, so with JavaScript off the page is blank | Not changed. Recorded as a known limitation | Observed with `curl` in smoke 8 and in the browser run |
| F-T04-06 | Tests | `beforeEach(() => mock.mockReset())` returns the mock, which Vitest then calls as cleanup. In one test that call threw | Rewritten with braces | `layout.test.tsx` |
| F-T04-07 | Smoke script | Three "unsafe redirect" checks failed at first. The page contained the string `evil.example` only inside Next's router payload, which echoes the request URL | The check now reads the `redirectTo` prop. This was a flaw in the check, not in the product | Smoke 9 |
| F-T04-08 | Environment | Port 3000 was held by a `next-server` I did not start | Left alone. The smoke used port 3100 with `APP_ORIGIN` set to match | `lsof` output |
| F-T04-09 | Residue | The browser script left two `revoked_tokens` rows in the dev database | The script now deletes its own tokens. I removed the two rows. A rerun left 0 users and 0 tokens | Database counts after the run |
| F-T04-10 | `next-env.d.ts` | `next build` rewrote this generated file | Restored to the committed version. Typecheck still passes | `git diff`, `npm run typecheck` |

## Deviations from the spec, all recorded in the native `design.md`

- Email format is one shared regular expression instead of Marshmallow's `Email` validator (design §4.4).
- `NextResponse.cookies` is not used (F-T04-02).
- `safeRedirectPath` and the new `safeLocalPath` live in `lib/safeRedirect.ts`, created in task 2.6 because `hardRedirect` needs them. Task 2.7 holds their tests.
- The mobile guard test and the protected and public page guard tests were added (`lib/mobileGuard.test.ts`, `app/(protected)/pages.guard.test.ts`, `app/(public)/public.guard.test.ts`).
- Vitest got an `@` alias, a `matchMedia` stub and a React Testing Library cleanup hook in the shared setup.

## Revision 3: password policy (8 characters, uppercase, lowercase and special)

**Change:** register now needs 8 to 128 characters with at least one ASCII uppercase letter, one ASCII lowercase letter and one ASCII special character. The minimum was 12. The maximum stays 128. Login accepts 1 to 128 characters and has no composition rule. Specs: `requirements.md` P11, AUTH-AC1.3, AUTH-AC2.4, AUTH-AC10.8; `design.md` DD15 and §4.4; changelog entry in `specs/CHANGELOG.md`.

**Where it applies:** `backend/app/blueprints/auth/schema.py` (Flask), `frontend/lib/authRules.ts` (the form), `frontend/components/shared/FormField.tsx` (the hint prop) and `RegisterForm.tsx` (the visible hint, linked with `aria-describedby`). The shared case file `specs/fixtures/auth-field-cases.json` drives both test suites.

**Results (revision 3 run):**

| Check | Result |
|---|---|
| Backend `ruff check`, `ruff format --check` | Pass |
| Backend `pytest` | 428 passed. New: every ASCII punctuation character counts as special (32 cases), space and non-ASCII symbols do not, length message first when both rules fail, login accepts `abc` and returns 401 |
| Frontend lint, typecheck, Vitest | Pass. 446 tests in 31 files. New: hint linked to the input, composition message and focus, an 8-character password accepted and sent unchanged, the same rules as the shared cases |
| Frontend `next build` with sentinel values | Pass. The sentinel was absent from `.next`. The composition message appears in the client bundle, as expected, because the form shows it |
| Docker image rebuilt | Pass. Flask returned the composition message for `aa1!aaaa` |
| HTTP smoke, section 1b | 5 Next-level rejections and 1 direct Flask rejection, each with the right fixed message. A short, simple password at login gets 401 `INVALID_CREDENTIALS`, not a policy message. The rejected registrations wrote no account |
| Chrome check, B2 | The register password input is described by the visible hint text. An 8-character lowercase password shows the composition message and takes focus. Layout checks at 375 px still pass |

**Defect found and fixed in the check, not in the product:** the first smoke run failed three policy checks with 429. Section 1 had already used four of Flask's five register calls per minute, so the policy checks hit the rate limit. The script now waits a minute before each group, and states why in its header.

## Rate-limit finding (F-AUTH-11)

The limiter keeps counters in each Gunicorn worker's memory. The image default is two workers, so AUTH-AC6.2 ("5 per minute per email") is not exact. Direct test: 14 wrong-password logins to one new email returned `401 401 401 401 401 401 401 429 429 401 429 401 401 429`. The smoke now checks only that a 429 appears within 12 attempts, which two workers guarantee. Options for the owner: run one worker locally (exact local behavior), or move the counters to shared storage before production (T16, already tracked). The spec was not changed here.

## Revision 4: local rate limit with one worker

**Change:** `compose.yaml` sets `GUNICORN_WORKERS=1` for the local backend. The Render default stays 2 until T16 (`docs/DEPLOYMENT.md`). The limiter stays in memory. A 401 no longer carries `Retry-After`, because RFC 9110 gives it meaning only on 429 and 503 (`backend/app/response_headers.py`).

**Isolation of quotas:**
- Pytest: each limiter test builds its own app and calls `limiter.reset()`, so it starts with empty counters. Login and register use separate limit keys, and a test shows a blocked login does not block a registration. Policy tests run with the limiter disabled (`conftest.py`), so they never use register quota.
- Live smoke: `reset_limiter()` restarts the backend before each check group. Policy checks run in two groups, five Next-level checks and then one direct Flask check, each within the 5-per-minute register quota. The login rate-limit check starts from empty counters.

**Observed results**

| Check | Observed |
|---|---|
| Compose config | `GUNICORN_WORKERS: "1"`. Log since the last start: one `Starting gunicorn`, one `Booting worker` (pid 7) |
| Live, one normalized email, six attempts within one second, spelled as upper case, padded, title case and mixed | `401, 401, 401, 401, 401, 429`. The sixth was `RATE_LIMITED`. Measured with fresh counters, one worker |
| Live, same check through the Next origin (smoke section 10) | `401, 401, 401, 401, 401, 429`. The 429 has `Retry-After` and a request ID. The 401s have none |
| Live, first invalid login straight to Flask after the fix | `401`, `X-RateLimit-Remaining: 4`, no `Retry-After` |
| Pytest, fresh process, `tests/test_rate_limit.py` | 17 passed, including the five-then-429 sequence, separate quotas and `Retry-After` only with 429 |
| Pytest, full backend suite | 431 passed, Ruff clean |
| Negative control 1: limit key set to the raw email | Sequence test failed with `[401, 401, 401, 401, 401, 401]`. Restored, then passed |
| Negative control 2: `Retry-After` filter disabled | `Retry-After` test failed. Restored, then passed |
| HTTP smoke, final | 75 of 75 |
| Chrome check, final | 96 of 96 |
| Dev database after the runs | 0 users, 0 revoked tokens |

**Findings**
- **F-AUTH-13:** the live check before the fix showed `Retry-After` on every 401 (Flask-Limiter adds it while its headers are on). Fixed with an after-request filter, and checked with a direct Flask request after the rebuild.
- **F-AUTH-14:** in revision 3 the policy checks ran after four other register calls in the same window, so three of them returned 429. Revision 3 added a sleep. Revision 4 restarts the backend before each group, so no group depends on another's quota.
- **F-AUTH-11 (resolved locally):** the per-worker counter is fixed for local runs by one worker. It remains open for production, where T16 must add shared storage before more workers run.

**Still open:** shared limiter storage and trusted client address handling (T16). Real-phone checks and Playwright (T15).

## Revision 5: password maximum of 10 characters (change C12, 2026-11-19, Claude Code)

**Change:** register accepts 8 to 10 characters (the uppercase, lowercase and special-character rules are unchanged) and login accepts 1 to 10 characters. Before: 8 to 128 and 1 to 128. Requested by the user. Specification: `.kiro/specs/authentication/` (requirements C12, design DD16 and §4.10, tasks 4.1 to 4.7). Code: `backend/app/config.py` (`PASSWORD_MAX = 10`) and `frontend/lib/authRules.ts` (`PASSWORD_MAX = 10`, `PASSWORD_HINT`). The schemas and validators read the constants, so no other logic changed.

**Checks run (all from this session):**

| Check | Result |
| --- | --- |
| Task 4.1, new boundary cases against the old constants | `test_auth_schema.py`: 6 failed, 96 passed. `authRules.test.ts`: 6 failed, 101 passed. The same six case IDs on both sides |
| Backend, `ruff check .`, `ruff format --check .`, `pytest` | Clean. 2177 passed and 1 skipped (2173 passed and 1 skipped on the revision 4 code and the old case file) |
| Frontend, `npm run lint`, `npm run typecheck`, `npm test` | Clean. 2173 tests in 100 files passed (2172 on the revision 4 code) |
| Frontend `npm run e2e:unit -- run.unit.ts` | 2 passed |
| Frontend `npm run build` | Succeeds |
| Docker image rebuilt (`docker compose build backend`), Flask on 5001 with one worker, `next start -p 3100` with `APP_ORIGIN=http://localhost:3100` | A login with 11 characters straight to Flask returned 400 `Must be 1 to 10 characters.` |
| HTTP smoke `evidence/authentication-http-smoke.py` | RESULT: ALL PASS, 79 checks (75 in revision 4). The four new checks send 11 characters to register and to login, at Next and at Flask: 400 with the fixed message, and no cookie on the login. Output: `evidence/authentication-T03-T04-http-smoke-rev5.txt`. The script deleted its one throwaway user and two revoked-token rows |
| Playwright `npm run e2e` (2026-11-19, after the checks above) | 58 passed, 0 failed, 1.5 minutes, the same count as the T15 run. Native Flask on 5001 against `revotask_test` (the preflight proved it), Next dev server on 3000, `desktop`, `viewport-320`, `mobile-375` and `viewport-768` projects (Chromium emulation, not a real device). It includes the LA-2a to LA-2d auth journey, which uses the new 10-character `makePassword()` and the 10-character wrong password. Teardown deleted every row of run `55977c60` and verified 0 left in all nine tables. No change to the suite was needed |
| Chrome run `evidence/authentication-mobile-measure.mjs` | RESULT: ALL PASS, 106 checks, Chrome 157 headless with device emulation (not a real phone). It now checks the "8 to 10 characters" hint, and the register and login length messages with focus on the password field at 375 px, with no horizontal scroll. Output: `evidence/authentication-T03-T04-browser-check-rev5.txt` |

**Findings:**

- F-AUTH-R5-01. Searching for old literals missed three leftovers that only the full backend run found: a wrong login password `Wrong-Password-1!` in `test_users_profile_session.py`, the padded password `" Spaced Pass 1! "` in `test_auth_schema.py` and the same in two frontend tests, and ` ${PASSWORD} ` (12 characters) in `RegisterForm.test.tsx`. Each returned 400 where the test expected 401 or success. Fixed. Lesson: padding counts toward the 10 characters.
- F-AUTH-R5-02. `frontend/e2e/auth.spec.ts` sent `${ownerPassword}-wrong` (16 characters) for the invalid-credentials step (LA-2b). It would have returned 400 and not shown the generic message. Changed to `Wrong-Pw-9`.

**Straggler search (task 4.5).** Search for `Horse-Battery`, `to 128 characters`, `randomBytes(9)`, `randomBytes(12)`, `PASSWORD_MAX = 128`, `1–128`, `8–128`, `1-128` and `8-128` over the repository (without `node_modules`, `.next`, `.venv`, `.git`, `playwright-report`). Remaining files, all allowed as history: the changelogs (`CHANGELOG.md`, `backend/CHANGELOG.md`, `frontend/CHANGELOG.md`, `specs/CHANGELOG.md`) and `evidence/spec-review.md` record earlier entries, the revision 4 smoke and browser text files and the Revision 3 section above record what ran then, and the three native spec files state the before values.

**Not run, so pending:** the Playwright suite has no step that checks the 11-character rejection in the browser (the smoke and the Chrome run do). The nine other evidence scripts (`*-mobile-measure.mjs`, `*-timing.mjs`) were syntax-checked with `node --check` and not run, because each needs a live stack and its own data. A real phone, live Render and Vercel checks, and the T16 decision on keeping the cap stay open.

**Environment note:** Docker Desktop was not running. Claude Code started it for the smoke and the browser run, rebuilt the backend image, then stopped the `backend` Compose service and the Next server. For the Playwright run it started native Flask on 5001 (test database) and `npm run dev`, then stopped both. Next's dev server also wrote an untracked `frontend/AGENTS.md`, which was deleted. Docker Desktop itself was left running. No database was reset or dropped.

**Known effect (requirements Open item 8):** an account registered with a password of 11 or more characters gets a 400 at login and cannot sign in. No local account was checked or changed.

## Open items and limits

1. **No real phone.** All mobile results are from Chrome's device emulation. On-screen keyboard behavior is unverified. The T16 mobile walkthrough covers a real device.
2. **Playwright is T15.** Root AC02.3 keeps its Playwright back-navigation proof there. The `pageshow` revalidation (back-forward cache restore) has unit tests only. The headless Chrome run exercised a normal Back navigation, which the server redirected.
3. **Production items for T16:** shared rate-limit storage and trusted client address handling, live cookie flags (`Secure` on https), and the live rate-limit check. The local limiter results prove local behavior only.
4. **No JavaScript means a blank error state** (F-T04-05).
5. **Revoked-token cleanup** has no job. The table grows by one row per sign out until one is added.
6. **Dev-only audit advisories** (seven moderate, `minimatch`) are unchanged from foundation.
7. **Other framework 4xx responses** (406, 414) still return Flask's default HTML.
8. **Rate limits are per worker** (F-AUTH-11). Revision 4 runs one worker in Compose, so the local rule is exact. Before the release, the production service must also run one worker, or use shared limiter storage (T16). More workers must not be added before then.
