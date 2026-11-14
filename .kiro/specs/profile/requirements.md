# Requirements Document

## Introduction

This slice covers root task T12: the profile update (E31, `PATCH /api/users/me`), the `/profile` page with a controlled form, the safe user context refresh, the entry point to the page in the shell, and the pytest and React tests for them. It implements AC12.1 and the mobile criterion AC13.1 (FE-S4–S6) for the new page and the new link. Verification covers V07 (pytest and React Testing Library) and V11 (375 px and wider). The automated Playwright journey (V10) is delivered in T15.

The authentication slice already provides the E30 read (`GET /api/users/me`), `PublicUserSchema` (an allowlist of `id`, `name`, `email`), the E02 field rules (`TrimmedString`, `NormalizedString`, `email_format`, `NAME_MAX`, `EMAIL_MAX` in `app.validation` and `auth/schema.py`), the `uq_users_email` unique constraint and its 23505 mapping (`is_unique_violation`, `EmailAlreadyExistsError`), `token_required`, `load_json_body`, the same-origin write helper `handlePrivateWrite`, `getCurrentUser()`, `AuthProvider`, `useErrorHandler`, `FormField`, `BaseButton`, `lib/authRules.ts` and the field-case fixture `specs/fixtures/auth-field-cases.json`. The database already holds every column this slice writes (`users.name`, `users.email`, `users.updated_at`). No table, migration or dependency is added. `docs/API.md` already lists E31 and no path, method or response field changes.

Out of scope: password change or reset, a current-password confirmation, email verification or confirmation mail, avatar upload, account deletion, a "member since" date, notification preferences, editing another user's profile, a rate limit on E31, real-time refresh of names on other open screens, notifications (T13) and analytics (T14). Reauthentication for an email change, confirmation of the new address, a notice to the old address and the E31 rate limit are deferred to T16 for public release (P8, P11).

Decisions P1–P11 were approved on 2026-11-14 with the clarifications recorded in "Approved decisions" at the end. Each is stated as a requirement below.

## Glossary

- **Profile_API**: The Flask handler for E31 (`PATCH /api/users/me`), in the `users` blueprint. E30 is the read.
- **Caller**: The signed-in user identified by the bearer token. E30 and E31 act only on the Caller. There is no user ID in the path or the body.
- **Public_User**: The wire shape `{id, name, email}`. No other field leaves the API (D3).
- **Profile_Fields**: `name` and `email`, with the E02 rules: `name` trimmed, 1 to 80 characters; `email` trimmed and lowercased, valid format, at most 254 characters. Lengths count Unicode code points.
- **Normalized_Value**: A Profile_Field value after trim (and lowercase for the email). Comparisons and storage use it.
- **Profile_Page**: The protected Server Component at `/profile`.
- **Profile_Form**: The client form on the Profile_Page, controlled and seeded from the Public_User.
- **Auth_Context**: The client context that holds the Public_User for interactive consumers.
- **Account_Link**: The link in the AppHeader account block that opens the Profile_Page.
- **Profile_Handler**: The same-origin Route Handler `PATCH /api/users/me` on the Next.js origin.
- **Test_Database**: The database named by `TEST_DATABASE_URL`.

## Requirements

### Requirement 1: Update my profile (E31)

**User Story:** As a signed-in user, I want to change my name or email, so that my account shows who I am today.

#### Acceptance Criteria

