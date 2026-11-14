# Design Document: profile (T12)

## Overview

This design implements the profile update (E31), the `/profile` page, the safe user context refresh and the AppHeader account link (root T12). It follows `requirements.md` (Requirements 1 to 8, decisions P1–P11 approved on 2026-11-14 with clarifications) and the shared design D2 and D5. Python (Flask, SQLAlchemy, Marshmallow, pytest) and TypeScript (Next.js App Router, Tailwind, daisyUI, Vitest) are the languages already in the repository. No table, migration, dependency, `docs/API.md` path, method or response field changes. The contract clarifications C23–C27 (below) are recorded in `docs/API.md`, `specs/CHANGELOG.md` and the shared documents.

### Verified facts about the existing code

| Fact | Where | Consequence |
|---|---|---|
| `GET /api/users/me` (E30) is the only route of `users_bp`. It uses `token_required` and `PublicUserSchema` (`id`, `name`, `email`). | `backend/app/blueprints/users/routes.py`, `schema.py` | E31 is a second route in the same blueprint. No new blueprint. |
| `token_required` loads `g.current_user` with `db.session.get(User, id)` after it checks the signature, expiry and revocation. The token identity is the user ID. | `backend/app/auth_guard.py` | An email change cannot affect a session (Requirement 3.4, 3.9). |
| `users.email` has `uq_users_email` and the check `email = lower(btrim(email))`. `name` is `String(80)`. `AuditMixin.updated_at` has `onupdate=utcnow`. | `backend/app/models/user.py`, `base.py` | The database decides duplicates and rejects a non-normalized email. `updated_at` moves only when the ORM issues an `UPDATE`. |
| `is_unique_violation(exc, "uq_users_email")` and `EmailAlreadyExistsError` (409, `EMAIL_ALREADY_EXISTS`) already map a 23505 for register. | `auth/service.py`, `exceptions.py` | E31 reuses both. No new exception. |
| `TrimmedString`, `NormalizedString`, `email_format`, `EMAIL_MAX`, `EMAIL_LENGTH`, `REQUIRED`, `NOT_TEXT`, `load_json_body` live in `app.validation`. `NAME_LENGTH` is in `auth/schema.py`. The field-message map `_MESSAGES` is private to `auth/schema.py`. | `backend/app/validation.py`, `auth/schema.py` | The profile schema reuses the validators. The message map moves to `app.validation` as `FIELD_MESSAGES` so both schemas share one definition (DD2). |
| `load_json_body` turns an unknown key into `fields.<key> = "Unknown field."` (Marshmallow `RAISE`) and a non-object into the body message. A schema-level error would be dropped and replaced by the body message. | `app/validation.py` | `{}` needs its own check in the route (DD2). |
| `register_response_headers` adds `Cache-Control: private, no-store` to every `/api/` response except health. | `backend/app/response_headers.py` | E30 and E31 get it by default. A test proves it. |
| The database default isolation level is READ COMMITTED. Board writes already serialize on a row lock taken with `with_for_update()`. | `boards/service.py` | E31 locks the user row the same way (DD1). |
| `handlePrivateWrite(request, spec)` checks environment, Origin (403), cookie (401), UUID params, JSON media type (415), size (413), JSON object (400) and the key set, calls Flask, passes the reply through and clears the cookie on 401. `requiredKeys` can be `[]`. | `frontend/lib/server/privateRoute.ts`, `bff.ts` | The Profile_Handler is one call with `allowedKeys: ["name","email"]` and `requiredKeys: []`. Its unknown-key 400 has the same shape as Flask's. |
| `FLASK_PATHS.me` is `/api/users/me`. `flaskRequest` already accepts `PATCH`. | `frontend/lib/server/flask.ts` | No change to the allowlist of routes. |
| `apiRequest(method, path, body)` accepts a pair only when it matches `DECLARED_BOARD_REQUESTS`. | `frontend/lib/apiClient.ts` | One new pattern: `PATCH /api/users/me`. |
| `AuthProvider` holds a memoized copy of three fields from its `user` prop, with no setter. A comment says "A setUser arrives with the profile slice (T12)". | `frontend/components/auth/AuthContext.tsx` | The provider becomes stateful with `setUser` (DD6). |
| `getCurrentUser()` is `React.cache`d and the protected layout calls it. Every protected page must call it (`pages.guard.test.ts`). | `frontend/lib/server/session.ts` | `/profile` calls it and shares the layout's single read (Requirement 4.1). |
| `AppHeader` shows the Avatar and the user's name in a plain `div`, then `LogoutButton`. Boards and My tasks are a second row below 1024 px. | `frontend/components/shared/AppHeader.tsx` | The account block becomes a `Link` (DD7). |
| `RegisterForm` is the model for a controlled form with `FormField`, `useErrorHandler`, focus on the first invalid field and a form-level `role="alert"`. `useErrorHandler` maps `EMAIL_ALREADY_EXISTS` to the email field. | `components/auth/RegisterForm.tsx`, `hooks/useErrorHandler.ts` | `ProfileForm` follows it. No change to the handler. |
| `specs/fixtures/auth-field-cases.json` is read by both the Flask schema tests and `authRules.test.ts`. | `specs/fixtures/` | A `profile` section is added, so both sides test the same cases (DD3). |
| `Tracker` and `BoardTracker` track users, tokens and board rows and delete exactly those at teardown. `race(app, jobs)` runs requests in threads on the guarded test database. | `backend/tests/auth_helpers.py`, `boards_helpers.py`, `kanban_helpers.py` | Profile tests reuse them. No new cleanup code beyond a sentinel check. |

