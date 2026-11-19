# Requirements Document

## Introduction

This slice covers root task T12: the profile update (E31, `PATCH /api/users/me`), the `/profile` page with a controlled form, the safe user context refresh, the entry point to the page in the shell, and the pytest and React tests for them. It implements AC12.1 and the mobile criterion AC13.1 (FE-S4–S6) for the new page and the new link. Verification covers V07 (pytest and React Testing Library) and V11 (375 px and wider). The automated Playwright journey (V10) is delivered in T15.

**Revision 2 (2026-11-19, requested by the user: "the email should be fix (can't be edited) because it's become our important key. So what we can edit just the name and password only").** The first version (approved 2026-11-14, implemented and verified the same day) let a user edit `name` and `email` and rejected `password`. Revision 2 makes the email read-only and adds an optional password change:

- The profile can change `name` and the password. The email is shown but never changed. E31 rejects an `email` key like any other unknown key.
- The password change is optional. The form shows it behind a "Change password" control, so the user chooses whether to change it. It needs the current password.
- E31 stays one endpoint. It accepts `name`, the pair `current_password` and `new_password`, or both.
- The email-only machinery of the first version goes away: the `uq_users_email` 409 on E31, the email normalization on E31 and the email field of the form.

The sections below state the revised behavior. Decisions P1–P11 keep their history in "Approved decisions"; P2, P3, P7, P8, P10 and P11 are revised there, and P12–P18 are new. Tasks that were verified under Revision 1 stay verified for the behavior they proved. Revision 2 adds tasks for the changes (see `tasks.md` after review).

The authentication slice already provides the E30 read (`GET /api/users/me`), `PublicUserSchema` (an allowlist of `id`, `name`, `email`), the E02 field rules (`TrimmedString`, `NAME_MAX`, the register password rules `PASSWORD_MIN`, `PASSWORD_MAX`, `PASSWORD_COMPOSITION` in `auth/schema.py` and `lib/authRules.ts`), the login password rule (1 to `PASSWORD_MAX`, no composition rule), `hash_password` and `verify_password` (Argon2id) in `auth/service.py`, `token_required`, `load_json_body`, the same-origin write helper `handlePrivateWrite`, `getCurrentUser()`, `AuthProvider`, `useErrorHandler`, `FormField`, `BaseButton`, `lib/authRules.ts` and the field-case fixture `specs/fixtures/auth-field-cases.json`. The database already holds every column this slice writes (`users.name`, `users.password_hash`, `users.updated_at`). No table, migration or dependency is added. `docs/API.md` already lists E31 and no path or method changes. The request body gains two optional keys, loses `email`, and E31 gains a documented 400 for a wrong current password.

Out of scope: password reset or recovery, "forgot password", editing the email by any route, email verification or confirmation mail, avatar upload, account deletion, a "member since" date, notification preferences, editing another user's profile, a "confirm new password" field and a show-password control (the register form has neither), a rule that the new password must differ from the current one, revoking other sessions after a password change, a rate limit on E31, real-time refresh of names on other open screens, notifications (T13) and analytics (T14). Revoking other sessions, the E31 rate limit and notifying the user of a password change are deferred to T16 for public release (P11, P15).

## Glossary