1. WHEN the Caller sends E31 with a JSON object that holds `name`, `email` or both, and every sent value meets its rule, THE Profile_API SHALL store each sent Normalized_Value and return 200 with the Public_User as the data (AC12.1, P1).
2. THE Profile_API SHALL leave a field that the request does not send unchanged, also when another request changes that field at the same time. A request that sends only `name` SHALL NOT change the email, and a request that sends only `email` SHALL NOT change the name (P10).
3. THE Profile_API SHALL trim `name` and `email`, lowercase `email`, and count length in Unicode code points, with the same rules and the same fixed messages as E02 (`Required.`, `Must be text.`, `Must be 1 to 80 characters.`, `Must be at most 254 characters.`, `Enter a valid email address.`). A message SHALL NOT contain the submitted value.
4. WHEN every sent Normalized_Value equals the stored value, THE Profile_API SHALL return 200 with the unchanged Public_User, write no row and leave `updated_at` unchanged. An email that differs from the stored one only by case or surrounding space is such a value (P2).
5. THE Profile_API SHALL change `updated_at` only when it stores a different value.
6. THE Profile_API SHALL apply the whole update or none of it. IF the update fails for any reason, including a duplicate email sent beside a valid `name`, THEN the stored name and email SHALL be unchanged (P3).
7. THE Profile_API SHALL return only `id`, `name` and `email`. A response SHALL NOT contain `password`, `password_hash`, `created_at`, `updated_at`, a token or any other field (AC12.1).
8. WHEN two requests for the same account run at the same time, one sending only `name` and one sending only `email`, THE Profile_API SHALL keep both changes. WHEN two requests send the same field, the one that commits last SHALL win for that field, and neither SHALL be reported as a conflict. A request that sends both fields SHALL apply both or neither, and SHALL NOT interleave with another update of the same account (P10).
9. THE Profile_API SHALL change only the Caller's row. No other user, board, membership, card or comment row changes. A later read of a board, a member list, a card assignee or a comment SHALL show the new name, because each read that resolves a name takes it from the user row (P9).

### Requirement 2: Rejected input

**User Story:** As an account holder, I want clear errors when my input is not accepted, so that I know what to fix and nothing changes by accident.

#### Acceptance Criteria

1. IF the body is not a JSON object, or is an empty object `{}`, THEN THE Profile_API SHALL return 400 `VALIDATION_ERROR` and change nothing (P1).
2. IF the body holds any key other than `name` and `email`, THEN THE Profile_API SHALL return 400 `VALIDATION_ERROR` with `fields.<key>` set to `Unknown field.` for each such key, and change nothing. This holds for `password`, `current_password`, `new_password`, `password_hash`, `id`, `created_at` and every other key, also when a valid `name` or `email` is sent beside it (AC12.1, P8).
3. IF `name` or `email` is `null`, a number, a boolean, an array or an object, THEN THE Profile_API SHALL return 400 with `fields.<name>` set to `Required.` for `null` and `Must be text.` for the other types.
4. IF `name` is empty or whitespace only, or longer than 80 characters after trimming, or IF `email` is empty or whitespace only, has an invalid format or is longer than 254 characters, THEN THE Profile_API SHALL return 400 with `fields.<name>` set to the fixed message, and change nothing.
5. IF the Normalized_Value of `email` belongs to another user, THEN THE Profile_API SHALL return 409 `EMAIL_ALREADY_EXISTS` with the standard message "An account with this email already exists." and change nothing. The unique constraint `uq_users_email` decides, so two simultaneous requests for the same new email commit at most once and the other returns 409 (AC01.2 rule applied to E31, P3).
6. WHEN the Caller sends the Caller's own current email in another case, THE Profile_API SHALL NOT return 409 (Requirement 1.4).
7. IF the request has a wrong `Content-Type`, THEN THE Profile_API SHALL return 415. IF the body is above the size limit, THEN 413. IF the JSON is malformed, THEN 400. The central handlers return these in the JSON envelope, as for the other write endpoints.
8. IF a database write fails for any other reason, THEN THE Flask error handlers SHALL return the sanitized 500 envelope, and the stored name and email SHALL be unchanged.
9. THE Profile_API SHALL check, in this order: authentication (401), then the body (415, 413, 400), then the update (409, 500). A request that fails validation SHALL write nothing and run no uniqueness check.

### Requirement 3: Authentication, privacy and role boundary

**User Story:** As a user, I want only me to be able to read or change my profile, so that my account stays mine.

#### Acceptance Criteria