## Architecture

```text
Browser                         Next.js (Vercel)                         Flask (Render)
 /profile (Server Component) ─ getCurrentUser() ─ fetchPrivate("me") ─────▶ E30
  ProfileForm
   save ─ apiRequest("PATCH","/api/users/me",{changed fields})
        ─▶ PATCH handler (handlePrivateWrite, keys name,email) ──────────────▶ E31
   200 ─ setUser(response) ─ router.refresh() ─ toast "Profile updated."
 AppHeader ─ account Link ─▶ /profile
```

E30 never reaches the browser. The token stays in the HttpOnly cookie. E31 is the only new browser call, through one same-origin PATCH handler. Flask re-validates everything and stays authoritative.

### Key design decisions

| ID | Decision | Rationale |
|---|---|---|
| DD1 | `update_profile` locks the Caller's user row (`SELECT … FOR UPDATE`, `populate_existing`), compares each submitted Normalized_Value with the fresh stored value, sets only the values that differ, and commits once. It writes nothing when nothing differs. | The lock makes the decision on the current row, so every outcome is one serial order of the overlapping requests. A request that sends a value equal to a stale read cannot skip a write that should be last (P10). The ORM sends an `UPDATE` with only the changed columns, so an omitted field is never overwritten. Both fields go in one `UPDATE`, which is the atomic unit (P3, P10). No change means no `UPDATE`, so `updated_at` stays (P2). |
| DD2 | `ProfileUpdateSchema` (Marshmallow, `unknown = RAISE`) has optional `name` and `email` with the E02 validators and messages. The route rejects an empty loaded dict with `RequestValidationError()` (400, standard message, no field entry). `FIELD_MESSAGES` moves to `app.validation`. | Same rules as E02 and the same fixed messages (Requirement 1.3). An unknown key such as `password` gets `Unknown field.` from Marshmallow, with no value echoed (Requirement 2.2). The empty body 400 must not carry the misleading "must be a JSON object" text. |
| DD3 | One fixture, two readers. `specs/fixtures/auth-field-cases.json` gains a `profile` section (base `{name,email}`, cases that set or drop keys). The Flask schema test and `authRules.test.ts` both run it. | A rule difference between Flask and Next fails a test (P4, Requirement 8.6). Existing registration cases are untouched. |
| DD4 | The uniqueness decision is the `uq_users_email` constraint. A 23505 on that name rolls back and raises `EmailAlreadyExistsError`. Any other `SQLAlchemyError` rolls back and propagates to the sanitized 500. No pre-check `SELECT`. | A pre-check races (Requirement 2.5). The rollback covers a valid name sent beside a taken email (P3). |
| DD5 | The browser sends only the fields whose Normalized_Value differs from the last saved value, after `validateProfile` passes. A pristine form cannot submit. | Smaller bodies and no needless 409 on an unchanged email (P7, P6). |
| DD6 | `AuthProvider` keeps the user in state, exposes `setUser(next)` that copies `id`, `name`, `email` only, and adopts a new `user` prop when the server sends different values (the "adjust state when a prop changes" pattern, no effect). `AuthContextValue` becomes `{ user, setUser }`. | The header shows the new name at once. `router.refresh()` then re-renders the server tree with the stored values and the provider follows without a flash (P6). The three-field copy keeps AUTH-AC11.6. |
| DD7 | The AppHeader account block is a `Link` to `/profile` with `aria-label="Profile, <name>"` and `aria-current="page"` on `/profile`. It keeps the Avatar (from 640 px), the truncating name, a `min-h-11 min-w-11` box and the focus ring of the nav links. Boards, My tasks and Log out are unchanged. | P5. The visible name is inside the accessible name (WCAG 2.5.3). A third nav link would take a third of the 320 px row. |
| DD8 | No session change on an email update. No code reads an email from a token or session. | P8, Requirement 3.4 and 3.9. Tested through E30 with the old token and a fresh login. |
| DD9 | No new shared part. `ProfileForm` uses `FormField`, `BaseButton`. The page uses `.surface`. | FE-D1 to FE-D3. |

