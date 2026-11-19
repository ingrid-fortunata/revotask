# Design Document: profile (T12)

## Overview

This design implements the profile update (E31), the `/profile` page, the safe user context refresh and the AppHeader account link (root T12). It follows `requirements.md` (Requirements 1 to 8, decisions P1–P18) and the shared design D2 and D5. Python (Flask, SQLAlchemy, Marshmallow, pytest) and TypeScript (Next.js App Router, Tailwind, daisyUI, Vitest) are the languages already in the repository. No table, migration, dependency, `docs/API.md` path or method changes.

**Revision 2 (2026-11-19).** The email becomes read-only and the profile gains an optional password change (P12–P18). E31 accepts `name`, the Password_Pair (`current_password`, `new_password`) or both, and rejects `email` as an unknown key. The service verifies the current password on the locked row and stores a new Argon2id hash. The form shows the email read-only and puts the password fields behind a "Change password" control. The email-only parts of Revision 1 are removed: the `uq_users_email` mapping, the 409 and the email rules on E31 and the form. Everything else (the lock, the no-op, the context refresh, the header link, the Next handler) stays. The contract clarifications C23–C27 are revised in place (below) and recorded in `docs/API.md`, `specs/CHANGELOG.md` and the shared documents at finalize.

### Verified facts about the existing code

| Fact | Where | Consequence |
|---|---|---|
| `GET /api/users/me` (E30) and `PATCH /api/users/me` (E31) are the two routes of `users_bp`. Both use `token_required` and `PublicUserSchema` (`id`, `name`, `email`). | `backend/app/blueprints/users/routes.py`, `schema.py` | Revision 2 edits E31 only. No new route or blueprint. |
| `token_required` loads `g.current_user` after it checks the signature, expiry and revocation. The token identity is the user ID. Revocation is a list of single `jti` values (`revoked_tokens`), not a per-user marker. | `backend/app/auth_guard.py`, `models/revoked_token.py` | A password change cannot invalidate other sessions without a new column (P15). The session stays valid, and revoking others is a T16 item. |
| `users.password_hash` is `Text`, not null. `AuditMixin.updated_at` has `onupdate=utcnow`. | `backend/app/models/user.py`, `base.py` | Assigning a new hash issues an `UPDATE` that moves `updated_at`. No schema change. |
| `hash_password` and `verify_password` (Argon2id, `argon2-cffi`) live in `auth/service.py`. `verify_password` returns `False` for a mismatch, a bad hash or an invalid hash. | `backend/app/blueprints/auth/service.py` | E31 reuses both. A stored hash that cannot be read gives "Current password is incorrect." and no 500. |
| The register password rule is `validate.Length(PASSWORD_MIN, PASSWORD_MAX, error=REGISTER_PASSWORD_LENGTH)` then `_password_composition`. The login rule is `Length(1, PASSWORD_MAX, error=LOGIN_PASSWORD_LENGTH)`. `_password_composition` is private to `auth/schema.py`. | `backend/app/blueprints/auth/schema.py` | The profile schema reuses both rules. `_password_composition` is renamed `password_composition` so another module can import it (DD2). |
| `FIELD_MESSAGES` (`required`, `null`, `invalid`) lives in `app.validation`. `load_json_body` turns an unknown key into `fields.<key> = "Unknown field."` (Marshmallow `RAISE`) and a non-object into the body message. A schema-level error without a field key is dropped and replaced by the body message. | `backend/app/validation.py` | `email` needs no code: it is no longer a declared field, so it is an unknown key. The pairing rule uses a field-keyed schema error (DD2). `{}` still needs its own check in the route. |
| `ApiError(fields=...)` carries a field-keyed 400. `RequestValidationError` is `400 VALIDATION_ERROR`. | `backend/app/exceptions.py` | The wrong-current-password 400 is `RequestValidationError(fields={"current_password": "Current password is incorrect."})`. No new exception. |
| `update_profile(user, *, name, email)` locks the row with `with_for_update()` and `populate_existing`, sets the values that differ, commits once, maps 23505 on `uq_users_email` to `EmailAlreadyExistsError`. | `backend/app/blueprints/users/service.py` | Revision 2 keeps the lock and the single commit, drops the email and the 23505 mapping, adds the password step. |
| `register_response_headers` adds `Cache-Control: private, no-store` to every `/api/` response except health. | `backend/app/response_headers.py` | E30 and E31 get it by default. A test proves it. |
| `handlePrivateWrite(request, spec)` checks environment, Origin (403), cookie (401), JSON media type (415), size (413), JSON object (400) and the key set, calls Flask, passes the reply through and clears the cookie on 401. Its server log line holds the request ID, route key and outcome only, never a body. | `frontend/lib/server/privateRoute.ts`, `bff.ts`, `flask.ts` | The Profile_Handler changes only `allowedKeys`. A password stays out of logs by the existing rule (Requirement 3.7, 8.2). |
| `apiRequest(method, path, body)` accepts a pair only when it matches `DECLARED_BOARD_REQUESTS`. `PATCH /api/users/me` is declared. | `frontend/lib/apiClient.ts` | No change. |
| `AuthProvider` holds a state copy of three fields with `setUser`, and `useAuth()` returns `{ user, setUser }`. | `frontend/components/auth/AuthContext.tsx` | No change. A password never reaches it. |
| `FormField` has `id`, `name`, `label`, `type`, `value`, `error`, `hint`, `autoComplete`, `inputClassName`, `inputRef`, `onChange`. It has no `readOnly`. It sets `text-base` and `min-h-11 min-w-11`. | `frontend/components/shared/FormField.tsx` | The read-only Email needs one new optional prop, `readOnly` (DD9). |
| `RegisterForm` is the model for a controlled form with a `type="password"` field (`autoComplete="new-password"`), `PASSWORD_HINT`, `FormField`, `useErrorHandler`, focus on the first invalid field and a form-level `role="alert"`. It has no confirm field. | `components/auth/RegisterForm.tsx`, `lib/authRules.ts` | `ProfileForm` follows it, so the password section matches register (P17). |
| `lib/authRules.ts` has `REGISTER_SPEC` (name, email, password), `LOGIN_SPEC` (password: 1 to 10), the generic `validate(spec, raw, partial)` and `PROFILE_FIELDS = ["name","email"]`, `profileChanges`, `validateProfile`. | `frontend/lib/authRules.ts` | The profile spec gets `name`, `current_password` (login rule) and `new_password` (register rule). `profileChanges` and `validateProfile` are rewritten for it. |
| `specs/fixtures/auth-field-cases.json` has a `profile` section (base `{name,email}`, cases with `set`, `drop`, `expect`). Flask and `authRules.test.ts` both run it. | `specs/fixtures/` | The section is rewritten for the new keys (DD3). The register and login sections are untouched. |
| `Tracker` and `BoardTracker` track users, tokens and board rows. `race(app, jobs)` runs requests in threads on the guarded test database. `profile_helpers.py` holds the profile test helpers. | `backend/tests/` | Profile tests reuse them. |

