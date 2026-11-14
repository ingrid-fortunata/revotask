# Implementation Plan: profile (T12)

## Overview

This plan implements the profile update (E31), the `/profile` page, the safe user context refresh and the AppHeader account link described in `design.md` (root T12). Order of work: the shared message map, schema, service and route, the shared fixture, the backend tests and a backend checkpoint, the frontend foundation (rules, client allowlist, Next handler, context setter), the form and page, the AppHeader link, the measured mobile check with the journey, the full verification checkpoint, and the documentation checkpoint.

**Status:** Done locally (2026-11-14). Requirements and design were approved (decisions P1–P11 with clarifications), and the user's `implement profile T12` invocation for all tasks approved this plan. Every group is verified; see `evidence/profile-T12.md`. Open outside this plan: Playwright (V10), real-device checks (T15), deployment and the T16 security items (reauthentication, new-address confirmation, old-address notice, the E31 rate limit).

**Root task:** T12. Existing root IDs are preserved and no new root ID is proposed. Root T12 stays unchecked in `specs/tasks.md` until its checks pass.

**Inputs:** `requirements.md` (Requirements 1 to 8, P1–P11), `design.md` (DD1–DD9, Properties 1–14, C23–C27, R1–R5).

## Dependency gates

| Gate | Rule | Enforced by |
|---|---|---|
| A | Root T04 is verified (checked in `specs/tasks.md`). No gate blocks the start. | Verified at spec time |
| B | The backend E31 checks pass before any frontend task that calls it. | 3.7 |
| C | The frontend and the full suites pass before the mobile record is final. | 9 |
| D | Root T12 is checked only after the backend, frontend, measured mobile check, journey and documentation pass. Unverified work stays open with the actual reason. | 10.5 |

## Test conventions (all groups)

