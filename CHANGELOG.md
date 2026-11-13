# Application Changelog

Track notable user-facing changes using [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and version releases using [Semantic Versioning](https://semver.org/). Move actual changes out of Unreleased when the release commit and its evidence are known.

## [Unreleased]

- Added handbook review and submission evidence for Kiro, Claude Code, Postman and Playwright.

### Added

- Boards and membership slice (T05–T06, local only): board list, create, detail, rename and delete (E05–E09), and member list, add and remove (E10–E12). Only Admins manage boards and members. Non-members and removed members get the same 404 as a missing board. Removing a member also clears that member's card assignments on that board, in one transaction (AC04.2). Dashboard at `/`, board page at `/boards/[id]` with confirmation dialogs for delete and remove. Known limits: `USER_NOT_FOUND` reveals whether an email belongs to a registered user, visible only to board Admins (accepted for v1). The per-admin rate limit for adding members is T16. Local verification: backend tests and frontend tests, lint and typecheck pass. The mobile check at 320, 375, 768 and 1280 px and the manual journey are pending. Evidence: [boards and membership](evidence/boards-membership-T05-T06.md).
- Authentication slice (T03–T04, local only): register, login, logout and `GET /api/users/me` in Flask with Argon2id (register password: 8 to 128 characters with an uppercase letter, a lowercase letter and a special character), JWT revocation, a shared `AUTH_REQUIRED` guard and login and register rate limits. Same-origin Next.js Route Handlers keep the token in an HttpOnly `revotask_session` cookie and return only the public user. Register and login pages, a protected shell with sign out, a typed `ApiError`, and one set of field rules shared by the forms and the API. Mobile rules (AC13.1) apply to every page and are measured in a real browser. Local verification: [evidence](evidence/authentication-T03-T04.md). Real-phone checks, Playwright (T15) and production rate limiting (T16) are pending.
- Foundation slice (T01–T02, local only): backend Flask factory with validated settings, shared JSON error envelope with `X-Request-ID`, `GET /api/health`, nine SQLAlchemy models, the first Alembic revision and a `bootstrap-schema` command. Frontend Next.js scaffold with Tailwind CSS, daisyUI and Vitest tests. Backend Docker image and local Compose service, on port 5001, with a Render Docker Web Service procedure.
- Added the Kiro Feature Spec workflow and detailed backend and frontend implementation specs.
- Local implementation prompts, placeholder environment files and repository ignore rules.
- Project requirements, design, API contract and acceptance baseline.

### Changed

- Local Compose runs one Gunicorn worker so the login and register rate limits are exact. Shared limiter storage (T16) is required before more production workers. A 401 no longer carries `Retry-After`.
- Request-body failures use the JSON envelope: 400 malformed JSON, 415 `UNSUPPORTED_MEDIA_TYPE`, 413 `CONTENT_TOO_LARGE`. `docs/API.md` lists both new statuses. `GET /api/users/me` (E30 read) moved from T12 to T03.
- Mobile responsiveness is a standing rule for every UI slice (AC13.1, FE-S4–S6): 375 px and wider, 44 by 44 px tappable areas, 16 px inputs, `min-h-dvh`.
- Simplified implementation to two reusable prompts per feature with synchronized task status and documentation.
- Added a documentation checkpoint to each implementation task so README facts and applicable changelogs can be updated with the code change.
- The implementation workflow starts from the included spec. Local acceptance precedes GitHub connection and live deployment. Foundation (T01–T02), authentication (T03–T04) and boards and membership (T05–T06) are implemented locally. Browser and mobile verification of the boards screens, later slices, live deployment and submission evidence are pending.
- Shared error envelope gains `405 METHOD_NOT_ALLOWED` with an `Allow` header (`docs/API.md`).

## Release entry template

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added

- User-visible capability and related AC or PR.

### Changed

- Behavior that changed and who is affected.

### Fixed

- Observable issue and fix.

### Security

- Security-relevant change where applicable.

- Backend/frontend versions: …
- Tested commit and environment: …
- Test and deployment evidence: …
```
