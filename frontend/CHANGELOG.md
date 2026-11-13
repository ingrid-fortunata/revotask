# Component Changelog

Record actual changes for this component. Reference the matching app release in [the root changelog](../CHANGELOG.md).

## [Unreleased]

- Foundation (T01–T02) scaffold: Next.js 16.4.6 App Router with React 19.3.1, TypeScript 5.9.3, Tailwind CSS 4.3.5 and daisyUI 5.8.0. Placeholder `/` is a Server Component with a daisyUI card. Node pinned to 24.22.1.
- Vitest 4.1.12 with jsdom and React Testing Library. `app/page.test.tsx` asserts the rendered heading and card.
- Verification: `npm ci`, lint, typecheck, test and build pass from a clean install. Dev server returned 200 for `/`. The build contains the daisyUI card rules. A sentinel placed in the build environment did not appear in `.next/`.
- Revision 2: `API_BASE_URL` in `.env.example` and `.env.local` is `http://127.0.0.1:5001`. Lint, typecheck, test and build pass against that setting.
- Revision 2 audit: `npm audit --omit=dev` reports 0 findings. `npm audit` reports 7 moderate advisories, all in development-only lint tooling: `minimatch` 10.2.6 nested under `@typescript-eslint/typescript-estree` (via `typescript-eslint` 8.72.2 and `eslint-config-next`). The advisory range is `>=7.0.0 <11.0.1`. The only patched release is a 11.x major. The latest stable `typescript-eslint` still uses `minimatch ^10.2.2`. Prerelease `8.72.3-alpha.*` builds use `^11.0.1`. No stable compatible fix exists, so no dependency change was made. `npm audit fix --force` and a major lint-toolchain change were not used. Follow-up: upgrade `typescript-eslint` when a stable release uses `minimatch` 11.0.1 or later. The advisory affects glob pattern handling at lint time with repository-controlled patterns, not shipped code.
- Known limitations: no API client, Route Handlers or auth UI yet (T04).
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