- Backend database-writing tests run on `TEST_DATABASE_URL` through `db_guard` and the `board_tracker` fixture (`BoardTracker`, which extends `Tracker`). Every user a test creates, directly or through the API, is tracked. Teardown deletes only those rows and the rows that reference them, in foreign-key order, whether the test passes or fails. No `TRUNCATE`, no name patterns, never `DATABASE_URL`. An untracked sentinel user survives (task 3.7).
- Concurrency tests use `race(app, jobs)` from `tests/kanban_helpers.py` and the two-session pattern in `design.md` ("Backend test files"). Each thread has its own client and session on the guarded database.
- Frontend tests use Vitest and React Testing Library. They assert rendered text, roles and the requests sent, not only that a component mounts.
- No Hypothesis or fast-check. Properties are parameterized tests over fixed tables.
- Every UI task meets Requirement 7: 44 by 44 CSS px controls (rendered box, `elementFromPoint` at the center), 16 px fields, no horizontal page scroll, checked at 375 px and recorded at 320, 375, 768 and 1280 px (FE-S4 to FE-S6, FE-D9). For UI work read FE-D1 to FE-D9 in `guidelines/frontend.md` and `frontend/app/globals.css` first. Add no color, font or second accent.
- Backend command (from `backend/`): `.venv/bin/python -m pytest <files> -v -p no:cacheprovider`. Frontend commands (from `frontend/`): `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Record the exact commands and real counts in `evidence/profile-T12.md`.
- The working tree holds uncommitted T11 changes in `AppHeader.tsx`, `apiClient.ts`, `flask.ts`, `privateRoute.ts`, `session.ts` and `types.ts`. Edit only the lines this plan names, and run the T11 tests with the profile tests.
- Do not write real passwords, tokens or connection strings into specs, evidence, logs or shell arguments.

## Tasks

- [x] 0. Record review outcomes and align contracts (spec phase)
  - [x] 0.1 Decisions P1–P11 and shared docs
    - Done with the design: `docs/API.md` (E31 and C23–C27), `backend/specs/api-contract.md` (`users_bp`), `specs/requirements.md` AC12.1, `docs/TEST-PLAN.md` V07 and V11, `specs/CHANGELOG.md` and `evidence/spec-review.md`.
    - _Requirements: 3.8, 8.9; Root: T12_
  - [x] 0.2 Finalize the spec after this plan is approved
    - Link root T12 in `specs/tasks.md` to `.kiro/specs/profile/tasks.md` ("Native spec: ..."). Synchronize `specs/traceability.md` (AC12.1 status, E31 and `/profile` rows), `frontend/specs/pages-and-components.md`, `frontend/specs/api-integration.md` and `guidelines/frontend.md` FE-D2 and its component table with the approved design. Record the plan approval in `evidence/spec-review.md` and the changes in `specs/CHANGELOG.md`. Do not check T12.
    - Acceptance: the link resolves, `specs/tasks.md` shows T12 unchecked, and the shared documents say the same as `design.md`.
    - _Root: T12_

- [x] 1. Backend: schema, service and route (WP-B1)
  - [x] 1.1 Share the field-message map
    - In `backend/app/validation.py`, add `FIELD_MESSAGES = {"required": REQUIRED, "null": REQUIRED, "invalid": NOT_TEXT}`. In `backend/app/blueprints/auth/schema.py`, replace the private `_MESSAGES` with `FIELD_MESSAGES`.
    - Acceptance: the existing auth schema and register and login tests pass unchanged.
    - _Requirements: 1.3; Root: T12; Decisions: R2_
  - [x] 1.2 Add `ProfileUpdateSchema`
    - In `backend/app/blueprints/users/schema.py`: `unknown = RAISE`; optional `name` (`TrimmedString`, `Length(min=1, max=NAME_MAX, error=NAME_LENGTH)`) and `email` (`NormalizedString`, `Length(max=EMAIL_MAX, error=EMAIL_LENGTH)`, `email_format`), both with `error_messages=FIELD_MESSAGES`. Import the validators and `NAME_LENGTH`. Do not add a password field.
    - Acceptance: the messages are fixed strings that never echo input. A `null` is "Required.", a non-string is "Must be text.", an unknown key is "Unknown field.".
    - _Requirements: 1.3, 2.2–2.4; Root: T12; Decisions: P1, DD2_
  - [x] 1.3 Add `update_profile`
    - Create `backend/app/blueprints/users/service.py` as in `design.md` ("Service sketch"): select the caller's row with `with_for_update()` and `populate_existing`, set only the submitted values that differ, commit once, map a `uq_users_email` 23505 to `EmailAlreadyExistsError` after a rollback, roll back and re-raise any other `SQLAlchemyError`. Import `EMAIL_UNIQUE_CONSTRAINT` and `is_unique_violation` from `app.blueprints.auth.service`.
    - Acceptance: no `UPDATE` runs and `updated_at` is unchanged when nothing differs. The function takes no password argument and records no event.
    - _Requirements: 1.1, 1.2, 1.4–1.6, 1.8, 2.5, 2.8, 3.6; Root: T12; Decisions: P2, P3, P10, DD1, DD4_
  - [x] 1.4 Add the E31 route
    - In `backend/app/blueprints/users/routes.py`, add `PATCH /api/users/me` with `@token_required`: `data = load_json_body(ProfileUpdateSchema())`, `if not data: raise RequestValidationError()`, `user = update_profile(g.current_user, **data)`, then `jsonify(data=PublicUserSchema().dump(user))`. No limiter. Update the module and package docstrings (E31 no longer "arrives with T12").
    - Acceptance: the check order is 401, then 415, 413 and 400, then field 400, then the empty-object 400, then the update. The response carries `Cache-Control: private, no-store` through the existing hook.
    - _Requirements: 1.1, 1.7, 2.1, 2.7, 2.9, 3.1–3.3; Root: T12; Decisions: P1, P11_

- [x] 2. Shared fixture
  - [x] 2.1 Add the `profile` section to `specs/fixtures/auth-field-cases.json`
    - Base `{name, email}` and cases that use the existing `set` and `drop` form: name only, email only, both, name empty, whitespace only, 1, 80 and 81 characters, email empty, invalid format, 254 and 255 characters, surrounding space and capitals (trimmed and lowercased), `null`, a number, a boolean, an array and an object for each field, and an unknown key (`password`, `id`) alone and beside a valid field. Update the `_note` to name the profile section. Leave the register and login cases unchanged.
    - Acceptance: the file parses, every case names `accepted` or the exact `fields` map, and the existing readers still pass.
    - _Requirements: 8.6; Root: T12; Decisions: P4, DD3, R3_

- [x] 3. Backend tests and checkpoint (WP-B2)
  - [x] 3.1 `test_users_profile_schema.py`
    - Run every `profile` fixture case through `ProfileUpdateSchema` and `load_json_body`. Assert the accepted output or the exact `fields`, that `FIELD_MESSAGES` is the map both schemas use, and that no message contains a submitted value (use a sentinel string).
    - Acceptance: every case passes. An unknown key beside a valid field reports only the unknown key.
    - _Requirements: 1.3, 2.2–2.4, 8.4, 8.6; Root: T12; Decisions: P1, DD3_
  - [x] 3.2 `test_users_profile.py`
    - Cover 200 for name only, email only and both, trimmed and lowercased values, an unchanged value and an own email in another case (200, `updated_at` unchanged), a real change that moves `updated_at`, the response allowlist (no `password`, `password_hash`, timestamps), the unchanged password hash, no `board_events` or `notifications` row, `Cache-Control: private, no-store` on every response. 400 for `{}`, a non-object body, `password`, `current_password`, `id`, `created_at` and another unknown key alone and beside a valid field, `null`, wrong types, a blank or 81-character name and a blank, malformed or 255-character email, each leaving the stored row unchanged. 415, 413 and malformed JSON. 401 for no token, malformed, expired and revoked tokens, with no update applied. The check order (a bad token wins over a bad body, a bad body wins over a duplicate email).
    - Acceptance: each case is its own parameterized id. A failed request leaves the row as it was.
    - _Requirements: 1.1–1.5, 1.7, 2.1–2.4, 2.6, 2.7, 2.9, 3.1, 3.2, 3.6, 8.4, 8.5; Root: T12; Decisions: P1, P2_
  - [x] 3.3 `test_users_profile_conflict.py`
    - Cover 409 `EMAIL_ALREADY_EXISTS` for another user's email and the same email in another case, a valid name beside a taken email (409 and the stored name is the original), two users that request one new email at the same time (`race`: one 200, one 409, one row holds it), and a later E30 that shows the unchanged values after a 409.
    - Acceptance: the duplicate-with-name case asserts the stored name directly in the database. The race never returns a 500.
    - _Requirements: 1.6, 2.5, 8.4, 8.5; Root: T12; Decisions: P3_
  - [x] 3.4 `test_users_profile_concurrency.py`
    - Cover per-field last write wins. Deterministic case: a second session locks the row, a name-only request that sends the stored name starts and blocks, the second session changes the name and commits, and the request then writes its value. A name-only and an email-only request on one account, repeated with a barrier, keep both values. Two requests for one field leave one of the two values and no 409. A request that sends both fields is applied together (a concurrent reader never sees one without the other).
    - Acceptance: the deterministic case fails against an implementation that has no row lock. Every repeat ends with one valid serial outcome.
    - _Requirements: 1.2, 1.8, 8.5; Root: T12; Decisions: P10, DD1_
  - [x] 3.5 `test_users_profile_session.py` and `test_users_profile_names.py`
    - Session: a token minted before an email change still works, E30 with it returns the new email, a fresh login succeeds with the new email and fails with the old (401 `INVALID_CREDENTIALS`), and the token `sub` is the user ID. Names: after a name change, the board member list, E21 `assignee_name`, an E22 result path and a comment read show the new name, and another user's row is unchanged.
    - Acceptance: the login checks use a user created with a real password hash through the register path, and the tracker removes it.
    - _Requirements: 1.9, 3.4, 3.5, 3.9, 8.5; Root: T12; Decisions: P8, P9_
  - [x] 3.6 `test_users_profile_logging.py`
    - Capture log output for a successful update, a 400 and a 409 with sentinel names and emails and assert that none appears in the log, and no request body either.
    - Acceptance: the sentinel never appears.
    - _Requirements: 3.7, 8.5; Root: T12_
  - [x] 3.7 `test_profile_cleanup.py` and backend checkpoint (gate B)
    - Teardown isolation: the harness creates tracked users, changes their profiles, then fails. The finalizer must still delete exactly the tracked users, and an untracked sentinel user must survive and be removed by the test itself. Then run the new files, the auth, users, boards and cards suites and the full backend suite.
    - Acceptance: all pass. Record the counts in the evidence log. Nothing reads or writes `DATABASE_URL`.
    - _Requirements: 8.4, 8.5, 8.7; Root: T12_

- [x] 4. Frontend foundation (WP-F1)
  - [x] 4.1 Profile rules in `lib/authRules.ts`
    - Add `PROFILE_FIELDS`, `profileChanges(values, saved)` (the fields whose normalized value differs from the saved one) and `validateProfile(raw)` (the E02 name and email entries and the generic `validate`, for the keys present only: an unknown key is "Unknown field.", a missing key is not an error). Extend `lib/authRules.test.ts` to run the `profile` fixture cases and test `profileChanges` and a partial body.
    - Acceptance: every `profile` case gives the same accepted values or messages as the Flask test. The register and login tests still pass.
    - _Requirements: 4.6, 8.6; Root: T12; Decisions: P7, DD3, DD5_
  - [x] 4.2 Client allowlist
    - In `lib/apiClient.ts`, add `{ method: "PATCH", pattern: /^\/api\/users\/me$/ }` to the declared requests. Extend `lib/apiClient.test.ts`: the pair is declared, `GET`, `POST` and `DELETE` on it and any other `/api/users` path are not.
    - Acceptance: an undeclared pair throws before `fetch`.
    - _Requirements: 8.3; Root: T12_
  - [x] 4.3 Next handler
    - Create `app/api/users/me/route.ts` with `PATCH` only, through `handlePrivateWrite` with `route: "me"`, `allowedKeys: ["name", "email"]` and `requiredKeys: []`. Create `route.test.ts`: a valid request, 403 for a wrong Origin, 401 clears the cookie, 415, 413, 400 for malformed JSON, 400 `Unknown field.` for `password` and an unknown key (not forwarded), `{}` forwarded, no token in the response, `private, no-store`, a Flask 400 and 409 passed through.
    - Acceptance: the handler exports no `GET`. The upstream call goes to `/api/users/me` only.
    - _Requirements: 8.1, 8.2; Root: T12; Decisions: P4_
  - [x] 4.4 `AuthContext` setter
    - In `components/auth/AuthContext.tsx`, make `AuthProvider` stateful as in `design.md` (`current`, `seen`, `setUser` that copies `id`, `name`, `email`, and adoption of a changed `user` prop without an effect) and add `setUser` to `AuthContextValue`. Update the existing tests and test helpers that build a context value by hand. Extend `AuthContext.test.tsx`: `setUser` keeps three fields and drops a token and a hash, a changed prop replaces the state, an unchanged prop keeps a `setUser` value.
    - Acceptance: every existing consumer test passes. The stale comment about T12 is removed.
    - _Requirements: 5.2, 6.4; Root: T12; Decisions: P6, DD6_

- [x] 5. Profile form and page (WP-F2)
  - [x] 5.1 `ProfileForm`
    - Create `components/profile/ProfileForm.tsx` as in `design.md` ("ProfileForm"): `FormField` for Name and Email (`autoComplete` `name` and `email`, the email hint "You sign in with this email."), `BaseButton` "Save changes" and "Saving…", disabled while pristine or pending, only changed fields sent after `validateProfile`, focus on the first invalid field, success path (`setSaved`, reseed, `setUser`, `router.refresh()`, `notifySuccess("Profile updated.")`), failure path through `useErrorHandler` with the typed values kept. No password input of any kind. Mobile: base classes for the smallest width, `BaseButton` `w-full sm:w-auto`.
    - Acceptance: see 5.2. Fields and button render at 44 by 44 CSS px with 16 px text.
    - _Requirements: 4.2, 4.4–4.7, 5.1–5.8, 7.1–7.3, 7.5; Root: T12; Decisions: P6, P7, DD5, DD9_
  - [x] 5.2 `ProfileForm.test.tsx`
    - Cover seeded values, Save disabled when pristine and while pending, only changed fields sent (name only, email only, both), a trimmed and lowercased value, inline 400 messages with focus on the first invalid field and no request for a client-invalid value, the inline 409 under Email with typed values kept and the context unchanged, the success toast, reseed from the response, `setUser` and `router.refresh()` called once, a second submit ignored while pending, a 5xx and a transport error that keep the text and enable Save again, `AUTH_REQUIRED` redirect, and no password field and no hidden password input in the DOM.
    - Acceptance: each state asserts text, roles and the request sent.
    - _Requirements: 4.2, 4.5–4.7, 5.1–5.8, 8.6; Root: T12_
  - [x] 5.3 Profile page
    - Create `app/(protected)/profile/page.tsx` as in `design.md` ("Page"): `getCurrentUser()` from `@/lib/server/session`, the `main` wrapper of FE-D2, the title, one `.surface` panel with `max-w-xl`, the unavailable-password sentence and the form. Create `page.test.tsx`: the helper is called, the form shows the stored values, a missing session redirects, a read failure reaches the error boundary. `pages.guard.test.ts` must cover the new page without an edit.
    - Acceptance: the page makes no client request and sends no token. The mobile-guard test passes.
    - _Requirements: 4.1, 4.3, 4.8, 4.9, 7.3; Root: T12; Decisions: P4_

- [x] 6. AppHeader account link (WP-F3)
  - [x] 6.1 Link the account block
    - In `components/shared/AppHeader.tsx`, replace the account block `div` with a `Link` to `/profile` as in `design.md` ("AppHeader"): `aria-label="Profile, <name>"`, `aria-current="page"` on `/profile`, `min-h-11 min-w-11`, the nav focus ring, the same truncation. Leave Boards, My tasks, Log out and the row order unchanged.
    - Acceptance: Boards, My tasks and Log out still render and behave as before.
    - _Requirements: 6.1, 6.2, 6.4, 6.5; Root: T12; Decisions: P5, DD7_
  - [x] 6.2 `AppHeader.test.tsx`
    - Extend: the link target and accessible name, `aria-current` on `/profile` and not elsewhere, the other links and their `aria-current` unchanged, the name follows `setUser`, the size and focus classes. Keep the existing assertions.
    - Acceptance: the whole file passes.
    - _Requirements: 6.1–6.4, 8.6; Root: T12_
  - [x] 6.3 Update the shell standard
    - In `guidelines/frontend.md`, update FE-D2 (the account block is a link to `/profile`) and the shared-parts and component table (`ProfileForm`). Add `frontend/specs/pages-and-components.md` and `api-integration.md` wording for the handler and `setUser` if 0.2 did not.
    - Acceptance: the guideline matches the shipped header.
    - _Requirements: 6.5; Root: T12_

- [x] 7. Frontend checkpoint (gate C, part 1)
  - [x] 7.1 Run the frontend checks
    - From `frontend/`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Fix any failure in this slice. A failure in an unrelated T11 test is reported with its cause, not hidden.
    - Acceptance: all four pass. Record the counts.
    - _Requirements: 8.6, 8.8; Root: T12_

- [x] 8. Measured mobile check and journey (WP-M)
  - [x] 8.1 `evidence/profile-mobile-measure.mjs`
    - Model it on `evidence/my-tasks-search-mobile-measure.mjs`. Run Chrome (device emulation) at 320, 375, 768 and 1280 px against the local app with two seeded users. For `/profile`: pristine, a field error, the 409 and after a save, with no horizontal page scroll, Name, Email and Save at least 44 by 44 CSS px (`elementFromPoint` at the center) and 16 px field text. For the AppHeader at 320 and 375 px: Profile, Boards, My tasks and Log out each measured at 44 by 44 CSS px, reached with Tab with a visible focus ring, no horizontal overflow and the header bottom not past the `main` top. Save screenshots and the JSON result.
    - Acceptance: the script exits with 0 failed checks, or the failure is recorded and fixed.
    - _Requirements: 6.3, 7.1, 7.2, 7.6; Root: T12; Decisions: P5_
  - [x] 8.2 Manual journey
    - Open the account link, change the name, save, see the header update, reload and see the stored name, change the email to one that is taken and see the inline error, change to a free email, sign out and sign in with the new email. Record the real result, with the browser type (emulator, not a real device).
    - Acceptance: every step has a recorded result. A defect found is fixed with a test that failed first, or recorded open.
    - _Requirements: 7.4, 7.6; Root: T12_

- [x] 9. Full verification checkpoint (gate C, part 2)
  - [x] 9.1 Backend and frontend suites
    - Run the full backend suite and the full frontend suite and `npm run build`, with the T11 tests included. Record the commands and the real counts.
    - Acceptance: all pass, or the failure and its cause are recorded and the task stays open.
    - _Requirements: 8.4–8.8; Root: T12_
  - [x] 9.2 Review the diff against the spec
    - Compare the diff with `requirements.md`, `design.md` and FE-D1 to FE-D9. Confirm no new color, font, dependency, migration or route other than the two named, no `password` field, no token in the browser and no log of a name or email. Confirm the T11 changes in the shared files are intact.
    - Acceptance: each finding is fixed or recorded.
    - _Requirements: 3.7, 4.2, 6.6, 8.2; Root: T12_

- [x] 10. Documentation checkpoint and root status
  - [x] 10.1 Evidence record
    - Write `evidence/profile-T12.md`: commands run and counts, the measured mobile result and screenshots (emulator or real device), the manual journey, the handler checks, defects found and fixed, and what stayed open (Playwright V10, real-device checks, T16 items: reauthentication, new-address confirmation, old-address notice and the E31 rate limit).
    - _Requirements: 7.6, 8.9; Root: T12_
  - [x] 10.2 Changelogs
    - Add concise entries under `[Unreleased]` in `CHANGELOG.md`, `backend/CHANGELOG.md` and `frontend/CHANGELOG.md`. Record any deviation from the approved design in `specs/CHANGELOG.md` with before, after, reason and verification.
    - _Root: T12_
  - [x] 10.3 README and layer docs
    - Update the `README.md` status and feature facts and `docs/USER_GUIDE.md` (the account link and the Profile page) with verified results only. Check `backend/specs/` and `frontend/specs/` still match the code. Update `specs/traceability.md` rows for AC12.1, E31 and `/profile`, and V07 and V11 in `docs/TEST-PLAN.md` if the results differ from the plan.
    - _Root: T12_
  - [x] 10.4 Standards check
    - Confirm `guidelines/frontend.md` lists `ProfileForm` and that FE-D2 matches the shipped header.
    - _Root: T12_
  - [x] 10.5 Root task status (gate D)
    - Check T12 in `specs/tasks.md` only when 1 to 9 pass. Otherwise leave it open with the real reason in the evidence record.
    - Acceptance: the checkbox matches the evidence.
    - _Root: T12_

## Notes

- Test sub-tasks are not marked optional. Root completion in `specs/tasks.md` needs V07 and V11, so they are required here.
- Each backend test file covers one concern, as listed in `design.md` ("Backend test files").
- All database-writing tests clean up automatically through `BoardTracker` and run only on `TEST_DATABASE_URL` (tasks 3.2 to 3.7).
- Local checks prove local behavior only. Playwright (V10), real-device checks and deployment stay open for T15 and T16.
- Password change, reauthentication, new-address confirmation, an old-address notice, an E31 rate limit, avatar upload, account deletion, notifications (T13) and analytics (T14) are out of scope. The last four security items are tracked in T16.
- Attach `guidelines/backend.md`, `guidelines/database.md` or `guidelines/frontend.md` when creating a file with no matching file context.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4"] },
    { "id": 4, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6"] },
    { "id": 5, "tasks": ["3.7"] },
    { "id": 6, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 7, "tasks": ["5.1", "6.1"] },
    { "id": 8, "tasks": ["5.2", "5.3", "6.2", "6.3"] },
    { "id": 9, "tasks": ["7.1"] },
    { "id": 10, "tasks": ["8.1", "8.2"] },
    { "id": 11, "tasks": ["9.1", "9.2"] },
    { "id": 12, "tasks": ["10.1", "10.2", "10.3", "10.4"] },
    { "id": 13, "tasks": ["10.5"] }
  ]
}
```
