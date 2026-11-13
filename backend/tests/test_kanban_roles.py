"""Role gate for the column endpoints (task 3.9; cards extend it in task 5.9).

Requirement 1.10 and Property 8: a Member gets 403 `FORBIDDEN` on E13 to E16 and nothing changes.
An Admin succeeds on the same requests.
"""

from __future__ import annotations

import pytest

from tests.kanban_helpers import (
    card_requests,
    card_snapshot,
    column_requests,
    column_snapshot,
    make_kanban,
    seed_cards,
    seed_columns,
)

ENDPOINTS = ["E13", "E14", "E15", "E16"]


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_property_8_a_member_gets_403_and_state_is_unchanged(client, board_tracker, app, endpoint):
    kanban = make_kanban(board_tracker, app)
    cols = seed_columns(kanban)
    member = kanban.add_member("member")
    before = column_snapshot(app, kanban.board_id)
    response = column_requests(kanban, cols)[endpoint](client, kanban.headers(member))
    assert response.status_code == 403
    error = response.get_json()["error"]
    assert error["code"] == "FORBIDDEN"
    assert "fields" not in error
    assert column_snapshot(app, kanban.board_id) == before


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_property_8_an_admin_succeeds_on_the_same_request(client, board_tracker, app, endpoint):
    kanban = make_kanban(board_tracker, app)
    cols = seed_columns(kanban)
    response = column_requests(kanban, cols)[endpoint](client, kanban.headers())
    assert response.status_code in (200, 201)
    assert column_snapshot(app, kanban.board_id) != ([], 0, 0)


@pytest.mark.parametrize("endpoint", ["E17", "E18", "E19", "E20"])
def test_property_8_a_member_may_use_every_card_endpoint(client, board_tracker, app, endpoint):
    kanban = make_kanban(board_tracker, app)
    t = seed_cards(kanban)
    member = kanban.add_member("member")
    before = card_snapshot(app, kanban.board_id, [t.todo, t.doing])
    response = card_requests(kanban, t)[endpoint](client, kanban.headers(member))
    assert response.status_code in (200, 201)
    assert card_snapshot(app, kanban.board_id, [t.todo, t.doing]) != before


@pytest.mark.parametrize("endpoint", ["E17", "E18", "E19", "E20"])
def test_property_8_an_admin_may_use_every_card_endpoint(client, board_tracker, app, endpoint):
    kanban = make_kanban(board_tracker, app)
    t = seed_cards(kanban)
    assert card_requests(kanban, t)[endpoint](client, kanban.headers()).status_code in (200, 201)
