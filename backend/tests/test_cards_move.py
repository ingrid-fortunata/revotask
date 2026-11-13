"""E20 (task 5.8; Requirements 4.1-4.11).

Properties 4 (authoritative order), 5 (same-board moves) and 10 (events).
"""

from __future__ import annotations

import math
import uuid

import pytest

from app.models.card import Card
from tests.kanban_helpers import (
    board_version,
    card_rows,
    card_snapshot,
    card_titles,
    e07_columns,
    events,
    make_kanban,
    move,
    post_card,
    seed_cards,
    soft_delete,
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


def _kinds(app, board_id):
    return sorted(kind for kind, _a, _c in events(app, board_id))


def test_move_within_a_column_down_and_up(client, kanban, app):
    t = seed_cards(kanban)
    third = kanban.tracker.make_card(t.todo, "X3", order=3072.0)
    down = move(client, kanban, t.x1, t.todo, None, 0)  # X1 to the end
    assert down.status_code == 200
    assert card_titles(app, t.todo) == ["X2", "X3", "X1"]
    up = move(client, kanban, third, t.todo, t.x2, 1)  # X3 before X2
    assert up.status_code == 200
    assert card_titles(app, t.todo) == ["X3", "X2", "X1"]
    assert board_version(app, kanban.board_id) == 2


def test_move_across_columns_in_both_directions(client, kanban, app):
    t = seed_cards(kanban)
    right = move(client, kanban, t.x1, t.doing, t.y1, 0)  # X1 into Doing, before Y1
    assert right.status_code == 200
    assert (card_titles(app, t.todo), card_titles(app, t.doing)) == (["X2"], ["X1", "Y1"])
    left = move(client, kanban, t.y1, t.todo, None, 1)  # Y1 back to Todo, at the end
    assert left.status_code == 200
    assert (card_titles(app, t.todo), card_titles(app, t.doing)) == (["X2", "Y1"], ["X1"])


def test_move_into_an_empty_column_and_to_the_end(client, kanban, app):
    t = seed_cards(kanban)
    empty = kanban.tracker.make_column(kanban.board_id, "Empty", order=3072.0)
    first = move(client, kanban, t.x1, empty, None, 0)
    assert first.status_code == 200
    assert card_rows(app, empty)[0]["order"] == 1024.0
    end = move(client, kanban, t.x2, empty, None, 1)
    assert end.status_code == 200
    assert card_titles(app, empty) == ["X1", "X2"]
    assert card_rows(app, empty)[1]["order"] == 2048.0


def test_the_response_has_only_the_affected_lists_for_a_cross_column_move(client, kanban, app):
    t = seed_cards(kanban)
    other = kanban.tracker.make_column(kanban.board_id, "Untouched", order=4096.0)
    kanban.tracker.make_card(other, "Z1")
    data = move(client, kanban, t.x1, t.doing, None, 0).get_json()["data"]
    assert data["position_version"] == 1
    assert [col["id"] for col in data["columns"]] == [str(t.todo), str(t.doing)]
    by_id = {col["id"]: col for col in data["columns"]}
    assert [c["title"] for c in by_id[str(t.todo)]["cards"]] == ["X2"]
    assert [c["title"] for c in by_id[str(t.doing)]["cards"]] == ["Y1", "X1"]
    assert data["card"]["column_id"] == str(t.doing)
    assert set(data["card"]) == {
        "id",
        "column_id",
        "title",
        "description",
        "assignee_id",
        "assignee_name",
        "order",
    }


def test_a_same_column_move_returns_one_list(client, kanban):
    t = seed_cards(kanban)
    data = move(client, kanban, t.x1, t.todo, None, 0).get_json()["data"]
    assert [col["id"] for col in data["columns"]] == [str(t.todo)]


def test_property_4_the_response_matches_e07_after_the_move(client, kanban):
    t = seed_cards(kanban)
    data = move(client, kanban, t.x2, t.doing, t.y1, 0).get_json()["data"]
    detail = {c["id"]: c for c in e07_columns(client, kanban.headers(), kanban.board_id)}
    for col in data["columns"]:
        assert [(c["id"], c["order"]) for c in col["cards"]] == [
            (c["id"], c["order"]) for c in detail[col["id"]]["cards"]
        ]
        keys = [(c["order"], c["id"]) for c in col["cards"]]
        assert keys == sorted(keys)


@pytest.mark.parametrize(("card", "anchor"), [("x2", None), ("x1", "x2")])
def test_a_move_to_the_current_place_is_200_without_a_write(client, kanban, app, card, anchor):
    t = seed_cards(kanban)
    before = card_snapshot(app, kanban.board_id, [t.todo, t.doing])
    response = move(
        client, kanban, getattr(t, card), t.todo, getattr(t, anchor) if anchor else None, 0
    )
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["position_version"] == 0
    assert [c["title"] for c in data["columns"][0]["cards"]] == ["X1", "X2"]
    assert card_snapshot(app, kanban.board_id, [t.todo, t.doing]) == before
    assert events(app, kanban.board_id) == []


def test_a_same_column_reorder_that_changes_place_is_a_move(client, kanban, app):
    t = seed_cards(kanban)
    assert move(client, kanban, t.x2, t.todo, t.x1, 0).status_code == 200
    assert _kinds(app, kanban.board_id) == ["card_moved"]
    assert board_version(app, kanban.board_id) == 1


def test_property_10_card_moved_and_entered_done_follow_the_done_rule(client, kanban, app):
    t = seed_cards(kanban, doing_is_done=True)
    admin = kanban.admin.id
    # Into Done from a non-Done column: card_moved and entered_done.
    assert move(client, kanban, t.x1, t.doing, None, 0).status_code == 200
    assert _kinds(app, kanban.board_id) == ["card_moved", "entered_done"]
    # Within Done: card_moved only.
    assert move(client, kanban, t.x1, t.doing, t.y1, 1).status_code == 200
    assert _kinds(app, kanban.board_id) == ["card_moved", "card_moved", "entered_done"]
    # Out of Done: card_moved only.
    assert move(client, kanban, t.x1, t.todo, None, 2).status_code == 200
    assert _kinds(app, kanban.board_id) == [
        "card_moved",
        "card_moved",
        "card_moved",
        "entered_done",
    ]
    # Back into Done: entered_done again.
    assert move(client, kanban, t.x1, t.doing, None, 3).status_code == 200
    assert _kinds(app, kanban.board_id).count("entered_done") == 2
    assert {actor for _k, actor, _c in events(app, kanban.board_id)} == {admin}
    assert {card for _k, _a, card in events(app, kanban.board_id)} == {t.x1}


def test_non_done_to_non_done_records_no_entered_done(client, kanban, app):
    t = seed_cards(kanban)
    assert move(client, kanban, t.x1, t.doing, None, 0).status_code == 200
    assert _kinds(app, kanban.board_id) == ["card_moved"]


def test_a_stale_version_is_409_and_changes_nothing(client, kanban, app):
    t = seed_cards(kanban)
    before = card_snapshot(app, kanban.board_id, [t.todo, t.doing])
    response = move(client, kanban, t.x1, t.doing, None, 5)
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "POSITION_CONFLICT"
    assert card_snapshot(app, kanban.board_id, [t.todo, t.doing]) == before
    assert events(app, kanban.board_id) == []


def test_the_version_check_wins_over_an_invalid_anchor(client, kanban):
    t = seed_cards(kanban)
    response = move(client, kanban, t.x1, t.doing, t.x1, 5)  # stale and a self anchor
    assert response.status_code == 409


def _foreign(kanban):
    other = make_kanban(kanban.tracker, kanban.app, "Other board")
    column = kanban.tracker.make_column(other.board_id, "Foreign", order=1.0)
    card = kanban.tracker.make_card(column, "Foreign card")
    return column, card


def test_property_5_invalid_destinations_and_anchors_are_400_and_write_nothing(client, kanban, app):
    t = seed_cards(kanban)
    from app.models.board_column import BoardColumn

    gone_column = kanban.tracker.make_column(kanban.board_id, "Gone", order=9000.0)
    soft_delete(app, BoardColumn, gone_column)
    deleted_card = kanban.tracker.make_card(t.doing, "Deleted anchor", order=5000.0)
    soft_delete(app, Card, deleted_card)
    foreign_column, foreign_card = _foreign(kanban)
    before = card_snapshot(app, kanban.board_id, [t.todo, t.doing])
    attempts = [
        (t.doing, t.x1),  # the card itself (it is not in Doing, so also invalid)
        (t.todo, t.x1),  # self anchor in its own column
        (t.doing, deleted_card),  # deleted anchor
        (t.doing, t.x2),  # anchor in another column
        (t.doing, foreign_card),  # anchor on another board
        (foreign_column, None),  # destination on another board
        (gone_column, None),  # soft-deleted destination
        (uuid.uuid4(), None),  # unknown destination
        (t.doing, uuid.uuid4()),  # unknown anchor
    ]
    for column_id, anchor in attempts:
        response = move(client, kanban, t.x1, column_id, anchor, 0)
        assert response.status_code == 400, (column_id, anchor)
        error = response.get_json()["error"]
        assert error["code"] == "VALIDATION_ERROR"
        assert error["message"] == "Choose a valid destination."
        assert "fields" not in error
    assert card_snapshot(app, kanban.board_id, [t.todo, t.doing]) == before
    assert events(app, kanban.board_id) == []
    foreign_rows = card_rows(app, foreign_column)
    assert [r["title"] for r in foreign_rows] == ["Foreign card"]


def test_rebalance_runs_when_neighbors_leave_no_strict_midpoint(client, kanban, app):
    t = seed_cards(kanban)
    tracker = kanban.tracker
    low = 1.0
    tracker.make_card(t.doing, "N1", order=low)
    n2 = tracker.make_card(t.doing, "N2", order=math.nextafter(low, 2.0))
    # Y1 (1024) is now after N1, N2. Move X1 before N2: between N1 and nextafter(N1).
    before_rows = {r["id"]: r for r in card_rows(app, t.doing)}
    response = move(client, kanban, t.x1, t.doing, n2, 0)
    assert response.status_code == 200
    rows = card_rows(app, t.doing)
    assert [r["title"] for r in rows] == ["N1", "X1", "N2", "Y1"]
    assert [r["order"] for r in rows] == [1024.0, 2048.0, 3072.0, 4096.0]
    assert rows[0]["updated_at"] > before_rows[rows[0]["id"]]["updated_at"]
    assert board_version(app, kanban.board_id) == 1
    assert [c["order"] for c in response.get_json()["data"]["columns"][1]["cards"]] == [
        1024.0,
        2048.0,
        3072.0,
        4096.0,
    ]


def test_rebalance_runs_when_two_neighbors_have_equal_order(client, kanban, app):
    t = seed_cards(kanban)
    a = kanban.tracker.make_card(t.doing, "E1", order=5.0)
    b = kanban.tracker.make_card(t.doing, "E2", order=5.0)
    # Y1 is at 1024. Equal orders sort by ID, so use the one with the larger ID as the anchor.
    second = max(a, b)
    response = move(client, kanban, t.x1, t.doing, second, 0)
    assert response.status_code == 200
    rows = card_rows(app, t.doing)
    assert [r["order"] for r in rows] == [1024.0, 2048.0, 3072.0, 4096.0]
    assert rows[2]["id"] == second and rows[1]["id"] == t.x1


def test_a_member_can_move_any_card_and_is_the_event_actor(client, kanban, app):
    t = seed_cards(kanban)
    member = kanban.add_member("member")
    response = move(client, kanban, t.x1, t.doing, None, 0, member)
    assert response.status_code == 200
    assert events(app, kanban.board_id)[0][1] == member.id


def test_a_card_created_through_e17_can_be_moved(client, kanban, app):
    t = seed_cards(kanban)
    created = post_card(client, kanban, t.todo, title="Fresh")
    kanban.tracker.record_card_from_response(created)
    card_id = created.get_json()["data"]["card"]["id"]
    version = created.get_json()["data"]["position_version"]
    assert move(client, kanban, card_id, t.doing, None, version).status_code == 200
    assert card_titles(app, t.doing)[-1] == "Fresh"