## Components and Interfaces

### Backend layout

```text
backend/app/blueprints/users/
  routes.py     E30 (existing) and E31 (new)
  schema.py     PublicUserSchema (existing), ProfileUpdateSchema (new)
  service.py    update_profile (new)
backend/app/validation.py          + FIELD_MESSAGES (moved from auth/schema.py)
backend/app/blueprints/auth/schema.py   imports FIELD_MESSAGES
```

`users/service.py` imports `EMAIL_UNIQUE_CONSTRAINT` and `is_unique_violation` from `auth/service.py`. `auth/service.py` does not import the users blueprint, so there is no cycle.

### Routes

| ID | Method and path | Handler behavior |
|---|---|---|
| E30 | `GET /api/users/me` | Unchanged. |
| E31 | `PATCH /api/users/me` | `@token_required`. `data = load_json_body(ProfileUpdateSchema())`. `if not data: raise RequestValidationError()`. `user = update_profile(g.current_user, **data)`. Return `jsonify(data=PublicUserSchema().dump(user))` with 200. No limiter in v1 (P11). |

### Check order

1. Authentication (401): missing, malformed, expired, revoked token.
2. Media type (415), size (413), JSON syntax (400), JSON object (400).
3. Field validation (400, `fields` per key). Unknown keys are field entries with `Unknown field.`.
4. Empty object (400, standard message).
5. The update: lock, compare, `UPDATE`, commit. A 23505 on `uq_users_email` is 409. Any other failure is the sanitized 500.

A request that fails steps 1 to 4 opens no write transaction beyond the guard's read and runs no uniqueness check (Requirement 2.9).

### Service sketch

```python
def update_profile(user: User, *, name: str | None = None, email: str | None = None) -> User:
    try:
        row = db.session.scalar(
            select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True)
        )
        if name is not None and name != row.name:
            row.name = name
        if email is not None and email != row.email:
            row.email = email
        db.session.commit()      # no dirty column: no UPDATE, updated_at unchanged
    except IntegrityError as exc:
        db.session.rollback()
        if is_unique_violation(exc, EMAIL_UNIQUE_CONSTRAINT):
            raise EmailAlreadyExistsError() from None
        raise
    except SQLAlchemyError:
        db.session.rollback()
        raise
    return row
```

The values are already trimmed (and lowercased for the email) by the schema. `commit()` ends the transaction and releases the lock in the no-op case too. The row is the same object as `g.current_user` (one identity map), so the dump that follows reads the stored values after the commit refresh. A `None` argument means "not sent". The schema never produces `None` for a sent field, because `null` is rejected.