## Architecture

```text
Browser                         Next.js (Vercel)                         Flask (Render)
 /profile (Server Component) ─ getCurrentUser() ─ fetchPrivate("me") ─────▶ E30
  ProfileForm  (Name, Email read-only, [Change password] → Current, New)
   save ─ apiRequest("PATCH","/api/users/me",{name?, current_password?, new_password?})
        ─▶ PATCH handler (handlePrivateWrite, keys name,current_password,new_password) ─▶ E31
   200 ─ setUser(response) ─ router.refresh() ─ toast "Profile updated."
 AppHeader ─ account Link ─▶ /profile
```

E30 never reaches the browser. The token stays in the HttpOnly cookie. E31 is the only write, through one same-origin PATCH handler. A password travels once, in the E31 request body over HTTPS, and is never stored in the browser, the context or a log. Flask re-validates everything and stays authoritative.

### Key design decisions

| ID | Decision | Rationale |
|---|---|---|
| DD1 | `update_profile(user, *, name=None, current_password=None, new_password=None)` locks the Caller's user row (`SELECT … FOR UPDATE`, `populate_existing`). If a Password_Pair was sent, it checks `verify_password(row.password_hash, current_password)` on that locked row and, on a mismatch, rolls back and raises `RequestValidationError(fields={"current_password": "Current password is incorrect."})`. It then sets the name when it differs and `password_hash = hash_password(new_password)` when a pair was sent, and commits once. It writes nothing when nothing differs. | The lock makes every decision on the current row, so every outcome is one serial order of overlapping requests (P10). Verifying on the locked row means a second password change that used the old password finds a changed hash and is refused (Requirement 1.8). The single commit makes name and password one atomic unit (P3, P16). A wrong password raises before any assignment, so nothing is written. An unchanged name with no pair issues no `UPDATE` (P2). The hash runs under the lock, which costs about one hash time for that one user's row and blocks no other user. |
| DD2 | `ProfileUpdateSchema` (Marshmallow, `unknown = RAISE`) declares `name` (`TrimmedString`, `Length(1, NAME_MAX)`), `current_password` (`fields.String`, `Length(1, PASSWORD_MAX, error=LOGIN_PASSWORD_LENGTH)`) and `new_password` (`fields.String`, `Length(PASSWORD_MIN, PASSWORD_MAX, error=REGISTER_PASSWORD_LENGTH)` then `password_composition`), all optional, with `error_messages=FIELD_MESSAGES`. A `@validates_schema(skip_on_field_errors=False)` check reads `original_data` and, when exactly one of the two password keys is present, raises `ValidationError("Required.", "<missing key>")`. `email` is not declared, so it is `Unknown field.` The route rejects an empty loaded dict with `RequestValidationError()`. `_password_composition` becomes `password_composition` in `auth/schema.py`. | Same rules and fixed messages as E02 and E03 (Requirement 1.3). Reusing the register validators means the new-password rule cannot drift (P17). The pairing check reads `original_data` so that it still fires when the present half is invalid, which keeps Flask and the client rules in agreement (Property 13). A password is never trimmed (plain `fields.String`). |
| DD3 | One fixture, two readers. The `profile` section of `specs/fixtures/auth-field-cases.json` is rewritten: base `{name, current_password, new_password}`, the same `set` and `drop` form. The Flask schema test and `authRules.test.ts` both run it. | A rule difference between Flask and Next fails a test (P4, Requirement 8.6). The register and login sections stay unchanged. |
| DD4 | No uniqueness handling. `update_profile` catches `SQLAlchemyError`, rolls back and re-raises (sanitized 500). There is no 409. | E31 no longer writes a unique column (P12). A database failure after a password check changes nothing. |
| DD5 | The browser sends `name` only when its Normalized_Value differs from the saved one, and the Password_Pair only when a password field holds text, after `validateProfile` passes. A pristine form cannot submit. | Smaller bodies, and a user who never opens the section never sends a password key (P7, P13). |
| DD6 | `AuthProvider` and `setUser` are unchanged. `ProfileForm` calls `setUser(parsePublicUser(response))` after a save. | The three-field copy keeps AUTH-AC11.6. A password never enters the context. |
| DD7 | The AppHeader account link is unchanged. | P5. |
| DD8 | No session change on a password update. No code reads a password or an email from a token or session. | P15, Requirement 3.4 and 3.9. Tested with a token that still works after a change and a fresh login. |
| DD9 | One shared-part change: `FormField` gets an optional `readOnly?: boolean` that sets `readOnly` on the input and nothing else. `ProfileForm` passes `readOnly` and `inputClassName="bg-base-200 text-base-content/70"` for the Email. No other shared part changes. | A `readOnly` input stays focusable and readable by a screen reader, unlike `disabled` (Requirement 4.2). The muted look uses existing daisyUI semantic tokens, so no new color (FE-D1). |
| DD10 | The Password_Section is a `div id="profile-password-section"` that is always in the DOM and carries `hidden` while closed. The password fields are rendered only while it is open. The toggle is a `BaseButton variant="ghost"` with `aria-expanded` and `aria-controls`. Closing it empties both password values and their errors. | `aria-controls` always points at a real element. A closed section has no password input in the DOM, so nothing can be sent or autofilled by mistake (Requirement 4.4, 4.10). |

