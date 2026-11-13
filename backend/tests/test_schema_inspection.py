"""FND-AC5.4, FND-AC5.5: the upgraded schema matches the data model in PostgreSQL's catalogs.

Autogenerate does not compare foreign keys reliably here (see migrations/env.py), so FKs are checked
against pg_constraint directly. Reads only. Runs against the schema at head.
"""

import re

import pytest
from sqlalchemy import create_engine, text

from app.config import DB_SCHEMA

pytestmark = pytest.mark.usefixtures("schema_at_head")

# (table, column) -> (information_schema data_type, is_nullable)
COLUMN_TYPES = {
    ("users", "id"): ("uuid", "NO"),
    ("users", "name"): ("character varying", "NO"),
    ("users", "email"): ("character varying", "NO"),
    ("users", "password_hash"): ("text", "NO"),
    ("users", "created_at"): ("timestamp with time zone", "NO"),
    ("users", "updated_at"): ("timestamp with time zone", "NO"),
    ("boards", "position_version"): ("integer", "NO"),
    ("boards", "deleted_at"): ("timestamp with time zone", "YES"),
    ("board_members", "role"): ("character varying", "NO"),
    ("board_columns", "is_done"): ("boolean", "NO"),
    ("board_columns", "order"): ("double precision", "NO"),
    ("cards", "order"): ("double precision", "NO"),
    ("cards", "assignee_id"): ("uuid", "YES"),
    ("cards", "description"): ("text", "YES"),
    ("notifications", "read_at"): ("timestamp with time zone", "YES"),
    ("board_events", "card_id"): ("uuid", "YES"),
    ("revoked_tokens", "jti"): ("uuid", "NO"),
}

PRIMARY_KEYS = {
    "users",
    "boards",
    "board_members",
    "board_columns",
    "cards",
    "card_comments",
    "notifications",
    "board_events",
    "revoked_tokens",
}

CHECK_FRAGMENTS = {
    "ck_users_email_normalized": "lower(btrim(",
    "ck_boards_position_version_nonnegative": "position_version >= 0",
    "ck_board_members_role": "'admin'",
    "ck_board_columns_order_finite_positive": "Infinity",
    "ck_cards_order_finite_positive": "Infinity",
    "ck_notifications_kind": "'commented'",
    "ck_board_events_kind": "'entered_done'",
}

# index name -> (is_unique, expected predicate fragments or None when the index is not partial)
INDEXES = {
    "ix_board_members_user_id_active": (False, "deleted_at IS NULL"),
    "uq_board_columns_board_id_active_done": (True, "is_done AND (deleted_at IS NULL)"),
    "ix_board_columns_board_order_id": (False, "deleted_at IS NULL"),
    "ix_cards_column_order_id": (False, "deleted_at IS NULL"),
    "ix_cards_assignee_id_active": (False, "deleted_at IS NULL"),
    "ix_card_comments_card_created_id": (False, "deleted_at IS NULL"),
    "ix_notifications_recipient_created_id": (False, None),
    "ix_notifications_recipient_unread": (False, "read_at IS NULL"),
    "ix_board_events_board_occurred": (False, None),
    "ix_revoked_tokens_expires_at": (False, None),
    "uq_board_members_board_id_user_id": (True, None),
    "uq_users_email": (True, None),
}


@pytest.fixture(scope="module")
def catalog(test_db_url):
    engine = create_engine(test_db_url)
    try:
        with engine.connect() as conn:
            yield conn
    finally:
        engine.dispose()


def _rows(conn, sql, **params):
    return conn.execute(text(sql), params).all()


def test_tables_live_in_revotask_and_none_leak_into_public(catalog):
    tables = {
        row[0]
        for row in _rows(
            catalog,
            "SELECT table_name FROM information_schema.tables WHERE table_schema = :s",
            s=DB_SCHEMA,
        )
    }
    assert {
        "users",
        "boards",
        "board_members",
        "board_columns",
        "cards",
        "card_comments",
        "notifications",
        "board_events",
        "revoked_tokens",
        "alembic_version",
    } <= tables
    leaked = _rows(
        catalog,
        "SELECT count(*) FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name IN ('users', 'cards', 'boards')",
    )
    assert leaked[0][0] == 0


@pytest.mark.parametrize(("table", "column"), sorted(COLUMN_TYPES))
def test_column_types_and_nullability(catalog, table, column):
    row = _rows(
        catalog,
        "SELECT data_type, is_nullable FROM information_schema.columns "
        "WHERE table_schema = :s AND table_name = :t AND column_name = :c",
        s=DB_SCHEMA,
        t=table,
        c=column,
    )
    assert row, f"{table}.{column} is missing"
    assert tuple(row[0]) == COLUMN_TYPES[(table, column)]


