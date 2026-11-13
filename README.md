# RevoTask

RevoTask is a collaborative Kanban app for small teams. Members organize cards into columns, move cards through a workflow, assign work and discuss cards. Board admins manage membership and columns.

**Status:** Foundation (T01–T02), authentication (T03–T04) and boards and membership (T05–T06) are implemented locally. The Flask API (Docker image with Compose on port 5001) serves health, register, login, logout, the current-user read, and the board and membership routes (E05–E12). Passwords use Argon2id, and JWT revocation and local rate limits are in place. Admins create, rename and delete boards and manage members. Removing a member clears that member's card assignments on that board. The Next.js app has `/register`, `/login`, a dashboard at `/`, and board pages at `/boards/[id]`. The session is in an HttpOnly cookie. The register password needs 8 to 128 characters with an uppercase letter, a lowercase letter and a special character. Local checks: backend 1146 tests passed and 1 skipped, with ruff clean. Frontend typecheck and lint are clean, and 950 Vitest tests in 50 files pass. Authentication also has a 75-check HTTP smoke and a 96-check Chrome run (device emulation, no real phone). The UI follows one dashboard design system ([frontend guidelines](guidelines/frontend.md), FE-D1 to FE-D9): a sidebar from 1024 px and a top bar below it. Pending: the mobile check of the boards screens at 320, 375, 768 and 1280 px, the manual boards journey, Playwright (T15), live deployments and submission evidence. Production rate limiting needs shared storage and trusted client address handling before release (T16). Adding members can reveal whether an email is registered to a user, a risk accepted for v1. Results: [foundation evidence](evidence/foundation-T01-T02.md), [authentication evidence](evidence/authentication-T03-T04.md) and [boards and membership evidence](evidence/boards-membership-T05-T06.md).

| Project | Technology                                              | Live URL               |
| ------- | ------------------------------------------------------- | ---------------------- |
| Web     | Next.js, React, TypeScript, Tailwind CSS, daisyUI       | Pending Vercel URL     |
| API     | Flask, SQLAlchemy, Marshmallow, Flask-Migrate, Gunicorn | Pending Render URL     |
| Data    | PostgreSQL                                              | Supabase in production |

## Local setup and tests

Follow [Development](docs/DEVELOPMENT.md). The local API uses port 5001 because macOS AirPlay Receiver keeps port 5000; see that guide. See the [API](docs/API.md), [user guide](docs/USER_GUIDE.md), [test plan](docs/TEST-PLAN.md) and [deployment runbook](docs/DEPLOYMENT.md).

## AI workflow and evidence

The [project brief](PROJECT-BRIEF.md) and [specification](specs/requirements.md) define the scope. The [feature queue](specs/FEATURE-QUEUE.md) maps feature slices to root tasks. Kiro generates requirements, design and tasks for each slice, and reviewed changes are reflected in the project-wide specification. The [backend specifications](backend/specs/README.md) and [frontend specifications](frontend/specs/README.md) describe each implementation layer. Document the AI tools used during implementation, review findings, refinements and measured results in the [evidence log](evidence/README.md). Update this section as evidence becomes available, then link the verified release and live URLs.

See the [submission checklist](docs/SUBMISSION.md), [application changelog](CHANGELOG.md) and [specification changelog](specs/CHANGELOG.md).
