"""Order of checks on E23-E26 (task 2.6; Requirement 5.1).

401 first, then 400 (path ID and body shape, no database), then 404 (board access), then 403
(author). A nonmember with a bad body is 400, with a good body 404. A non-author participant
with a bad body is 400, with a good body 403.
"""

from __future__ import annotations

import pytest

from tests.comments_helpers import (
    comment_requests,
    invalid_comment_requests,
    seed_comment_world,
)
from tests.kanban_helpers import make_kanban

BODY_ENDPOINTS = ["E24", "E25"]


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    return seed_comment_world(make_kanban(board_tracker, app))


@pytest.mark.parametrize("endpoint", BODY_ENDPOINTS)
def test_anonymous_with_an_invalid_body_is_401_not_400(client, world, endpoint):
    assert invalid_comment_requests(world)[endpoint](client, {}).status_code == 401


@pytest.mark.parametrize("endpoint", BODY_ENDPOINTS)
def test_an_invalid_body_is_400_for_every_authenticated_caller(
    client, world, board_tracker, endpoint
):
    stranger = board_tracker.make_user(name="Stranger")
    other = world.kanban.add_member("member", name="Omar")
    for user in (stranger, other, world.member, world.kanban.admin):
        response = invalid_comment_requests(world)[endpoint](client, world.kanban.headers(user))
        assert response.status_code == 400, user.id
        assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize("endpoint", ["E23", "E24", "E25", "E26"])
def test_a_valid_request_from_a_nonmember_is_404(client, world, board_tracker, endpoint):
    stranger = board_tracker.make_user(name="Stranger")
    response = comment_requests(world)[endpoint](client, world.kanban.headers(stranger))
    assert response.status_code == 404


@pytest.mark.parametrize("endpoint", ["E25", "E26"])
def test_a_valid_request_from_a_non_author_participant_is_403(client, world, endpoint):
    other = world.kanban.add_member("member", name="Omar")
    for user in (other, world.kanban.admin):
        response = comment_requests(world)[endpoint](client, world.kanban.headers(user))
        assert response.status_code == 403
        assert response.get_json()["error"]["code"] == "FORBIDDEN"


def test_404_comes_before_403_for_a_comment_on_another_board(client, world, board_tracker, app):
    # The caller is a participant of board A but not of the comment's board B: 404, not 403.
    other = make_kanban(board_tracker, app, name="Board B")
    other_world = seed_comment_world(other)
    response = client.patch(
        f"/api/comments/{other_world.comment}",
        json={"content": "x"},
        headers=world.kanban.headers(world.kanban.admin),
    )
    assert response.status_code == 404
