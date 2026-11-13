"""FND-AC4.1–4.4: model metadata matches backend/specs/data-model.md. No database is needed."""

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CheckConstraint, ForeignKeyConstraint

from app.extensions import db
from app.models import (
    Board,
    BoardColumn,
    BoardMember,
    Card,
    CardComment,
    Notification,
    RevokedToken,
    User,
)

# column name -> nullable, per backend/specs/data-model.md
EXPECTED = {
    "users": {
        "id": False,
        "name": False,
        "email": False,
        "password_hash": False,
        "created_at": False,
        "updated_at": False,
    },
    "boards": {
        "id": False,
        "creator_id": False,
        "name": False,
        "position_version": False,
        "created_at": False,
        "updated_at": False,
        "deleted_at": True,
    },
    "board_members": {
        "id": False,
        "board_id": False,
        "user_id": False,
        "role": False,
        "created_at": False,
        "updated_at": False,
        "deleted_at": True,
    },
    "board_columns": {
        "id": False,
        "board_id": False,
        "name": False,
        "is_done": False,
        "order": False,
        "created_at": False,
        "updated_at": False,
        "deleted_at": True,
    },
    "cards": {
        "id": False,
        "column_id": False,
        "assignee_id": True,
        "title": False,
        "description": True,
        "order": False,
        "created_at": False,
        "updated_at": False,
        "deleted_at": True,
    },
    "card_comments": {
        "id": False,
        "card_id": False,
        "author_id": False,
        "content": False,
        "created_at": False,
        "updated_at": False,
        "deleted_at": True,
    },
    "notifications": {
        "id": False,
        "recipient_id": False,
        "actor_id": False,
        "board_id": False,
        "card_id": False,
        "kind": False,
        "created_at": False,
        "read_at": True,
    },
    "board_events": {
        "id": False,
        "board_id": False,
        "actor_id": False,
        "card_id": True,
        "kind": False,
        "occurred_at": False,
    },
    "revoked_tokens": {"jti": False, "expires_at": False},
}

# VARCHAR lengths from the data model
LENGTHS = {
    ("users", "name"): 80,
    ("users", "email"): 254,
    ("boards", "name"): 100,
    ("board_members", "role"): 8,
    ("board_columns", "name"): 80,
    ("cards", "title"): 160,
    ("notifications", "kind"): 20,
    ("board_events", "kind"): 24,
}

SOFT_DELETABLE = {"boards", "board_members", "board_columns", "cards", "card_comments"}
NOT_SOFT_DELETABLE = {"users", "notifications", "board_events", "revoked_tokens"}

RELATIONSHIP_PAIRS = [
    (User, "created_boards", Board, "creator"),
    (Board, "members", BoardMember, "board"),
    (User, "memberships", BoardMember, "user"),
    (Board, "columns", BoardColumn, "board"),
    (BoardColumn, "cards", Card, "column"),
    (User, "assigned_cards", Card, "assignee"),
    (Card, "comments", CardComment, "card"),
    (User, "comments", CardComment, "author"),
    (User, "notifications", Notification, "recipient"),
]

EXPECTED_CHECKS = {
    "ck_users_email_normalized",
    "ck_boards_position_version_nonnegative",
    "ck_board_members_role",
    "ck_board_columns_order_finite_positive",
    "ck_cards_order_finite_positive",
    "ck_notifications_kind",
    "ck_board_events_kind",
}

EXPECTED_INDEXES = {
    "ix_board_members_user_id_active",
    "uq_board_columns_board_id_active_done",
    "ix_board_columns_board_order_id",
    "ix_cards_column_order_id",
    "ix_cards_assignee_id_active",
    "ix_card_comments_card_created_id",
    "ix_notifications_recipient_created_id",
    "ix_notifications_recipient_unread",
    "ix_board_events_board_occurred",
    "ix_revoked_tokens_expires_at",
}


def test_exactly_the_nine_tables_exist_in_the_revotask_schema():
    names = {table.name for table in db.metadata.tables.values()}
    assert names == set(EXPECTED)
    assert {table.schema for table in db.metadata.tables.values()} == {"revotask"}


@pytest.mark.parametrize("table", sorted(EXPECTED))
def test_columns_and_nullability_match_the_data_model(table):
    columns = db.metadata.tables[f"revotask.{table}"].columns
    assert {c.name: c.nullable for c in columns} == EXPECTED[table]


@pytest.mark.parametrize(("table", "column"), sorted(LENGTHS))
def test_varchar_lengths_match_the_data_model(table, column):
    col = db.metadata.tables[f"revotask.{table}"].columns[column]
    assert col.type.length == LENGTHS[(table, column)]


@pytest.mark.parametrize("table", sorted(SOFT_DELETABLE))
def test_soft_deletable_tables_have_deleted_at(table):
    assert "deleted_at" in db.metadata.tables[f"revotask.{table}"].columns


@pytest.mark.parametrize("table", sorted(NOT_SOFT_DELETABLE))
def test_append_or_account_tables_have_no_deleted_at(table):
    assert "deleted_at" not in db.metadata.tables[f"revotask.{table}"].columns


@pytest.mark.parametrize("table", sorted(EXPECTED))
def test_timestamps_are_timezone_aware(table):
    for name in ("created_at", "updated_at", "deleted_at", "read_at", "occurred_at", "expires_at"):
        col = db.metadata.tables[f"revotask.{table}"].columns.get(name)
        if col is not None:
            assert col.type.timezone is True, f"{table}.{name}"


def test_order_columns_are_double_precision_float_with_precision_53():
    dialect = postgresql.dialect()
    for table in ("board_columns", "cards"):
        col = db.metadata.tables[f"revotask.{table}"].columns["order"]
        assert col.type.compile(dialect=dialect) == "FLOAT(53)"


def test_every_foreign_key_restricts_deletes_and_targets_the_revotask_schema():
    for table in db.metadata.tables.values():
        for constraint in table.constraints:
            if isinstance(constraint, ForeignKeyConstraint):
                assert constraint.ondelete == "RESTRICT", table.name
                for element in constraint.elements:
                    assert element.target_fullname.startswith("revotask."), table.name


@pytest.mark.parametrize(("parent", "parent_attr", "child", "child_attr"), RELATIONSHIP_PAIRS)
def test_relationships_are_declared_on_both_sides_with_back_populates(
    parent, parent_attr, child, child_attr
):
    parent_rel = getattr(parent, parent_attr).property
    child_rel = getattr(child, child_attr).property
    assert parent_rel.back_populates == child_attr
    assert child_rel.back_populates == parent_attr


def test_check_constraints_are_named_as_the_data_model_requires():
    names = {
        c.name
        for table in db.metadata.tables.values()
        for c in table.constraints
        if isinstance(c, CheckConstraint)
    }
    assert EXPECTED_CHECKS <= names


def test_partial_and_composite_indexes_exist_with_expected_names():
    names = {index.name for table in db.metadata.tables.values() for index in table.indexes}
    assert EXPECTED_INDEXES <= names


def test_revoked_token_jti_is_the_primary_key_and_the_only_identity():
    assert [c.name for c in RevokedToken.__table__.primary_key.columns] == ["jti"]
