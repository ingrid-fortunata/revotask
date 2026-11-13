"""Access matrix for E23-E26 (task 2.5; Requirements 1.4, 2.4, 3.5, 4.4, 5.2, 5.3, 5.6).

Property 4: a missing, soft-deleted, other-board and nonmember case all give one 404 envelope.
"""

from __future__ import annotations

import uuid

import pytest

from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.card import Card
from app.models.card_comment import CardComment
from tests.comments_helpers import comment_requests, seed_comment_world
from tests.kanban_helpers import (
    error_without_request_id,
    make_kanban,
    soft_delete,
    soft_delete_membership,
)

ENDPOINTS = ["E23", "E24", "E25", "E26"]


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    return seed_comment_world(make_kanban(board_tracker, app))


def _assert_private(response):
    assert response.headers["Cache-Control"] == "private, no-store"


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_anonymous_callers_get_401(client, world, endpoint):
    response = comment_requests(world)[endpoint](client, {})
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "AUTH_REQUIRED"
    _assert_private(response)


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_property_4_nonmember_removed_member_and_missing_ids_give_one_404(
    client, world, board_tracker, app, endpoint
):
    kanban = world.kanban
    stranger = board_tracker.make_user(name="Stranger")
    removed = kanban.add_member("member", name="Removed")
    soft_delete_membership(app, kanban.board_id, removed.id)
    request = comment_requests(world)[endpoint]

    envelopes = []
    for user in (stranger, removed):
        response = request(client, kanban.headers(user))
        assert response.status_code == 404, user.id
        _assert_private(response)
        envelopes.append(error_without_request_id(response))

    # An unknown ID gives the same envelope.
    unknown = uuid.uuid4()
    missing = {
        "E23": lambda: client.get(f"/api/cards/{unknown}/comments", headers=kanban.headers()),
        "E24": lambda: client.post(
            f"/api/cards/{unknown}/comments", json={"content": "x"}, headers=kanban.headers()
        ),
        "E25": lambda: client.patch(
            f"/api/comments/{unknown}", json={"content": "x"}, headers=kanban.headers(world.member)
        ),
        "E26": lambda: client.delete(
            f"/api/comments/{unknown}", headers=kanban.headers(world.member)
        ),
    }[endpoint]()
    assert missing.status_code == 404
    envelopes.append(error_without_request_id(missing))
    assert all(envelope == envelopes[0] for envelope in envelopes)
    assert envelopes[0]["code"] == "NOT_FOUND"


@pytest.mark.parametrize("endpoint", ["E25", "E26"])
def test_a_removed_author_gets_404_on_edit_and_delete(client, world, app, endpoint):
    soft_delete_membership(app, world.kanban.board_id, world.member.id)
    response = comment_requests(world)[endpoint](client, world.kanban.headers(world.member))
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "NOT_FOUND"


def test_ids_from_another_board_behave_as_missing(client, world, board_tracker, app):
    other = make_kanban(board_tracker, app, name="Other board")
    other_world = seed_comment_world(other)
    # The caller belongs to the first board only, and addresses the second board's IDs.
    caller = world.kanban.headers()
    reads = [
        client.get(f"/api/cards/{other_world.card}/comments", headers=caller),
        client.post(
            f"/api/cards/{other_world.card}/comments", json={"content": "x"}, headers=caller
        ),
        client.patch(f"/api/comments/{other_world.comment}", json={"content": "x"}, headers=caller),
        client.delete(f"/api/comments/{other_world.comment}", headers=caller),
    ]
    assert [r.status_code for r in reads] == [404, 404, 404, 404]
    assert len({str(error_without_request_id(r)) for r in reads}) == 1


@pytest.mark.parametrize(
    ("endpoint", "what"),
    [
        (endpoint, what)
        for endpoint in ENDPOINTS
        for what in ("card", "column", "board", "comment")
        # A deleted comment does not affect the card routes E23 and E24.
        if not (what == "comment" and endpoint in ("E23", "E24"))
    ],
)
def test_soft_deleted_parents_and_comments_are_404_for_the_admin_or_author(
    client, world, app, endpoint, what
):
    target = {
        "card": (Card, world.card),
        "column": (BoardColumn, world.column),
        "board": (Board, world.kanban.board_id),
        "comment": (CardComment, world.comment),
    }[what]
    soft_delete(app, *target)
    user = world.member if endpoint in ("E25", "E26") else world.kanban.admin
    response = comment_requests(world)[endpoint](client, world.kanban.headers(user))
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "NOT_FOUND"
    _assert_private(response)


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_successful_responses_are_private_no_store(client, world, endpoint):
    user = world.member if endpoint in ("E25", "E26") else world.kanban.admin
    response = comment_requests(world)[endpoint](client, world.kanban.headers(user))
    assert response.status_code in (200, 201)
    _assert_private(response)


def test_error_responses_other_than_404_are_private_no_store_too(client, world):
    forbidden = comment_requests(world)["E25"](client, world.kanban.headers())  # admin, not author
    assert forbidden.status_code == 403
    _assert_private(forbidden)
    invalid = client.post(
        f"/api/cards/{world.card}/comments", json={}, headers=world.kanban.headers()
    )
    assert invalid.status_code == 400
    _assert_private(invalid)


def test_a_bad_path_id_is_400_before_any_lookup(client, world):
    headers = world.kanban.headers()
    for response in (
        client.get("/api/cards/not-a-uuid/comments", headers=headers),
        client.post("/api/cards/not-a-uuid/comments", json={"content": "x"}, headers=headers),
        client.patch("/api/comments/not-a-uuid", json={"content": "x"}, headers=headers),
        client.delete("/api/comments/not-a-uuid", headers=headers),
    ):
        assert response.status_code == 400
        assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"