def test_varchar_lengths_are_enforced_in_the_catalog(catalog):
    rows = _rows(
        catalog,
        "SELECT table_name, column_name, character_maximum_length "
        "FROM information_schema.columns WHERE table_schema = :s AND data_type = "
        "'character varying'",
        s=DB_SCHEMA,
    )
    lengths = {(t, c): n for t, c, n in rows}
    assert lengths[("users", "email")] == 254
    assert lengths[("users", "name")] == 80
    assert lengths[("boards", "name")] == 100
    assert lengths[("board_members", "role")] == 8
    assert lengths[("cards", "title")] == 160
    assert lengths[("notifications", "kind")] == 20
    assert lengths[("board_events", "kind")] == 24


def test_primary_keys_exist_on_every_table(catalog):
    rows = _rows(
        catalog,
        "SELECT conrelid::regclass::text FROM pg_constraint WHERE contype = 'p' "
        "AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = :s)",
        s=DB_SCHEMA,
    )
    found = {row[0].split(".")[-1] for row in rows}
    assert PRIMARY_KEYS <= found


def test_check_constraints_carry_the_expected_rule(catalog):
    rows = _rows(
        catalog,
        "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint "
        "WHERE contype = 'c' AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = :s)",
        s=DB_SCHEMA,
    )
    definitions = {name: definition for name, definition in rows}
    for name, fragment in CHECK_FRAGMENTS.items():
        assert name in definitions, name
        assert fragment in definitions[name], (name, definitions[name])


def test_order_check_rejects_nan_and_infinity_by_definition(catalog):
    rows = _rows(
        catalog,
        "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
        "WHERE conname = 'ck_board_columns_order_finite_positive'",
    )
    definition = rows[0][0]
    # PostgreSQL renders the expression as ("order" > (0)::double precision) AND ... Infinity.
    assert '"order" > (0)' in definition
    assert "< 'Infinity'" in definition


def test_every_foreign_key_is_restrict_and_points_into_revotask(catalog):
    # Read the referenced schema from pg_namespace. regclass text omits the schema when it
    # matches the search path, and the role's "$user" entry resolves to revotask here.
    rows = _rows(
        catalog,
        "SELECT c.conname, c.confdeltype, n.nspname FROM pg_constraint c "
        "JOIN pg_class t ON t.oid = c.confrelid "
        "JOIN pg_namespace n ON n.oid = t.relnamespace "
        "JOIN pg_namespace own ON own.oid = c.connamespace "
        "WHERE c.contype = 'f' AND own.nspname = :s",
        s=DB_SCHEMA,
    )
    # One FK per foreign-key column in the data model: boards 1, board_members 2,
    # board_columns 1, cards 2, card_comments 2, notifications 4, board_events 3.
    assert len(rows) == 15
    for name, delete_action, referenced_schema in rows:
        assert delete_action == "r", f"{name} is not ON DELETE RESTRICT"
        assert referenced_schema == DB_SCHEMA, f"{name} references {referenced_schema}"


@pytest.mark.parametrize(("index_name", "expected"), sorted(INDEXES.items()))
def test_indexes_have_expected_uniqueness_and_predicates(catalog, index_name, expected):
    unique_expected, predicate = expected
    rows = _rows(
        catalog,
        "SELECT indexdef FROM pg_indexes WHERE schemaname = :s AND indexname = :n",
        s=DB_SCHEMA,
        n=index_name,
    )
    assert rows, f"{index_name} is missing"
    indexdef = rows[0][0]
    assert ("CREATE UNIQUE INDEX" in indexdef) is unique_expected, indexdef
    if predicate is None:
        assert " WHERE " not in indexdef, indexdef
    else:
        assert re.search(r"WHERE \(?" + re.escape(predicate), indexdef), indexdef


def test_composite_order_indexes_use_the_expected_column_order(catalog):
    rows = _rows(
        catalog,
        "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = :s "
        "AND indexname IN ('ix_board_columns_board_order_id', 'ix_cards_column_order_id', "
        "'ix_card_comments_card_created_id')",
        s=DB_SCHEMA,
    )
    defs = {name: definition for name, definition in rows}
    assert '(board_id, "order", id)' in defs["ix_board_columns_board_order_id"]
    assert '(column_id, "order", id)' in defs["ix_cards_column_order_id"]
    assert "(card_id, created_at, id)" in defs["ix_card_comments_card_created_id"]
