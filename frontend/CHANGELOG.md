# Component Changelog

Record actual changes for this component. Newest date first. Each `## YYYY-MM-DD` heading groups the commits made that day, and each commit has a `### <short-sha> <subject>` entry. Reference the matching root entry for the same commit in [the root changelog](../CHANGELOG.md).

## 2026-11-18

### 4240cf0 feat: add global error boundary and app-wide not found page

- Added `app/global-error.tsx` (own `<html>` and `<body>`, imports `globals.css`, `retry()`, no error text) and `app/not-found.tsx`, with tests in `app/global-error.test.tsx`. See the root entry for 4240cf0 in [the root changelog](../CHANGELOG.md).

### 9f49570 feat: add sprint dates to board forms, header and analytics

- New `lib/sprint.ts` (`formatSprintRange`, `sprintFromWindow`), `validateSprint` in `lib/boardRules.ts` (the Flask rules, read from the same fixture) and `components/boards/SprintFields.tsx` (two native date inputs, hint, "Clear dates").
- `CreateBoardForm` is stacked at every width with the optional dates. `RenameBoardForm` (labels "Edit board" and "Save changes") edits the name and the dates and sends the pair, two nulls or no sprint key. `BoardHeader` shows the sprint line, `BoardShell` holds the sprint after a save and passes `sprintKey` to the analytics panel and hook, which read again when it changes.
- `AnalyticsFigures` uses `data.window` for the line and the "sprint" or "week" labels. `parseBoardSummary` and `parseAnalytics` accept the new keys. The Route Handlers for E06 and E08 allow `sprint_start` and `sprint_end`. `FormField` accepts `type="date"`.
- Tests updated and added in `lib/`, `components/boards/`, `components/analytics/`, `hooks/` and `app/api/boards/`. Browser evidence: `evidence/boards-membership-sprint-measure.mjs`. See the root entry in [the root changelog](../CHANGELOG.md).

## 2026-11-17

### 29144c6 style: make kanban end drop zone card-sized while dragging

- `KanbanColumn` end strip uses `min-h-32` while `dnd.draggedId` is set, `min-h-11` otherwise. Test added in `KanbanBoard.test.tsx`. See the root entry in [the root changelog](../CHANGELOG.md).

### 84a7238 style: make profile panel full width

- Removed `max-w-xl` from the panel in `app/(protected)/profile/page.tsx`. See the root entry for 84a7238 in [the root changelog](../CHANGELOG.md).

### 29c7c3b style: add pointer cursor to notification bell

- Added `cursor-pointer` to the `NotificationBell` button. See the root entry for 29c7c3b in [the root changelog](../CHANGELOG.md).

### 38281f1 feat: show analytics week range in local time

- `formatWeekRange` formats both bounds with local date fields and a fixed month list. Vitest fixes `TZ` to `Asia/Jakarta`. See the root entry for 38281f1 in [the root changelog](../CHANGELOG.md).

### 4cb298f fix: disable move card confirm when nothing would change

- `MoveCardDialog` takes a `busy` prop and disables Confirm through `isCardUnchanged`. `KanbanBoard` passes `kanban.busy`. See the root entry for 4cb298f in [the root changelog](../CHANGELOG.md).

## 2026-11-15

### 8033a55 docs: close T15 in specs, changelogs and setup guide

- Local acceptance (T15) added the Playwright suite: `@playwright/test` 1.64.1 (exact pin), `playwright.config.ts` (projects `desktop`, `viewport-320`, `mobile-375`, `viewport-768`), `e2e/` specs for auth, boards and membership, Kanban, rollback, comments, timing and the mobile matrix, and `e2e/support/` for the read-only database proof, run identity, token tracking and cleanup. Scripts: `npm run e2e`, `e2e:unit` and `e2e:cleanup`. Verification: `npx playwright test` 54 passed, `npm run e2e:unit` 17 passed and 4 skipped (live-only), Vitest 2039 passed (98 files), lint and typecheck clean. See [the evidence](../evidence/local-acceptance-T15.md).

- Fixed two touch targets found by the T15 matrix (FE-S5): the `MembersPanel` "Members (n)" button was 40 px wide (now `min-w-11 justify-center`), and the `AppHeader` brand link was 28 px wide at 400 px and below, where only the glyph shows (now `min-w-11`). Regression assertions in `MembersPanel.test.tsx` and `AppHeader.test.tsx`.