1. THE Profile_API and the E30 read SHALL require a valid bearer token. A missing, malformed, expired or revoked token SHALL return 401 `AUTH_REQUIRED` and change nothing.
2. THE Profile_API and the E30 read SHALL add `Cache-Control: private, no-store` to every response, success and error.
3. THE Profile_API SHALL act on the user named by the token and on no other. A board admin, a board member and a user with no board all have the same rights: each may change only their own name and email. No role, board or membership changes what E31 does.
4. WHEN the Caller changes the email, THE Profile_API SHALL NOT revoke or reissue any token. The current session and every other open session of the Caller SHALL stay valid, because a token names the stable user ID and not the email. E30 with the existing token SHALL return the new email at once (P8).
5. WHEN the email changed, THE login endpoint (E03) SHALL accept the new email with the unchanged password in a fresh login and SHALL return 401 `INVALID_CREDENTIALS` for the old one. The password hash SHALL be unchanged (P8).
6. THE Profile_API SHALL NOT send mail, create a notification or record an event. Reauthentication, confirmation of the new address and a notice to the old address are not part of v1 and are tracked in T16 for public release (P8).
7. THE Profile_API SHALL NOT log a name, an email or a request body. Logs keep the request ID, route and outcome only.
8. THE slice SHALL keep every path, method and response shape in `docs/API.md` unchanged. The behavior that the contract leaves open SHALL be recorded as contract clarifications in the design, `docs/API.md` and `specs/CHANGELOG.md`: the partial-update semantics, the empty body 400, the unchanged-value no-op, the all-or-nothing rule, the per-field last-write-wins rule (P10) and the `Unknown field.` rule for forbidden keys. They SHALL also record that a `409 EMAIL_ALREADY_EXISTS` from E31 gives a signed-in user an additional account-enumeration path, alongside the existing E02 behavior, and that the E31 rate limit is deferred to T16 (P11).
9. THE session identity SHALL stay the stable user ID. No code path SHALL key a session, token or revocation on the email.

### Requirement 4: Profile page

**User Story:** As a signed-in user, I want a profile page that shows my current name and email in a form, so that I can edit them in one place.

#### Acceptance Criteria

1. WHEN a signed-in user opens `/profile`, THE Profile_Page SHALL verify the session, read the Public_User through `getCurrentUser()` and render the Profile_Form seeded with the current `name` and `email` (AC12.1, FE-C1, FE-A1). It SHALL make no second request for the same data.
2. THE Profile_Form SHALL have exactly two fields, `Name` and `Email`, each with a visible label, built with `FormField`, with `autocomplete="name"` and `autocomplete="email"`, and a `Save changes` button built with `BaseButton`. THE form SHALL have no password field and no hidden password input (AC12.1, P8).
3. THE Profile_Page SHALL follow the page pattern of FE-D4: a title "Profile", then the form in one `.surface` panel. It SHALL tell the user, in plain text, that password changes are not available yet (FE-D7, P8).
4. THE Profile_Form SHALL keep its values in local state. Typing SHALL NOT change the Auth_Context or the header.
5. THE Save changes button SHALL be disabled while the Normalized_Values equal the stored Public_User, and while a request is pending. A pristine form SHALL NOT send a request (P6, P7).
6. WHEN the user submits, THE Profile_Form SHALL validate the fields with the E02 rules of `lib/authRules.ts` before any request, show the field message inline under the field, move focus to the first invalid field and send nothing. It SHALL send only the fields whose Normalized_Value differs from the stored one, in a JSON object (P7).
7. WHILE a request is pending, THE Profile_Form SHALL show a pending state and ignore a second submit.
8. IF the session is missing or revoked, THEN THE Profile_Page SHALL redirect to `/login`, as the other protected pages do. IF the E30 read fails with a Flask outage or a 5xx, THEN THE Profile_Page SHALL show the app error boundary with a way to retry.
9. THE Profile_Page SHALL send no token to the browser. A user who reloads the page SHALL see the stored values.

### Requirement 5: Save feedback and the safe user context

**User Story:** As a user, I want to see that my change worked or why it did not, and I want the rest of the app to show my new name at once.

#### Acceptance Criteria