## Components and Interfaces

### Backend layout

```text
backend/app/blueprints/users/
  routes.py     E30 (existing) and E31 (revised)
  schema.py     PublicUserSchema (existing), ProfileUpdateSchema (revised)
  service.py    update_profile (revised)
backend/app/blueprints/auth/schema.py   _password_composition → password_composition
```

`users/service.py` imports `hash_password` and `verify_password` from `auth/service.py`. It no longer imports `EMAIL_UNIQUE_CONSTRAINT`, `is_unique_violation` or `EmailAlreadyExistsError`. `auth/service.py` does not import the users blueprint, so there is no cycle.

### Routes

| ID | Method and path | Handler behavior |
|---|---|---|
| E30 | `GET /api/users/me` | Unchanged. |
| E31 | `PATCH /api/users/me` | `@token_required`. `data = load_json_body(ProfileUpdateSchema())`. `if not data: raise RequestValidationError()`. `user = update_profile(g.current_user, **data)`. Return `jsonify(data=PublicUserSchema().dump(user))` with 200. No limiter in v1 (P11, P18). |

### Check order

1. Authentication (401): missing, malformed, expired, revoked token.
2. Media type (415), size (413), JSON syntax (400), JSON object (400).
3. Field validation (400, `fields` per key). Unknown keys (`email` included) are field entries with `Unknown field.`. A half pair adds `Required.` for the missing key.
4. Empty object (400, standard message).
5. The update: lock, current-password check (400, `fields.current_password`), assignments, one commit. Any database failure is the sanitized 500.

A request that fails steps 1 to 4 opens no write transaction beyond the guard's read and runs no hash check (Requirement 2.9).

### Schema sketch

```python
class ProfileUpdateSchema(Schema):
    class Meta:
        unknown = RAISE

    name = TrimmedString(error_messages=FIELD_MESSAGES,
                         validate=validate.Length(min=1, max=NAME_MAX, error=NAME_LENGTH))
    current_password = fields.String(error_messages=FIELD_MESSAGES,
                         validate=validate.Length(min=1, max=PASSWORD_MAX, error=LOGIN_PASSWORD_LENGTH))
    new_password = fields.String(error_messages=FIELD_MESSAGES,
                         validate=[validate.Length(min=PASSWORD_MIN, max=PASSWORD_MAX,
                                                   error=REGISTER_PASSWORD_LENGTH),
                                   password_composition])

    @validates_schema(skip_on_field_errors=False)
    def both_or_neither(self, data, **kwargs):          # reads original_data via pass_original
        ...
```

