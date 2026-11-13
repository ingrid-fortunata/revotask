"""BT3 detail tests for the boards API (task 2.7; Requirements 2.1-2.3, 7.5).

E07 returns the caller's role, the board `position_version` and the active columns, each with its
active cards. Columns and cards are ordered by stored `order`, then by ID. Rows are seeded
directly with `BoardTracker`, because the column and card writers belong to later tasks. Every
test uses the `board_tracker` fixture, so teardown removes only the rows the test created.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.extensions import db
from app.models.base import utcnow
from app.models.board_column import BoardColumn
from app.models.card import Card
from tests.auth_helpers import bearer

BOARD_KEYS = {"id", "name", "role", "position_version", "columns"}
COLUMN_KEYS = {"id", "board_id", "name", "is_done", "order", "cards"}
CARD_KEYS = {"id", "column_id", "title", "description", "assignee_id", "assignee_name", "order"}


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def _soft_delete(app, model, row_id: uuid.UUID) -> None:
    """Set `deleted_at` on one row. Used to build hidden states the API cannot create."""
    with app.app_context():
        try:
            row = db.session.get(model, row_id)
            row.deleted_at = utcnow()
            db.session.commit()
        finally:
            db.session.remove()


def _board_detail(client, token: str, board_id: uuid.UUID):
    return client.get(f"/api/boards/{board_id}", headers=bearer(token))


def _expected_order(items):
    """Sort (id, order) pairs the way the spec does: stored order, then ID."""
    return [item_id for item_id, _order in sorted(items, key=lambda item: (item[1], item[0]))]


@pytest.mark.parametrize("role", ["admin", "member"])
def test_detail_has_the_documented_shape_for_each_role(client, board_tracker, role):
    owner = board_tracker.make_user()
    viewer = board_tracker.make_user()
    board_id = board_tracker.make_board(owner.id, "Shape board")
    board_tracker.make_membership(board_id, viewer.id, role)
    column_id = board_tracker.make_column(board_id, "Todo", order=1.0)
    board_tracker.make_card(column_id, "Write spec", assignee_id=viewer.id, order=1.0)
    token = board_tracker.token_for(viewer.id)

    response = _board_detail(client, token, board_id)

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "private, no-store"
    data = response.get_json()["data"]
    assert set(data) == BOARD_KEYS
    assert data["id"] == str(board_id)
    assert data["name"] == "Shape board"
    assert data["role"] == role
    assert isinstance(data["position_version"], int)

    (column,) = data["columns"]
    assert set(column) == COLUMN_KEYS
    assert column["board_id"] == str(board_id)
    assert column["name"] == "Todo"
    assert column["is_done"] is False
    assert column["order"] == 1.0

    (card,) = column["cards"]
    assert set(card) == CARD_KEYS
    assert card["column_id"] == str(column_id)
    assert card["title"] == "Write spec"
    assert card["assignee_id"] == str(viewer.id)


def test_detail_returns_empty_columns_for_a_board_without_columns(client, board_tracker):
    owner = board_tracker.make_user()
    board_id = board_tracker.make_board(owner.id, "Empty board")
    board_tracker.make_membership(board_id, owner.id, "admin")
    token = board_tracker.token_for(owner.id)

    response = _board_detail(client, token, board_id)

    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["columns"] == []
    assert data["role"] == "admin"


def test_detail_orders_columns_and_cards_by_order_then_id(client, board_tracker):
    owner = board_tracker.make_user()
    board_id = board_tracker.make_board(owner.id, "Ordered board")
    board_tracker.make_membership(board_id, owner.id, "admin")

    # Columns: seeded out of order, with two columns that tie on `order`.
    late = board_tracker.make_column(board_id, "Late", order=3.0)
    tie_a = board_tracker.make_column(board_id, "Tie A", order=2.0)
    tie_b = board_tracker.make_column(board_id, "Tie B", order=2.0)
    early = board_tracker.make_column(board_id, "Early", order=0.5)
    column_orders = [(late, 3.0), (tie_a, 2.0), (tie_b, 2.0), (early, 0.5)]

    # Cards in the first column: fractional and tied orders, seeded out of order.
    busy = tie_a
    card_orders = [
        (board_tracker.make_card(busy, "Card 2", order=2.0), 2.0),
        (board_tracker.make_card(busy, "Card 1", order=1.0), 1.0),
        (board_tracker.make_card(busy, "Card 1b", order=1.0), 1.0),
        (board_tracker.make_card(busy, "Card 0.25", order=0.25), 0.25),
    ]
    # One card in another column, so each card must appear under its own column only.
    other_card = board_tracker.make_card(late, "Other column card", order=1.0)
    token = board_tracker.token_for(owner.id)

    response = _board_detail(client, token, board_id)

    assert response.status_code == 200
    columns = response.get_json()["data"]["columns"]
    assert [column["id"] for column in columns] == [
        str(column_id) for column_id in _expected_order(column_orders)
    ]

    by_id = {column["id"]: column for column in columns}
    assert [card["id"] for card in by_id[str(busy)]["cards"]] == [
        str(card_id) for card_id in _expected_order(card_orders)
    ]
    assert [card["id"] for card in by_id[str(late)]["cards"]] == [str(other_card)]
    assert by_id[str(early)]["cards"] == []


def test_detail_assignee_name_comes_from_the_user_join(client, board_tracker):
    owner = board_tracker.make_user()
    assignee = board_tracker.make_user(name="Dana Ruiz")
    board_id = board_tracker.make_board(owner.id, "Assignee board")
    board_tracker.make_membership(board_id, owner.id, "admin")
    board_tracker.make_membership(board_id, assignee.id, "member")
    column_id = board_tracker.make_column(board_id)
    assigned = board_tracker.make_card(column_id, "Assigned", assignee_id=assignee.id, order=1.0)
    unassigned = board_tracker.make_card(column_id, "Unassigned", order=2.0)
    token = board_tracker.token_for(owner.id)

    response = _board_detail(client, token, board_id)

    assert response.status_code == 200
    cards = {card["id"]: card for card in response.get_json()["data"]["columns"][0]["cards"]}
    assert cards[str(assigned)]["assignee_id"] == str(assignee.id)
    assert cards[str(assigned)]["assignee_name"] == "Dana Ruiz"
    assert cards[str(unassigned)]["assignee_id"] is None
    assert cards[str(unassigned)]["assignee_name"] is None
    # The public response never exposes the assignee's email.
    assert assignee.email not in response.get_data(as_text=True)


def test_detail_excludes_soft_deleted_columns_and_cards(client, app, board_tracker):
    owner = board_tracker.make_user()
    board_id = board_tracker.make_board(owner.id, "Soft delete board")
    board_tracker.make_membership(board_id, owner.id, "admin")

    active_column = board_tracker.make_column(board_id, "Active", order=1.0)
    kept_card = board_tracker.make_card(active_column, "Kept", order=1.0)
    deleted_card = board_tracker.make_card(active_column, "Deleted card", order=2.0)
    deleted_column = board_tracker.make_column(board_id, "Deleted column", order=2.0)
    board_tracker.make_card(deleted_column, "Under deleted column", order=1.0)
    _soft_delete(app, Card, deleted_card)
    _soft_delete(app, BoardColumn, deleted_column)
    token = board_tracker.token_for(owner.id)

    response = _board_detail(client, token, board_id)

    assert response.status_code == 200
    columns = response.get_json()["data"]["columns"]
    assert [column["id"] for column in columns] == [str(active_column)]
    assert [card["id"] for card in columns[0]["cards"]] == [str(kept_card)]
    with app.app_context():
        try:
            assert db.session.scalar(select(Card.id).where(Card.id == deleted_card)) is not None
        finally:
            db.session.remove()
