# Profile T12: implementation evidence

Feature spec: `.kiro/specs/profile/`. Root task: T12. Implemented by Claude Code (`/revotask-feature implement profile T12`, run scope: every task of `tasks.md`, 2026-11-14). The spec phases (requirements, design, tasks) were also produced by Claude Code (`/revotask-feature spec profile T12`), and the user approved each phase in chat.

Local checks prove local behavior only. The browser run used Chrome device emulation (headless Chrome 157.0.8103.51 with touch emulation below 640 px), not a real phone and not an on-screen keyboard. The Playwright journey (V10) is delivered in T15.

## Summary

| Area | Result |
| --- | --- |
| Backend | `pytest` 1907 passed, 1 skipped (the deliberate E05 skip). `ruff check .` and `ruff format --check .` clean. 99 new tests in 8 new files (`test_users_profile_schema.py` 34, `test_users_profile.py` 45, `test_users_profile_conflict.py` 7, `test_users_profile_concurrency.py` 4, `test_users_profile_session.py` 5, `test_users_profile_names.py` 2, `test_users_profile_logging.py` 1, `test_profile_cleanup.py` 1). |
| Frontend | `npm run lint` and `npm run typecheck` clean. `npm test` 1845 tests in 88 files passed (baseline 1733 in 85). `npm run build` succeeded and lists `/profile` and `/api/users/me`. |
| Browser (V07, V11) | `evidence/profile-mobile-measure.mjs`: 376 checks at 320, 375, 768 and 1280 px for two accounts (one with a very long unbroken name and email), plus the scripted 375 px journey. 0 failed. Report: `evidence/profile-mobile.json`. Screenshots: `evidence/profile-screenshots/`. |
| Open | Playwright journey V10, real-device and on-screen-keyboard checks (T15), deployment (T16). T16 security items: reauthentication for an email change, new-address confirmation, an old-address notice and the E31 rate limit. |

## Commands and results

### Backend (tasks 1.1 to 3.7)

- Captured 2026-11-14, from `backend/`. `backend/.venv`. Database writes went to `TEST_DATABASE_URL` through `db_guard` and the `board_tracker` fixture. Its value is not recorded here.
- `.venv/bin/python -m pytest -q -p no:cacheprovider` gave 1907 passed, 1 skipped (baseline before this slice: 1808 passed, 1 skipped). The eight new files alone gave 99 passed.
- `.venv/bin/ruff check .` gave "All checks passed". `.venv/bin/ruff format --check .` gave "143 files already formatted".
- Existing tests changed: `test_factory.py` lists the new endpoint `users.patch_me`, and `test_users_me.py` replaced the "PATCH returns 405 until T12" case with a PUT 405 case (the route now allows GET and PATCH).
- Mutation check of the row lock (task 3.4): removing `with_for_update()` and `populate_existing` from `update_profile` made `test_the_last_request_wins_a_field_it_submits` fail ("the request did not wait for the row lock"). The service was restored and the file passes.
- Duplicate email with a name change (P3): `test_a_valid_name_beside_a_taken_email_leaves_the_original_name` reads the stored row directly and finds the original name. Two users that request one new email at the same time through `race()` give one 200 and one 409, and one row holds the email.
- Concurrency (P10): a name-only and an email-only request on one account keep both values in 12 repeats. Two requests for one field leave one of the two values and no 409 in 8 repeats. A reader polling while 20 alternating both-field updates run never sees a mixed pair of name and email.
- Sessions (P8): a token issued before an email change still works, E30 returns the new email, a fresh login works with the new email and returns 401 `INVALID_CREDENTIALS` with the old, and the token `sub` is the user ID.
- Teardown: `test_profile_cleanup.py` makes tracked users, changes their profiles, fails inside the harness, and checks that the tracked users are gone while an untracked sentinel user survives. Every database-writing profile test uses `board_tracker`.

### Frontend (tasks 4.1 to 7.1, 9.1)