Concurrent same-account requests queue on the lock and each runs on the fresh row, so the outcome is one serial order. A race between two accounts for one new email is decided by the unique index: the second `UPDATE` waits for the first to commit and then fails with 23505. A simultaneous swap of two accounts' emails can make PostgreSQL abort one of them as a deadlock. That request fails with the sanitized 500, changes nothing, and can be retried (Risks).

### Serialization

`PublicUserSchema` stays the only output shape. No new output schema.

### Next handler and client allowlist

```text
frontend/app/api/users/me/route.ts    PATCH only
```

```ts
export async function PATCH(request: NextRequest) {
  return handlePrivateWrite(request, {
    route: "me",
    method: "PATCH",
    allowedKeys: ["name", "email"],
    requiredKeys: [],
  });
}
```

The handler adds no GET, so the browser cannot read E30 (the page reads it on the server). A body with another key gets 400 `fields.<key> = "Unknown field."` from `readJsonObject`, and is not forwarded. `{}` passes the handler and Flask returns the 400. `lib/apiClient.ts` gains `{ method: "PATCH", pattern: /^\/api\/users\/me$/ }`. No other `/api/users` path is declared.

### Frontend layout

```text
frontend/app/(protected)/profile/page.tsx      Server Component
frontend/components/profile/ProfileForm.tsx    client form
frontend/components/auth/AuthContext.tsx       + setUser
frontend/components/shared/AppHeader.tsx       account Link
frontend/lib/authRules.ts                      + PROFILE_FIELDS, validateProfile, profileChanges
frontend/app/api/users/me/route.ts             PATCH handler
frontend/lib/apiClient.ts                      + PATCH pattern
```

### Rules (`lib/authRules.ts`)

```ts
export const PROFILE_FIELDS = ["name", "email"] as const;
// The values to send: each field whose normalized value differs from the saved one.
export function profileChanges(values: Record<"name"|"email", string>, saved: PublicUser): Partial<Record<"name"|"email", string>>;
// validateProfile(raw): the E02 name and email rules for the keys present in raw.
// An unknown key is "Unknown field.", a missing key is not an error (a partial update).
export function validateProfile(raw: Record<string, unknown>): Validated<"name" | "email">;
```

`validateProfile` reuses the `REGISTER_SPEC` entries for `name` and `email` and the generic `validate`, restricted to the keys present. The form never sends an empty object, because it is disabled when nothing changed.

### `AuthContext`

```tsx
export interface AuthContextValue { user: PublicUser; setUser: (next: PublicUser) => void }
export function AuthProvider({ user, children }) {
  const [current, setCurrent] = useState(pick(user));
  const [seen, setSeen] = useState(pick(user));
  if (differs(pick(user), seen)) { setSeen(pick(user)); setCurrent(pick(user)); }   // follow the server
  const setUser = useCallback((next: PublicUser) => setCurrent(pick(next)), []);
  const value = useMemo(() => ({ user: current, setUser }), [current, setUser]);
  ...
}
```

`pick` copies `id`, `name` and `email`. A test hands `setUser` an object with a token and a hash and asserts the context holds three fields. Existing tests that build an `AuthContextValue` by hand add a no-op `setUser`.

### `ProfileForm`

Props: `user: PublicUser`. State: `saved` (the last stored values, seeded from the prop), `values` (`name`, `email` strings seeded from it), `fieldErrors`, `formError`, `pending`. Refs for both inputs.

