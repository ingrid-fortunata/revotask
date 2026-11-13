"""FND-AC6.1–6.5: PostgreSQL rejects data that breaks the baseline invariants (DB04, DB05).

Each rejection runs inside a savepoint and asserts the constraint name from the driver's
diagnostics, so the test fails if a different constraint rejects the row. Accepted cases run in
the same rolled-back transaction, so nothing persists between tests.
"""

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

pytestmark = pytest.mark.usefixtures("schema_at_head")

NOW = datetime.now(UTC)


def _id():
    return uuid.uuid4()


def make_user(session, email="ann@example.com"):
    return session.execute(
        text(
            "INSERT INTO revotask.users (id, name, email, password_hash) "
            "VALUES (:id, 'Ann', :email, 'hash') RETURNING id"
        ),
        {"id": _id(), "email": email},
    ).scalar_one()


def make_board(session, creator_id, name="Board"):
    return session.execute(
        text(
            "INSERT INTO revotask.boards (id, creator_id, name) "
            "VALUES (:id, :creator, :name) RETURNING id"
        ),
        {"id": _id(), "creator": creator_id, "name": name},
    ).scalar_one()


def make_column(session, board_id, order=1024.0, is_done=False, deleted_at=None):
    return session.execute(
        text(
            'INSERT INTO revotask.board_columns (id, board_id, name, is_done, "order", deleted_at) '
            "VALUES (:id, :board, 'Col', :done, :order, :deleted) RETURNING id"
        ),
        {
            "id": _id(),
            "board": board_id,
            "done": is_done,
            "order": order,
            "deleted": deleted_at,
        },
    ).scalar_one()


def make_card(session, column_id, order=1024.0):
    return session.execute(
        text(
            'INSERT INTO revotask.cards (id, column_id, title, "order") '
            "VALUES (:id, :column, 'Card', :order) RETURNING id"
        ),
        {"id": _id(), "column": column_id, "order": order},
    ).scalar_one()


def expect_rejected(session, sql, params, constraint):
    with pytest.raises(IntegrityError) as info:
        with session.begin_nested():
            session.execute(text(sql), params)
    assert info.value.orig.diag.constraint_name == constraint, info.value.orig.diag


# FND-AC6.1 -------------------------------------------------------------------------------------


def test_email_with_uppercase_is_rejected_by_the_normalization_check(db_session):
    expect_rejected(
        db_session,
        "INSERT INTO revotask.users (id, name, email, password_hash) "
        "VALUES (:id, 'A', 'Ann@Example.com', 'h')",
        {"id": _id()},
        "ck_users_email_normalized",
    )


def test_email_with_surrounding_whitespace_is_rejected_by_the_normalization_check(db_session):
    expect_rejected(
        db_session,
        "INSERT INTO revotask.users (id, name, email, password_hash) "
        "VALUES (:id, 'A', '  ann@example.com ', 'h')",
        {"id": _id()},
        "ck_users_email_normalized",
    )


def test_duplicate_normalized_email_is_rejected_by_the_unique_constraint(db_session):
    make_user(db_session, "dup@example.com")
    expect_rejected(
        db_session,
        "INSERT INTO revotask.users (id, name, email, password_hash) "
        "VALUES (:id, 'B', 'dup@example.com', 'h')",
        {"id": _id()},
        "uq_users_email",
    )


# FND-AC6.2 -------------------------------------------------------------------------------------

BAD_ORDERS = [0.0, -1.0, float("inf"), float("-inf"), float("nan")]
GOOD_ORDERS = [0.5, 1024.0]


@pytest.mark.parametrize("order", BAD_ORDERS)
def test_column_order_must_be_finite_and_positive(db_session, order):
    board = make_board(db_session, make_user(db_session))
    expect_rejected(
        db_session,
        'INSERT INTO revotask.board_columns (id, board_id, name, is_done, "order") '
        "VALUES (:id, :board, 'Bad', false, :order)",
        {"id": _id(), "board": board, "order": order},
        "ck_board_columns_order_finite_positive",
    )


@pytest.mark.parametrize("order", BAD_ORDERS)
def test_card_order_must_be_finite_and_positive(db_session, order):
    column = make_column(db_session, make_board(db_session, make_user(db_session)))
    expect_rejected(
        db_session,
        'INSERT INTO revotask.cards (id, column_id, title, "order") '
        "VALUES (:id, :column, 'Bad', :order)",
        {"id": _id(), "column": column, "order": order},
        "ck_cards_order_finite_positive",
    )


