"""The five reorder scenarios named in docs/RUBRIC.md (QA row), one test each (E20, V04).

Each test builds its own board through `board_tracker`, so rows are independent and removed even
when an assertion fails. Every outcome is read back from PostgreSQL, not from the response alone.

1. same column      2. different column      3. missing card
4. unauthorized board      5. correct FLOAT order
"""

from __future__ import annotations

import uuid

import pytest

from tests.kanban_helpers import (
    board_version,
    card_rows,
    card_snapshot,
    card_titles,
    error_without_request_id,
    events,
    make_kanban,
    move,
    seed_cards,
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


def test_1_same_column_move_to_the_end_persists_the_new_order(client, kanban, app):
    """X1 goes after X2 in Todo: 200, titles X2, X1, orders 2048.0 and 3072.0, version 0 -> 1."""
    t = seed_cards(kanban)
    response = move(client, kanban, t.x1, t.todo, None, 0)
    assert response.status_code == 200
    assert response.get_json()["data"]["position_version"] == 1
    rows = card_rows(app, t.todo)
    assert [(r["title"], r["order"]) for r in rows] == [("X2", 2048.0), ("X1", 3072.0)]
    assert board_version(app, kanban.board_id) == 1
    assert [(kind, actor, card) for kind, actor, card in events(app, kanban.board_id)] == [
        ("card_moved", kanban.admin.id, t.x1)
    ]


def test_2_different_column_move_changes_column_and_leaves_the_source_intact(client, kanban, app):
    """X1 goes from Todo to Doing before Y1: Todo keeps X2, Doing is X1, Y1, X1 sits at 512.0."""
    t = seed_cards(kanban)
    response = move(client, kanban, t.x1, t.doing, t.y1, 0)
    assert response.status_code == 200
    assert card_titles(app, t.todo) == ["X2"]
    doing = card_rows(app, t.doing)
    assert [(r["title"], r["order"]) for r in doing] == [("X1", 512.0), ("Y1", 1024.0)]
    assert card_rows(app, t.todo)[0]["order"] == 2048.0  # the untouched sibling keeps its value
    assert board_version(app, kanban.board_id) == 1
    assert [kind for kind, _a, _c in events(app, kanban.board_id)] == ["card_moved"]


def test_3_missing_card_is_404_and_changes_nothing(client, kanban, app):
    """An unknown card ID is 404 NOT_FOUND with no field errors, no event and no version bump."""
    t = seed_cards(kanban)
    before = card_snapshot(app, kanban.board_id, [t.todo, t.doing])
    response = move(client, kanban, uuid.uuid4(), t.doing, None, 0)
    assert response.status_code == 404
    error = error_without_request_id(response)
    assert error["code"] == "NOT_FOUND" and "fields" not in error
    assert card_snapshot(app, kanban.board_id, [t.todo, t.doing]) == before
    assert board_version(app, kanban.board_id) == 0
    assert events(app, kanban.board_id) == []


def test_4_unauthorized_board_is_the_same_404_as_a_missing_card_and_changes_nothing(
    client, kanban, app, board_tracker
):
    """A stranger and another board's admin get the missing-card 404; rows are untouched."""
    t = seed_cards(kanban)
    other = make_kanban(board_tracker, app, "Other board")  # its admin is not on this board
    stranger = board_tracker.make_user(name="Stranger")
    before = card_snapshot(app, kanban.board_id, [t.todo, t.doing])
    missing = error_without_request_id(move(client, kanban, uuid.uuid4(), t.doing, None, 0))
    for user in (stranger, other.admin):
        response = move(client, kanban, t.x1, t.doing, None, 0, user=user)
        assert response.status_code == 404
        assert error_without_request_id(response) == missing
    assert card_snapshot(app, kanban.board_id, [t.todo, t.doing]) == before
    assert board_version(app, kanban.board_id) == 0
    assert events(app, kanban.board_id) == []


def test_5_float_order_uses_the_midpoint_and_sorts_numerically(client, kanban, app):
    """Between 1024.0 and 2048.0 the card gets exactly 1536.0, then 1280.0 between 1024.0 and it.

    The stored values are floats, so the order must be numeric (1280.0 < 1536.0), not textual.
    """
    t = seed_cards(kanban)
    third = kanban.tracker.make_card(t.todo, "X3", order=4096.0)
    assert move(client, kanban, third, t.todo, t.x2, 0).status_code == 200  # between X1 and X2
    rows = card_rows(app, t.todo)
    assert [(r["title"], r["order"]) for r in rows] == [
        ("X1", 1024.0),
        ("X3", 1536.0),
        ("X2", 2048.0),
    ]
    assert move(client, kanban, t.x2, t.todo, third, 1).status_code == 200  # between X1 and X3
    rows = card_rows(app, t.todo)
    assert [(r["title"], r["order"]) for r in rows] == [
        ("X1", 1024.0),
        ("X2", 1280.0),
        ("X3", 1536.0),
    ]
    assert all(isinstance(r["order"], float) for r in rows)
    assert board_version(app, kanban.board_id) == 2
