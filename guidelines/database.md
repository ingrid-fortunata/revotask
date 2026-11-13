# Database Steering Guidelines

| ID | Rule | Rationale | RevoTask example |
|---|---|---|---|
| DB01 | Use plural snake_case tables and snake_case columns. Define UUID primary keys and meaningful foreign keys. | Keeps schema joins and naming predictable. | `card_comments.card_id` references `cards.id`. |
| DB02 | Use UTC timezone-aware timestamps. Define `created_at`, `updated_at` and nullable `deleted_at` for soft-deletable domain models. | Supports audit, ordering and consistent filtering. | Card queries filter active cards and ancestors. |
| DB03 | Declare both relationship sides with `back_populates` and explicitly eager-load nested views where needed. | Avoids hidden relationships and N+1 queries. | `BoardColumn.cards` and `Card.column`; board detail uses `selectinload`. |
| DB04 | Enforce business uniqueness with database constraints. | Rejects races across application workers. | Unique normalized email and one active Done column per board. |
| DB05 | Use double-precision FLOAT order values, finite and positive. Sort by `(order,id)` and use a versioned board lock for position writes. | Preserves stable ordering during concurrent changes and precision edge cases. | The move service rebalances siblings before a midpoint loses precision. |
| DB06 | Store schema changes in reviewed Alembic migrations. Test on PostgreSQL against empty and previous schemas. | Keeps deployment reproducible. | Add a partial active-column index in a migration and check upgraded existing data. |
| DB07 | Keep the application schema private. Separate runtime permissions from schema-change permissions and use TLS verification in production. | Limits database exposure and blast radius. | Grant the Flask role required DML in `revotask`. Keep migration credentials outside the runtime service unless executing a controlled pre-deploy step. |