- **Profile_API**: The Flask handler for E31 (`PATCH /api/users/me`), in the `users` blueprint. E30 is the read.
- **Caller**: The signed-in user identified by the bearer token. E30 and E31 act only on the Caller. There is no user ID in the path or the body.
- **Public_User**: The wire shape `{id, name, email}`. No other field leaves the API (D3).
- **Editable_Fields**: `name`, and the password pair `current_password` and `new_password`. `email` is not editable.
- **Name_Rule**: `name` trimmed, 1 to 80 characters, counted in Unicode code points (E02).
- **New_Password_Rule**: The register password rule of E02: 8 to 10 characters, with at least one uppercase letter, one lowercase letter and one ASCII special character. Not trimmed. A space is not a special character.
- **Current_Password_Rule**: The login password rule of E03: 1 to 10 characters, no composition rule, not trimmed. It does not require the shape of a valid new password, so an older account is not blocked by it.
- **Password_Pair**: `current_password` and `new_password`, sent together or not at all.
- **Normalized_Value**: A `name` value after trim. Comparisons and storage use it. A password is never normalized.
- **Profile_Page**: The protected Server Component at `/profile`.
- **Profile_Form**: The client form on the Profile_Page, controlled and seeded from the Public_User.
- **Password_Section**: The part of the Profile_Form with the Current password and New password fields. It is collapsed until the user opens it.
- **Auth_Context**: The client context that holds the Public_User for interactive consumers.
- **Account_Link**: The link in the AppHeader account block that opens the Profile_Page.
- **Profile_Handler**: The same-origin Route Handler `PATCH /api/users/me` on the Next.js origin.
- **Test_Database**: The database named by `TEST_DATABASE_URL`.

## Requirements

### Requirement 1: Update my profile (E31)

**User Story:** As a signed-in user, I want to change my name or my password, so that my account shows who I am today and stays under my control.

#### Acceptance Criteria

1. WHEN the Caller sends E31 with a JSON object that holds `name`, the Password_Pair or both, every sent value meets its rule, and `current_password` matches the stored password, THE Profile_API SHALL store each sent Normalized_Value and the Argon2id hash of `new_password`, and return 200 with the Public_User as the data (AC12.1, P1, P13).
2. THE Profile_API SHALL leave a field that the request does not send unchanged. A request that sends only `name` SHALL NOT change the password, and a request that sends only the Password_Pair SHALL NOT change the name. No request SHALL change the email (P10, P12).
3. THE Profile_API SHALL trim `name`, apply the Name_Rule, apply the New_Password_Rule to `new_password` and the Current_Password_Rule to `current_password`, with the same fixed messages as E02 and E03 (`Required.`, `Must be text.`, `Must be 1 to 80 characters.`, `Must be 8 to 10 characters.`, `Must include an uppercase letter, a lowercase letter and a special character.`, `Must be 1 to 10 characters.`). A message SHALL NOT contain a submitted value (P17).
4. WHEN the request sends only `name` and its Normalized_Value equals the stored name, THE Profile_API SHALL return 200 with the unchanged Public_User, write no row and leave `updated_at` unchanged (P2).
5. THE Profile_API SHALL change `updated_at` only when it stores a different value. A password change always stores a new hash and so changes `updated_at`.
6. THE Profile_API SHALL apply the whole update or none of it. IF the update fails for any reason, including a wrong `current_password` sent beside a valid `name`, THEN the stored name and password hash SHALL be unchanged (P3, P16).
7. THE Profile_API SHALL return only `id`, `name` and `email`. A response SHALL NOT contain `password`, `current_password`, `new_password`, `password_hash`, `created_at`, `updated_at`, a token or any other field (AC12.1).
8. WHEN two requests for the same account run at the same time, one sending only `name` and one sending only the Password_Pair, THE Profile_API SHALL keep both changes. WHEN two requests send `name`, the one that commits last SHALL win, and neither SHALL be reported as a conflict. WHEN two requests send a Password_Pair with the same `current_password`, the first to commit SHALL win and the second SHALL be answered as in Requirement 2.6, because the stored password no longer matches. A request that sends both fields SHALL apply both or neither, and SHALL NOT interleave with another update of the same account (P10).
9. THE Profile_API SHALL change only the Caller's row. No other user, board, membership, card or comment row changes. A later read of a board, a member list, a card assignee or a comment SHALL show the new name, because each read that resolves a name takes it from the user row (P9).
10. THE stored `email` SHALL be the same after every E31 request, whatever the body held. The email stays the login key (P12).

