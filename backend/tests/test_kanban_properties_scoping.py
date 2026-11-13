"""Feature: kanban, Properties 7 and 8 over every write endpoint (task 5.11).

One matrix: for E13 to E20 and each kind of caller, the status is the agreed one and nothing
changes when it is not a success. Nonmembers and removed members get 404, a Member gets 403 on
the admin-only column endpoints and succeeds on the card endpoints, and an Admin succeeds.
"""

from __future__ import annotations

import pytest

from tests.kanban_helpers import (
    card_requests,
    card_snapshot,
    column_requests,
    make_kanban,
    seed_cards,
    seed_columns,
    soft_delete_membership,
)

ADMIN_ONLY = ["E13", "E14", "E15", "E16"]
PARTICIPANT = ["E17", "E18", "E19", "E20"]


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def _setup(board_tracker, app):
    kanban = make_kanban(board_tracker, app)
    cols = seed_columns(kanban)
    cards = seed_cards(kanban)
    requests = {**column_requests(kanban, cols), **card_requests(kanban, cards)}
    return kanban, cards, requests


@pytest.mark.parametrize("endpoint", ADMIN_ONLY + PARTICIPANT)
@pytest.mark.parametrize("caller", ["nonmember", "removed member"])
def test_property_7_nonmembers_and_removed_members_get_404_and_change_nothing(
    client, board_tracker, app, endpoint, caller
):
    kanban, cards, requests = _setup(board_tracker, app)
    user = board_tracker.make_user(name=caller)
    if caller == "removed member":
        board_tracker.make_membership(kanban.board_id, user.id, "member")
        soft_delete_membership(app, kanban.board_id, user.id)
    before = card_snapshot(app, kanban.board_id, [cards.todo, cards.doing])
    response = requests[endpoint](client, kanban.headers(user))
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "NOT_FOUND"
    assert card_snapshot(app, kanban.board_id, [cards.todo, cards.doing]) == before


@pytest.mark.parametrize("endpoint", ADMIN_ONLY)
def test_property_8_a_member_gets_403_on_column_endpoints(client, board_tracker, app, endpoint):
    kanban, cards, requests = _setup(board_tracker, app)
    member = kanban.add_member("member")
    before = card_snapshot(app, kanban.board_id, [cards.todo, cards.doing])
    response = requests[endpoint](client, kanban.headers(member))
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "FORBIDDEN"
    assert card_snapshot(app, kanban.board_id, [cards.todo, cards.doing]) == before


@pytest.mark.parametrize("endpoint", ADMIN_ONLY + PARTICIPANT)
def test_property_8_an_admin_succeeds_on_every_endpoint(client, board_tracker, app, endpoint):
    kanban, _cards, requests = _setup(board_tracker, app)
    assert requests[endpoint](client, kanban.headers()).status_code in (200, 201)


@pytest.mark.parametrize("endpoint", PARTICIPANT)
def test_property_8_a_member_succeeds_on_card_endpoints(client, board_tracker, app, endpoint):
    kanban, _cards, requests = _setup(board_tracker, app)
    member = kanban.add_member("member")
    assert requests[endpoint](client, kanban.headers(member)).status_code in (200, 201)
