"""Audit events of the column endpoints (task 3.9; cards extend it in task 5.9).

Requirements 2.2, 2.10 and 5.4 to 5.5; Property 10. A real E16 writes one `column_reordered`
event for the actor. E13, E14 and E15 write none. A failed, conflicting, forbidden, missing or
unchanged request writes none and leaves the version alone.
"""

from __future__ import annotations

import uuid

import pytest

from tests.kanban_helpers import (
    board_version,
    card_requests,
    column_requests,
    events,
    make_kanban,
    move,
    reorder,
    seed_cards,
    seed_columns,
    set_done,
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


@pytest.fixture
def cols(kanban):
    return seed_columns(kanban)


def test_property_10_a_real_reorder_writes_exactly_one_event(client, kanban, cols, app):
    assert reorder(client, kanban, cols.c, cols.a, 0).status_code == 200
    assert events(app, kanban.board_id) == [("column_reordered", kanban.admin.id, None)]


@pytest.mark.parametrize("endpoint", ["E13", "E14", "E15"])
def test_property_10_create_edit_and_delete_write_no_event(client, kanban, cols, app, endpoint):
    assert column_requests(kanban, cols)[endpoint](client, kanban.headers()).status_code in (
        200,
        201,
    )
    assert events(app, kanban.board_id) == []


def test_property_10_rejected_and_unchanged_reorders_write_no_event(
    client, kanban, cols, app, board_tracker
):
    member = kanban.add_member("member")
    stranger = board_tracker.make_user()
    attempts = [
        reorder(client, kanban, cols.c, cols.a, 99),  # 409
        reorder(client, kanban, cols.c, cols.c, 0),  # 400 self anchor
        reorder(client, kanban, cols.c, uuid.uuid4(), 0),  # 400 unknown anchor
        reorder(client, kanban, uuid.uuid4(), cols.a, 0),  # 404 unknown moved column
        reorder(client, kanban, cols.c, cols.a, 0, member),  # 403
        reorder(client, kanban, cols.c, cols.a, 0, stranger),  # 404
        reorder(client, kanban, cols.b, cols.c, 0),  # unchanged position, 200
        reorder(client, kanban, cols.c, None, 0),  # unchanged position, 200
    ]
    assert [r.status_code for r in attempts] == [409, 400, 400, 404, 403, 404, 200, 200]
    assert events(app, kanban.board_id) == []
    assert board_version(app, kanban.board_id) == 0


@pytest.fixture
def card_t(kanban):
    return seed_cards(kanban)


def _kinds(app, board_id):
    return sorted(kind for kind, _a, _c in events(app, board_id))


def test_property_10_e17_writes_card_created_and_e18_e19_write_nothing(client, kanban, card_t, app):
    requests = card_requests(kanban, card_t)
    created = requests["E17"](client, kanban.headers())
    kanban.tracker.record_card_from_response(created)
    assert _kinds(app, kanban.board_id) == ["card_created"]
    assert requests["E18"](client, kanban.headers()).status_code == 200
    assert requests["E19"](client, kanban.headers()).status_code == 200
    assert _kinds(app, kanban.board_id) == ["card_created"]


def test_property_10_entered_done_is_written_for_a_create_in_done_and_a_move_into_done(
    client, kanban, card_t, app
):
    set_done(app, card_t.doing)
    created = client.post(
        f"/api/columns/{card_t.doing}/cards", json={"title": "Born done"}, headers=kanban.headers()
    )
    kanban.tracker.record_card_from_response(created)
    assert _kinds(app, kanban.board_id) == ["card_created", "entered_done"]
    assert move(client, kanban, card_t.x1, card_t.doing, None, 1).status_code == 200
    assert _kinds(app, kanban.board_id) == [
        "card_created",
        "card_moved",
        "entered_done",
        "entered_done",
    ]


def test_property_10_rejected_and_unchanged_card_requests_write_no_event(
    client, kanban, card_t, app, board_tracker
):
    stranger = board_tracker.make_user()
    attempts = [
        move(client, kanban, card_t.x1, card_t.doing, None, 9),  # 409
        move(client, kanban, card_t.x1, card_t.doing, uuid.uuid4(), 0),  # 400
        move(client, kanban, uuid.uuid4(), card_t.doing, None, 0),  # 404
        move(client, kanban, card_t.x1, card_t.doing, None, 0, stranger),  # 404
        move(client, kanban, card_t.x2, card_t.todo, None, 0),  # unchanged, 200
        move(client, kanban, card_t.x1, card_t.todo, card_t.x2, 0),  # unchanged, 200
        client.post(
            f"/api/columns/{card_t.todo}/cards", json={"title": ""}, headers=kanban.headers()
        ),
    ]
    assert [r.status_code for r in attempts] == [409, 400, 404, 404, 200, 200, 400]
    assert events(app, kanban.board_id) == []
    assert board_version(app, kanban.board_id) == 0