The check is written with `pass_original=True`: `present = {"current_password", "new_password"} & original_data.keys()`. When `len(present) == 1`, it raises `ValidationError(REQUIRED, <the other key>)`. A key that holds `null` counts as present (it gets its own `Required.` from the field).

### Service sketch

```python
def update_profile(user, *, name=None, current_password=None, new_password=None) -> User:
    try:
        row = db.session.scalar(select(User).where(User.id == user.id)
                                .with_for_update().execution_options(populate_existing=True))
        if new_password is not None:                       # the schema guarantees both or neither
            if not verify_password(row.password_hash, current_password):
                db.session.rollback()                      # release the lock, write nothing
                raise RequestValidationError(fields={"current_password": WRONG_PASSWORD})
            row.password_hash = hash_password(new_password)
        if name is not None and name != row.name:
            row.name = name
        db.session.commit()                                # no dirty column: no UPDATE, updated_at stays
    except SQLAlchemyError:
        db.session.rollback()
        raise
    return row
```

The name is already trimmed by the schema. A `None` argument means "not sent"; the schema never produces `None` for a sent field, because `null` is rejected. The row is the same object as `g.current_user` (one identity map), so the dump that follows reads the stored values after the commit refresh. `WRONG_PASSWORD = "Current password is incorrect."` is a module constant. The new hash is a fresh Argon2id string with its own salt, so even the same new password stores a different hash and `updated_at` moves.

Concurrent same-account requests queue on the lock and each runs on the fresh row, so the outcome is one serial order. A name-only request and a password request both commit, in either order, and keep both changes. Two password requests that carry the same current password: the first commits, the second verifies against the new hash and gets the 400. Two name requests: the last to commit wins.

### Serialization

`PublicUserSchema` stays the only output shape. No new output schema. A password, a hash and the timestamps never leave the API.

### Next handler and client allowlist

```text
frontend/app/api/users/me/route.ts    PATCH only
```

```ts
export async function PATCH(request: NextRequest) {
  return handlePrivateWrite(request, {
    route: "me",
    method: "PATCH",
    allowedKeys: ["name", "current_password", "new_password"],
    requiredKeys: [],
  });
}
```

The handler adds no GET, so the browser cannot read E30. A body with another key (`email` included) gets 400 `fields.<key> = "Unknown field."` from `readJsonObject` and is not forwarded. `{}` passes the handler and Flask returns the 400. `lib/apiClient.ts` already declares `PATCH /api/users/me`. No other `/api/users` path is declared.

### Frontend layout

```text
frontend/app/(protected)/profile/page.tsx      Server Component (copy changes)
frontend/components/profile/ProfileForm.tsx    client form (revised)
frontend/components/shared/FormField.tsx       + readOnly prop
frontend/lib/authRules.ts                      PROFILE_FIELDS, validateProfile, profileChanges (revised)
frontend/app/api/users/me/route.ts             allowedKeys (revised)
```

`AuthContext.tsx`, `AppHeader.tsx` and `apiClient.ts` do not change.

### Rules (`lib/authRules.ts`)

```ts
export const PROFILE_FIELDS = ["name", "current_password", "new_password"] as const;
export type ProfileKey = (typeof PROFILE_FIELDS)[number];

const PROFILE_SPEC: Record<ProfileKey, FieldSpec> = {
  name: REGISTER_SPEC.name,
  current_password: LOGIN_SPEC.password,      // 1 to 10, no composition (P17)
  new_password: REGISTER_SPEC.password,       // 8 to 10 with composition
};

// Values to send: name when its normalized value differs from `savedName`; each password key
// only when its field holds text. An empty password field is "not sent".
export function profileChanges(values: Record<ProfileKey, string>, savedName: string): Partial<Record<ProfileKey, string>>;

// validate(PROFILE_SPEC, raw, partial = true), then: when exactly one password key is present
// in `raw`, the other gets "Required." (the Flask pairing rule). An unknown key, `email`
// included, is "Unknown field.".
export function validateProfile(raw: Record<string, unknown>): Validated<ProfileKey>;
```

An empty password field is dropped by `profileChanges`, so the half-pair case shows `Required.` for the empty one, as Requirement 4.7 says. A password made of spaces is non-empty, is sent as typed and follows the length and composition rules, like Flask. The form never sends an empty object, because Save is disabled when nothing changed.

### `AuthContext`

Unchanged from Revision 1 (stateful, `setUser` copies `id`, `name`, `email` only, follows a changed `user` prop).

### `ProfileForm`

Props: `user: PublicUser`. State: `savedName` (the last stored name), `values` (`name`, `current_password`, `new_password`), `passwordOpen`, `fieldErrors`, `formError`, `pending`. Refs for the three inputs.