- `dirty` is true when `profileChanges(values, saved)` is not empty. `Save changes` is `disabled` when `!dirty || pending`.
- Submit: ignore when pending. Compute `changes`. If empty, return. `validateProfile(changes)`: on errors show them inline, focus the first invalid field in `PROFILE_FIELDS` order and send nothing. Otherwise `setPending(true)`, `apiRequest("PATCH", "/api/users/me", body)`, `parsePublicUser(data)`.
- Success: `setSaved(next)`, `setValues({ name: next.name, email: next.email })`, `setFieldErrors({})`, `setFormError(null)`, `setUser(next)`, `router.refresh()`, `notifySuccess("Profile updated.")`.
- Failure: `handleError(error, { onFields: showFieldErrors, onFormError: setFormError })`. `EMAIL_ALREADY_EXISTS` goes to the Email field through the handler. `VALIDATION_ERROR` with `fields` is inline. A 5xx, a rate limit or a transport error is a toast. `AUTH_REQUIRED` redirects to `/login`. The typed `values` are never reset on failure. `pending` is cleared in every outcome.
- Markup: `<form noValidate aria-busy>`; an optional `role="alert"` for `formError`; `FormField` `profile-name` (`autoComplete="name"`) and `profile-email` (`type="email"`, `autoComplete="email"`, hint "You sign in with this email."); `BaseButton type="submit" loading={pending}` with the label "Save changes" and "Saving…" while pending. No password input.

### Page

```tsx
export default async function ProfilePage() {
  const user = await getCurrentUser();
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1>
      <section className="surface mt-4 w-full max-w-xl p-4 sm:mt-6 sm:p-5">
        <h2 className="text-lg font-semibold">Your details</h2>
        <p className="mt-1 text-sm text-base-content/70">Change your name or email. Password changes are not available yet.</p>
        <div className="mt-4"><ProfileForm user={user} /></div>
      </section>
    </main>
  );
}
```

The page follows FE-D4 (title, then content in one `.surface`). `max-w-xl` keeps the line length readable from 1024 px. There is no side column, because the page has no secondary work.

### AppHeader

The account block becomes:

```tsx
<Link href="/profile" aria-label={`Profile, ${user.name}`} aria-current={onProfile ? "page" : undefined}
  className="flex min-h-11 min-w-11 min-w-0 items-center gap-2 rounded-field px-2 … focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary hover:bg-white/5 {current: bg-white/10}">
  <span className="hidden sm:inline-flex"><Avatar … /></span>
  <span className="min-w-0 max-w-[28vw] truncate … sm:max-w-[50vw] lg:max-w-none" title={user.name}>{user.name}</span>
</Link>
```

`onProfile` is `pathname === "/profile" || pathname.startsWith("/profile/")`. The row layout, the order (brand, nav row, account, Log out) and the other controls do not change. `guidelines/frontend.md` FE-D2 is updated at implementation: the account block is a link to `/profile`.

### Mobile design (Requirements 6, 7, FE-S4 to FE-S6, FE-D9)

- Base classes are for the smallest width: a single column, `FormField` full width, `BaseButton` `w-full sm:w-auto`.
- `FormField` already sets `text-base` and `min-h-11 min-w-11`. Long names and emails wrap in the error and hint text (`break-words`). The input scrolls its own text, so a long value cannot widen the page. The panel has `min-w-0`.
- At 320 and 375 px the header's first row holds the brand, the account link (name truncated to `28vw`) and Log out. The nav row holds Boards and My tasks. Each is at least 44 by 44 CSS px. A browser check measures all four, tabs through them for a visible focus ring, and checks `scrollWidth <= clientWidth` and that the header bottom does not pass the `main` top (Requirement 6.3).

## Data Models

No schema change. Wire shapes are unchanged from `docs/API.md`:

```text
E31 request:  {"name"?: string, "email"?: string}   at least one key
E31 200:      {"data": {"id","name","email"}}
E31 400:      {"error": {"code":"VALIDATION_ERROR", "message", "fields"?: {key: message}}}
E31 409:      {"error": {"code":"EMAIL_ALREADY_EXISTS", "message"}}
```

Frontend types: `PublicUser` and `parsePublicUser` already exist. `AuthContextValue` gains `setUser`.

## Error Handling

| Condition | Flask | Next handler | UI |
|---|---|---|---|
| No or bad token | 401 `AUTH_REQUIRED` | 401, clears the cookie | Redirect to `/login` |
| Wrong Origin | n/a | 403 | Toast (fixed copy) |
| 415, 413, bad JSON | 415, 413, 400 | Same, from the helper | Toast or form message |
| Unknown key, bad value | 400 `fields` | 400 `Unknown field.` for an unknown key, else passes Flask's | Inline, focus first field |
| Empty object | 400, standard message | Passed through | Not reachable from the form (Save disabled) |
| Taken email | 409 `EMAIL_ALREADY_EXISTS` | Passed through | Inline under Email, values kept |
| Database or other failure | Sanitized 500 | Passed through | Toast, values kept, Save enabled |
| Flask down | n/a | 502/503 envelope | Toast |