- Captured 2026-11-14, from `frontend/`. `npm run lint` and `npm run typecheck`: clean. `npm test`: 88 files, 1845 tests passed. `npm run build`: succeeded.
- New or extended: `lib/authRules.test.ts` (the `profile` fixture section, `profileChanges`, `validateProfile`, 106 tests in the file), `lib/apiClient.test.ts` (`PATCH /api/users/me` declared, eight undeclared variants refused), `app/api/users/me/route.test.ts` (Origin 403, 401 clears the cookie, 415, 413, 400 for bad JSON, `password` and other keys answered 400 `Unknown field.` without a forward, `{}` forwarded, token never in the response, Flask 400 and 409 passed through, 503 cases), `components/auth/AuthContext.test.tsx` (`setUser` keeps three fields, follows a changed prop, keeps a saved value while the prop is unchanged), `components/profile/ProfileForm.test.tsx` (seeded values, pristine disabled, only changed fields, normalization, inline 400 and 409, success path, pending, 5xx, transport and rate limit, redirect on `AUTH_REQUIRED`, malformed response, no password field), `app/(protected)/profile/page.test.tsx` and `components/shared/AppHeader.test.tsx` (account link target, name, `aria-current`, size and focus classes, `setUser` follow). `pages.guard.test.ts` covered the new page without an edit.

### Browser and mobile check (tasks 8.1, 8.2)

- Setup: my own Flask (127.0.0.1:5002) on `TEST_DATABASE_URL` with rate limiting off, and a production Next server (localhost:3101, `API_BASE_URL=http://127.0.0.1:5002`). Your stack on 5001 and 3000 was not used. Both servers were stopped afterwards. The three throwaway accounts stay in the test database (users cannot be deleted through the API).
- Command: `BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 REPORT_FILE=evidence/profile-mobile.json SHOT_DIR=evidence/profile-screenshots node evidence/profile-mobile-measure.mjs`. Result: 376 checks, 0 failed, exit 0.
- Per width (320, 375, 768, 1280) and per account: `/profile` pristine, with field errors, with the 409 and after a name-only save. Each state: no horizontal page scroll, every interactive box at least 44 by 44 CSS px with `elementFromPoint` at the center on the control, 16 px field text. Pristine: two inputs and no password input, Save disabled, the password sentence present, the form seeded with the stored values, a pristine submit sends no request. Field error: both inline messages, focus on the first invalid field, no request. 409: the message under Email, both typed values kept, the header name unchanged, Save enabled again, nothing stored (read from Flask). Saved: exactly one PATCH whose body has only `name`, the header link label changes at once, the form is pristine and on `/profile`, Flask stores the new name.
- The AppHeader at every width and state (P5): Profile, Boards, My tasks and Sign out all present, visible, inside the viewport, reachable at their center, each at least 44 by 44 CSS px, no horizontal overflow, the sticky bar (below 1024 px) or sidebar (from 1024 px) not overlapping the content, and `aria-current="page"` on the account link on `/profile`. The shell uses "Sign out" as the label of the sign-out control.
- Keyboard: real Tab key events reach the four header controls and the Name and Email fields, each with a computed outline of at least 2 px on the header controls, and Tab skips the disabled Save button while pristine.
- Journey at 375 px (all passed): My tasks, the account link by touch emulation, change the name, save (toast and header update), reload (stored name in form and header), an email of another user typed in capitals (inline error), a free email typed padded and in capitals (saved, form shows it trimmed and lowercased, session still signed in), sign out, sign in with the old email fails with "Invalid email or password.", sign in with the new email works.
- Screenshots were reviewed at 375 and 1280 px (409 state and saved state): the header rows, the single `.surface` panel, the inline error and the toast match the design system, and the very long name truncates in the header and scrolls inside its own field.

## Implementation notes by task group

| Group | Result |
| --- | --- |
| 1 Backend | `FIELD_MESSAGES` moved to `app/validation.py` and shared with the auth schema. `ProfileUpdateSchema` (optional `name` and `email`, `unknown = RAISE`). `update_profile` in the new `users/service.py` (row lock, re-read, only changed columns, one commit, 23505 on `uq_users_email` to `EmailAlreadyExistsError`). `PATCH /api/users/me` with `token_required`, `{}` rejected with `RequestValidationError()`. |
| 2 Fixture | `specs/fixtures/auth-field-cases.json` has a `profile` section of 30 cases read by the Flask and the `authRules` tests. |
| 3 Backend tests | See the summary table. |
| 4 Frontend foundation | `PROFILE_FIELDS`, `profileChanges` and `validateProfile` (the generic `validate` gained a `partial` option) in `lib/authRules.ts`. The `PATCH /api/users/me` entry in `lib/apiClient.ts`. `app/api/users/me/route.ts` on `handlePrivateWrite`. A stateful `AuthProvider` with `setUser`. |
| 5 Form and page | `ProfileForm` and `/profile`. |
| 6 AppHeader | The account block is a `Link` to `/profile` with `aria-label="Profile, <name>"`. `guidelines/frontend.md` FE-D2 and the component table updated. |
| 8 Browser check | `evidence/profile-mobile-measure.mjs`, `evidence/profile-mobile.json`, `evidence/profile-screenshots/`. |

