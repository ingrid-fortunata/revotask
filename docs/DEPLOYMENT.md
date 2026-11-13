# Deployment Runbook · GitHub, Supabase, Render and Vercel

Start after the local acceptance checks in [TEST-PLAN.md](TEST-PLAN.md) pass and you are ready to publish. Record the tested commit, URLs, migration revision and results in [evidence](../evidence/README.md).

## 1. Connect GitHub

1. Review repository contents, the ignore rules and Git history for secrets. Review the staged diff before committing.
2. Create or choose the GitHub repository, connect it as a remote and push the locally verified branch when ready. Configure CI to run the same local checks against an isolated PostgreSQL instance.
3. Use a commit that passed those checks as the deployment candidate.

## 2. Supabase PostgreSQL

1. Create the database project for the live demo. Keep local development and test databases separate.
2. In the Supabase **Connect** panel, copy the **Session pooler** settings. Use the host and username provided by the dashboard. Configure SQLAlchemy with the `postgresql+psycopg` driver. URL-encode special characters in passwords.
3. Download the database CA certificate. Use `sslmode=verify-full` and `sslrootcert` pointing to that certificate. Verify connectivity and certificate validation before migrating.
4. Prepare the `revotask` schema and separate migration and runtime database roles. Grant schema usage and required table operations to the runtime role. Give the migration role schema-change permissions. Use explicit schema names for models, foreign keys and the Alembic version table. For this dedicated project, Flask uses SQL directly and the Supabase Data API can be disabled.
5. With the migration role from the candidate commit, run `flask --app app:create_app bootstrap-schema` once. It creates the `revotask` schema only when it is missing and never drops or alters an existing schema. Then run `flask --app app:create_app db upgrade` once. Record the result of `flask --app app:create_app db current`. Maintain compatibility with the prior app release while both versions may run.

Example connection format. All angle-bracketed values are placeholders.

```dotenv
DATABASE_URL=postgresql+psycopg://<role>.<project_ref>:<encoded_password>@<session_pooler_host>:5432/postgres?sslmode=verify-full&sslrootcert=/etc/secrets/supabase-ca.crt
```

References: [connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres), [TLS](https://supabase.com/docs/guides/platform/ssl-enforcement), [Data API security](https://supabase.com/docs/guides/api/securing-your-api).

## 3. Flask on Render (Docker Web Service)

Render builds the same `backend/Dockerfile` that local Compose uses (`compose.yaml`). Nothing in the image changes between local and Render. Settings come from the environment only. This procedure is for the release phase (T16). Do not run it before local acceptance passes.

1. Create a Web Service from the GitHub repository. Set **Language** to **Docker**, **Root Directory** to `backend` (so `backend/.dockerignore` applies to the build), and **Dockerfile Path** to `./Dockerfile`. Choose a plan that supports Docker services.
2. Do not set a build or start command. The image's `CMD` runs `gunicorn --bind 0.0.0.0:${PORT} 'app:create_app()'`, and Render provides `PORT`. Set `GUNICORN_WORKERS=1` until shared limiter storage (T16) is in place. The image default of 2 would let up to twice each login and register limit through, because each worker keeps its own counters. Render provides `PORT` (default 10000). Gunicorn binds `0.0.0.0` on that port, which is what Render requires for web services.
3. Set **Health Check Path** to `/api/health`. Set `APP_ENV=production`, the runtime `DATABASE_URL` (the Supabase session pooler URL from section 2 with `sslmode=verify-full` and `sslrootcert=/etc/secrets/supabase-ca.crt`), `JWT_SECRET_KEY` (at least 32 characters, generated for production only) and `LOG_LEVEL`. Install the CA certificate as Render Secret File `supabase-ca.crt`. Do not put `DOCKER_DATABASE_URL`, `TEST_DATABASE_URL` or any local `.env` value in Render. Open release item (T16): the login and register rate limits use in-memory storage in the current code, which proves local behavior only. Before production traffic, choose shared limiter storage and decide how the trusted client address is derived behind Vercel and Render, then record the decision and the live check in the evidence log.
4. Run the migration as a separate one-off step with the migration role, before triggering a deploy that needs a new revision. Use the candidate commit's image or a local checkout of it:

   ```bash
   cd backend
   DATABASE_URL='<migration-role URL from section 2>' flask --app app:create_app bootstrap-schema
   DATABASE_URL='<migration-role URL from section 2>' flask --app app:create_app db upgrade
   DATABASE_URL='<migration-role URL from section 2>' flask --app app:create_app db current
   ```

   Keep migration credentials out of the Render service's environment. Gunicorn does not run migrations. Record the `db current` output in the evidence log.
5. Trigger the deploy. Confirm the Render health check passes on `/api/health`. Then verify the public HTTPS endpoints with `curl https://<render-host>/api/health`, a Postman register and login with a test account, and one endpoint from each Blueprint (V14).

Local parity: run the same image with `docker compose up -d backend` after setting `DOCKER_DATABASE_URL` in the root `.env`. Local Compose publishes `127.0.0.1:5001`. Render listens on the port it assigns through `PORT` and routes public HTTPS traffic to it.

References: [Render Docker deploys](https://render.com/docs/docker), [Render web services and port binding](https://render.com/docs/web-services), [Render secret files](https://render.com/docs/configure-environment-variables), [Supabase connecting](https://supabase.com/docs/guides/database/connecting-to-postgres), [TLS](https://supabase.com/docs/guides/platform/ssl-enforcement).

## 4. Next.js on Vercel

1. Import the repo with the Next.js preset and set **Root Directory** to `frontend`.
2. Set the server-only `API_BASE_URL=https://<render-service-host>` and `APP_ORIGIN=https://<canonical-vercel-host>` (the session cookie is `Secure` on https, and an http origin is accepted only for loopback development). Configure preview origin and isolated preview data separately if you use previews.
3. Deploy the same candidate revision. Check registration, login, protected Server Components, browser mutations through same-origin handlers and logout on the canonical URL.
4. Run live Playwright and a mobile walkthrough. Record URL, commit, time, browser and results.

References: [Vercel monorepos](https://vercel.com/docs/monorepos), [environment variables](https://vercel.com/docs/environment-variables).

## 5. Live verification and recovery

```bash
curl -fsS "https://<render-service-host>/api/health"
cd frontend
E2E_BASE_URL="https://<canonical-vercel-host>" npx playwright test
npx playwright show-report
```

Use a fresh browser and a dedicated test account. Commit release notes and documentation, then deploy and recheck the final revision on both services. Commit the sanitized full Playwright report in evidence/playwright-final/ and record the tested URLs and deployed SHA. The report can live in a later evidence-only commit that references the tested code. See [Submission](SUBMISSION.md). Tag the verified deployed code revision. If a deploy fails, retain the evidence, check environment values and migration revision, and restore a known working app revision if it is compatible with the current schema. Prepare backups and recovery steps for schema changes that could lose data.