## Testing Strategy

### Approach

Parameterized pytest, Vitest and React Testing Library, as in the earlier slices. Tests assert status, body, stored rows, rendered text, roles and the requests sent. The Playwright journey (V10) is delivered in T15.

### Test data isolation (Requirement 8.7)

Database-writing tests use the `board_tracker` fixture (`BoardTracker`, which extends `Tracker`) on the app built from `TEST_DATABASE_URL` through `db_guard`. Every user a test creates, directly or through the API, is tracked and deleted at teardown, whether the test passes or fails. No `TRUNCATE`, no name pattern, never `DATABASE_URL`. `test_profile_cleanup.py` creates tracked users, fails on purpose after a profile change, and proves that the finalizer removed exactly the tracked users and that an untracked sentinel user survived.

### Backend test files (V07)

| File | Covers |
|---|---|
| `test_users_profile_schema.py` | The `profile` fixture cases, `FIELD_MESSAGES` parity with the register schema, an unknown key echoes no value. |
| `test_users_profile.py` | 200 (name, email, both, trimmed and lowercased, unchanged, own email in another case), `updated_at` moved only by a real change, the response allowlist, the password hash unchanged, no event and no notification row, `Cache-Control` on every response. 400: `{}`, non-object, `password`, `current_password`, `id`, `created_at`, an unknown key alone and beside a valid field, `null`, wrong types, blank or 81-character name, blank, malformed or 255-character email. 415, 413, malformed JSON. 401: none, malformed, expired, revoked (an update is not applied). Check order. |
| `test_users_profile_conflict.py` | 409 for another user's email, the same in another case. A valid name beside a taken email: 409 and the stored name is the original. Simultaneous requests from two users for one new email: one 200, one 409, one row holds it. A failed update leaves a later E30 unchanged. |
| `test_users_profile_concurrency.py` | Per-field last write wins (P10). Deterministic: a second session locks the row, a name-only request that sends the stored name starts and blocks, the second session changes the name and commits, and the request then writes its value (the request is last). A name-only and an email-only request on one account, repeated with a barrier, always keep both values. Two requests for one field leave one of the two values and no 409. Both fields in one request are applied together (never one without the other, checked with a concurrent reader). |
| `test_users_profile_session.py` | A token minted before an email change still works. E30 with it returns the new email. A fresh login succeeds with the new email and returns 401 `INVALID_CREDENTIALS` with the old. The token identity is the user ID (`sub`), not the email. |
| `test_users_profile_names.py` | After a name change, the board member list, E21 `assignee_name` and a comment read (`author_name`) show the new name (P9). E22 returns no names, so it is not part of this check. Another user's row is unchanged. |
| `test_users_profile_logging.py` | Log output for a profile update contains no name, email or body. |
| `test_profile_cleanup.py` | Teardown isolation, including the sentinel user. |

### Frontend test files (Vitest and RTL)

| File | Covers |
|---|---|
| `lib/authRules.test.ts` (extended) | The `profile` fixture cases, `profileChanges`, `validateProfile` for a partial body and an unknown key. |
| `components/profile/ProfileForm.test.tsx` | Seeded values, Save disabled when pristine and while pending, only changed fields sent, trimmed and lowercased value, inline 400 and focus on the first invalid field, the inline 409 with typed values kept, the success toast, reseed, `setUser` and `router.refresh()` called, a second submit ignored while pending, a 5xx and a transport error keep the text and re-enable Save, no password field and no hidden password input. |
| `app/(protected)/profile/page.test.tsx` | Calls the session helper, renders the form with the stored values, redirects on a missing session, error state. `pages.guard.test.ts` covers the new page automatically. |
| `components/auth/AuthContext.test.tsx` (extended) | `setUser` keeps three fields, drops a token and a hash, follows a changed `user` prop. |
| `components/shared/AppHeader.test.tsx` (extended) | The account link target, name and `aria-current` on `/profile`, the other links unchanged, the name updates after `setUser`, the size classes. |
| `app/api/users/me/route.test.ts` | Valid request, 403 for a wrong Origin, 401 clears the cookie, 415, 413, 400 for bad JSON and for `password`, an unknown key not forwarded, `{}` forwarded, no token in the response, `private, no-store`, Flask 400 and 409 passed through. |
| `lib/apiClient.test.ts` (extended) | `PATCH /api/users/me` is declared, no other `/api/users` path or method is. |

