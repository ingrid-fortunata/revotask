"""E29 cards_per_column (T14; Requirement 1; Property 1)."""

from __future__ import annotations

import pytest
from sqlalchemy import update

from app.extensions import db
from app.models.board_column import BoardColumn
from app.models.card import Card
from tests.analytics_helpers import analytics_data
from tests.kanban_helpers import _write, make_kanban, set_done, soft_delete


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


def _rows(data) -> list[tuple[str, int]]:
    return [(item["name"], item["count"]) for item in data["cards_per_column"]]


def test_zero_columns_gives_an_empty_list_and_the_other_figures(client, kanban):
    data = analytics_data(client, kanban)
    assert data["cards_per_column"] == []
    assert data["completed_cards"] == 0
    assert data["member_activity"] == []


def test_an_empty_column_has_count_zero_and_cards_are_counted(client, kanban, board_tracker):
    todo = board_tracker.make_column(kanban.board_id, "Todo", order=1.0)
    board_tracker.make_column(kanban.board_id, "Empty", order=2.0)
    for index in range(3):
        board_tracker.make_card(todo, f"c{index}", order=float(index + 1))
    assert _rows(analytics_data(client, kanban)) == [("Todo", 3), ("Empty", 0)]


def test_the_done_column_is_listed_like_any_other(client, kanban, app, board_tracker):
    done = board_tracker.make_column(kanban.board_id, "Done", order=2.0)
    set_done(app, done)
    board_tracker.make_column(kanban.board_id, "Todo", order=1.0)
    board_tracker.make_card(done, "finished", order=1.0)
    assert _rows(analytics_data(client, kanban)) == [("Todo", 0), ("Done", 1)]


def test_columns_follow_board_order_with_the_id_as_tie_break(client, kanban, board_tracker):
    first = board_tracker.make_column(kanban.board_id, "Late", order=5.0)
    twins = [board_tracker.make_column(kanban.board_id, f"Twin{i}", order=1.0) for i in range(2)]
    data = analytics_data(client, kanban)
    expected_twins = sorted(twins)  # equal order, so the column ID decides
    assert [item["column_id"] for item in data["cards_per_column"]] == [
        *[str(column_id) for column_id in expected_twins],
        str(first),
    ]


def test_a_deleted_card_is_not_counted(client, kanban, app, board_tracker):
    todo = board_tracker.make_column(kanban.board_id, "Todo", order=1.0)
    board_tracker.make_card(todo, "kept", order=1.0)
    gone = board_tracker.make_card(todo, "gone", order=2.0)
    soft_delete(app, Card, gone)
    assert _rows(analytics_data(client, kanban)) == [("Todo", 1)]


def test_a_column_whose_only_card_is_deleted_is_still_listed_at_zero(
    client, kanban, app, board_tracker
):
    column = board_tracker.make_column(kanban.board_id, "Cleared", order=1.0)
    gone = board_tracker.make_card(column, "gone", order=1.0)
    soft_delete(app, Card, gone)
    assert _rows(analytics_data(client, kanban)) == [("Cleared", 0)]


def test_a_deleted_column_is_not_listed_with_its_cards(client, kanban, app, board_tracker):
    todo = board_tracker.make_column(kanban.board_id, "Todo", order=1.0)
    old = board_tracker.make_column(kanban.board_id, "Old", order=2.0)
    board_tracker.make_card(todo, "a", order=1.0)
    board_tracker.make_card(old, "b", order=1.0)
    soft_delete(app, BoardColumn, old)
    assert _rows(analytics_data(client, kanban)) == [("Todo", 1)]


def test_a_card_moved_between_columns_follows_its_new_column(client, kanban, app, board_tracker):
    todo = board_tracker.make_column(kanban.board_id, "Todo", order=1.0)
    doing = board_tracker.make_column(kanban.board_id, "Doing", order=2.0)
    card = board_tracker.make_card(todo, "move me", order=1.0)
    _write(
        app,
        lambda: db.session.execute(update(Card).where(Card.id == card).values(column_id=doing)),
    )
    assert _rows(analytics_data(client, kanban)) == [("Todo", 0), ("Doing", 1)]


def test_cards_of_another_board_are_not_counted(client, kanban, board_tracker, app):
    other = make_kanban(board_tracker, app, name="Other board")
    other_column = board_tracker.make_column(other.board_id, "Todo", order=1.0)
    board_tracker.make_card(other_column, "elsewhere", order=1.0)
    mine = board_tracker.make_column(kanban.board_id, "Todo", order=1.0)
    board_tracker.make_card(mine, "here", order=1.0)
    assert _rows(analytics_data(client, kanban)) == [("Todo", 1)]
    assert _rows(analytics_data(client, other)) == [("Todo", 1)]