### Requirement 2: Rejected input

**User Story:** As an account holder, I want clear errors when my input is not accepted, so that I know what to fix and nothing changes by accident.

#### Acceptance Criteria

1. IF the body is not a JSON object, or is an empty object `{}`, THEN THE Profile_API SHALL return 400 `VALIDATION_ERROR` and change nothing (P1).
2. IF the body holds any key other than `name`, `current_password` and `new_password`, THEN THE Profile_API SHALL return 400 `VALIDATION_ERROR` with `fields.<key>` set to `Unknown field.` for each such key, and change nothing. This holds for `email`, `password`, `password_hash`, `id`, `created_at` and every other key, also when a valid `name` or Password_Pair is sent beside it (AC12.1, P12).
3. IF `name`, `current_password` or `new_password` is `null`, a number, a boolean, an array or an object, THEN THE Profile_API SHALL return 400 with `fields.<name>` set to `Required.` for `null` and `Must be text.` for the other types.
4. IF `name` is empty or whitespace only or longer than 80 characters after trimming, or IF `new_password` breaks the New_Password_Rule, or IF `current_password` breaks the Current_Password_Rule, THEN THE Profile_API SHALL return 400 with `fields.<name>` set to the fixed message, and change nothing. A password made only of spaces SHALL NOT be trimmed to empty. It follows the length and composition rules as entered.
5. IF the request sends `current_password` without `new_password`, or `new_password` without `current_password`, THEN THE Profile_API SHALL return 400 with `fields.<missing key>` set to `Required.`, and change nothing (P13).
6. IF the request sends a valid Password_Pair and `current_password` does not match the Caller's stored password, THEN THE Profile_API SHALL return 400 `VALIDATION_ERROR` with `fields.current_password` set to `Current password is incorrect.`, and change nothing, a valid `name` included. It SHALL NOT return 401, so the session stays open, and the message SHALL NOT contain a submitted value (P14, P16).
7. IF the request has a wrong `Content-Type`, THEN THE Profile_API SHALL return 415. IF the body is above the size limit, THEN 413. IF the JSON is malformed, THEN 400. The central handlers return these in the JSON envelope, as for the other write endpoints.
8. IF a database write fails for any other reason, THEN THE Flask error handlers SHALL return the sanitized 500 envelope, and the stored name and password hash SHALL be unchanged.
9. THE Profile_API SHALL check, in this order: authentication (401), then the body (415, 413, 400), then field validation including the pairing rule (400), then the empty-object rule (400), then the current-password check (400), then the update (500). A request that fails an earlier step SHALL write nothing and SHALL NOT run the password hash check.
10. THE Profile_API SHALL NOT return 409. No unique constraint can be violated by E31.

### Requirement 3: Authentication, privacy and role boundary

**User Story:** As a user, I want only me to be able to read or change my profile and password, so that my account stays mine.

#### Acceptance Criteria

