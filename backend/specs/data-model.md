# PostgreSQL Data Model

Implements shared design D3–D4. Use the `revotask` schema on local PostgreSQL and Supabase. Names below are database columns. SQLAlchemy classes use singular PascalCase. UTC timestamps use `TIMESTAMPTZ` with timezone-aware SQLAlchemy mappings. Foreign keys point to explicit schema-qualified tables.

## Tables and fields

| Table / ORM model | Columns and PostgreSQL types | Constraints and behavior |
|---|---|---|
| `users` / `User` | `id UUID`, `name VARCHAR(80)`, `email VARCHAR(254)`, `password_hash TEXT`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ` | Normalize email before insert/update and enforce unique normalized email in the database. Hash is required and absent from public DTOs. Account deletion is outside v1. |
| `boards` / `Board` | `id UUID`, `creator_id UUID → users`, `name VARCHAR(100)`, `position_version INTEGER`, audit fields | Version starts at zero and is nonnegative. Create board and admin membership together. |
| `board_members` / `BoardMember` | `id UUID`, `board_id UUID → boards`, `user_id UUID → users`, `role VARCHAR(8)`, audit fields | Unique `(board_id, user_id)`; role is `admin` or `member`. Re-add reactivates the same row. Admin removal returns 409. |
| `board_columns` / `BoardColumn` | `id UUID`, `board_id UUID → boards`, `name VARCHAR(80)`, `is_done BOOLEAN`, `order DOUBLE PRECISION`, audit fields | `is_done` defaults to false. Partial unique index on `board_id` for active Done rows. |
| `cards` / `Card` | `id UUID`, `column_id UUID → board_columns`, `assignee_id UUID → users` nullable, `title VARCHAR(160)`, `description TEXT` nullable, `order DOUBLE PRECISION`, audit fields | Description at most 2,000 characters. Active assignee must be a board participant at write time. |
| `card_comments` / `CardComment` | `id UUID`, `card_id UUID → cards`, `author_id UUID → users`, `content TEXT`, audit fields | Trimmed content 1–2,000 characters. Author identity is immutable. |
| `notifications` / `Notification` | `id UUID`, `recipient_id UUID → users`, `actor_id UUID → users`, `board_id UUID → boards`, `card_id UUID → cards`, `kind VARCHAR(20)`, `created_at TIMESTAMPTZ`, `read_at TIMESTAMPTZ` nullable | Kinds `assigned` and `commented`. Visibility follows current membership and active board/card ancestors. First successful mark-read sets `read_at` and a repeat keeps it. One visibility filter (active board, column and card, and the recipient's active membership) serves E27 items, both counts and E28; rows are never deleted, so a rejoining member sees them again. Plain foreign keys, no ORM relationship: the queries join explicitly (T13). |
| `board_events` / `BoardEvent` | `id UUID`, `board_id UUID → boards`, `actor_id UUID → users`, `card_id UUID → cards` nullable, `kind VARCHAR(24)`, `occurred_at TIMESTAMPTZ` | Append-only. Use `card_created`, `card_moved`, `column_reordered`, `comment_created` and `entered_done` for the events defined by D4/D6. |
| `revoked_tokens` / `RevokedToken` | `jti UUID`, `expires_at TIMESTAMPTZ` | `jti` is the primary key. Expired records are eligible for cleanup. |

All fields are required unless marked nullable. For soft-deletable models, **audit fields** mean required `created_at` and `updated_at` and nullable `deleted_at`. Generate UUID IDs with `uuid.uuid4`, initialize creation timestamps and refresh `updated_at` on writes. Use restrictive foreign keys since business deletion is soft. Keep historical events accessible to authorized analytics after card deletion.

## Relationships and ordering

- Define both directions explicitly with `back_populates`, including Board–BoardColumn and BoardColumn–Card. Preload board detail collections with `selectinload` and apply active-child filters.
- Resolve card and comment access through their parent board. Authorize current participation before returning private DTOs. For a membership mutation or Kanban write, serialize on the board row and check authorization again inside the transaction.
- Column and card order use SQLAlchemy `db.Float(precision=53)` or equivalent that compiles to PostgreSQL `DOUBLE PRECISION`. Enforce `order > 0 AND order < 'Infinity'::double precision` to exclude infinities, NaN and nonpositive values. Sort with `(order,id)`; follow D4 for precision exhaustion and rebalance.
- Index active memberships by `user_id`, active columns by `(board_id, order, id)`, active cards by `(column_id, order, id)` and `assignee_id`, active comments by `(card_id, created_at, id)`, notifications by `(recipient_id, created_at, id)` with an unread lookup, events by `(board_id, occurred_at)` and revoked tokens by expiry.

## Migration verification

Review the generated Alembic revision and schema-qualified foreign keys before applying. Verify tables, constraints and indexes on a fresh database and test later revisions against the prior schema. Keep the runtime role limited to required table operations. Test normalized-email races, invalid order values, duplicate Done columns, deletion visibility and versioned reorder on PostgreSQL.