- QA (T15, tests only): see the entry below for `BoardCard` and `CommentList`.

- QA (T15, tests only): `BoardCard.test.tsx` asserts the exact text of two cards (title, assignee or Unassigned, Move) and `CommentList.test.tsx` asserts author, content with its line break, `datetime` and the Edited marker for a mixed list, and the disabled state. No application code changed. Verification: lint, typecheck and 2038 Vitest tests (98 files) pass. See [the review record](../evidence/implementation-review.md#test-review-v01v08-and-v13).

## 2026-11-14

### fc6e18f docs: update changelogs, readme and user guide for analytics

- Analytics moved into a modal dialog opened by an Analytics button at the right end of the board header. The read runs only while the dialog is open, and Close or Escape aborts it.

- Analytics UI (T14) implemented locally: `AnalyticsPanel` (client, an Analytics button at the right end of the board header (before Rename and Delete) that opens a `BaseModal`) with the props-only `AnalyticsFigures` (week range in UTC, the completed figure, two divided lists with decorative bars and every number as text), the `useBoardAnalytics` hook (one read at a time, aborts the earlier read, ignores late and earlier-board responses, reads on mount, on a rise of the Kanban `position_version` and on Refresh, never throws, keeps the last figures on an error, no polling, no Kanban gate), `lib/analytics.ts` (`parseAnalytics` allowlist, `formatWeekRange`, `barPercent`), the same-origin `GET /api/boards/[id]/analytics` handler (query forwarded unchanged) and its `FLASK_PATHS` and `DECLARED_GETS` entries. A 404 shows the board access toast and goes to the dashboard, a 401 goes to login, and any other failure shows the error and a Retry inside the panel only.

- Verification: typecheck, lint and 2035 Vitest tests (98 files) pass, and `next build` succeeds and lists `/api/boards/[id]/analytics`. The modal build's browser check ran 153 checks with 2 failures, both on the shared header brand link below 400 px (open). 69 new or extended tests (60 in five new files), including a `BoardShell` test where E29 fails at mount and on a later read and a card still moves and the search still works. A 128-check Chrome run (device emulation, no real phone) at 320, 375, 768 and 1280 px found no horizontal page scroll and every control at least 44 by 44 CSS px, and its 375 px journey passed. `BoardShell.test.tsx` now counts only non-analytics `apiGet` calls in its member-removal tests.

### 3403d4b docs: update specs, guides and changelogs for notifications

- Notifications UI (T13) implemented locally: `NotificationBell` in the `AppHeader` brand block at every width (a 44 px button named "Notifications, N unread" with the exact count, a badge hidden at 0 and before the first response, capped at `99+`), `NotificationPanel` (a `BaseModal` named "Notifications" with loading, empty and error states with Retry, "Newer" and "Older" at 20 per page and a live region) and `NotificationRow` (a link to the board, an Unread text badge, a "Mark as read" button named after its row). `useNotifications` polls every 30 seconds for the shown page with one E27 request at a time, drops a response for an earlier page or requested before a completed mark, keeps Poll failures quiet and cleans up on unmount; marking read runs one request at a time, lowers the badge, aborts any request in flight and refreshes the page, and following an unread row's link marks it read without blocking navigation. New same-origin handlers `GET /api/notifications` (query forwarded unchanged) and `PATCH /api/notifications/[id]/read` (no body), the client allowlist pairs, `lib/notifications.ts` parsers and the `NotificationItem` type. The shared invalid-ID message is now "The ID is not valid." The header's brand block sizes to its content, the account name is `max-w-[18vw]` below 640 px and the wordmark is visually hidden below 400 px, so five controls fit at 320 px.

- Verification: typecheck, lint and 1958 Vitest tests (93 files) pass, and `next build` succeeds. A 205-check Chrome run (device emulation, no real phone) at 320, 375, 768 and 1280 px found, and the slice fixed, a bell that overlapped the Profile link at 320 and 375 px, panel text that inherited the header's pale color, and a long unbroken title that ran under the Unread badge. It then found no horizontal page scroll, every control at least 44 by 44 px with `elementFromPoint` on the control, a visible focus ring on every header control, Escape with focus returning to the bell, and the poll bringing the count within 28 seconds. Evidence: `evidence/notifications-T13.md`.

### a067359 docs: update specs, api docs and changelogs for profile, my tasks and search

- Profile UI (T12) implemented locally: `/profile` (a Server Component reading the user through `getCurrentUser()`) with the controlled `ProfileForm`, which sends only the fields that changed through the new same-origin `PATCH /api/users/me` handler, shows field errors inline (a 409 under Email), and on success reseeds, calls `setUser` on the safe user context, runs `router.refresh()` and toasts "Profile updated.". The AppHeader account block is now a link to `/profile` at every width. `AuthProvider` is stateful with `setUser`. `lib/authRules.ts` gained `profileChanges` and `validateProfile`, and `lib/apiClient.ts` declares `PATCH /api/users/me`.

- Verification: typecheck, lint and 1845 Vitest tests (88 files) pass, and `next build` succeeds. A 376-check Chrome run (device emulation, no real phone) at 320, 375, 768 and 1280 px found no horizontal overflow, 44 px targets for the form and the four header controls, a visible keyboard focus ring and a passing 375 px journey.

- My Tasks and search UI (T11) implemented locally: `/my-tasks` (a Server Component reading E21 through `lib/server/tasks.ts`, props-only `MyTasks` and `TaskGroup`, a summary, an empty state and board links, no card deep link). `CardSearch` and `useCardSearch` on the board page: 300 ms debounce, abort plus a sequence guard so a late response never overwrites newer results, a blank query clears at once, "Searching…", results, a no-result message, an error with Retry, and "Showing N results." at the 20-result cap. `resolveSearchResults` shows each result's live title and column from the board state, trusts an unchanged title and re-tests only a changed one. A result opens the existing Card details dialog. The search is independent of the Kanban gate. A same-origin `GET /api/boards/[id]/cards/search` handler forwards the query string unchanged so Flask validates it. `AppHeader` shows Boards and My tasks at every width (a second row of the top bar below 1024 px). `FormField` gained the `search` type and an optional `maxLength`. `chipClass` moved to `lib/boardChip.ts`.

- Verification: typecheck, lint and 1733 Vitest tests (85 files) pass, and `next build` succeeds. A 359-check Chrome run (device emulation, no real phone) at 320, 375, 768 and 1280 px found no horizontal page scroll, every control at least 44 by 44 px, 16 px search text, both header links reachable with no overlap of the sticky bar, a passing 375 px journey, and the Flask 400 passed through the handler for a repeated `q`, an unknown key, a blank `q` and a NUL `q`.

## 2026-11-13

### f2db11d docs: update readme, changelogs and layer docs for comments

- Comments UI (T10) implemented locally: `CardDetailModal` ("Card details", `BaseModal` with the new `wide` prop) replaces `CardEditDialog` and opens from the card's "Open <title>" button. It holds `CardEditForm` (the card form moved over unchanged, with a `lockCard` flag), then the comments: `CommentList` (props-only), `CommentItem` (author-only Edit and Delete, inline editor, delete confirmation), `CommentForm` and the `useCardComments` hook. Comment text is a plain text node with its line breaks. New same-origin handlers `GET` and `POST /api/cards/[id]/comments` and `PATCH` and `DELETE /api/comments/[id]`, declared in the client allowlist. `useKanbanBoard` gains `refreshBoard()` and `hasCard()`: a comment 404 refetches the board, so lost access redirects, a missing card closes the modal and an existing card reloads the comments. An uncertain add (5xx or transport failure) keeps the draft and the list, refetches, and enables a manual retry only after the refresh succeeds, with no automatic retry and no text matching.

- Fixed: Escape on a confirmation inside another dialog also closed the dialog behind it, because React bubbles `cancel` through the component tree. `BaseModal` now stops it, and ignores Tab from a nested dialog (F-CMT-1). After adding a comment the field keeps focus (F-CMT-2).

- Verification: typecheck, lint and 1571 Vitest tests (75 files) pass, and `next build` succeeds. A 480-check Chrome run (device emulation, no real phone) at 320, 375, 768 and 1280 px found no horizontal page scroll, the wide dialog within the viewport, every control at least 44 by 44 px, 16 px fields, dialog focus, Tab and Escape behavior, and a scripted 375 px journey including a lost response against the real server. Playwright and a real-device check are pending (T15). Evidence: `evidence/comments-T10.md`.

### a77ffbc docs: update specs, api docs and changelogs for kanban

- Kanban UI (T09) implemented locally on `/boards/[id]`: `KanbanBoard` with lanes in a horizontally scrolling region (`ColumnHeader`, `BoardCard`, `KanbanColumn`), admin column controls (`AddColumnForm`, `ColumnEditDialog`, Move left and Move right, delete with a confirm), card controls for every participant (`AddCardForm`, `CardEditDialog`), and the Move dialog (`MoveCardDialog`) as the keyboard and touch alternative to desktop drag. `useKanbanBoard` holds the board state behind one gate (one write or refetch at a time), applies moves optimistically, rolls back and refetches on failure, and defers the refetch requested after a member removal until the pending write settles. `useDragAndDrop` holds drag state only. New shared parts `SelectField` and `CheckboxField`, and `FormField` gained `multiline`. New Route Handlers for E13 to E20 and `GET` handlers for the board and its members, the browser client allowlist, typed parsers in `lib/kanban.ts` and rules in `lib/kanbanRules.ts` that match the backend fixture.

- Verification: typecheck, lint and 1362 Vitest tests (65 files) pass, and `next build` succeeds. A 418-check Chrome run (device emulation, no real phone) at 320, 375, 768 and 1280 px found no horizontal page scroll, every control at least 44 by 44 px, 16 px inputs and selects, dialog focus, Tab and Escape behavior, a scripted 375 px journey and a forced 409. The drag in that run used synthetic DOM drag events, not a pointer drag (Playwright, T15). Evidence: `evidence/kanban-T07-T09.md`.

### ac7468f docs: record frontend design system rules and changelog

- Visual redesign of the finished screens as a work dashboard, mobile first. New `revotask` daisyUI theme and `.surface` panel utility in `app/globals.css`, Figtree through `next/font`. `AppHeader` is a sticky top bar below 1024 px and a fixed sidebar from 1024 px with a Boards link marked `aria-current`. The dashboard has a summary strip (total boards, boards you manage, boards you join), a tile grid with a colored chip per board, and the create form in a side panel from 1024 px. The board page has a header panel with a back link, wide columns area and a 22 rem members panel with avatars. Login and register get a split layout from 1024 px. New shared parts: `BrandMark`, `Avatar`. `LogoutButton` accepts `className`.

- Design rules are recorded as FE-D1 to FE-D9 in `guidelines/frontend.md`, and the `revotask-feature` skill reads them for UI work.

- Verification: typecheck, lint and 958 Vitest tests (51 files) pass, and `next build` succeeds. Screenshots at 375, 768 and 1280 px (Chrome device emulation, no real phone) show no horizontal page scroll on the dashboard, board page, login and the empty state. The 320 px check and the real-phone check are pending.

### 3b46afc docs: record boards status in changelogs, README and evidence

- Boards and membership UI (T06) implemented locally: dashboard at `/` with the board list, role badges, create form and empty state. Board page at `/boards/[id]` with the name, role badge, rename and delete (Admin only). Members panel with add and remove (Admin only; Remove on `member` rows only). Shared `BaseModal` and `ConfirmDialog` on native `<dialog>` for delete and remove.

- Data flow: board reads run on the server (`lib/server/boards.ts`). Writes go through same-origin Route Handlers under `app/api/boards/` that share `handlePrivateWrite`. The browser client accepts only declared UUID paths. A 404 on a board request shows the access error and goes to `/`. `USER_NOT_FOUND` shows under the email field only.

- Added `NOT_FOUND`, `USER_NOT_FOUND` and `STATE_CONFLICT` error codes with fallback copy. Board name and email rules are tested against the shared fixture.

- Mobile classes (FE-S4–S6) are applied to the new screens. Not yet checked in a browser.

- Verification: typecheck and lint are clean. Vitest: 50 files and 950 tests passing. The browser and mobile check at 320, 375, 768 and 1280 px and the manual journey are pending. The dev server could not start from the agent shell, so no browser run has happened.

### 012b0b3 docs: record the password rule and one-worker rate limit in specs and API docs

- Typed `ApiError`, `useErrorHandler`, `lib/toast.ts`, and form rules in `lib/authRules.ts` that run the same 61 shared cases as the Flask schemas. The register password needs 8 to 128 characters with an uppercase letter, a lowercase letter and a special character, and the form shows that rule as help text linked to the field. `safeRedirectPath` rejects unsafe `next` values.

- Verification (revision 3): lint and typecheck pass, 446 Vitest tests in 31 files, `next build`, a sentinel build (server values absent from `.next`), a negative control for the `server-only` boundary, a 73-check HTTP smoke, and a 96-check Chrome run at 320, 375, 768 and 1280 px (device emulation). Evidence: `evidence/authentication-T03-T04.md`.

### 2b24ad2 docs: add authentication feature spec and record T03-T04 status

- Known limitations at foundation: no API client, Route Handlers or auth UI. T04 added them (next entries).

- Authentication (T04) implemented locally. Same-origin Route Handlers `POST /api/auth/register`, `/login` and `/logout` check `Origin` against `APP_ORIGIN`, accept exactly the declared fields (415 for a non-JSON content type, 413 over 64 KiB), call Flask through a server-only client, and set the host-only HttpOnly `revotask_session` cookie with a lifetime bounded by the token. The browser and `AuthContext` receive the public user only.

- Pages: `/register`, `/login` (public, never read the cookie) and a protected shell at `/` (`(protected)` route group). Session checks go through `lib/server/session.ts`, and a test fails when a protected page skips it.

- Mobile (AC13.1): `min-h-dvh`, 44 by 44 tappable areas, 16 px inputs, a toast that fits a 320 px screen, and a source-scan test that blocks `h-screen`, `100vh` and zoom locks.

- Dependencies: `react-hot-toast@2.6.1`, `server-only@0.0.1`, `@testing-library/user-event@14.6.10` (dev). Vitest got an `@` alias, node-environment tests and a `matchMedia` stub.

- Fixed during verification: `app/error.tsx` uses `retry()`, because `reset()` does not re-fetch in Next 16.4. The first draft used `reset()`, and a real-browser run showed Try again could not recover.

- Known limitations: no real-phone check yet; Playwright arrives in T15; with JavaScript off the error state is a blank page.

### bc8aa16 root: scaffolding foundation backend and frontend

- Foundation (T01–T02) scaffold: Next.js 16.4.6 App Router with React 19.3.1, TypeScript 5.9.3, Tailwind CSS 4.3.5 and daisyUI 5.8.0. Placeholder `/` is a Server Component with a daisyUI card. Node pinned to 24.22.1.

- Vitest 4.1.12 with jsdom and React Testing Library. `app/page.test.tsx` asserts the rendered heading and card.

- Verification: `npm ci`, lint, typecheck, test and build pass from a clean install. Dev server returned 200 for `/`. The build contains the daisyUI card rules. A sentinel placed in the build environment did not appear in `.next/`.

- Revision 2: `API_BASE_URL` in `.env.example` and `.env.local` is `http://127.0.0.1:5001`. Lint, typecheck, test and build pass against that setting.

- Revision 2 audit: `npm audit --omit=dev` reports 0 findings. `npm audit` reports 7 moderate advisories, all in development-only lint tooling: `minimatch` 10.2.6 nested under `@typescript-eslint/typescript-estree` (via `typescript-eslint` 8.72.2 and `eslint-config-next`). The advisory range is `>=7.0.0 <11.0.1`. The only patched release is a 11.x major. The latest stable `typescript-eslint` still uses `minimatch ^10.2.2`. Prerelease `8.72.3-alpha.*` builds use `^11.0.1`. No stable compatible fix exists, so no dependency change was made. `npm audit fix --force` and a major lint-toolchain change were not used. Follow-up: upgrade `typescript-eslint` when a stable release uses `minimatch` 11.0.1 or later. The advisory affects glob pattern handling at lint time with repository-controlled patterns, not shipped code.

### 9a8f6d6 docs: initial references

- Specified public-user AuthContext, SearchBar responsibility and browser/SSR error evidence.

- Documented the page/component design, typed API integration and error handling.

- Added a local environment example and implementation entry point in the project prompt pack. Component implementation is pending.

## Entry template

```markdown
## YYYY-MM-DD

### <short-sha> <commit subject>

- Changed behavior or UI, with the component and AC.
- Verification and evidence: …
```