### Browser checks (V07, V11)

`evidence/profile-mobile-measure.mjs` (Chrome, device emulation, modeled on the T11 script) runs at 320, 375, 768 and 1280 px against the local app: `/profile` pristine, with a field error, with the 409, and after a save; the AppHeader at 320 and 375 px with Profile, Boards, My tasks and Log out each measured at 44 by 44 CSS px with `elementFromPoint`, tabbed for a visible focus ring, no horizontal overflow and no overlap with the content. It runs the manual journey of Requirement 7.6 and records the real result, with the browser type (emulator, not a real device).

## Correctness Properties

1. **Allowlist.** For any request, the response data has exactly the keys `id`, `name` and `email`.
2. **Partial update.** For a submitted subset S of `{name,email}`, the stored value of every field outside S is unchanged.
3. **Normalization.** The stored name is the trimmed input and the stored email is the trimmed, lowercased input, for any accepted input.
4. **No-op.** If every submitted Normalized_Value equals the stored one, the response is 200, no `UPDATE` runs and `updated_at` is unchanged.
5. **All or nothing.** If the request fails with any 4xx or 5xx, the stored name and email equal the values before the request.
6. **Uniqueness.** After any set of simultaneous updates, no two users share an email, and each loser of a duplicate race gets 409.
7. **Per-field last write wins.** The stored value of a field is the value of the last committed request that submitted it. A request that does not submit a field never changes it.
8. **Rejected keys.** A body with any key outside `name` and `email` returns 400 with `Unknown field.` for each, whatever the other keys hold, and changes nothing.
9. **Session identity.** An email change leaves every token valid. E30 with it returns the new email. A fresh login works with the new email only.
10. **Isolation.** An update changes only the Caller's `users` row.
11. **Client request minimality.** The client sends only changed fields and sends nothing when pristine or invalid.
12. **Context safety.** The Auth_Context holds exactly `id`, `name` and `email`, whatever object reaches `setUser`.
13. **Rule parity.** For every `profile` fixture case, Flask and `validateProfile` give the same accepted values or the same field messages.
14. **Mobile.** At 320 and 375 px and wider, the profile page and the AppHeader have no horizontal page scroll, and the four header controls and the form controls are at least 44 by 44 CSS px.

## Acceptance Criteria Map

| Requirement | API or UI | Task area | Verification |
|---|---|---|---|
| 1 Update (E31) | `users/service.py`, `routes.py`, `schema.py` | Backend | `test_users_profile.py`, `_conflict`, `_concurrency`, `_names`; Properties 1–5, 7, 10 |
| 2 Rejected input | Schema, route, service | Backend | `test_users_profile.py`, `_schema.py`, `_conflict`; Properties 5, 6, 8 |
| 3 Auth, privacy, role | `token_required`, headers, no event | Backend | `_profile.py`, `_session.py`, `_logging.py`; Property 9 |
| 4 Profile page | `profile/page.tsx`, `ProfileForm` | Frontend | `page.test.tsx`, `ProfileForm.test.tsx`; Property 11 |
| 5 Feedback, context | `ProfileForm`, `AuthContext` | Frontend | `ProfileForm.test.tsx`, `AuthContext.test.tsx`; Property 12 |
| 6 Entry point | `AppHeader` | Frontend | `AppHeader.test.tsx`, browser check; Property 14 |
| 7 Mobile, accessible | Page, form, header | Frontend and browser | Browser check at 320, 375, 768, 1280; Property 14 |
| 8 Handler, allowlist, tests | `users/me/route.ts`, `apiClient.ts`, tests | Both | `route.test.ts`, `apiClient.test.ts`, fixture; Property 13 |