1. THE Profile_API and the E30 read SHALL require a valid bearer token. A missing, malformed, expired or revoked token SHALL return 401 `AUTH_REQUIRED` and change nothing.
2. THE Profile_API and the E30 read SHALL add `Cache-Control: private, no-store` to every response, success and error.
3. THE Profile_API SHALL act on the user named by the token and on no other. A board admin, a board member and a user with no board all have the same rights: each may change only their own name and password. No role, board or membership changes what E31 does.
4. WHEN the Caller changes the password, THE Profile_API SHALL NOT revoke or reissue any token. The current session and every other open session of the Caller SHALL stay valid, because the revocation list tracks single tokens and not users. Revoking the other sessions is tracked in T16 for public release (P15).
5. WHEN the password changed, THE login endpoint (E03) SHALL accept the unchanged email with the new password in a fresh login and SHALL return 401 `INVALID_CREDENTIALS` for the old password. The stored value SHALL be an Argon2id hash made by the same function as registration, and SHALL differ from the old hash (P14).
6. THE Profile_API SHALL NOT send mail, create a notification or record an event. A notice to the user about a password change is not part of v1 and is tracked in T16 for public release (P15).
7. THE Profile_API SHALL NOT log a name, a password or a request body. Logs keep the request ID, route and outcome only. No error message, response or test failure output SHALL contain a submitted password.
8. THE slice SHALL keep every path and method in `docs/API.md` unchanged. The behavior that the contract leaves open SHALL be recorded as contract clarifications in the design, `docs/API.md` and `specs/CHANGELOG.md`: the partial-update semantics, the empty body 400, the unchanged-name no-op, the all-or-nothing rule, the per-field last-write-wins rule (P10), the `Unknown field.` rule for forbidden keys including `email` (P12), the Password_Pair rules and the 400 for a wrong current password (P13, P14, P16), and that E31 no longer returns 409 or accepts `email`. They SHALL also record that E31 now verifies a password for a signed-in user, so a stolen session can be used to guess it, and that the E31 rate limit is deferred to T16 (P11, P18).
9. THE session identity SHALL stay the stable user ID. No code path SHALL key a session, token or revocation on the email or the password.

### Requirement 4: Profile page

**User Story:** As a signed-in user, I want a profile page that shows my name and email, lets me edit my name and lets me change my password when I choose, so that I do one thing in one place.

#### Acceptance Criteria

1. WHEN a signed-in user opens `/profile`, THE Profile_Page SHALL verify the session, read the Public_User through `getCurrentUser()` and render the Profile_Form seeded with the current `name` and `email` (AC12.1, FE-C1, FE-A1). It SHALL make no second request for the same data.
2. THE Profile_Form SHALL show a `Name` field (editable, `autocomplete="name"`), an `Email` field, the Password_Section control and a `Save changes` button built with `BaseButton`. Each field has a visible label and is built with `FormField`. The `Email` field SHALL show the stored email as read-only text: it SHALL be a read-only input (`readOnly`, so it stays focusable and readable by a screen reader, with the muted look of a read-only field), it SHALL have no editing affordance, its value SHALL never be sent, and a hint SHALL say that the email cannot be changed and is used to sign in (FE-D7, P12).
3. THE Profile_Page SHALL follow the page pattern of FE-D4: a title "Profile", then the form in one `.surface` panel. It SHALL NOT say that password changes are unavailable.
4. THE Password_Section SHALL be collapsed on load. A control labelled `Change password` (a button with `aria-expanded` and `aria-controls`) SHALL open it, and the same control, labelled `Cancel password change`, SHALL close it. Opened, it shows `Current password` (`type="password"`, `autocomplete="current-password"`) and `New password` (`type="password"`, `autocomplete="new-password"`, with the register password hint `PASSWORD_HINT` as its hint). Closing it SHALL empty both fields and clear their errors, so a user who does not open it never sends a password key. There is no confirm field and no show-password control (P13, P17).
5. THE Profile_Form SHALL keep its values in local state. Typing SHALL NOT change the Auth_Context or the header.
6. THE Save changes button SHALL be disabled while nothing differs from the stored values and while a request is pending. Nothing differs when the Normalized_Value of `name` equals the stored name and both password fields are empty or the Password_Section is closed. A pristine form SHALL NOT send a request (P6, P7).
7. WHEN the user submits, THE Profile_Form SHALL validate the fields with the rules of `lib/authRules.ts` before any request, show the field message inline under the field, move focus to the first invalid field (in the order Name, Current password, New password) and send nothing. It SHALL send `name` only when its Normalized_Value differs from the stored one, and the Password_Pair only when at least one password field holds text. When one of the two password fields is empty and the other holds text, the empty one SHALL show `Required.` inline and nothing SHALL be sent (P7, P13).
8. WHILE a request is pending, THE Profile_Form SHALL show a pending state and ignore a second submit.
9. IF the session is missing or revoked, THEN THE Profile_Page SHALL redirect to `/login`, as the other protected pages do. IF the E30 read fails with a Flask outage or a 5xx, THEN THE Profile_Page SHALL show the app error boundary with a way to retry.
10. THE Profile_Page SHALL send no token to the browser. A user who reloads the page SHALL see the stored name and email, and the Password_Section SHALL be collapsed and empty. A password SHALL NOT be stored in the URL, in browser storage or in the Auth_Context.