1. WHEN E31 returns 200 with a changed Public_User, THE Profile_Form SHALL show the success toast "Profile updated.", reseed its fields from the returned values (so a trimmed name and a lowercased email show as stored) and keep the user on the page (AC12.1, P6).
2. WHEN E31 returns 200, THE Auth_Context SHALL replace its Public_User with the three allowed fields of the response, so the AppHeader shows the new name without a reload. The Auth_Context SHALL copy only `id`, `name` and `email`, and SHALL drop any other property (AUTH-AC11.6).
3. WHEN E31 returns 200, THE Profile_Form SHALL ask Next.js to refresh the Server Components of the current route, so a later server read, including the protected layout, shows the stored values (P6).
4. IF E31 returns 400 with `fields`, THEN THE Profile_Form SHALL show each message inline under its field, keep the typed text, focus the first invalid field and show no success toast.
5. IF E31 returns 409 `EMAIL_ALREADY_EXISTS`, THEN THE Profile_Form SHALL show the message inline under the Email field, keep the typed text and leave the Auth_Context and the header unchanged (AC01.2 rule, P3).
6. IF E31 returns 401, THEN THE app SHALL clear the session and go to `/login`, as for other private requests.
7. IF E31 fails with a 5xx, a rate limit or a transport error, THEN THE Profile_Form SHALL show the error toast of the shared handler, keep the typed text, enable Save changes again and leave the Auth_Context unchanged.
8. THE feedback copy SHALL be plain and say what happened and what to do (FE-D7). A success or an error SHALL be reported once.
9. A view that is already open and shows the old name (a board, a member list, a comment) SHALL refresh through its existing behavior (a reload, a navigation or its own refetch). The slice SHALL NOT add polling, a push or a shared cache for it (P9).

### Requirement 6: Entry point in the shell

**User Story:** As a user on any screen size, I want a visible way to open my profile, so that I do not type the address.

#### Acceptance Criteria

1. THE AppHeader SHALL show the Account_Link, made of the Avatar and the user's name, as a link to `/profile` at every width. The name keeps its truncation and its `title`. The link has an accessible name that says it opens the profile and names the user (FE-D2, FE-S3, P5).
2. WHEN the current page is `/profile`, THE Account_Link SHALL have `aria-current="page"`.
3. THE Account_Link SHALL render with a box of at least 44 by 44 CSS px, keep a visible keyboard focus ring and cause no horizontal overflow at 320 and 375 px (FE-S4, FE-S5). At 320 px and at 375 px the Account_Link, "Boards", "My tasks" and "Log out" SHALL all be reachable, each at least 44 by 44 CSS px with a visible focus ring, with no horizontal overflow and no overlap of the content below the header (P5).
4. THE Account_Link SHALL show the current name from the Auth_Context, so it follows a saved change at once.
5. THE slice SHALL keep the two navigation links "Boards" and "My tasks" and the Log out control, each with its target size. It SHALL record the shell change in `guidelines/frontend.md` FE-D2 and in the design, as S10 did (P5).
6. THE slice SHALL add no color, font or second accent (FE-D1).

### Requirement 7: Mobile and accessible UI

**User Story:** As a user on a phone, I want to read and edit my profile at 375 px and wider.

#### Acceptance Criteria

1. WHILE the viewport is 375 px wide or wider, THE Profile_Page and the Account_Link SHALL show no horizontal page scroll. A long name, a long email and a long error message SHALL wrap (`break-words`, `min-w-0`) or truncate, and SHALL NOT widen the page. Pinch zoom SHALL stay enabled (FE-S2, FE-S4).
2. THE Name field, the Email field, the Save changes button and the Account_Link SHALL render with a box of at least 44 by 44 CSS px, confirmed with `elementFromPoint` at the center, and the fields SHALL use 16 px text so that iOS Safari does not zoom (FE-S5).
3. THE new page SHALL follow the Visual Design System (FE-D1 to FE-D9): one `.surface` panel with `p-4 sm:p-5`, Figtree type, daisyUI semantic colors, sentence case, `FormField` and `BaseButton`, and the `main` wrapper `mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8` (FE-D2). From 1024 px the form panel SHALL NOT stretch across the full content width, so lines stay readable.
4. WHEN a user on a 375 px viewport opens the Account_Link, edits the name and saves, THE flow SHALL be completable with touch and without hover. WHEN a user uses a keyboard, THE user SHALL reach both fields, the button and the link with Tab, submit with Enter, and see a visible focus ring.
5. Each field error SHALL be linked to its field (`aria-describedby`, `aria-invalid`). A form-level error SHALL use `role="alert"`. Focus SHALL move to the first invalid field after a failed submit.
6. WHEN this slice is handed off, THE evidence log SHALL record a screenshot and measured check at 320, 375, 768 and 1280 px for `/profile` (pristine, a field error, the 409 error, after a successful save) and for the AppHeader at 320 and 375 px with all four controls measured, whether the browser was an emulator or a real device, and the manual journey: open the link, change the name, save, see the header update, reload, change the email to one that is taken.