## Deviations from the approved design (no behavior or contract change)

- The names check covers E10 (member list), E21 `assignee_name` and E23 `author_name`. E22 returns no names, so the design's mention of E22 results was removed from `design.md`.
- `ProfileForm` shows a form-level `role="alert"` message ("Check the submitted fields.") when Flask returns a 400 whose only field keys are not Name or Email, because there is no field to place it under. The design did not say what to do with such a key.
- `profileChanges(values, saved)` takes the saved values as a plain `{name, email}` record, so the form passes its `saved` state and not the `PublicUser`.

## What stayed open

- Playwright journey (V10), real-device and on-screen-keyboard checks (T15), live deployment and live cookie checks (T16).
- Tracked in T16 for public release: reauthentication for an email change, confirmation of the new address, a notice to the old address, and the E31 rate limit. The 409 `EMAIL_ALREADY_EXISTS` is an additional account-enumeration path next to E02 (P11).
- A simultaneous swap of two accounts' emails can make PostgreSQL abort one request as a deadlock (design risk). It was not tested.


---

# Revision 2 (2026-11-19): read-only email and optional password change

Feature spec: `.kiro/specs/profile/` (native groups 11 to 17). Requested by the user: "the email should be fix (can't be edited) because its become our important key. So what we can edit just the name and password only." Implemented by Claude Code (`/revotask-feature implement profile`, run scope: all tasks, 2026-11-19). The spec phases were also produced by Claude Code and the user approved each in chat. Decisions P12–P18: see `.kiro/specs/profile/requirements.md`.

Local checks prove local behavior only. The browser run used Chrome device emulation (headless Chrome 157.0.8103.80 with touch emulation below 640 px), not a real phone and not an on-screen keyboard.

## Summary

| Area | Result |
| --- | --- |
| Backend | `pytest` 2234 passed, 1 skipped (the deliberate E05 skip), 2177 before. `ruff check .` and `ruff format --check .` clean. The eight profile files hold 156 tests: `test_users_profile_schema.py` 71, `test_users_profile.py` 61, `test_users_profile_password.py` 7 (replaces `test_users_profile_conflict.py`), `_concurrency` 6, `_session` 6, `_names` 3, `_logging` 1, `test_profile_cleanup.py` 1. |
| Frontend | `npm run lint` and `npm run typecheck` clean. `npm test` 2221 tests in 100 files passed (2173 before). `npm run build` succeeded. |
| Browser (V07, V11) | `evidence/profile-mobile-measure.mjs`: 457 checks at 320, 375, 768 and 1280 px for two accounts (one with a very long unbroken name and email), plus the scripted 375 px journey. 0 failed. Report: `evidence/profile-mobile-rev2.json`. Screenshots: `evidence/profile-screenshots-rev2/`. |
| Playwright (V10) | `npm run e2e`: 58 passed, 0 failed (native Flask on the test database, Next dev server, Chromium emulation). No suite change was needed: no existing journey edits the email. Teardown verified 0 rows left. |
| Open | Real-device and on-screen-keyboard checks (T15 and later), a Playwright profile journey (none exists), deployment (T16). T16 security items: the E31 rate limit, revoking other sessions after a password change, a change notice. |

## Commands and results