### Requirement 5: Save feedback and the safe user context

**User Story:** As a user, I want to see that my change worked or why it did not, and I want the rest of the app to show my new name at once.

#### Acceptance Criteria

1. WHEN E31 returns 200, THE Profile_Form SHALL show the success toast "Profile updated.", reseed its Name field from the returned value (so a trimmed name shows as stored), empty and close the Password_Section and keep the user on the page. A request that changed nothing (200 with the unchanged user) SHALL NOT occur from the form, because the button is disabled then (AC12.1, P6).
2. WHEN E31 returns 200, THE Auth_Context SHALL replace its Public_User with the three allowed fields of the response, so the AppHeader shows the new name without a reload. The Auth_Context SHALL copy only `id`, `name` and `email`, and SHALL drop any other property (AUTH-AC11.6).
3. WHEN E31 returns 200, THE Profile_Form SHALL ask Next.js to refresh the Server Components of the current route, so a later server read, including the protected layout, shows the stored values (P6).
4. IF E31 returns 400 with `fields`, THEN THE Profile_Form SHALL show each message inline under its field (`name`, `current_password` to Current password, `new_password` to New password), keep the typed text, focus the first invalid field and show no success toast. A key in `fields` that has no field on the form SHALL show as a form-level message.
5. IF E31 returns 400 with `fields.current_password` `Current password is incorrect.`, THEN THE Profile_Form SHALL show it inline under Current password, keep the Password_Section open with the typed text, leave the name as typed, and leave the Auth_Context and the header unchanged (P16).
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

**User Story:** As a user on a phone, I want to read and edit my profile and change my password at 375 px and wider.

#### Acceptance Criteria

1. WHILE the viewport is 375 px wide or wider, THE Profile_Page and the Account_Link SHALL show no horizontal page scroll, with the Password_Section closed and open. A long name, a long email and a long error message SHALL wrap (`break-words`, `min-w-0`) or truncate, and SHALL NOT widen the page. Pinch zoom SHALL stay enabled (FE-S2, FE-S4).
2. THE Name field, the read-only Email field, the Current password and New password fields, the Change password control, the Save changes button and the Account_Link SHALL render with a box of at least 44 by 44 CSS px, confirmed with `elementFromPoint` at the center, and the fields SHALL use 16 px text so that iOS Safari does not zoom (FE-S5).
3. THE new page SHALL follow the Visual Design System (FE-D1 to FE-D9): one `.surface` panel with `p-4 sm:p-5`, Figtree type, daisyUI semantic colors, sentence case, `FormField` and `BaseButton`, and the `main` wrapper `mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8` (FE-D2). From 1024 px the form panel SHALL NOT stretch across the full content width, so lines stay readable. The read-only Email field SHALL use existing daisyUI semantic tokens for its muted look and add no color (FE-D1).
4. WHEN a user on a 375 px viewport opens the Account_Link, edits the name, opens the Password_Section, changes the password and saves, THE flow SHALL be completable with touch and without hover. WHEN a user uses a keyboard, THE user SHALL reach the Name field, the read-only Email field, the Change password control, the password fields once open, the button and the link with Tab, submit with Enter, and see a visible focus ring.
5. Each field error SHALL be linked to its field (`aria-describedby`, `aria-invalid`). A form-level error SHALL use `role="alert"`. Focus SHALL move to the first invalid field after a failed submit. Opening the Password_Section SHALL NOT move focus away from the control, and the control SHALL announce its state through `aria-expanded`.
6. WHEN this slice is handed off, THE evidence log SHALL record a screenshot and measured check at 320, 375, 768 and 1280 px for `/profile` (pristine, a field error, the wrong current password error, the Password_Section open, after a successful save) and for the AppHeader at 320 and 375 px with all four controls measured, whether the browser was an emulator or a real device, and the manual journey: open the link, change the name, save, see the header update, reload, open Change password, enter a wrong current password, then a right one, sign out and sign in with the new password.

