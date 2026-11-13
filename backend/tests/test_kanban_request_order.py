"""Order of checks on the column endpoints (task 3.9; extended for cards in task 5.9).

Requirement 1.12 and the K3 order: authenticate (401), path IDs and body shape (400), board access
(404 nonmember, 403 member), then the version (409), then destination and anchor (400).
"""

from __future__ import annotations

import uuid

import pytest

from tests.kanban_helpers import (
    CardTargets,
    ColumnTargets,
    card_requests,
    column_requests,
    invalid_card_requests,
    invalid_column_requests,
    make_kanban,
    move,
    reorder,
    seed_cards,
    seed_columns,
)

BODY_ENDPOINTS = ["E13", "E14", "E16"]


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


@pytest.fixture
def cols(kanban) -> ColumnTargets:
    return seed_columns(kanban)


@pytest.mark.parametrize("endpoint", BODY_ENDPOINTS)
def test_anonymous_with_an_invalid_body_is_401_not_400(client, kanban, cols, endpoint):
    response = invalid_column_requests(kanban, cols)[endpoint](client, {})
    assert response.status_code == 401


@pytest.mark.parametrize("endpoint", BODY_ENDPOINTS)
def test_an_invalid_body_is_400_for_every_authenticated_caller(
    client, kanban, cols, board_tracker, endpoint
):
    stranger = board_tracker.make_user()
    member = kanban.add_member("member")
    for user in (stranger, member, kanban.admin):
        response = invalid_column_requests(kanban, cols)[endpoint](client, kanban.headers(user))
        assert response.status_code == 400, user.id
        assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize("endpoint", BODY_ENDPOINTS + ["E15"])
def test_a_valid_body_gets_404_for_a_nonmember_and_403_for_a_member(
    client, kanban, cols, board_tracker, endpoint
):
    stranger = board_tracker.make_user()
    member = kanban.add_member("member")
    request = column_requests(kanban, cols)[endpoint]
    assert request(client, kanban.headers(stranger)).status_code == 404
    assert request(client, kanban.headers(member)).status_code == 403


@pytest.mark.parametrize("path", ["/api/columns/not-a-uuid", "/api/boards/not-a-uuid/columns"])
def test_a_malformed_path_id_is_400_before_any_access_check(client, kanban, board_tracker, path):
    stranger = board_tracker.make_user()
    response = client.patch(path, json={"name": "x"}, headers=kanban.headers(stranger))
    if path.endswith("/columns"):
        response = client.post(path, json={"name": "x"}, headers=kanban.headers(stranger))
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"
    delete = client.delete("/api/columns/not-a-uuid", headers=kanban.headers(stranger))
    assert delete.status_code == 400


def test_access_is_checked_before_the_version_on_e16(client, kanban, cols, board_tracker):
    stranger = board_tracker.make_user()
    member = kanban.add_member("member")
    assert reorder(client, kanban, cols.c, cols.a, 99, stranger).status_code == 404
    assert reorder(client, kanban, cols.c, cols.a, 99, member).status_code == 403


def test_the_version_is_checked_before_the_anchor_on_e16(client, kanban, cols):
    # Stale version and a self anchor: the stale version wins.
    stale = reorder(client, kanban, cols.c, cols.c, 99)
    assert stale.status_code == 409
    assert stale.get_json()["error"]["code"] == "POSITION_CONFLICT"
    # Current version and the same self anchor: now the anchor is rejected.
    bad_anchor = reorder(client, kanban, cols.c, cols.c, 0)
    assert bad_anchor.status_code == 400
    assert bad_anchor.get_json()["error"]["message"] == "Choose a valid destination."


@pytest.fixture
def card_t(kanban) -> CardTargets:
    return seed_cards(kanban)


@pytest.mark.parametrize("endpoint", ["E17", "E18", "E20"])
def test_cards_anonymous_with_an_invalid_body_is_401(client, kanban, card_t, endpoint):
    assert invalid_card_requests(kanban, card_t)[endpoint](client, {}).status_code == 401


@pytest.mark.parametrize("endpoint", ["E17", "E18", "E20"])
def test_cards_an_invalid_body_is_400_for_every_authenticated_caller(
    client, kanban, card_t, board_tracker, endpoint
):
    stranger = board_tracker.make_user()
    member = kanban.add_member("member")
    for user in (stranger, member, kanban.admin):
        response = invalid_card_requests(kanban, card_t)[endpoint](client, kanban.headers(user))
        assert response.status_code == 400, user.id


@pytest.mark.parametrize("endpoint", ["E17", "E18", "E19", "E20"])
def test_cards_a_valid_body_gets_404_for_a_nonmember(
    client, kanban, card_t, board_tracker, endpoint
):
    stranger = board_tracker.make_user()
    assert (
        card_requests(kanban, card_t)[endpoint](client, kanban.headers(stranger)).status_code == 404
    )


def test_cards_a_malformed_path_id_is_400_before_any_access_check(client, kanban, board_tracker):
    stranger = board_tracker.make_user()
    headers = kanban.headers(stranger)
    assert (
        client.post("/api/columns/nope/cards", json={"title": "x"}, headers=headers).status_code
        == 400
    )
    assert client.patch("/api/cards/nope", json={"title": "x"}, headers=headers).status_code == 400
    assert client.delete("/api/cards/nope", headers=headers).status_code == 400
    assert client.patch("/api/cards/nope/position", json={}, headers=headers).status_code == 400


def test_cards_access_is_checked_before_the_version_on_e20(client, kanban, card_t, board_tracker):
    stranger = board_tracker.make_user()
    assert move(client, kanban, card_t.x1, card_t.doing, None, 99, stranger).status_code == 404


def test_cards_the_version_wins_over_every_destination_error(client, kanban, card_t):
    stale = [
        move(client, kanban, card_t.x1, card_t.doing, card_t.x1, 99),  # self anchor
        move(client, kanban, card_t.x1, card_t.doing, uuid.uuid4(), 99),  # unknown anchor
        move(client, kanban, card_t.x1, uuid.uuid4(), None, 99),  # unknown destination
    ]
    assert [r.status_code for r in stale] == [409, 409, 409]
    assert all(r.get_json()["error"]["code"] == "POSITION_CONFLICT" for r in stale)
    fresh = move(client, kanban, card_t.x1, card_t.doing, card_t.x1, 0)
    assert fresh.status_code == 400
    assert fresh.get_json()["error"]["message"] == "Choose a valid destination."
