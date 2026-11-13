# Component Changelog

Record actual changes for this component. Reference the matching app release in [the root changelog](../CHANGELOG.md).

## [Unreleased]

- Foundation (T01–T02) scaffold: Next.js 16.4.6 App Router with React 19.3.1, TypeScript 5.9.3, Tailwind CSS 4.3.5 and daisyUI 5.8.0. Placeholder `/` is a Server Component with a daisyUI card. Node pinned to 24.22.1.
- Vitest 4.1.12 with jsdom and React Testing Library. `app/page.test.tsx` asserts the rendered heading and card.
- Verification: `npm ci`, lint, typecheck, test and build pass from a clean install. Dev server returned 200 for `/`. The build contains the daisyUI card rules. A sentinel placed in the build environment did not appear in `.next/`.
- Revision 2: `API_BASE_URL` in `.env.example` and `.env.local` is `http://127.0.0.1:5001`. Lint, typecheck, test and build pass against that setting.
- Revision 2 audit: `npm audit --omit=dev` reports 0 findings. `npm audit` reports 7 moderate advisories, all in development-only lint tooling: `minimatch` 10.2.6 nested under `@typescript-eslint/typescript-estree` (via `typescript-eslint` 8.72.2 and `eslint-config-next`). The advisory range is `>=7.0.0 <11.0.1`. The only patched release is a 11.x major. The latest stable `typescript-eslint` still uses `minimatch ^10.2.2`. Prerelease `8.72.3-alpha.*` builds use `^11.0.1`. No stable compatible fix exists, so no dependency change was made. `npm audit fix --force` and a major lint-toolchain change were not used. Follow-up: upgrade `typescript-eslint` when a stable release uses `minimatch` 11.0.1 or later. The advisory affects glob pattern handling at lint time with repository-controlled patterns, not shipped code.
- Known limitations at foundation: no API client, Route Handlers or auth UI. T04 added them (next entries).
- Authentication (T04) implemented locally. Same-origin Route Handlers `POST /api/auth/register`, `/login` and `/logout` check `Origin` against `APP_ORIGIN`, accept exactly the declared fields (415 for a non-JSON content type, 413 over 64 KiB), call Flask through a server-only client, and set the host-only HttpOnly `revotask_session` cookie with a lifetime bounded by the token. The browser and `AuthContext` receive the public user only.
- Pages: `/register`, `/login` (public, never read the cookie) and a protected shell at `/` (`(protected)` route group). Session checks go through `lib/server/session.ts`, and a test fails when a protected page skips it.
- Typed `ApiError`, `useErrorHandler`, `lib/toast.ts`, and form rules in `lib/authRules.ts` that run the same 56 shared cases as the Flask schemas. `safeRedirectPath` rejects unsafe `next` values.
- Mobile (AC13.1): `min-h-dvh`, 44 by 44 tappable areas, 16 px inputs, a toast that fits a 320 px screen, and a source-scan test that blocks `h-screen`, `100vh` and zoom locks.
- Dependencies: `react-hot-toast@2.6.1`, `server-only@0.0.1`, `@testing-library/user-event@14.6.10` (dev). Vitest got an `@` alias, node-environment tests and a `matchMedia` stub.
- Fixed during verification: `app/error.tsx` uses `retry()`, because `reset()` does not re-fetch in Next 16.4. The first draft used `reset()`, and a real-browser run showed Try again could not recover.
- Verification: lint and typecheck pass, 431 Vitest tests, `next build`, a sentinel build (server values absent from `.next`), a negative control for the `server-only` boundary, a 64-check HTTP smoke, and a 90-check Chrome run at 320, 375, 768 and 1280 px (device emulation). Evidence: `evidence/authentication-T03-T04.md`.
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