### Requirement 8: Browser handler, client allowlist and verification

**User Story:** As a reviewer, I want the token and the passwords to stay out of places they do not belong and the checks to be honest about what ran.

#### Acceptance Criteria

1. WHEN the browser saves the profile, THE Next.js app SHALL use the same-origin Route Handler `PATCH /api/users/me`, built on the existing shared write helper (`handlePrivateWrite`) with its established Origin and authentication checks (P4). The Profile_Page SHALL read E30 through the existing server-only helper `getCurrentUser()`. It SHALL check the server environment, the exact Origin (403), the session cookie (401), the JSON media type (415), the size (413) and the JSON object (400), accept only the keys `name`, `current_password` and `new_password` with none required (Flask requires at least one), call only the fixed E31 path with the session token from the HttpOnly cookie, and return `Cache-Control: private, no-store`. It SHALL answer a key that is not allowed, `email` included, with the same 400 and `Unknown field.` as Flask. It SHALL clear the cookie on 401 and pass through the upstream status and error code (P4, P12).
2. THE Profile_Handler SHALL NOT forward a token to the browser, and SHALL NOT forward any key other than `name`, `current_password` and `new_password` to Flask. It SHALL NOT log, echo or store a password or a body.
3. THE client parser for the E31 response SHALL copy only `id`, `name` and `email`, and throw a typed `ApiError` on any other shape, as the existing parsers do (FE-A1). The client allowlist in `lib/apiClient.ts` SHALL accept `PATCH /api/users/me` and no other `/api/users` path.
4. WHEN V07 runs on the backend, THE pytest suite SHALL cover E31 with 200 (name only, Password_Pair only, both, name normalization, an unchanged name), 400 (an empty object, a non-object body, `email` alone and beside a valid field, `password`, `password_hash`, `id`, `created_at` and an unknown key alone and beside a valid field, `null`, wrong types, a blank or 81-character name, a `new_password` of 7 or 11 characters or without an uppercase letter, a lowercase letter or a special character, a `current_password` of 0 or 11 characters, `current_password` without `new_password` and the reverse, a wrong `current_password` alone and beside a valid `name`), 401 (no token, malformed, expired and revoked) and 415, 413 and malformed JSON. No case SHALL expect a 409.
5. THE pytest suite SHALL also cover: the whole-or-nothing rule (a valid name beside a wrong current password returns 400 and leaves the original name and password hash intact), concurrent updates of one account (a name-only and a Password_Pair request keep both values, whichever commits first; two requests with the same `current_password` leave one new password and one 400), the email unchanged after every request, a fresh login with the new password succeeding and with the old failing, a token that still works after a password change (current and a second session), `updated_at` unchanged by a name no-op and changed by a password change, no password, hash or timestamp in any response, the stored hash an Argon2id hash that verifies the new password, that another user's row is unchanged, that a later board member list, E21 `assignee_name` and a comment show the new name, no event and no notification row, the check order of Requirement 2.9 (a bad token wins over a bad body, a bad body wins over a wrong current password, and no hash check runs for a rejected body), `Cache-Control` on every response, and that no name, password or body appears in the log output.
6. WHEN V07 and V11 run on the frontend, THE Vitest and React Testing Library tests SHALL cover the Profile_Form (seeded Name, the read-only Email with no editing affordance and never sent, the collapsed Password_Section, opening and closing it with `aria-expanded`, the pristine disabled state, the name sent only when changed, the Password_Pair sent only when a password field holds text, `Required.` for the empty half of the pair, the field rules, inline 400 messages with focus on the first invalid field, the inline wrong-current-password message that keeps the section open, the success toast, the reseed and the emptied section, the pending state with a second submit ignored, a 5xx or transport error that keeps the text), the Profile_Page (session check, redirect on a missing session, the error state), the Auth_Context update (only three fields kept, a header that shows the new name), the Account_Link (`aria-current`, accessible name, target size classes), the Profile_Handler (a valid request for name only, Password_Pair only and both, 403 for a wrong Origin, 401 clears the cookie, 415, 413, 400 for malformed JSON and for `email`, no token in the response, an unknown key not forwarded), the field rules against the shared fixture `specs/fixtures/auth-field-cases.json` for name and the password keys, and the client parser, by asserting rendered text, roles and the requests sent, not only that a component mounts.
7. Database-writing tests SHALL write only to the dedicated Test_Database (`TEST_DATABASE_URL`, through `db_guard`, never `DATABASE_URL`), track every user they create, and clean up automatically the records created by each run, even when assertions fail. They SHALL remove only the data that run created, and an untracked sentinel user SHALL survive the cleanup. Test passwords SHALL be fixed non-secret values that meet the rules, and SHALL NOT be real credentials.
8. THE slice SHALL use the existing test stack: parameterized pytest, Vitest and React Testing Library. The automated Playwright journey (V10) is delivered in T15, and its profile steps SHALL be updated for the read-only email and the password change when T15 is next run.
9. WHEN the slice is handed off, THE documentation SHALL record the status in `specs/traceability.md` (AC12.1, E31, `/profile`), the README, the USER_GUIDE, the changelogs and the evidence log (`evidence/profile-T12.md`, Revision 2), with real-device checks and Playwright left open where they have not run.