### Dependencies and gates

| Gate | Rule |
|---|---|
| A | Root T04 is verified. No gate blocks the start. |
| B | The backend E31 checks pass before the frontend calls it. |
| C | The frontend, the full suites and `next build` pass before the mobile record is final. |
| D | Root T12 is checked only after the backend, frontend, measured mobile check and journey pass. Unverified work stays open with the actual reason. |

## Contract and Document Impact

| Clarification | Statement | Documents |
|---|---|---|
| C23 | E31 is a partial update of `name`, `email` or both. `{}` and a non-object are 400. | `docs/API.md` E31, `backend/specs/api-contract.md`, `specs/requirements.md` AC12.1 |
| C24 | A submitted value equal to the stored one after normalization is a no-op: 200, no write, `updated_at` unchanged. A case-only change of one's own email is a no-op, not a 409. | Same |
| C25 | The update is all or nothing. A duplicate email is 409 `EMAIL_ALREADY_EXISTS` from `uq_users_email` and the whole update rolls back, also when a valid `name` was sent. | Same |
| C26 | Last write wins per submitted field. An omitted field is never written. Both fields apply atomically. The user row is locked for the update. | Same |
| C27 | A key other than `name` and `email`, `password` included, is 400 with `fields.<key> = "Unknown field."`. An email change revokes nothing and sends nothing. The 409 is an additional account-enumeration path next to E02. The E31 rate limit is deferred to T16, with reauthentication, new-address confirmation and an old-address notice. | Same, `docs/TEST-PLAN.md` V07, `specs/CHANGELOG.md` |

Updated at design time: `docs/API.md` E31, `backend/specs/api-contract.md` (`users_bp` row), `specs/requirements.md` AC12.1, `docs/TEST-PLAN.md` V07, `specs/CHANGELOG.md`. At implementation: `guidelines/frontend.md` FE-D2 (the account link), `frontend/specs/pages-and-components.md` and `api-integration.md` (the handler and the `setUser`), `specs/traceability.md`, README, USER_GUIDE and the changelogs. `specs/design.md` D5 already describes `/profile` and needs no change. Root `specs/tasks.md` links this spec at finalize.

## Review Items and Decisions

| ID | Item | Proposal | Reason |
|---|---|---|---|
| R1 | Lock the user row, or rely on the dirty-column `UPDATE` alone | Lock (DD1). | A dirty-column `UPDATE` already keeps an omitted field. The lock also makes the no-op decision on the fresh row, so a request that is last always wins its submitted field (P10). It costs one `SELECT … FOR UPDATE` in a short transaction. |
| R2 | Move `FIELD_MESSAGES` to `app.validation` | Yes. | One definition for two schemas, no import of a private name. |
| R3 | A `profile` section in the shared fixture | Yes (DD3). | The same cases run in Flask and in the browser rules. |
| R4 | Success toast text | "Profile updated." (P6, as approved). | |
| R5 | Email hint copy | "You sign in with this email." under the Email field. | Tells the user what an email change means without a password prompt. |

## Risks

| Risk | Mitigation |
|---|---|
| Two accounts swap emails at the same moment. PostgreSQL can abort one as a deadlock. | The aborted request returns the sanitized 500 and changes nothing, and the user can retry. A test is not added for a case that needs two cooperating users and exact timing. |
| A stolen session can change the email without the password. | Accepted for coursework scope (P8). Reauthentication, new-address confirmation and an old-address notice are tracked in T16 for public release. |
| The 409 reveals that an email is registered to any signed-in user. | Accepted (P11), documented next to E02. The E31 rate limit is deferred to T16, with the shared limiter storage. |
| `AuthProvider` becomes stateful, so a stale value could outlive a server update. | The provider adopts a changed `user` prop (DD6) and a test covers it. |
| The T11 working-tree changes touch `AppHeader.tsx`, `apiClient.ts` and the server helpers. | Implement on top of them, edit only the account block and the one allowlist entry, and run the T11 tests with the profile tests. |
