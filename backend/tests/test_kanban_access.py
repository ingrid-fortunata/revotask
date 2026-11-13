"""Access matrix for the column endpoints (task 3.9; extended for cards in task 5.9).

Requirements 1.11, 11.1 and 11.2; Properties 7 (inaccessible resources are indistinguishable) and
the private caching rule. Anonymous callers get 401. A nonmember, a removed member, a caller of a
soft-deleted board and a caller addressing an unknown or foreign ID all get the same 404 envelope.
"""

from __future__ import annotations

import uuid

import pytest

from app.models.board import Board
from tests.kanban_helpers import (
    CardTargets,
    ColumnTargets,
    Kanban,
    card_requests,
    card_snapshot,
    column_requests,
    column_snapshot,
    error_without_request_id,
    make_kanban,
    seed_cards,
    seed_columns,
    soft_delete,
    soft_delete_membership,
)

ENDPOINTS = ["E13", "E14", "E15", "E16"]


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


@pytest.fixture
def cols(kanban) -> ColumnTargets:
    return seed_columns(kanban)


def _assert_private(response):
    assert response.headers["Cache-Control"] == "private, no-store"


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_anonymous_callers_get_401(client, kanban, cols, app, endpoint):
    before = column_snapshot(app, kanban.board_id)
    response = column_requests(kanban, cols)[endpoint](client, {})
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "AUTH_REQUIRED"
    _assert_private(response)
    assert column_snapshot(app, kanban.board_id) == before


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_property_7_inaccessible_resources_give_one_404_envelope(
    client, kanban: Kanban, cols, app, board_tracker, endpoint
):
    request = column_requests(kanban, cols)[endpoint]
    envelopes = {}

    stranger = board_tracker.make_user(name="Stranger")
    envelopes["nonmember"] = request(client, kanban.headers(stranger))

    removed = kanban.add_member("member", name="Removed")
    soft_delete_membership(app, kanban.board_id, removed.id)
    envelopes["removed member"] = request(client, kanban.headers(removed))

    for name, response in envelopes.items():
        assert response.status_code == 404, name
        _assert_private(response)
    shapes = [error_without_request_id(r) for r in envelopes.values()]
    assert shapes[0]["code"] == "NOT_FOUND"
    assert "fields" not in shapes[0]
    assert shapes[0] == shapes[1]


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_a_soft_deleted_board_is_404_for_its_admin(client, kanban, cols, app, endpoint):
    soft_delete(app, Board, kanban.board_id)
    response = column_requests(kanban, cols)[endpoint](client, kanban.headers())
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "NOT_FOUND"
    _assert_private(response)


def test_unknown_foreign_and_deleted_column_ids_give_the_nonmember_404(
    client, kanban, cols, app, board_tracker
):
    stranger = board_tracker.make_user()
    nonmember = client.patch(
        f"/api/columns/{cols.a}", json={"name": "x"}, headers=kanban.headers(stranger)
    )
    other = make_kanban(board_tracker, app, "Other")
    foreign_column = seed_columns(other).a
    unknown = client.patch(
        f"/api/columns/{uuid.uuid4()}", json={"name": "x"}, headers=kanban.headers()
    )
    foreign = client.patch(
        f"/api/columns/{foreign_column}", json={"name": "x"}, headers=kanban.headers()
    )
    from app.models.board_column import BoardColumn

    soft_delete(app, BoardColumn, cols.c)
    deleted = client.patch(f"/api/columns/{cols.c}", json={"name": "x"}, headers=kanban.headers())
    shapes = [error_without_request_id(r) for r in (nonmember, unknown, foreign, deleted)]
    assert {r.status_code for r in (nonmember, unknown, foreign, deleted)} == {404}
    assert shapes[0]["code"] == "NOT_FOUND"
    assert all(shape == shapes[0] for shape in shapes)
    foreign_delete = client.delete(f"/api/columns/{foreign_column}", headers=kanban.headers())
    assert foreign_delete.status_code == 404


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_successful_responses_are_private_no_store(client, kanban, cols, endpoint):
    response = column_requests(kanban, cols)[endpoint](client, kanban.headers())
    assert response.status_code in (200, 201)
    _assert_private(response)


