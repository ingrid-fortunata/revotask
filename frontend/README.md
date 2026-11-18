# RevoTask Frontend

Next.js web app for RevoTask, a collaborative Kanban app. Users register, manage boards and members, move cards between columns, comment, track assigned work, read notifications and view weekly board analytics.

**Live app:** https://revotask.vercel.app

## Tech stack

| Area | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, daisyUI 5 |
| Toasts | react-hot-toast |
| Unit and component tests | Vitest, Testing Library (jsdom) |
| End-to-end tests | Playwright (Chromium) |
| Lint | ESLint with `eslint-config-next` |
| Runtime | Node.js 24.22.1 (pinned in `.nvmrc`) |

## How it talks to the API

The browser never calls Flask directly. Next.js Route Handlers under `app/api/` act as a backend-for-frontend:

1. The browser calls a same-origin Next.js route, for example `POST /api/auth/login`.
2. The handler checks the request `Origin` against `APP_ORIGIN`, then forwards the call to Flask at `API_BASE_URL`.
3. On login the handler stores the JWT in an **HttpOnly cookie**. Later handlers read the cookie and attach it to Flask requests. JavaScript never sees the token.

`APP_ORIGIN` and `API_BASE_URL` are server-only and never reach the browser bundle.

## Project structure

```text
frontend/
├── app/
│   ├── (public)/            # /login, /register
│   ├── (protected)/         # /, /boards/[id], /my-tasks, /profile (session required)
│   ├── api/                 # Route Handlers: BFF proxy to the Flask API
│   ├── layout.tsx, error.tsx, global-error.tsx, not-found.tsx, globals.css
├── components/
│   ├── auth/  boards/  kanban/  tasks/  profile/
│   ├── notifications/  analytics/
│   └── shared/              # Base UI: BaseButton, BaseModal, FormField, Avatar, ...
├── hooks/                   # useAuth, useKanbanBoard, useDragAndDrop, useNotifications, ...
├── lib/                     # Typed API client, errors, validation rules, board and card logic
│   └── server/              # Server-only: Flask client, session cookie, origin check
├── e2e/                     # Playwright acceptance suite and helpers
├── specs/                   # Pages, API integration, error handling specs
├── next.config.ts, tsconfig.json, eslint.config.mjs
├── vitest.config.mts, playwright.config.ts
└── package.json
```

Unit tests sit beside the code they test (`*.test.ts`, `*.test.tsx`).

## Pages

| Route | Access | Purpose |
| --- | --- | --- |
| `/register`, `/login` | Public | Create an account and sign in |
| `/` | Signed in | Board dashboard: list and create boards |
| `/boards/[id]` | Board participant | Kanban board, card details and comments, search, members, analytics |
| `/my-tasks` | Signed in | Every card assigned to you, grouped by board |
| `/profile` | Signed in | Change your name or email |

The header shows a notification bell with the unread count, refreshed every 30 seconds.

The layout uses a sidebar from 1024 px and a top bar below it. Cards move by desktop drag and drop, or with the Move button, which works with a keyboard and touch. A stale move returns 409 and the board refetches.

## Prerequisites

- Node.js 24.22.1 (`nvm use` reads `.nvmrc`)
- The backend API running. See the [backend README](../backend/README.md).

## Getting started

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev                       # http://localhost:3000
```

Open the app at `http://localhost:3000`, not `127.0.0.1`. See the origin note below.

## Environment variables

Set these in `.env.local`. They are read on the server only.

| Variable | Default | Description |
| --- | --- | --- |
| `API_BASE_URL` | `http://127.0.0.1:5001` | Base URL of the Flask API |
| `APP_ORIGIN` | `http://localhost:3000` | Exact origin of this app. The BFF rejects browser `POST` requests with a different `Origin` (403) |
| `E2E_BASE_URL` | `http://localhost:3000` | Target of the Playwright suite |

`APP_ORIGIN` must be an `https` origin, or an `http` origin on `localhost`, `127.0.0.1` or `[::1]`. The session cookie is `Secure` only when `APP_ORIGIN` is `https`. If you start Next on another port, set `APP_ORIGIN` to match, for example `APP_ORIGIN=http://localhost:3100 npx next start -p 3100`.

`next build` needs neither variable. They are read on the first request.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (jsdom for components, node for Route Handlers and server modules) |
| `npm run e2e` | Playwright acceptance suite |
| `npm run e2e:unit` | Playwright helper unit tests (no servers or database) |
| `npm run e2e:cleanup` | Remove rows left by an interrupted e2e run |

## End-to-end tests

The Playwright suite in `e2e/` starts no servers. Before `npm run e2e`:

1. Run Flask natively on port 5001, connected to the **test** database.
2. Run `npm run dev` on `http://localhost:3000`.
3. Have `psql` on `PATH`, or set `PSQL` to its absolute path.
4. Run `npx playwright install chromium` once.

A preflight check stops the run unless it can prove Flask uses the `_test` database. Each run creates tagged accounts and deletes all of its rows at the end. If a run is killed, clean up with `LA_CLEANUP_RUN=<runId> npm run e2e:cleanup`.

Projects: `desktop` (1280 px, mouse) and `viewport-320`, `mobile-375`, `viewport-768` (Chromium touch emulation). These are emulations, not real devices. The HTML report goes to `playwright-report/`, which is git-ignored. Check a report for credentials before sharing it.

The full setup is in the [development guide](../docs/DEVELOPMENT.md).

## Deployment

- Hosted on Vercel with Root Directory `frontend`.
- Every push to `main` deploys automatically.
- Set `API_BASE_URL` to the Render API URL and `APP_ORIGIN` to the Vercel URL in the project settings.

See the [deployment runbook](../docs/DEPLOYMENT.md).

## Documentation

- [Frontend specs](specs/README.md): [pages and components](specs/pages-and-components.md), [API integration](specs/api-integration.md), [error handling](specs/error-handling.md)
- [Frontend changelog](CHANGELOG.md)
- [Frontend guidelines](../guidelines/frontend.md), [user guide](../docs/USER_GUIDE.md)
- [Project README](../README.md)