- `dirty` is true when `profileChanges(values, savedName)` is not empty. `Save changes` is `disabled` when `!dirty || pending`.
- The toggle: `Change password` (closed) or `Cancel password change` (open). Opening sets `passwordOpen`. Closing sets `passwordOpen` false, empties both password values and removes their errors. Focus stays on the toggle.
- Submit: ignore when pending. Compute `changes`. If empty, return. `validateProfile(changes)`: on errors show them inline, focus the first invalid field in `PROFILE_FIELDS` order and send nothing. Otherwise `setPending(true)`, `apiRequest("PATCH", "/api/users/me", body)`, `parsePublicUser(data)`.
- Success: `setSavedName(next.name)`, `setValues({ name: next.name, current_password: "", new_password: "" })`, `setPasswordOpen(false)`, clear errors, `setUser(next)`, `router.refresh()`, `notifySuccess("Profile updated.")`.
- Failure: `handleError(error, { onFields: showFieldErrors, onFormError: setFormError })`. `fields.current_password` shows under Current password and the section stays open. A 5xx, a rate limit or a transport error is a toast. `AUTH_REQUIRED` redirects to `/login`. Typed values are never reset on failure. `pending` is cleared in every outcome. `showFieldErrors` keeps its Revision 1 rule: a key without a field becomes the form-level message "Check the submitted fields.".
- Markup: `<form noValidate aria-busy>`; an optional `role="alert"` for `formError`; `FormField` `profile-name` (`autoComplete="name"`); `FormField` `profile-email` (`type="email"`, `readOnly`, `value={user.email}`, `hint="You sign in with this email. It cannot be changed."`, no `onChange` effect, no `name` sent); the toggle; the section with `FormField` `profile-current-password` (`type="password"`, `autoComplete="current-password"`, label "Current password") and `profile-new-password` (`type="password"`, `autoComplete="new-password"`, label "New password", `hint={PASSWORD_HINT}`); `BaseButton type="submit" loading={pending}` "Save changes" and "Saving…" while pending. The email value comes from the user prop and is not part of `values`, so it can never be sent.

### Page

```tsx
export default async function ProfilePage() {
  const user = await getCurrentUser();
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1>
      <section className="surface mt-4 w-full p-4 sm:mt-6 sm:p-5">
        <h2 className="text-lg font-semibold">Your details</h2>
        <p className="mt-1 text-sm text-base-content/70">Change your name or your password. Your email cannot be changed.</p>
        <div className="mt-4"><ProfileForm user={user} /></div>
      </section>
    </main>
  );
}
```