CARD_ENDPOINTS = ["E17", "E18", "E19", "E20"]


@pytest.fixture
def card_t(kanban) -> CardTargets:
    return seed_cards(kanban)


@pytest.mark.parametrize("endpoint", CARD_ENDPOINTS)
def test_anonymous_callers_get_401_on_cards(client, kanban, card_t, app, endpoint):
    before = card_snapshot(app, kanban.board_id, [card_t.todo, card_t.doing])
    response = card_requests(kanban, card_t)[endpoint](client, {})
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "AUTH_REQUIRED"
    _assert_private(response)
    assert card_snapshot(app, kanban.board_id, [card_t.todo, card_t.doing]) == before


@pytest.mark.parametrize("endpoint", CARD_ENDPOINTS)
def test_property_7_inaccessible_card_resources_give_one_404_envelope(
    client, kanban: Kanban, card_t, app, board_tracker, endpoint
):
    request = card_requests(kanban, card_t)[endpoint]
    before = card_snapshot(app, kanban.board_id, [card_t.todo, card_t.doing])
    stranger = board_tracker.make_user(name="Stranger")
    removed = kanban.add_member("member", name="Removed")
    soft_delete_membership(app, kanban.board_id, removed.id)
    responses = [request(client, kanban.headers(user)) for user in (stranger, removed)]
    for response in responses:
        assert response.status_code == 404
        _assert_private(response)
    shapes = [error_without_request_id(r) for r in responses]
    assert shapes[0]["code"] == "NOT_FOUND" and "fields" not in shapes[0]
    assert shapes[0] == shapes[1]
    assert card_snapshot(app, kanban.board_id, [card_t.todo, card_t.doing]) == before


@pytest.mark.parametrize("endpoint", CARD_ENDPOINTS)
def test_a_soft_deleted_board_is_404_for_its_admin_on_cards(client, kanban, card_t, app, endpoint):
    soft_delete(app, Board, kanban.board_id)
    response = card_requests(kanban, card_t)[endpoint](client, kanban.headers())
    assert response.status_code == 404
    _assert_private(response)


def test_unknown_foreign_and_deleted_card_and_column_ids_give_the_same_404(
    client, kanban, card_t, app, board_tracker
):
    from app.models.card import Card

    other = make_kanban(board_tracker, app, "Other")
    foreign = seed_cards(other)
    deleted_card = board_tracker.make_card(card_t.todo, "Gone")
    soft_delete(app, Card, deleted_card)
    stranger = board_tracker.make_user()
    probes = [
        client.patch(
            f"/api/cards/{card_t.x1}", json={"title": "x"}, headers=kanban.headers(stranger)
        ),
        client.patch(f"/api/cards/{uuid.uuid4()}", json={"title": "x"}, headers=kanban.headers()),
        client.patch(f"/api/cards/{foreign.x1}", json={"title": "x"}, headers=kanban.headers()),
        client.patch(f"/api/cards/{deleted_card}", json={"title": "x"}, headers=kanban.headers()),
    ]
    assert {r.status_code for r in probes} == {404}
    shapes = [error_without_request_id(r) for r in probes]
    assert all(shape == shapes[0] for shape in shapes)
    for response in (
        client.delete(f"/api/cards/{foreign.x1}", headers=kanban.headers()),
        client.post(
            f"/api/columns/{foreign.todo}/cards", json={"title": "x"}, headers=kanban.headers()
        ),
        client.post(
            f"/api/columns/{uuid.uuid4()}/cards", json={"title": "x"}, headers=kanban.headers()
        ),
        client.patch(
            f"/api/cards/{foreign.x1}/position",
            json={
                "column_id": str(card_t.todo),
                "before_card_id": None,
                "expected_position_version": 0,
            },
            headers=kanban.headers(),
        ),
    ):
        assert response.status_code == 404


@pytest.mark.parametrize("endpoint", CARD_ENDPOINTS)
def test_successful_card_responses_are_private_no_store(client, kanban, card_t, endpoint):
    response = card_requests(kanban, card_t)[endpoint](client, kanban.headers())
    assert response.status_code in (200, 201)
    _assert_private(response)
