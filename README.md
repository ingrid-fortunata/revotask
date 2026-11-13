# RevoTask

RevoTask is a collaborative Kanban app for small teams. Members organize cards into columns, move cards through a workflow, assign work and discuss cards. Board admins manage membership and columns.

**Status:** Specification baseline prepared. Application scaffolding, local test results and deployments are pending.

| Project | Technology | Live URL |
|---|---|---|
| Web | Next.js, React, TypeScript, Tailwind CSS, daisyUI | Pending Vercel URL |
| API | Flask, SQLAlchemy, Marshmallow, Flask-Migrate, Gunicorn | Pending Render URL |
| Data | PostgreSQL | Supabase in production |

## Local setup and tests

Follow [Development](docs/DEVELOPMENT.md) after the scaffold is implemented. See the [API](docs/API.md), [user guide](docs/USER_GUIDE.md), [test plan](docs/TEST-PLAN.md) and [deployment runbook](docs/DEPLOYMENT.md).

## AI workflow and evidence

The [project brief](PROJECT-BRIEF.md) and [specification](specs/requirements.md) define the scope. The [feature queue](specs/FEATURE-QUEUE.md) maps feature slices to root tasks. Kiro generates requirements, design and tasks for each slice, and reviewed changes are reflected in the project-wide specification. The [backend specifications](backend/specs/README.md) and [frontend specifications](frontend/specs/README.md) describe each implementation layer. Document the AI tools used during implementation, review findings, refinements and measured results in the [evidence log](evidence/README.md). Update this section as evidence becomes available, then link the verified release and live URLs.

See the [submission checklist](docs/SUBMISSION.md), [application changelog](CHANGELOG.md) and [specification changelog](specs/CHANGELOG.md).
