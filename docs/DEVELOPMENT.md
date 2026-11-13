# RevoTask Development Guide · Draft

This guide defines expected entry points. Verify and update each command after implementing T01.

## Local setup

1. Open the extracted workspace. After T01, use the runtime versions pinned by the scaffold. Before T02, start a local PostgreSQL instance and create separate development and test databases. The sample database URLs use the revotask role and databases revotask_dev and revotask_test. Match those values locally or update the URLs.
2. From the root, set up Flask:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set DATABASE_URL and TEST_DATABASE_URL for your local PostgreSQL.
# Generate a random development JWT secret and save it in .env.
flask --app app:create_app db upgrade
flask --app app:create_app run
```

3. From the root in a second terminal, set up Next.js:

```bash
cd frontend
npm ci
cp .env.example .env.local
# Set API_BASE_URL=http://127.0.0.1:5000 and APP_ORIGIN=http://localhost:3000.
npm run dev
```

4. Use `http://localhost:3000` consistently for the browser origin. Validate the API health endpoint at `http://127.0.0.1:5000/api/health`. Configure daisyUI through the compatible Tailwind/PostCSS setup already present in the scaffold.

## Environment contract

| Scope | Variables | Example values |
|---|---|---|
| Flask | `APP_ENV`, `DATABASE_URL`, `JWT_SECRET_KEY`, `LOG_LEVEL` | development, local PostgreSQL URI, local-only generated secret, INFO |
| Flask tests | `TEST_DATABASE_URL` | Isolated PostgreSQL URI. Test setup fails if it targets a protected environment. |
| Next.js server | `APP_ORIGIN`, `API_BASE_URL` | `http://localhost:3000`, `http://127.0.0.1:5000` |
| Playwright | `E2E_BASE_URL` | `http://localhost:3000` or verified Vercel URL. Add test-account inputs only if fixture strategy requires them. |

Commit both `.env.example` files with placeholders and commit lockfiles. Ignore real `.env*` files with an exception for the examples, `.venv/`, `__pycache__/`, `.next/`, `node_modules/`, `playwright/.auth/`, and unsanitized test reports and traces. Keep environment and test commands aligned with the chosen package scripts.

## Expected test commands

| Location | Command |
|---|---|
| `backend/` | `pytest -v` |
| `frontend/` | `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` |
| `frontend/` | `npx playwright install`, `npx playwright test`, `npx playwright show-report` |

Follow [the test plan](TEST-PLAN.md) and [deployment runbook](DEPLOYMENT.md) for execution and verification. Review each AI diff against the applicable guideline IDs. Record real changes in the relevant changelogs and keep migration revisions and API contracts reviewable.
