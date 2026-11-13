# Component Changelog

Record actual changes for this component. Reference the matching app release in [the root changelog](../CHANGELOG.md).

## [Unreleased]

- Kanban UI (T09) implemented locally on `/boards/[id]`: `KanbanBoard` with lanes in a horizontally scrolling region (`ColumnHeader`, `BoardCard`, `KanbanColumn`), admin column controls (`AddColumnForm`, `ColumnEditDialog`, Move left and Move right, delete with a confirm), card controls for every participant (`AddCardForm`, `CardEditDialog`), and the Move dialog (`MoveCardDialog`) as the keyboard and touch alternative to desktop drag. `useKanbanBoard` holds the board state behind one gate (one write or refetch at a time), applies moves optimistically, rolls back and refetches on failure, and defers the refetch requested after a member removal until the pending write settles. `useDragAndDrop` holds drag state only. New shared parts `SelectField` and `CheckboxField`, and `FormField` gained `multiline`. New Route Handlers for E13 to E20 and `GET` handlers for the board and its members, the browser client allowlist, typed parsers in `lib/kanban.ts` and rules in `lib/kanbanRules.ts` that match the backend fixture.
- Verification: typecheck, lint and 1362 Vitest tests (65 files) pass, and `next build` succeeds. A 418-check Chrome run (device emulation, no real phone) at 320, 375, 768 and 1280 px found no horizontal page scroll, every control at least 44 by 44 px, 16 px inputs and selects, dialog focus, Tab and Escape behavior, a scripted 375 px journey and a forced 409. The drag in that run used synthetic DOM drag events, not a pointer drag (Playwright, T15). Evidence: `evidence/kanban-T07-T09.md`.

- Visual redesign of the finished screens as a work dashboard, mobile first. New `revotask` daisyUI theme and `.surface` panel utility in `app/globals.css`, Figtree through `next/font`. `AppHeader` is a sticky top bar below 1024 px and a fixed sidebar from 1024 px with a Boards link marked `aria-current`. The dashboard has a summary strip (total boards, boards you manage, boards you join), a tile grid with a colored chip per board, and the create form in a side panel from 1024 px. The board page has a header panel with a back link, wide columns area and a 22 rem members panel with avatars. Login and register get a split layout from 1024 px. New shared parts: `BrandMark`, `Avatar`. `LogoutButton` accepts `className`.
- Design rules are recorded as FE-D1 to FE-D9 in `guidelines/frontend.md`, and the `revotask-feature` skill reads them for UI work.
- Verification: typecheck, lint and 958 Vitest tests (51 files) pass, and `next build` succeeds. Screenshots at 375, 768 and 1280 px (Chrome device emulation, no real phone) show no horizontal page scroll on the dashboard, board page, login and the empty state. The 320 px check and the real-phone check are pending.

