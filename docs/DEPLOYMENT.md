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
5. Run `flask --app app:create_app db upgrade` once with the migration role from the candidate commit. Record the result of `flask --app app:create_app db current`. Maintain compatibility with the prior app release while both versions may run.

Example connection format. All angle-bracketed values are placeholders.

```dotenv
DATABASE_URL=postgresql+psycopg://<role>.<project_ref>:<encoded_password>@<session_pooler_host>:5432/postgres?sslmode=verify-full&sslrootcert=/etc/secrets/supabase-ca.crt
```

References: [connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres), [TLS](https://supabase.com/docs/guides/platform/ssl-enforcement), [Data API security](https://supabase.com/docs/guides/api/securing-your-api).

## 3. Flask on Render

1. Create a Python Web Service from the GitHub repo. Set **Root Directory** to `backend`.
2. Use `pip install -r requirements.txt` as the build command. Use `gunicorn --bind 0.0.0.0:$PORT 'app:create_app()'` as the start command, assuming T01 uses this entry point.
3. Set **Health Check Path** to `/api/health`. Configure `APP_ENV=production`, the runtime `DATABASE_URL`, `JWT_SECRET_KEY`, `LOG_LEVEL` and any rate-limiter settings the implementation uses. Install the CA certificate as Render Secret File `supabase-ca.crt`. Keep migration credentials in the environment that runs migrations.
4. Use a controlled pre-deploy migration on a plan that supports it. If you migrate manually, run the migration and verify its revision before triggering the deployment. Keep migrations outside the Gunicorn worker startup path.
5. Verify the public HTTPS health endpoint. Register and log in with a test account via Postman, then check one endpoint from each Blueprint as described in V14.

References: [Flask on Render](https://render.com/docs/deploy-flask), [monorepos](https://render.com/docs/monorepo-support), [deploy phases](https://render.com/docs/deploys), [secret files](https://render.com/docs/configure-environment-variables), [health checks](https://render.com/docs/health-checks).

## 4. Next.js on Vercel

1. Import the repo with the Next.js preset and set **Root Directory** to `frontend`.
2. Set the server-only `API_BASE_URL=https://<render-service-host>` and `APP_ORIGIN=https://<canonical-vercel-host>`. Configure preview origin and isolated preview data separately if you use previews.
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
