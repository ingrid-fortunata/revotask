"""Visibility of notifications (T13; Requirement 5.4 to 5.6; Properties 4, 5 and 9; decision B4).

One filter serves the items, both counts and E28: an active board, column and card, and the
recipient's active membership. Rows are kept, so a rejoining member sees the same rows with the
same read status.
"""

from __future__ import annotations

import pytest

from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.card import Card
from tests.kanban_helpers import make_kanban, soft_delete
from tests.notification_helpers import (
    assign,
    comment,
    insert_notification,
    list_as,
    mark_as,
    seed_world,
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    return seed_world(make_kanban(board_tracker, app))


def _two_rows_one_read(client, world):
    """Ana is assigned (read afterwards) and then commented on (unread). Returns the two IDs."""
    kanban = world.kanban
    assert assign(client, kanban, world.card, world.ana.id).status_code == 200
    assert comment(client, kanban, world.card, by=world.ben).status_code == 201
    items = list_as(client, kanban, world.ana).get_json()["data"]["items"]
    assigned = next(item for item in items if item["kind"] == "assigned")
    commented = next(item for item in items if item["kind"] == "commented")
    assert mark_as(client, kanban, world.ana, assigned["id"]).status_code == 200
    return assigned["id"], commented["id"]


def _counts(client, world, user, query=""):
    data = list_as(client, world.kanban, user, query).get_json()["data"]
    return len(data["items"]), data["total"], data["unread_count"]


def test_removal_hides_the_rows_and_a_rejoin_brings_them_back_with_their_read_status(client, world):
    kanban = world.kanban
    assigned_id, commented_id = _two_rows_one_read(client, world)
    before = list_as(client, kanban, world.ana).get_json()["data"]
    assert (before["total"], before["unread_count"]) == (2, 1)
    read_at = {item["id"]: item["read_at"] for item in before["items"]}
    assert read_at[assigned_id] is not None and read_at[commented_id] is None

    removed = client.delete(
        f"/api/boards/{kanban.board_id}/members/{world.ana.id}", headers=kanban.headers()
    )
    assert removed.status_code == 200
    assert _counts(client, world, world.ana) == (0, 0, 0)
    for note in (assigned_id, commented_id):
        assert mark_as(client, kanban, world.ana, note).status_code == 404

    added = client.post(
        f"/api/boards/{kanban.board_id}/members",
        json={"email": world.ana.email},
        headers=kanban.headers(),
    )
    assert added.status_code == 201
    after = list_as(client, kanban, world.ana).get_json()["data"]
    assert [item["id"] for item in after["items"]] == [item["id"] for item in before["items"]]
    assert {item["id"]: item["read_at"] for item in after["items"]} == read_at
    assert (after["total"], after["unread_count"]) == (2, 1)
    # The counts follow on every page, an empty one included.
    for page in (1, 2, 3):
        assert _counts(client, world, world.ana, f"?page={page}&per_page=1")[1:] == (2, 1)
    assert mark_as(client, kanban, world.ana, commented_id).status_code == 200


@pytest.mark.parametrize("model", [Board, BoardColumn, Card])
def test_a_soft_deleted_board_column_or_card_hides_the_row_from_all_three_reads(
    client, world, app, model
):
    kanban = world.kanban
    note = insert_notification(app, world.ana.id, kanban.admin.id, kanban.board_id, world.card)
    assert _counts(client, world, world.ana) == (1, 1, 1)
    target = {Board: kanban.board_id, BoardColumn: world.column, Card: world.card}[model]
    soft_delete(app, model, target)
    assert _counts(client, world, world.ana) == (0, 0, 0)
    assert mark_as(client, kanban, world.ana, note).status_code == 404


def test_other_users_and_other_boards_are_unaffected(client, world, board_tracker, app):
    kanban = world.kanban
    insert_notification(app, world.ana.id, kanban.admin.id, kanban.board_id, world.card)
    insert_notification(app, world.ben.id, kanban.admin.id, kanban.board_id, world.card)
    # A second board where Ana is also a member and has a row.
    other = make_kanban(board_tracker, app, name="Other board")
    board_tracker.make_membership(other.board_id, world.ana.id, "member")
    other_column = board_tracker.make_column(other.board_id, "Todo", order=1024.0)
    other_card = board_tracker.make_card(other_column, "Elsewhere", order=1024.0)
    insert_notification(app, world.ana.id, other.admin.id, other.board_id, other_card)
    assert _counts(client, world, world.ana) == (2, 2, 2)

    soft_delete(app, Board, kanban.board_id)
    assert _counts(client, world, world.ana) == (1, 1, 1)  # only the other board's row
    assert list_as(client, kanban, world.ana).get_json()["data"]["items"][0]["board_id"] == str(
        other.board_id
    )
    # Ben has no membership change and his own row is hidden only by the deleted board.
    assert _counts(client, world, world.ben) == (0, 0, 0)
