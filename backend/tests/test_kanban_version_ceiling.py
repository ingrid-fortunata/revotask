"""The position version ceiling (task 3.9; cards extend it in task 5.9).

Requirement 5.7, DD12 and Property 18. At 2147483647 a request that would change the version
returns 409 `STATE_CONFLICT` and writes nothing. Requests that do not change it, and reads, still
work.
"""

from __future__ import annotations

import pytest

from tests.kanban_helpers import (
    MAX_VERSION,
    board_version,
    card_requests,
    card_snapshot,
    column_requests,
    column_snapshot,
    e07_columns,
    events,
    make_kanban,
    move,
    post_card,
    post_column,
    reorder,
    seed_cards,
    seed_columns,
    set_version,
)

LIMIT_MESSAGE = "This board has reached its change limit."


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    k = make_kanban(board_tracker, app)
    return k


@pytest.fixture
def cols(kanban, app):
    seeded = seed_columns(kanban)
    set_version(app, kanban.board_id, MAX_VERSION)
    return seeded


def _reorder_at_max(client, kanban, cols, moved, before):
    return reorder(client, kanban, moved, before, MAX_VERSION)


def test_property_18_version_changing_requests_are_409_and_write_nothing(client, kanban, cols, app):
    before = column_snapshot(app, kanban.board_id)
    requests = {
        "E13": post_column(client, kanban, name="New"),
        "E15": column_requests(kanban, cols)["E15"](client, kanban.headers()),
        "E16": _reorder_at_max(client, kanban, cols, cols.c, cols.a),
    }
    for name, response in requests.items():
        assert response.status_code == 409, name
        error = response.get_json()["error"]
        assert error["code"] == "STATE_CONFLICT", name
        assert error["message"] == LIMIT_MESSAGE
    assert column_snapshot(app, kanban.board_id) == before
    assert board_version(app, kanban.board_id) == MAX_VERSION
    assert events(app, kanban.board_id) == []


def test_requests_that_do_not_change_the_version_still_work_at_the_ceiling(
    client, kanban, cols, app
):
    renamed = column_requests(kanban, cols)["E14"](client, kanban.headers())
    assert renamed.status_code == 200
    unchanged = _reorder_at_max(client, kanban, cols, cols.c, None)
    assert unchanged.status_code == 200
    assert unchanged.get_json()["data"]["position_version"] == MAX_VERSION
    assert len(e07_columns(client, kanban.headers(), kanban.board_id)) == 3
    assert board_version(app, kanban.board_id) == MAX_VERSION


def test_a_stale_version_at_the_ceiling_is_still_a_position_conflict(client, kanban, cols):
    response = reorder(client, kanban, cols.c, cols.a, MAX_VERSION - 1)
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "POSITION_CONFLICT"


def test_the_version_ceiling_is_accepted_and_one_above_it_is_400(client, kanban, cols):
    assert reorder(client, kanban, cols.c, None, MAX_VERSION).status_code == 200
    over = reorder(client, kanban, cols.c, None, MAX_VERSION + 1)
    assert over.status_code == 400
    assert over.get_json()["error"]["code"] == "VALIDATION_ERROR"
    boolean = client.patch(
        f"/api/boards/{kanban.board_id}/columns/reorder",
        json={
            "column_id": str(cols.c),
            "before_column_id": None,
            "expected_position_version": True,
        },
        headers=kanban.headers(),
    )
    assert boolean.status_code == 400


def test_one_below_the_ceiling_the_next_change_succeeds(client, kanban, cols, app):
    set_version(app, kanban.board_id, MAX_VERSION - 1)
    response = post_column(client, kanban, name="Last one")
    assert response.status_code == 201
    kanban.tracker.record_column_from_response(response)
    assert response.get_json()["data"]["position_version"] == MAX_VERSION


@pytest.fixture
def card_t(kanban, app):
    seeded = seed_cards(kanban)
    set_version(app, kanban.board_id, MAX_VERSION)
    return seeded


def test_property_18_card_requests_that_change_the_version_are_409_and_write_nothing(
    client, kanban, card_t, app
):
    before = card_snapshot(app, kanban.board_id, [card_t.todo, card_t.doing])
    requests = {
        "E17": post_card(client, kanban, card_t.todo, title="New"),
        "E19": card_requests(kanban, card_t)["E19"](client, kanban.headers()),
        "E20": move(client, kanban, card_t.x1, card_t.doing, None, MAX_VERSION),
    }
    for name, response in requests.items():
        assert response.status_code == 409, name
        error = response.get_json()["error"]
        assert (error["code"], error["message"]) == ("STATE_CONFLICT", LIMIT_MESSAGE), name
    assert card_snapshot(app, kanban.board_id, [card_t.todo, card_t.doing]) == before
    assert board_version(app, kanban.board_id) == MAX_VERSION
    assert events(app, kanban.board_id) == []


def test_card_requests_that_do_not_change_the_version_still_work_at_the_ceiling(
    client, kanban, card_t, app
):
    assert card_requests(kanban, card_t)["E18"](client, kanban.headers()).status_code == 200
    unchanged = move(client, kanban, card_t.x2, card_t.todo, None, MAX_VERSION)
    assert unchanged.status_code == 200
    assert unchanged.get_json()["data"]["position_version"] == MAX_VERSION
    assert board_version(app, kanban.board_id) == MAX_VERSION


def test_a_card_move_with_the_version_above_the_ceiling_is_400(client, kanban, card_t):
    response = move(client, kanban, card_t.x1, card_t.doing, None, MAX_VERSION + 1)
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"
