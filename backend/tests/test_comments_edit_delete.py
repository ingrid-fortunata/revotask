"""E25 edit and E26 delete a comment (task 2.4; Requirements 3.1-3.6, 4.1-4.5).

Properties 3 (author-only), 6 (events) and 7 (timestamps).
"""

from __future__ import annotations

import pytest

from tests.comments_helpers import (
    comment_kinds,
    comment_row,
    comment_snapshot,
    seed_comment_world,
)
from tests.kanban_helpers import board_version, make_kanban


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    return seed_comment_world(make_kanban(board_tracker, app))


def _patch(client, world, content, user=None, comment=None):
    return client.patch(
        f"/api/comments/{comment or world.comment}",
        json={"content": content},
        headers=world.kanban.headers(user or world.member),
    )


def _delete(client, world, user=None, comment=None):
    return client.delete(
        f"/api/comments/{comment or world.comment}",
        headers=world.kanban.headers(user or world.member),
    )


def test_a_changed_edit_updates_the_text_and_moves_updated_at_forward(client, world, app):
    before = comment_row(app, world.comment)
    response = _patch(client, world, "  Edited text  ")
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["content"] == "Edited text"
    after = comment_row(app, world.comment)
    assert after["updated_at"] > before["updated_at"]
    assert (after["created_at"], after["author_id"], after["card_id"]) == (
        before["created_at"],
        before["author_id"],
        before["card_id"],
    )
    assert data["created_at"] != data["updated_at"]


def test_property_7_the_same_content_after_trimming_changes_nothing(client, world, app):
    """N1: 200, nothing written, updated_at unchanged."""
    before = comment_row(app, world.comment)
    snapshot = comment_snapshot(app, world.kanban.board_id, world.card)
    response = _patch(client, world, "   First comment \n")
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["content"] == "First comment"
    assert data["created_at"] == data["updated_at"]
    assert comment_row(app, world.comment)["updated_at"] == before["updated_at"]
    assert comment_snapshot(app, world.kanban.board_id, world.card) == snapshot


def test_property_6_an_edit_and_a_delete_record_no_event(client, world, app):
    _patch(client, world, "Edited")
    _delete(client, world)
    assert comment_kinds(app, world.kanban.board_id) == []


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"content": ""},
        {"content": "  "},
        {"content": "x" * 2001},
        {"content": 3},
        {"content": "ok", "card_id": "x"},
    ],
)
def test_invalid_bodies_are_400_and_change_nothing(client, world, app, body):
    snapshot = comment_snapshot(app, world.kanban.board_id, world.card)
    response = client.patch(
        f"/api/comments/{world.comment}", json=body, headers=world.kanban.headers(world.member)
    )
    assert response.status_code == 400
    assert comment_snapshot(app, world.kanban.board_id, world.card) == snapshot


@pytest.mark.parametrize("who", ["admin", "member_other"])
def test_property_3_a_participant_who_is_not_the_author_gets_403(client, world, app, who):
    """M4: an admin included."""
    other = world.kanban.admin if who == "admin" else world.kanban.add_member("member", name="Omar")
    snapshot = comment_snapshot(app, world.kanban.board_id, world.card)
    edit = _patch(client, world, "Hijack", user=other)
    delete = _delete(client, world, user=other)
    for response in (edit, delete):
        assert response.status_code == 403
        assert response.get_json()["error"]["code"] == "FORBIDDEN"
    assert comment_snapshot(app, world.kanban.board_id, world.card) == snapshot


def test_the_author_may_be_an_admin(client, world, app):
    from tests.comments_helpers import make_comment_row

    own = make_comment_row(app, world.card, world.kanban.admin.id, "Admin note")
    assert (
        _patch(client, world, "Admin edit", user=world.kanban.admin, comment=own).status_code == 200
    )
    assert _delete(client, world, user=world.kanban.admin, comment=own).status_code == 200


def test_delete_returns_the_comment_as_it_was_and_later_reads_omit_it(client, world, app):
    listed = client.get(f"/api/cards/{world.card}/comments", headers=world.kanban.headers())
    before = listed.get_json()["data"][0]
    response = _delete(client, world)
    assert response.status_code == 200
    assert response.get_json() == {"data": before}
    assert comment_row(app, world.comment)["deleted_at"] is not None
    after = client.get(f"/api/cards/{world.card}/comments", headers=world.kanban.headers())
    assert after.get_json() == {"data": []}


def test_a_repeat_delete_and_an_edit_after_a_delete_are_404(client, world, app):
    assert _delete(client, world).status_code == 200
    snapshot = comment_snapshot(app, world.kanban.board_id, world.card)
    assert _delete(client, world).status_code == 404
    assert _patch(client, world, "Too late").status_code == 404
    assert comment_snapshot(app, world.kanban.board_id, world.card) == snapshot


def test_edit_and_delete_do_not_change_the_position_version(client, world, app):
    version = board_version(app, world.kanban.board_id)
    _patch(client, world, "Changed")
    _delete(client, world)
    assert board_version(app, world.kanban.board_id) == version
