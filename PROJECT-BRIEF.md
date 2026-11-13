# Project Brief · RevoTask

## 1. Overview

RevoTask gives small teams a shared Kanban board to track work from assignment through completion. It supports collaboration, visibility into current work, and a repeatable AI-assisted development workflow with reviewable evidence.

## 2. User roles

| Role | Capabilities | Permission boundary |
|---|---|---|
| Visitor | Register and sign in. | Protected data requires an authenticated account. |
| Signed-in user | Create a board, see accessible boards, see personal assignments and notifications, edit own profile. | Board access begins with ownership or membership. |
| Board member | Read board and analytics, manage cards, assign active board participants, move cards and manage own comments. | Admin controls board settings, membership and columns. Only a comment's author may change it. |
| Board admin | Inherits member capabilities and manages own board name, lifecycle, columns and members. Board creator is its admin. | Authorization is scoped to that board. |

## 3. Core features

- Accounts and sessions with registration, login, logout, and profile editing.
- Board list and detail, admin membership management, ordered columns and cards, card assignment and comments.
- Desktop drag-and-drop and a keyboard/touch move control, both using the same persistence contract.
- Personal tasks grouped by board, board-scoped card search, notification bell, and board analytics.
- Public deployment and a reproducible QA and evidence package.
- Out of scope for the first submission: real-time sockets, file attachments, public boards, invitation email, password reset, board ownership transfer, restoration UI, and AI features within the app.

## 4. Tech stack

- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS, daisyUI and react-hot-toast. Deploy to Vercel.
- Backend: Flask, SQLAlchemy, Alembic via Flask-Migrate, Marshmallow, Flask-JWT-Extended, Psycopg and Gunicorn. Deploy to Render.
- Database: PostgreSQL locally and Supabase PostgreSQL in production. Flask owns the data and authorization boundary.
- Tooling: Kiro for specifications and implementation drafts, Claude Code for independent review and test drafts, pytest, React Testing Library and Playwright for verification.

## 5. Non-functional requirements

1. With a warm deployment and a representative board of at most 100 cards, target p95 ≤ 800 ms for 30 sequential board detail API requests measured from one client. Capture conditions and raw timings.
2. At a 375 px viewport and with keyboard navigation on desktop, a user can complete the core board flow and move a card using a visible control. The Kanban region may scroll horizontally while the page header and forms remain usable.
3. All protected API endpoints reject absent, expired or revoked tokens. An authenticated nonmember cannot read or mutate another board. Private responses carry no-store caching.
4. With concurrent card or column reorder requests based on the same board position version, at most one commits and the stale requester receives 409 and reloads authoritative state.

## Scope agreement

The supplied handbook, pp. 1–13, defines the assignment and evidence rubric. [RUBRIC.md](docs/RUBRIC.md) lists adopted requirements and design deviations. [Requirements](specs/requirements.md), [design](specs/design.md) and the [API contract](docs/API.md) define implementation behavior for this baseline. Resolve inconsistencies in those documents and log the decision before changing code.