The page follows FE-D4 (title, then content in one `.surface`). The panel fills the width of the `main` wrapper (full width, by the user's request on 2026-11-17). The page no longer says that password changes are unavailable.

### AppHeader

Unchanged from Revision 1: the account block is a `Link` to `/profile` with `aria-label="Profile, <name>"`, `aria-current="page"` on `/profile`, a 44 px box and the focus ring of the nav links. `guidelines/frontend.md` FE-D2 already records it.

### Mobile design (Requirements 6, 7, FE-S4 to FE-S6, FE-D9)

- Base classes are for the smallest width: a single column, `FormField` full width, `BaseButton` `w-full sm:w-auto`. The toggle is `w-full sm:w-auto` and left aligned from 640 px.
- `FormField` already sets `text-base` and `min-h-11 min-w-11`. Long names and emails wrap in the hint and error text (`break-words`). A long email scrolls inside its read-only input and cannot widen the page. The panel has `min-w-0`. The password hint is plain wrapping text.
- At 320 and 375 px the header's first row holds the brand, the account link (name truncated to `28vw`) and Log out. The nav row holds Boards and My tasks. Each is at least 44 by 44 CSS px. A browser check measures all four, tabs through them for a visible focus ring, and checks `scrollWidth <= clientWidth` and that the header bottom does not pass the `main` top (Requirement 6.3). The form check runs with the section closed and open.

## Data Models

No schema change. Wire shapes:

```text
E31 request:  {"name"?: string, "current_password"?: string, "new_password"?: string}
              at least one key; current_password and new_password come together
E31 200:      {"data": {"id","name","email"}}
E31 400:      {"error": {"code":"VALIDATION_ERROR", "message", "fields"?: {key: message}}}
              (includes fields.current_password = "Current password is incorrect.")
```

There is no E31 409. Frontend types: `PublicUser` and `parsePublicUser` already exist.

## Error Handling

| Condition | Flask | Next handler | UI |
|---|---|---|---|
| No or bad token | 401 `AUTH_REQUIRED` | 401, clears the cookie | Redirect to `/login` |
| Wrong Origin | n/a | 403 | Toast (fixed copy) |
| 415, 413, bad JSON | 415, 413, 400 | Same, from the helper | Toast or form message |
| Unknown key (`email` included), bad value, half pair | 400 `fields` | 400 `Unknown field.` for an unknown key, else passes Flask's | Inline, focus first field |
| Empty object | 400, standard message | Passed through | Not reachable from the form (Save disabled) |
| Wrong current password | 400 `fields.current_password` | Passed through | Inline under Current password, section stays open, values kept |
| Database or other failure | Sanitized 500 | Passed through | Toast, values kept, Save enabled |
| Flask down | n/a | 502/503 envelope | Toast |

## Testing Strategy

### Approach

Parameterized pytest, Vitest and React Testing Library, as in the earlier slices. Tests assert status, body, stored rows, rendered text, roles and the requests sent. The Playwright journey (V10) is delivered in T15. Test passwords are fixed non-secret values that meet the rules, such as `Old#pass1` and `New#pass2` (9 characters), never real credentials.

### Test data isolation (Requirement 8.7)

Database-writing tests use the `board_tracker` fixture on the app built from `TEST_DATABASE_URL` through `db_guard`. Every user a test creates is tracked and deleted at teardown, pass or fail. No `TRUNCATE`, no name pattern, never `DATABASE_URL`. `test_profile_cleanup.py` stays as it is and proves the sentinel user survives.

### Backend test files (V07)

| File | Covers |
|---|---|
| `test_users_profile_schema.py` | The rewritten `profile` fixture cases, `FIELD_MESSAGES` parity with the register schema, `password_composition` and the lengths shared with register and login, the pairing rule with a present but invalid half, an unknown key (`email`) echoes no value, no message contains a submitted password (sentinel string). |
| `test_users_profile.py` | 200 (name only, Password_Pair only, both, trimmed name, unchanged name), `updated_at` moved only by a real change and by every password change, the response allowlist, no event and no notification row, `Cache-Control` on every response. 400: `{}`, non-object, `email` alone and beside a valid field, `password`, `password_hash`, `id`, `created_at`, unknown key, `null`, wrong types, blank or 81-character name, `new_password` of 7 and 11 characters and without each character class, `current_password` of 0 and 11 characters, each half pair, each leaving the stored row unchanged. 415, 413, malformed JSON. 401: none, malformed, expired, revoked. Check order, including that no hash check runs for a rejected body (patch `verify_password` and assert no call). |
| `test_users_profile_password.py` (replaces `test_users_profile_conflict.py`) | A wrong `current_password` returns 400 on `fields.current_password` with the fixed message, and leaves the stored name and hash intact when a valid name is sent beside it (the hash read from the database). A right one stores an Argon2id hash that verifies the new password and not the old, and differs from the old hash. The message contains no submitted value. A legacy hash that cannot be parsed gives the same 400 and no 500. The email is the same after every request in the file. |
| `test_users_profile_concurrency.py` | Deterministic lock test: a second session locks the row, a name-only request that sends the stored name blocks, the second session changes the name and commits, the request then writes its value. A name-only and a Password_Pair request on one account, repeated with a barrier, always keep both changes. Two name requests leave one of the two values and no 409. Two Password_Pair requests with the same `current_password` leave exactly one 200 and one 400, and the stored hash verifies the winner's new password. Both fields in one request apply together (checked with a concurrent reader). |
| `test_users_profile_session.py` | A token minted before a password change still works, and so does a second session's token. E30 with it returns the unchanged email. A fresh login with the same email succeeds with the new password and returns 401 `INVALID_CREDENTIALS` with the old. The token identity is the user ID (`sub`). |
| `test_users_profile_names.py` | After a name change, the board member list, E21 `assignee_name` and a comment read (`author_name`) show the new name (P9). Another user's row is unchanged, also after a password change. |
| `test_users_profile_logging.py` | Log output for a profile update (name, password pair, a rejected body) contains no name, password or body. |
| `test_profile_cleanup.py` | Teardown isolation, including the sentinel user. Unchanged. |

### Frontend test files (Vitest and RTL)

| File | Covers |
|---|---|
| `lib/authRules.test.ts` (revised) | The rewritten `profile` fixture cases, `profileChanges` (name only when changed, a password key only when non-empty, nothing when pristine), `validateProfile` for a partial body, a half pair, an unknown key and `email`. |
| `components/profile/ProfileForm.test.tsx` (revised) | Seeded Name, read-only Email (`readOnly`, same value as the user, no `onChange` effect, never in a request), collapsed section with no password input in the DOM, open and close with `aria-expanded`, closing empties the fields and errors, Save disabled when pristine and while pending, the name sent only when changed, the pair sent only when a password field holds text, `Required.` for the empty half, the field rules, inline 400 and focus order, the inline wrong-current-password message that keeps the section open and the typed text, the success toast, reseed, emptied and closed section, `setUser` and `router.refresh()` called, a second submit ignored while pending, a 5xx and a transport error keep the text and re-enable Save. |
| `components/shared/FormField.test.tsx` (extended) | `readOnly` sets the attribute and changes nothing else. |
| `app/(protected)/profile/page.test.tsx` | Calls the session helper, renders the form with the stored values, no "password changes are not available" text, redirects on a missing session, error state. `pages.guard.test.ts` covers the page automatically. |
| `components/auth/AuthContext.test.tsx`, `components/shared/AppHeader.test.tsx` | Unchanged. They run in the full suite. |
| `app/api/users/me/route.test.ts` (revised) | Valid request for name only, Password_Pair only and both, 403 for a wrong Origin, 401 clears the cookie, 415, 413, 400 for bad JSON and for `email`, an unknown key not forwarded, `{}` forwarded, no token in the response, `private, no-store`, Flask 400 passed through. |
| `lib/apiClient.test.ts` | Unchanged. It already declares `PATCH /api/users/me` and no other `/api/users` path. |

### Browser checks (V07, V11)

`evidence/profile-mobile-measure.mjs` (Chrome, device emulation) is extended and runs at 320, 375, 768 and 1280 px against the local app: `/profile` pristine, with a field error, with the Password_Section open, with the wrong-current-password error, and after a save; the AppHeader at 320 and 375 px with Profile, Boards, My tasks and Log out each measured at 44 by 44 CSS px with `elementFromPoint`, tabbed for a visible focus ring, no horizontal overflow and no overlap. It runs the manual journey of Requirement 7.6, including a sign-out and a sign-in with the new password, and records the real result with the browser type (emulator, not a real device).

## Correctness Properties

1. **Allowlist.** For any request, the response data has exactly the keys `id`, `name` and `email`.
2. **Partial update.** For a submitted subset S of `{name, Password_Pair}`, the stored name and password hash outside S are unchanged. The email is always unchanged.
3. **Normalization.** The stored name is the trimmed input. A password is stored only as an Argon2id hash of the input as entered, never trimmed.
4. **No-op.** A name-only request whose Normalized_Value equals the stored name returns 200, runs no `UPDATE` and leaves `updated_at` unchanged. A request with a valid Password_Pair always changes the hash and `updated_at`.
5. **All or nothing.** If the request fails with any 4xx or 5xx, the stored name and password hash equal the values before the request.
6. **Current password.** A password changes only when `current_password` verifies against the stored hash at the moment the row is locked. Of any set of simultaneous requests that carry the same `current_password`, at most one commits a new password.
7. **Per-field last write wins.** The stored name is the name of the last committed request that submitted it. A request that does not submit a field never changes it.
8. **Rejected keys.** A body with any key outside `name`, `current_password` and `new_password` (`email` included) returns 400 with `Unknown field.` for each, whatever the other keys hold, and changes nothing.
9. **Pairing.** A body with exactly one of `current_password` and `new_password` returns 400 with `Required.` on the missing one and changes nothing.
10. **Session identity.** A password change leaves every token valid. A fresh login works with the unchanged email and the new password only.
11. **Isolation.** An update changes only the Caller's `users` row.
12. **Client request minimality.** The client sends only changed fields and sends nothing when pristine or invalid. It never sends the email.
13. **Rule parity.** For every `profile` fixture case, Flask and `validateProfile` give the same accepted values or the same field messages.
14. **Secrecy.** No password, hash or request body appears in a response, a log line, an error message, the Auth_Context, browser storage or the URL.
15. **Mobile.** At 320 and 375 px and wider, the profile page (section closed and open) and the AppHeader have no horizontal page scroll, and the four header controls and the form controls are at least 44 by 44 CSS px.

## Acceptance Criteria Map

| Requirement | API or UI | Task area | Verification |
|---|---|---|---|
| 1 Update (E31) | `users/service.py`, `routes.py`, `schema.py` | Backend | `test_users_profile.py`, `_password`, `_concurrency`, `_names`; Properties 1–7, 11 |
| 2 Rejected input | Schema, route, service | Backend | `test_users_profile.py`, `_schema.py`, `_password`; Properties 5, 8, 9 |
| 3 Auth, privacy, role | `token_required`, headers, no event | Backend | `_profile.py`, `_session.py`, `_logging.py`; Properties 10, 14 |
| 4 Profile page | `profile/page.tsx`, `ProfileForm`, `FormField` | Frontend | `page.test.tsx`, `ProfileForm.test.tsx`; Property 12 |
| 5 Feedback, context | `ProfileForm`, `AuthContext` | Frontend | `ProfileForm.test.tsx`, `AuthContext.test.tsx` |
| 6 Entry point | `AppHeader` | Frontend | `AppHeader.test.tsx`, browser check; Property 15 |
| 7 Mobile, accessible | Page, form, header | Frontend and browser | Browser check at 320, 375, 768, 1280; Property 15 |
| 8 Handler, allowlist, tests | `users/me/route.ts`, `apiClient.ts`, tests | Both | `route.test.ts`, `apiClient.test.ts`, fixture; Property 13 |

### Dependencies and gates

| Gate | Rule |
|---|---|
| A | Root T04 is verified. No gate blocks the start. |
| B | The backend E31 checks pass before the frontend sends a password. |
| C | The frontend, the full suites and `next build` pass before the mobile record is final. |
| D | Revision 2 is recorded as complete only after the backend, frontend, measured mobile check and journey pass. Root T12 stays checked while Revision 2 is open, with the open revision noted. Unverified work stays open with the actual reason. |

## Contract and Document Impact

| Clarification | Statement (Revision 2) | Documents |
|---|---|---|
| C23 | E31 is a partial update of `name`, the pair `current_password` and `new_password`, or both. `{}` and a non-object are 400. The pair comes together, otherwise 400 `Required.` on the missing key. | `docs/API.md` E31, `backend/specs/api-contract.md`, `specs/requirements.md` AC12.1 |
| C24 | A name equal to the stored one after trimming is a no-op: 200, no write, `updated_at` unchanged. A valid password pair is never a no-op. | Same |
| C25 | The update is all or nothing. A wrong `current_password` is 400 `VALIDATION_ERROR` with `fields.current_password` = "Current password is incorrect." (not 401, so the session stays) and the whole update rolls back, also when a valid `name` was sent. E31 returns no 409. | Same |
| C26 | Last write wins per submitted field. An omitted field is never written. Name and password apply atomically. The user row is locked, and the current password is checked on the locked row, so a second change with the same current password is refused. | Same |
| C27 | A key other than `name`, `current_password` and `new_password` is 400 with `fields.<key> = "Unknown field."`. This includes `email`, which is the fixed login key and cannot be changed, and `password`. A password change revokes nothing and sends nothing. E31 now verifies a password for a signed-in user, so a stolen session can guess it. The E31 rate limit, revoking other sessions and a change notice are deferred to T16. | Same, `docs/TEST-PLAN.md` V07, `specs/CHANGELOG.md` |

At finalize: `docs/API.md` E31 row and the C23–C27 paragraph, `backend/specs/api-contract.md` (`users_bp` row), `specs/requirements.md` AC12.1, `specs/traceability.md`, `specs/tasks.md` (the T12 note), `docs/TEST-PLAN.md` V07 and V11, `frontend/specs/pages-and-components.md` and `api-integration.md`, `docs/USER_GUIDE.md`, `specs/CHANGELOG.md` and `evidence/spec-review.md`. At implementation: the README, the changelogs and `evidence/profile-T12.md`. `guidelines/frontend.md` FE-D2 needs no change for the header. Its component table notes the `readOnly` prop of `FormField`. `specs/design.md` D5 already describes `/profile`.

## Review Items and Decisions

| ID | Item | Proposal | Reason |
|---|---|---|---|
| R1 | Lock the user row, or rely on the dirty-column `UPDATE` alone | Lock (DD1), as in Revision 1. | The lock also decides the current-password check on the fresh hash (Property 6). |
| R2 | Verify the password inside the lock, or before it | Inside. | A check before the lock would pass for two simultaneous requests that carry the same current password. The cost is one hash time under one user's row lock. |
| R3 | Rename `_password_composition` to `password_composition` | Yes. | One definition for two schemas, no import of a private name. |
| R4 | `readOnly` prop on `FormField` | Yes (DD9). | A `readOnly` input stays focusable and readable. `disabled` is skipped by Tab and by many screen readers. |
| R5 | Success toast text | "Profile updated." for every success, including a password change (P6). | One message, reported once. A separate "Password changed." message is possible if you prefer it. |
| R6 | Section control wording | "Change password" and "Cancel password change". | States the action in plain words (FE-D7). |
| R7 | Pairing rule placement in Flask | A `validates_schema` check on `original_data` with `skip_on_field_errors=False`. | The client rule reports the missing half beside other errors, so Flask does too (Property 13). |
| R8 | Email hint copy | "You sign in with this email. It cannot be changed." | Tells the user why the field is fixed. |

## Risks

| Risk | Mitigation |
|---|---|
| A stolen session can guess the current password through E31, and the 10-character maximum makes that easier. | Accepted for coursework scope (P18). The E31 rate limit is deferred to T16 and named in `docs/API.md` and the changelog. If a limit is wanted now, E31 can reuse `limiter` with a per-user key. |
| A password change leaves other sessions valid, so a stolen session survives it. | Accepted (P15). Revoking other sessions needs a `users.password_changed_at` column and a guard check. It is tracked in T16. |
| A mistyped new password locks the user out, because no reset exists and no confirm field is shown. | Accepted (P17). The section is opt-in, the hint states the rules, and a fresh login is part of the manual journey. A confirm field or show-password control can be added in a later revision. |
| The hash runs while the user's row is locked, so concurrent requests of one account wait. | The wait is one hash time and affects only that user. Other users are not blocked. |
| An older account with a stored password longer than 10 characters cannot enter it as the current password (the login rule caps it), so it cannot change it. | Same consequence as C12 for login, already accepted. T16 decides whether to keep the cap. |
| The password travels in the E31 body. | HTTPS in production. The same-origin handler never logs or echoes a body, and the tests assert no password in logs, responses or the context (Property 14). |
| `AuthProvider` is stateful, so a stale value could outlive a server update. | Revision 1 behavior and test stay. |