- Boards and membership UI (T06) implemented locally: dashboard at `/` with the board list, role badges, create form and empty state. Board page at `/boards/[id]` with the name, role badge, rename and delete (Admin only). Members panel with add and remove (Admin only; Remove on `member` rows only). Shared `BaseModal` and `ConfirmDialog` on native `<dialog>` for delete and remove.
- Data flow: board reads run on the server (`lib/server/boards.ts`). Writes go through same-origin Route Handlers under `app/api/boards/` that share `handlePrivateWrite`. The browser client accepts only declared UUID paths. A 404 on a board request shows the access error and goes to `/`. `USER_NOT_FOUND` shows under the email field only.
- Added `NOT_FOUND`, `USER_NOT_FOUND` and `STATE_CONFLICT` error codes with fallback copy. Board name and email rules are tested against the shared fixture.
- Mobile classes (FE-S4–S6) are applied to the new screens. Not yet checked in a browser.
- Verification: typecheck and lint are clean. Vitest: 50 files and 950 tests passing. The browser and mobile check at 320, 375, 768 and 1280 px and the manual journey are pending. The dev server could not start from the agent shell, so no browser run has happened.
- Foundation (T01–T02) scaffold: Next.js 16.4.6 App Router with React 19.3.1, TypeScript 5.9.3, Tailwind CSS 4.3.5 and daisyUI 5.8.0. Placeholder `/` is a Server Component with a daisyUI card. Node pinned to 24.22.1.
- Vitest 4.1.12 with jsdom and React Testing Library. `app/page.test.tsx` asserts the rendered heading and card.
- Verification: `npm ci`, lint, typecheck, test and build pass from a clean install. Dev server returned 200 for `/`. The build contains the daisyUI card rules. A sentinel placed in the build environment did not appear in `.next/`.
- Revision 2: `API_BASE_URL` in `.env.example` and `.env.local` is `http://127.0.0.1:5001`. Lint, typecheck, test and build pass against that setting.
- Revision 2 audit: `npm audit --omit=dev` reports 0 findings. `npm audit` reports 7 moderate advisories, all in development-only lint tooling: `minimatch` 10.2.6 nested under `@typescript-eslint/typescript-estree` (via `typescript-eslint` 8.72.2 and `eslint-config-next`). The advisory range is `>=7.0.0 <11.0.1`. The only patched release is a 11.x major. The latest stable `typescript-eslint` still uses `minimatch ^10.2.2`. Prerelease `8.72.3-alpha.*` builds use `^11.0.1`. No stable compatible fix exists, so no dependency change was made. `npm audit fix --force` and a major lint-toolchain change were not used. Follow-up: upgrade `typescript-eslint` when a stable release uses `minimatch` 11.0.1 or later. The advisory affects glob pattern handling at lint time with repository-controlled patterns, not shipped code.
- Known limitations at foundation: no API client, Route Handlers or auth UI. T04 added them (next entries).
- Authentication (T04) implemented locally. Same-origin Route Handlers `POST /api/auth/register`, `/login` and `/logout` check `Origin` against `APP_ORIGIN`, accept exactly the declared fields (415 for a non-JSON content type, 413 over 64 KiB), call Flask through a server-only client, and set the host-only HttpOnly `revotask_session` cookie with a lifetime bounded by the token. The browser and `AuthContext` receive the public user only.
- Pages: `/register`, `/login` (public, never read the cookie) and a protected shell at `/` (`(protected)` route group). Session checks go through `lib/server/session.ts`, and a test fails when a protected page skips it.
- Typed `ApiError`, `useErrorHandler`, `lib/toast.ts`, and form rules in `lib/authRules.ts` that run the same 61 shared cases as the Flask schemas. The register password needs 8 to 128 characters with an uppercase letter, a lowercase letter and a special character, and the form shows that rule as help text linked to the field. `safeRedirectPath` rejects unsafe `next` values.
- Mobile (AC13.1): `min-h-dvh`, 44 by 44 tappable areas, 16 px inputs, a toast that fits a 320 px screen, and a source-scan test that blocks `h-screen`, `100vh` and zoom locks.
- Dependencies: `react-hot-toast@2.6.1`, `server-only@0.0.1`, `@testing-library/user-event@14.6.10` (dev). Vitest got an `@` alias, node-environment tests and a `matchMedia` stub.
- Fixed during verification: `app/error.tsx` uses `retry()`, because `reset()` does not re-fetch in Next 16.4. The first draft used `reset()`, and a real-browser run showed Try again could not recover.
- Verification (revision 3): lint and typecheck pass, 446 Vitest tests in 31 files, `next build`, a sentinel build (server values absent from `.next`), a negative control for the `server-only` boundary, a 73-check HTTP smoke, and a 96-check Chrome run at 320, 375, 768 and 1280 px (device emulation). Evidence: `evidence/authentication-T03-T04.md`.
- Known limitations: no real-phone check yet; Playwright arrives in T15; with JavaScript off the error state is a blank page.
- Specified public-user AuthContext, SearchBar responsibility and browser/SSR error evidence.
- Documented the page/component design, typed API integration and error handling.
- Added a local environment example and implementation entry point in the project prompt pack. Component implementation is pending.

## Entry template

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added

- …

### Changed

- …

### Fixed

- …
- App release and commit: …
- API, migration or environment impact: …
- Verification and evidence: …
```