### Requirement 8: Browser handler, client allowlist and verification

**User Story:** As a reviewer, I want the token to stay server-side and the checks to be honest about what ran.

#### Acceptance Criteria

1. WHEN the browser saves the profile, THE Next.js app SHALL use the same-origin Route Handler `PATCH /api/users/me`, built on the existing shared write helper (`handlePrivateWrite`) with its established Origin and authentication checks (P4). The Profile_Page SHALL read E30 through the existing server-only helper `getCurrentUser()`. It SHALL check the server environment, the exact Origin (403), the session cookie (401), the JSON media type (415), the size (413) and the JSON object (400), accept only the keys `name` and `email` with neither required (Flask requires at least one), call only the fixed E31 path with the session token from the HttpOnly cookie, and return `Cache-Control: private, no-store`. It SHALL answer a key that is not allowed with the same 400 and `Unknown field.` as Flask. It SHALL clear the cookie on 401 and pass through the upstream status and error code (P4).
2. THE Profile_Handler SHALL NOT forward a token to the browser, and SHALL NOT forward any key other than `name` and `email` to Flask.
3. THE client parser for the E31 response SHALL copy only `id`, `name` and `email`, and throw a typed `ApiError` on any other shape, as the existing parsers do (FE-A1). The client allowlist in `lib/apiClient.ts` SHALL accept `PATCH /api/users/me` and no other `/api/users` path.
4. WHEN V07 runs on the backend, THE pytest suite SHALL cover E31 with 200 (name only, email only, both, normalization of whitespace and case, an unchanged value, an own email in another case), 400 (an empty object, a non-object body, `password`, `current_password`, `id`, `created_at` and an unknown key alone and beside a valid field, `null`, wrong types, a blank or 81-character name, a blank, malformed or 255-character email), 401 (no token, malformed, expired and revoked), 409 (an email of another user, the same in another case, and two simultaneous requests for one new email where one wins) and 415, 413 and malformed JSON.
5. THE pytest suite SHALL also cover: the whole-or-nothing rule (a valid name beside a taken email returns 409 from the `uq_users_email` constraint and leaves the original name intact), concurrent updates of one account (a name-only and an email-only request keep both values, whichever commits first, and two requests for the same field leave one of the two submitted values and no 409), E30 with the existing token returning the new email, a fresh login with the new email succeeding and with the old failing, `updated_at` unchanged by a no-op, no password or timestamp in any response, the unchanged password hash, login with the new email and a 401 with the old, a token that still works after an email change, that another user's row is unchanged, that a later board member list, E21 `assignee_name` and a comment show the new name, no event and no notification row, the check order of Requirement 2.9, `Cache-Control` on every response, and that no name, email or body appears in the log output.
6. WHEN V07 and V11 run on the frontend, THE Vitest and React Testing Library tests SHALL cover the Profile_Form (seeded values, the pristine disabled state, only changed fields sent, trimmed and lowercased values, inline 400 messages with focus on the first invalid field, the inline 409, the success toast and reseed, the pending state with a second submit ignored, a 5xx or transport error that keeps the text, no password field in the DOM), the Profile_Page (session check, redirect on a missing session, the error state), the Auth_Context update (only three fields kept, a header that shows the new name), the Account_Link (`aria-current`, accessible name, target size classes), the Profile_Handler (a valid request, 403 for a wrong Origin, 401 clears the cookie, 415, 413, 400 for malformed JSON and for `password`, no token in the response, unknown key not forwarded), the field rules against the shared fixture `specs/fixtures/auth-field-cases.json` for name and email, and the client parser, by asserting rendered text, roles and the requests sent, not only that a component mounts.
7. Database-writing tests SHALL write only to the dedicated Test_Database (`TEST_DATABASE_URL`, through `db_guard`, never `DATABASE_URL`), track every user they create, and clean up automatically the records created by each run, even when assertions fail. They SHALL remove only the data that run created, and an untracked sentinel user SHALL survive the cleanup.
8. THE slice SHALL use the existing test stack: parameterized pytest, Vitest and React Testing Library. The automated Playwright journey (V10) is delivered in T15.
9. WHEN the slice is handed off, THE documentation SHALL record the status in `specs/traceability.md` (AC12.1, E31, `/profile`), the README, the USER_GUIDE, the changelogs and the evidence log (`evidence/profile-T12.md`), with real-device checks and Playwright left open where they have not run.