@pytest.mark.parametrize("order", GOOD_ORDERS)
def test_positive_finite_orders_are_accepted(db_session, order):
    board = make_board(db_session, make_user(db_session))
    column = make_column(db_session, board, order=order)
    make_card(db_session, column, order=order)


# FND-AC6.3 -------------------------------------------------------------------------------------


def test_second_active_done_column_on_one_board_is_rejected(db_session):
    board = make_board(db_session, make_user(db_session))
    make_column(db_session, board, is_done=True)
    with pytest.raises(IntegrityError) as info:
        with db_session.begin_nested():
            make_column(db_session, board, order=2048.0, is_done=True)
    assert info.value.orig.diag.constraint_name == "uq_board_columns_board_id_active_done"


def test_done_column_on_a_different_board_is_accepted(db_session):
    creator = make_user(db_session)
    make_column(db_session, make_board(db_session, creator, "A"), is_done=True)
    make_column(db_session, make_board(db_session, creator, "B"), is_done=True)


def test_done_column_is_accepted_after_the_first_is_soft_deleted(db_session):
    board = make_board(db_session, make_user(db_session))
    make_column(db_session, board, is_done=True, deleted_at=NOW)
    make_column(db_session, board, order=2048.0, is_done=True)


# FND-AC6.4 -------------------------------------------------------------------------------------


def test_duplicate_board_membership_is_rejected(db_session):
    user = make_user(db_session)
    board = make_board(db_session, user)
    insert = (
        "INSERT INTO revotask.board_members (id, board_id, user_id, role) "
        "VALUES (:id, :board, :user, 'admin')"
    )
    db_session.execute(text(insert), {"id": _id(), "board": board, "user": user})
    expect_rejected(
        db_session,
        insert,
        {"id": _id(), "board": board, "user": user},
        "uq_board_members_board_id_user_id",
    )


def test_membership_role_outside_admin_and_member_is_rejected(db_session):
    user = make_user(db_session)
    board = make_board(db_session, user)
    expect_rejected(
        db_session,
        "INSERT INTO revotask.board_members (id, board_id, user_id, role) "
        "VALUES (:id, :board, :user, 'owner')",
        {"id": _id(), "board": board, "user": user},
        "ck_board_members_role",
    )


def test_negative_position_version_is_rejected(db_session):
    expect_rejected(
        db_session,
        "INSERT INTO revotask.boards (id, creator_id, name, position_version) "
        "VALUES (:id, :creator, 'Neg', -1)",
        {"id": _id(), "creator": make_user(db_session)},
        "ck_boards_position_version_nonnegative",
    )


def test_notification_kind_outside_assigned_and_commented_is_rejected(db_session):
    user = make_user(db_session)
    board = make_board(db_session, user)
    card = make_card(db_session, make_column(db_session, board))
    expect_rejected(
        db_session,
        "INSERT INTO revotask.notifications (id, recipient_id, actor_id, board_id, card_id, kind) "
        "VALUES (:id, :u, :u, :b, :c, 'mentioned')",
        {"id": _id(), "u": user, "b": board, "c": card},
        "ck_notifications_kind",
    )


def test_board_event_kind_outside_the_five_defined_kinds_is_rejected(db_session):
    user = make_user(db_session)
    board = make_board(db_session, user)
    expect_rejected(
        db_session,
        "INSERT INTO revotask.board_events (id, board_id, actor_id, kind, occurred_at) "
        "VALUES (:id, :b, :u, 'card_deleted', now())",
        {"id": _id(), "b": board, "u": user},
        "ck_board_events_kind",
    )


def test_duplicate_revoked_token_jti_is_rejected(db_session):
    jti = _id()
    insert = "INSERT INTO revotask.revoked_tokens (jti, expires_at) VALUES (:jti, now())"
    db_session.execute(text(insert), {"jti": jti})
    expect_rejected(db_session, insert, {"jti": jti}, "pk_revoked_tokens")


# FND-AC6.5 -------------------------------------------------------------------------------------


def test_physically_deleting_a_referenced_row_is_rejected(db_session):
    board = make_board(db_session, make_user(db_session))
    make_column(db_session, board)
    with pytest.raises(IntegrityError) as info:
        with db_session.begin_nested():
            db_session.execute(text("DELETE FROM revotask.boards WHERE id = :id"), {"id": board})
    assert info.value.orig.diag.constraint_name == "fk_board_columns_board_id_boards"


def test_soft_deleting_a_referenced_row_is_the_supported_path(db_session):
    board = make_board(db_session, make_user(db_session))
    make_column(db_session, board)
    result = db_session.execute(
        text("UPDATE revotask.boards SET deleted_at = now() WHERE id = :id"), {"id": board}
    )
    assert result.rowcount == 1