- Backend (from `backend/`): `.venv/bin/python -m pytest tests/test_users_profile*.py tests/test_profile_cleanup.py -p no:cacheprovider` 156 passed. Full: `.venv/bin/python -m pytest -q -p no:cacheprovider` 2234 passed, 1 skipped. `ruff check .` and `ruff format --check .` clean.
- Mutation check (task 14.5): replacing the locked re-read in `update_profile` with the stale `user` object made `test_the_last_request_wins_a_field_it_submits`, `test_two_password_requests_with_one_current_password_leave_one_winner` and `test_the_password_check_waits_for_the_row_lock` fail (3 failed, 3 passed). The service was restored and all 6 pass.
- Frontend (from `frontend/`): `npm run lint`, `npm run typecheck`, `npm test` (2221 passed), `npm run build`. New or revised: `lib/authRules.test.ts` (the 59 rewritten `profile` fixture cases plus `profileChanges` and `validateProfile`), `components/profile/ProfileForm.test.tsx` (read-only email never sent, collapsed section with no password input, open and close with `aria-expanded`, closing empties fields and errors, name and pair sent only when changed or typed, `Required.` for the empty half, inline messages and focus order, the wrong current password kept inline with the section open, success reseed and closed section, pending, 5xx, transport and rate limit, `AUTH_REQUIRED` redirect), `components/shared/FormField.test.tsx` (`readOnly`), `app/api/users/me/route.test.ts` (`email` and `password` rejected without a forward, name, pair and both forwarded, no password in the response or the console), `app/(protected)/profile/page.test.tsx`.
- Browser: `BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 REPORT_FILE=evidence/profile-mobile-rev2.json SHOT_DIR=evidence/profile-screenshots-rev2 node evidence/profile-mobile-measure.mjs`, against my own Flask on `TEST_DATABASE_URL` with rate limiting off (127.0.0.1:5002) and a production Next server (localhost:3101). Result: 457 checks, 0 failed, exit 0. Both servers were stopped afterwards. The throwaway accounts stay in the test database (users cannot be deleted through the API).
- Playwright: Flask on port 5001 (test database, rate limits on), `npm run dev` on port 3000, `npm run e2e`: 58 passed in 1.5 minutes.

## Browser check details

- Per width and account: `/profile` pristine (Name, a read-only Email that cannot be edited and stays focusable, a closed password section with no password input, Save disabled, the page text "Your email cannot be changed." and no "not available yet" text, seeded values, a pristine submit sends no request, the header controls, keyboard reach of the header controls, the fields and the Change password control), with the password section open (two password fields with `current-password` and `new-password` autocomplete, the rules hint, no confirm field, `aria-expanded`), with a field error (focus on the first invalid field, no request), with a wrong current password from Flask (inline under Current password, the section stays open, the typed values and header name stay, Save enabled, nothing stored, read from Flask), and after a name-only save (exactly one PATCH whose body is only `name`, the header changes at once, Flask stores the new name and keeps the email). Each state: no horizontal page scroll, every interactive box at least 44 by 44 CSS px with `elementFromPoint` at the center, 16 px field text.
- Journey at 375 px (all passed): account link by touch emulation, change the name, save (toast and header update), reload (stored name, closed and empty password section), the email shown read-only, Change password, a wrong current password (inline error, section open), the right current password (toast, section closed), the session still signed in, sign out, sign in with the old password fails with "Invalid email or password.", sign in with the same email and the new password works.
- Screenshots reviewed at 375 and 1280 px (wrong-password state and pristine state): the muted read-only email, the "Cancel password change" control, the inline error and the single `.surface` panel match the design system. No new color or font.

## Deviations from the approved design (no behavior or contract change)

- The "Cancel password change" control uses the existing `x` icon and the "Change password" control has no icon, because the shared icon set has no lock icon and the slice adds no icon.
- `ProfileForm` passes a no-op `onChange` to the read-only email, because `FormField` requires the prop.
- The password-rule parity test compares Flask schema outcomes (profile versus register and login) instead of comparing validator objects.

## Diff review against the spec (task 17.2)

- No new color, font, dependency, migration or route. One shared-part prop (`FormField` `readOnly`) and one rename (`password_composition`).
- No `email` write on any path: `update_profile` takes no email argument and the schema has no `email` field. The form's email value comes from the user prop and is not part of the request state.
- No password in a response, a log line, the context, browser storage or the URL: asserted by the backend response and log tests, the route test (no password in the response or console) and the form test (the context call holds three fields, the toast holds no password).
- No 409 on E31. The T11 changes in the shared files are intact (the full frontend suite, including the T11 tests, passes).
- A generated `frontend/AGENTS.md` that `next` wrote while the servers ran was removed. The Playwright run also rewrote `evidence/local-acceptance-T15-mobile.json` and `local-acceptance-T15-timing.json` with fresh run values. They were restored to the recorded T15 versions, because this slice does not re-record T15 evidence. Neither is part of the change.

## What stayed open

- Real-device and on-screen-keyboard checks, a Playwright profile journey and live deployment checks (T15 and T16).
- Tracked in T16 for public release: the E31 rate limit (a stolen session can guess the current password through E31, and the 10-character maximum makes that easier), revoking other sessions after a password change, a change notice, and whether to keep the 10-character cap.
- A mistyped new password locks the user out because no reset exists and the form has no confirm field or show-password control (P17).