## Approved decisions

The user approved P1–P11 on 2026-11-14. The table records the outcome and the clarification the user added.

| ID | Decision | Outcome | Where |
|---|---|---|---|
| P1 | Update semantics of E31 | Approved. A JSON object with `name`, `email` or both. An empty object, a non-object body and unknown fields return `400 VALIDATION_ERROR`. | 1.1, 2.1, 2.2 |
| P2 | Unchanged values | Approved. Compare after the existing normalization. If every submitted value is unchanged, return 200 with the current user and keep `updated_at`. A case-only change to one's own email is a no-op. | 1.4, 1.5, 2.6 |
| P3 | Duplicate email and atomicity | Approved. `uq_users_email` enforces uniqueness under concurrent requests. A violation of it maps to `409 EMAIL_ALREADY_EXISTS`, the whole update rolls back and the error shows inline under Email. Test: a duplicate email with a name change leaves the original name intact. | 1.6, 2.5, 5.5, 8.5 |
| P4 | Browser path | Approved. The existing same-origin write helper with its Origin and authentication checks. The Profile_Page reads E30 through the existing server-only helper. Field validation stays consistent between Next.js and Flask. | 4.1, 8.1–8.3 |
| P5 | Entry point | Approved. The AppHeader account block links to `/profile` at every width and FE-D2 is updated. Profile, Boards, My tasks and Log out stay reachable at 320 and 375 px with visible keyboard focus, 44 by 44 CSS px targets and no horizontal overflow. | 6.1–6.5, 7.6 |
| P6 | After a save | Approved. Reseed the form and update the Auth_Context from the response, call `router.refresh()`, show "Profile updated." and stay on `/profile`. Save is disabled while pristine or pending. Entered values stay when the save fails. | 4.5, 5.1–5.5, 5.7 |
| P7 | What the client sends | Approved. Only fields whose normalized value differs from the last saved values, with the E02 rules of `lib/authRules.ts`. Flask stays authoritative. | 4.6 |
| P8 | Password and sessions | Approved, coursework scope. The form edits name and email, rejects `password` and explains that password changes are unavailable. An email change is effective at once and leaves existing sessions valid. Verified: session identity is the stable user ID, E30 with the existing session returns the new email, a fresh login works with the new email and fails with the old. Reauthentication, new-address confirmation and old-address notification are tracked in T16 for public release. | 2.2, 3.4–3.6, 3.9, 4.2, 4.3, 8.5 |
| P9 | Names elsewhere | Approved. Reads that resolve names from the user row show the new name on the next load. Already-open views refresh through their existing behavior. | 1.9, 5.9 |
| P10 | Concurrent edits | Approved, refined. Last write wins per submitted field. An omitted field survives a concurrent update to it. Both fields submitted together apply atomically. Test: concurrent name-only and email-only updates of one account. | 1.2, 1.8, 8.5 |
| P11 | Abuse limits | Approved. The E31 rate limit is deferred to T16 for public release. The docs say that `409 EMAIL_ALREADY_EXISTS` gives signed-in users an additional account-enumeration path, alongside the existing E02 behavior. | 3.8, Out of scope |

## Dependency note

The authentication slice is verified (root T03 and T04 are checked in `specs/tasks.md`, `evidence/authentication-T03-T04.md`). The prerequisite in `specs/FEATURE-QUEUE.md` is Authentication. No prerequisite blocks this slice. The working tree holds uncommitted T11 changes that touch `AppHeader.tsx`, `AuthContext`-adjacent files, `lib/server/flask.ts`, `privateRoute.ts`, `session.ts`, `apiClient.ts` and `lib/types.ts`. This slice must build on them and not overwrite them.
