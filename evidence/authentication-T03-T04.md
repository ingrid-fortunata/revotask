# Authentication evidence · T03–T04

**Scope:** Native spec `.kiro/specs/authentication/` (requirements, design, tasks). Root tasks T03 and T04.

**State:** Local implementation and verification. The change is uncommitted in the working tree. No GitHub, Render, Vercel or Supabase step was run. Every live check used `127.0.0.1` or `localhost`.

**Environment:** macOS, zsh. Python 3.14.5 (`backend/.venv`). Node.js 24.22.1. PostgreSQL 16.14 on `127.0.0.1:5432`. Docker Desktop 29.9.2 (Flask ran as the Compose image on port 5001). Google Chrome 157.0.8103.51, headless, with device emulation. **No real phone was used.**

## Result summary

| Area | Result |
|---|---|
| Backend `ruff check .` and `ruff format --check .` | Pass (64 files formatted) |
| Backend `pytest` | **382 passed** (foundation had 186, so 196 are new) |
| Backend race test (8 simultaneous registrations of one email) | Passed 5 of 5 consecutive runs, and again in the final full runs. The simultaneous-logout test passed too |
| Backend Docker image rebuilt with the new dependencies | Builds. `GET /api/health` 200. `POST /api/auth/register` with `{}` returns the 400 envelope. A `text/plain` body returns 415 |
| Frontend `npm run lint`, `typecheck` | Pass |
| Frontend `npm test` (Vitest) | **431 passed in 31 files** (foundation had 1) |
| Frontend `npm run build` | Pass. Routes: `/` (dynamic), `/login` (dynamic), `/register` (static), `/api/auth/{register,login,logout}` (dynamic), `/_not-found` |
| `npm audit --omit=dev` | 0 vulnerabilities. The seven dev-only moderate advisories from foundation are unchanged and untouched |
| HTTP smoke (`evidence/authentication-http-smoke.py`) | **64 of 64 checks pass** against real Flask (5001) and a production Next server (3100) |
| Real-browser check (`evidence/authentication-mobile-measure.mjs`) | **90 of 90 checks pass**, run twice in full |
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
| AUTH-AC10.1–10.7 forms | `LoginForm` (12), `RegisterForm` (11), `pages` (13), `authRules` (61, of which 56 are the shared cases), `public.guard` (4) tests | Browser B and C |
| AUTH-AC11.1–11.9 shell | `session` (13), `layout` (2), `AppHeader` (4), `LogoutButton` (3), `SessionRevalidator` (4), `error` (3), `AuthContext` (4), `pages.guard` (4) tests | Smoke 4–8, browser C–E |
| AUTH-AC13.1–13.7 mobile | `FormField` (4), `BaseButton` (4), `AppHeader`, `ToasterHost` (3) class tests, `mobileGuard.test.ts` (40) | Browser A and D |

## Exact form fields

- Flask register and login schemas use `unknown=RAISE`. Next handlers compare the key set before calling Flask. The forms render exactly three (register) and two (login) inputs, and a test asserts the input `name` attributes and the request body keys.
- Shared cases: `specs/fixtures/auth-field-cases.json` holds 37 register and 19 login cases. The Flask schema tests and the `authRules.ts` tests each ran all 56, and they agreed on every case with no correction to the file.
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
- **Rate limit:** five wrong-password logins for one email returned 401 and the sixth returned 429 with `Retry-After: 60`. Counters are in memory in one container.

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

## Open items and limits

1. **No real phone.** All mobile results are from Chrome's device emulation. On-screen keyboard behavior is unverified. The T16 mobile walkthrough covers a real device.
2. **Playwright is T15.** Root AC02.3 keeps its Playwright back-navigation proof there. The `pageshow` revalidation (back-forward cache restore) has unit tests only. The headless Chrome run exercised a normal Back navigation, which the server redirected.
3. **Production items for T16:** shared rate-limit storage and trusted client address handling, live cookie flags (`Secure` on https), and the live rate-limit check. The local limiter results prove local behavior only.
4. **No JavaScript means a blank error state** (F-T04-05).
5. **Revoked-token cleanup** has no job. The table grows by one row per sign out until one is added.
6. **Dev-only audit advisories** (seven moderate, `minimatch`) are unchanged from foundation.
7. **Other framework 4xx responses** (406, 414) still return Flask's default HTML.