## Approved decisions

The user approved P1–P11 on 2026-11-14 (Revision 1). Revision 2 revises the ones marked below and adds P12–P18 on 2026-11-19. P12–P15 are the user's own instructions in chat. P16–P18 are defaults chosen to complete the draft, listed for review.

| ID | Decision | Outcome | Where |
|---|---|---|---|
| P1 | Update semantics of E31 | Approved. A JSON object with `name`, `email` or both. An empty object, a non-object body and unknown fields return `400 VALIDATION_ERROR`. **Revised (Rev 2):** the editable keys are `name`, `current_password` and `new_password`. `email` is an unknown field. | 1.1, 2.1, 2.2 |
| P2 | Unchanged values | Approved. Compare after the existing normalization. If every submitted value is unchanged, return 200 with the current user and keep `updated_at`. **Revised (Rev 2):** applies to a name-only request. The email case rule is gone, and a password change never is a no-op. | 1.4, 1.5 |
| P3 | Duplicate email and atomicity | Approved. **Revised (Rev 2):** the duplicate-email 409 is removed with the email edit. The whole-or-nothing rule stays, now tested with a valid name beside a wrong current password. | 1.6, 2.10, 8.5 |
| P4 | Browser path | Approved. The existing same-origin write helper with its Origin and authentication checks. The Profile_Page reads E30 through the existing server-only helper. Field validation stays consistent between Next.js and Flask. | 4.1, 8.1–8.3 |
| P5 | Entry point | Approved. The AppHeader account block links to `/profile` at every width and FE-D2 is updated. Profile, Boards, My tasks and Log out stay reachable at 320 and 375 px with visible keyboard focus, 44 by 44 CSS px targets and no horizontal overflow. | 6.1–6.5, 7.6 |
| P6 | After a save | Approved. Reseed the form and update the Auth_Context from the response, call `router.refresh()`, show "Profile updated." and stay on `/profile`. Save is disabled while pristine or pending. Entered values stay when the save fails. **Revised (Rev 2):** a success also empties and closes the Password_Section. | 4.6, 5.1–5.5, 5.7 |
| P7 | What the client sends | Approved. Only fields whose normalized value differs from the last saved values, with the rules of `lib/authRules.ts`. Flask stays authoritative. **Revised (Rev 2):** `name` when changed, the Password_Pair when a password field holds text. | 4.7 |
| P8 | Password and sessions | Approved in Revision 1: `password` rejected, email change effective at once. **Superseded (Rev 2) by P12, P13, P14 and P15.** | — |
| P9 | Names elsewhere | Approved. Reads that resolve names from the user row show the new name on the next load. Already-open views refresh through their existing behavior. | 1.9, 5.9 |
| P10 | Concurrent edits | Approved, refined. Last write wins per submitted field. An omitted field survives a concurrent update to it. Both fields submitted together apply atomically. **Revised (Rev 2):** fields are `name` and the Password_Pair. A second password change with the same current password is refused. | 1.2, 1.8, 8.5 |
| P11 | Abuse limits | Approved. The E31 rate limit is deferred to T16 for public release. **Revised (Rev 2):** the 409 enumeration note is gone with the 409. The deferral now also covers password guessing from a stolen session (P18). | 3.8, Out of scope |
| P12 | The email is fixed | **New (Rev 2), user instruction.** The email is the account's key, so it cannot be edited. It is shown read-only. E31 rejects an `email` key with 400 `Unknown field.`, so no client and no direct call can change it. The `uq_users_email` handling, the 409 and the email rules leave E31 and the form. | 1.2, 1.10, 2.2, 2.10, 4.2 |
| P13 | Name and password, password optional | **New (Rev 2), user instruction.** E31 stays one endpoint that accepts `name`, the Password_Pair or both. The password change is optional: the form keeps it behind a "Change password" control, and sends the pair only when the user filled it in. A half pair is 400. | 1.1, 2.5, 4.4, 4.7 |
| P14 | Current password is required | **New (Rev 2), user answer.** A new password needs `current_password`, checked against the stored Argon2id hash on the locked row. The new password is stored with the registration hash function. | 1.1, 2.6, 3.5 |
| P15 | Sessions after a password change | **New (Rev 2), user answer.** Every open session stays valid. No migration or revocation column. Revoking other sessions and a notice to the user are tracked in T16. | 3.4, 3.6 |
| P16 | Wrong current password is a 400 | **New (Rev 2), default for review.** `400 VALIDATION_ERROR` with `fields.current_password` = "Current password is incorrect.", nothing changes. A 401 would sign the user out through the shared 401 handling. | 1.6, 2.6, 5.5 |
| P17 | Password rules | **New (Rev 2), default for review.** `new_password` follows the register rule (8 to 10, composition). `current_password` follows the login rule (1 to 10), so an older account can still enter it. No "must differ from the current password" rule and no confirm field or show-password control, as the register form has none. Risk accepted: with no reset, a mistyped new password locks the user out until T16. | 1.3, 2.4, 4.4 |
| P18 | Rate limit for E31 | **New (Rev 2), default for review.** Stays deferred to T16 as P11 says, with the risk named in the docs: a stolen session can guess the current password through E31, and the 10-character cap makes that easier. If you want a limit now, E31 can reuse `limiter` with a per-user key; say so at review. | 3.8, Out of scope |

## Dependency note

The authentication slice is verified (root T03 and T04 are checked in `specs/tasks.md`, `evidence/authentication-T03-T04.md`, including revision 5, the 10-character password maximum). The prerequisite in `specs/FEATURE-QUEUE.md` is Authentication. No prerequisite blocks this slice. T12 Revision 1 is implemented and verified (`evidence/profile-T12.md`), so Revision 2 edits working code, its tests, the shared fixture and the shared documents. The working tree is clean at the start of this revision.
