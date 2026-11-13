"""E16 (task 3.8; Requirements 2.1-2.10, 5.4).

Property 4 (authoritative order) and Property 6 (a stale version wins over destination errors).
"""

from __future__ import annotations

import math
import uuid

import pytest

from app.models.board_column import BoardColumn
from tests.kanban_helpers import (
    board_version,
    column_rows,
    column_snapshot,
    e07_columns,
    error_without_request_id,
    events,
    make_kanban,
    post_column,
    reorder,
    soft_delete,
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


def _three(client, kanban):
    """Create A, B, C through E13. The board version is 3 afterwards."""
    ids = []
    for name in ("A", "B", "C"):
        response = post_column(client, kanban, name=name)
        kanban.tracker.record_column_from_response(response)
        ids.append(response.get_json()["data"]["column"]["id"])
    return ids


def _names(app, kanban):
    return [r["name"] for r in column_rows(app, kanban.board_id)]


def test_move_the_last_column_to_the_front(client, kanban, app):
    a, b, c = _three(client, kanban)
    response = reorder(client, kanban, c, a, 3)
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["position_version"] == 4
    assert [col["name"] for col in data["columns"]] == ["C", "A", "B"]
    assert _names(app, kanban) == ["C", "A", "B"]
    assert board_version(app, kanban.board_id) == 4


def test_move_a_column_to_the_end_with_a_null_anchor(client, kanban, app):
    a, b, c = _three(client, kanban)
    assert reorder(client, kanban, a, None, 3).status_code == 200
    assert _names(app, kanban) == ["B", "C", "A"]


def test_move_a_column_up_into_the_middle(client, kanban, app):
    a, b, c = _three(client, kanban)
    assert reorder(client, kanban, c, b, 3).status_code == 200
    assert _names(app, kanban) == ["A", "C", "B"]


def test_property_4_the_response_lists_match_e07_after_the_move(client, kanban, app):
    a, b, c = _three(client, kanban)
    data = reorder(client, kanban, c, a, 3).get_json()["data"]
    detail = e07_columns(client, kanban.headers(), kanban.board_id)
    assert [(col["id"], col["order"]) for col in data["columns"]] == [
        (col["id"], col["order"]) for col in detail
    ]
    assert all(
        set(col) == {"id", "board_id", "name", "is_done", "order"} for col in data["columns"]
    )
    orders = [(col["order"], col["id"]) for col in data["columns"]]
    assert orders == sorted(orders)


def test_a_real_move_records_one_column_reordered_event_for_the_actor(client, kanban, app):
    a, b, c = _three(client, kanban)
    reorder(client, kanban, c, a, 3)
    assert events(app, kanban.board_id) == [("column_reordered", kanban.admin.id, None)]


@pytest.mark.parametrize(("which", "anchor"), [("B", "C"), ("C", None), ("A", "B")])
def test_a_move_to_the_current_place_is_200_without_a_write(client, kanban, app, which, anchor):
    ids = dict(zip("ABC", _three(client, kanban), strict=True))
    before = column_snapshot(app, kanban.board_id)
    response = reorder(client, kanban, ids[which], ids.get(anchor), 3)
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["position_version"] == 3
    assert [col["name"] for col in data["columns"]] == ["A", "B", "C"]
    assert column_snapshot(app, kanban.board_id) == before
    assert events(app, kanban.board_id) == []


def test_a_stale_version_is_409_and_changes_nothing(client, kanban, app):
    a, b, c = _three(client, kanban)
    before = column_snapshot(app, kanban.board_id)
    response = reorder(client, kanban, c, a, 2)
    assert response.status_code == 409
    error = response.get_json()["error"]
    assert error["code"] == "POSITION_CONFLICT"
    assert error["message"] == "The board changed. Refresh and try again."
    assert column_snapshot(app, kanban.board_id) == before


def test_property_6_a_stale_version_with_a_deleted_anchor_is_409_not_400(client, kanban, app):
    a, b, c = _three(client, kanban)
    soft_delete(app, BoardColumn, uuid.UUID(b))
    response = reorder(client, kanban, c, b, 0)
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "POSITION_CONFLICT"


def _other_board_column(client, kanban):
    other = make_kanban(kanban.tracker, kanban.app, "Other board")
    response = post_column(client, other, name="Foreign")
    kanban.tracker.record_column_from_response(response)
    return response.get_json()["data"]["column"]["id"]


def test_invalid_anchors_are_400_with_the_generic_message_and_write_nothing(client, kanban, app):
    a, b, c = _three(client, kanban)
    deleted = post_column(client, kanban, name="Gone")
    kanban.tracker.record_column_from_response(deleted)
    gone = deleted.get_json()["data"]["column"]["id"]
    soft_delete(app, BoardColumn, uuid.UUID(gone))
    foreign = _other_board_column(client, kanban)
    version = board_version(app, kanban.board_id)
    before = column_snapshot(app, kanban.board_id)
    for anchor in (c, gone, foreign, str(uuid.uuid4())):  # itself, deleted, other board, unknown
        response = reorder(client, kanban, c, anchor, version)
        assert response.status_code == 400, anchor
        error = response.get_json()["error"]
        assert error["code"] == "VALIDATION_ERROR"
        assert error["message"] == "Choose a valid destination."
        assert "fields" not in error
    assert column_snapshot(app, kanban.board_id) == before


def test_a_moved_column_that_is_missing_deleted_or_on_another_board_is_the_same_404(
    client, kanban, app
):
    a, b, c = _three(client, kanban)
    deleted = post_column(client, kanban, name="Gone")
    kanban.tracker.record_column_from_response(deleted)
    gone = deleted.get_json()["data"]["column"]["id"]
    soft_delete(app, BoardColumn, uuid.UUID(gone))
    foreign = _other_board_column(client, kanban)
    version = board_version(app, kanban.board_id)
    before = column_snapshot(app, kanban.board_id)
    envelopes = []
    for moved in (str(uuid.uuid4()), gone, foreign):
        response = reorder(client, kanban, moved, a, version)
        assert response.status_code == 404, moved
        envelopes.append(error_without_request_id(response))
    assert envelopes[0]["code"] == "NOT_FOUND"
    assert envelopes[0] == envelopes[1] == envelopes[2]
    assert column_snapshot(app, kanban.board_id) == before


def test_a_malformed_moved_column_id_is_400(client, kanban):
    response = client.patch(
        f"/api/boards/{kanban.board_id}/columns/reorder",
        json={"column_id": "nope", "before_column_id": None, "expected_position_version": 0},
        headers=kanban.headers(),
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"] == {"column_id": "Must be a valid ID."}


def test_a_missing_anchor_key_is_400(client, kanban):
    a, b, c = _three(client, kanban)
    response = client.patch(
        f"/api/boards/{kanban.board_id}/columns/reorder",
        json={"column_id": c, "expected_position_version": 3},
        headers=kanban.headers(),
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"] == {"before_column_id": "Required."}


def test_rebalance_runs_when_neighbors_leave_no_strict_midpoint(client, kanban, app):
    tracker = kanban.tracker
    low = 1.0
    x = tracker.make_column(kanban.board_id, "X", order=low)
    y = tracker.make_column(kanban.board_id, "Y", order=math.nextafter(low, 2.0))
    z = tracker.make_column(kanban.board_id, "Z", order=2.0)
    before_rows = {r["id"]: r for r in column_rows(app, kanban.board_id)}
    response = reorder(client, kanban, z, y, 0)
    assert response.status_code == 200
    rows = column_rows(app, kanban.board_id)
    assert [r["name"] for r in rows] == ["X", "Z", "Y"]
    assert [r["order"] for r in rows] == [1024.0, 2048.0, 3072.0]
    assert [col["order"] for col in response.get_json()["data"]["columns"]] == [
        1024.0,
        2048.0,
        3072.0,
    ]
    # One bump for the whole rebalance, and the rebalanced siblings' updated_at moved.
    assert board_version(app, kanban.board_id) == 1
    assert rows[0]["updated_at"] > before_rows[x]["updated_at"]
    assert rows[2]["updated_at"] > before_rows[y]["updated_at"]


def test_rebalance_runs_when_two_neighbors_have_equal_order(client, kanban, app):
    tracker = kanban.tracker
    x = tracker.make_column(kanban.board_id, "X", order=5.0)
    y = tracker.make_column(kanban.board_id, "Y", order=5.0)
    z = tracker.make_column(kanban.board_id, "Z", order=10.0)
    # Equal orders sort by ID, so the anchor with the larger ID sits second: Z lands between
    # two equal values, which has no strict midpoint.
    second = max(x, y)
    response = reorder(client, kanban, z, second, 0)
    assert response.status_code == 200
    rows = column_rows(app, kanban.board_id)
    assert [r["order"] for r in rows] == [1024.0, 2048.0, 3072.0]
    assert rows[1]["id"] == z
    assert rows[2]["id"] == second
