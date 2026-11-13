# RevoTask

RevoTask is a collaborative Kanban app for small teams. Members organize cards into columns, move cards through a workflow, assign work and discuss cards. Board admins manage membership and columns.

**Status:** Foundation (T01–T02) and authentication (T03–T04) are implemented and checked locally. The Flask API (Docker image with Compose on port 5001) serves health, register, login, logout and the current-user read, with Argon2id passwords, JWT revocation and local rate limits. The Next.js app has `/register`, `/login` and a protected shell at `/`, with the session in an HttpOnly cookie. Local checks: backend 431 tests, frontend 446 tests, a 75-check HTTP smoke on one Gunicorn worker and a 96-check Chrome run (device emulation, no real phone). The register password needs 8 to 128 characters with an uppercase letter, a lowercase letter and a special character. Boards and later slices, Playwright, live deployments and submission evidence are pending. Production rate limiting needs shared storage and trusted client address handling before release (T16). Results: [foundation evidence](evidence/foundation-T01-T02.md) and [authentication evidence](evidence/authentication-T03-T04.md).

| Project | Technology | Live URL |
|---|---|---|
| Web | Next.js, React, TypeScript, Tailwind CSS, daisyUI | Pending Vercel URL |
| API | Flask, SQLAlchemy, Marshmallow, Flask-Migrate, Gunicorn | Pending Render URL |
| Data | PostgreSQL | Supabase in production |

## Local setup and tests

Follow [Development](docs/DEVELOPMENT.md). The local API uses port 5001 because macOS AirPlay Receiver keeps port 5000; see that guide. See the [API](docs/API.md), [user guide](docs/USER_GUIDE.md), [test plan](docs/TEST-PLAN.md) and [deployment runbook](docs/DEPLOYMENT.md).

## AI workflow and evidence

The [project brief](PROJECT-BRIEF.md) and [specification](specs/requirements.md) define the scope. The [feature queue](specs/FEATURE-QUEUE.md) maps feature slices to root tasks. Kiro generates requirements, design and tasks for each slice, and reviewed changes are reflected in the project-wide specification. The [backend specifications](backend/specs/README.md) and [frontend specifications](frontend/specs/README.md) describe each implementation layer. Document the AI tools used during implementation, review findings, refinements and measured results in the [evidence log](evidence/README.md). Update this section as evidence becomes available, then link the verified release and live URLs.

See the [submission checklist](docs/SUBMISSION.md), [application changelog](CHANGELOG.md) and [specification changelog](specs/CHANGELOG.md).
