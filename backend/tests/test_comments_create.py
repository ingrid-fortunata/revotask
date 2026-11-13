"""E24 add a comment (task 2.3; Requirements 2.1-2.9). Properties 5, 6, 7, 16 and 18."""

from __future__ import annotations

import uuid

import pytest

from tests.comments_helpers import (
    comment_kinds,
    comment_row,
    comment_rows,
    comment_snapshot,
    post_comment,
    seed_comment_world,
)
from tests.kanban_helpers import board_version, events, make_kanban, soft_delete


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    return seed_comment_world(make_kanban(board_tracker, app))


def test_201_shape_and_a_comment_created_event(client, world, app):
    kanban = world.kanban
    before = len(events(app, kanban.board_id))
    response = post_comment(client, kanban, world.card, content="  Looks good  ", user=None)
    assert response.status_code == 201
    data = response.get_json()["data"]
    assert set(data) == {
        "id",
        "card_id",
        "author_id",
        "author_name",
        "content",
        "created_at",
        "updated_at",
    }
    assert data["content"] == "Looks good"
    assert data["author_id"] == str(kanban.admin.id)
    assert data["author_name"] == "Admin"
    assert data["card_id"] == str(world.card)
    new_events = events(app, kanban.board_id)[before:]
    assert new_events == [("comment_created", kanban.admin.id, world.card)]


def test_inner_line_breaks_are_kept_and_returned_unchanged(client, world, app):
    text = "line one\n\nline three\n  indented"
    response = post_comment(client, world.kanban, world.card, content=f"\n{text}\n")
    assert response.get_json()["data"]["content"] == text
    stored = comment_row(app, uuid.UUID(response.get_json()["data"]["id"]))
    assert stored["content"] == text
    listed = client.get(f"/api/cards/{world.card}/comments", headers=world.kanban.headers())
    assert listed.get_json()["data"][-1]["content"] == text


def test_property_7_created_and_updated_are_the_same_instant(client, world, app):
    """N1: a new comment never looks edited."""
    response = post_comment(client, world.kanban, world.card, content="Fresh")
    data = response.get_json()["data"]
    assert data["created_at"] == data["updated_at"]
    stored = comment_row(app, uuid.UUID(data["id"]))
    assert stored["created_at"] == stored["updated_at"]


def test_property_5_the_position_version_and_the_order_do_not_change(client, world, app):
    before = comment_snapshot(app, world.kanban.board_id, world.card)
    post_comment(client, world.kanban, world.card, content="No version change")
    after = comment_snapshot(app, world.kanban.board_id, world.card)
    assert after[1] == before[1] == board_version(app, world.kanban.board_id)
    assert after[3] == before[3]  # columns and their order


def test_a_member_and_an_admin_can_both_comment(client, world, app):
    for user in (world.member, world.kanban.admin):
        response = post_comment(client, world.kanban, world.card, user=user, content="Hi")
        assert response.status_code == 201
        assert response.get_json()["data"]["author_id"] == str(user.id)
    assert comment_kinds(app, world.kanban.board_id).count("comment_created") == 2


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"content": ""},
        {"content": "   \n "},
        {"content": "x" * 2001},
        {"content": 5},
        {"content": None},
        {"content": "ok", "author_id": "x"},
        {"content": "ok", "card_id": "x"},
    ],
)
def test_invalid_bodies_are_400_and_create_nothing(client, world, app, body):
    before = comment_snapshot(app, world.kanban.board_id, world.card)
    response = client.post(
        f"/api/cards/{world.card}/comments", json=body, headers=world.kanban.headers()
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"
    assert comment_snapshot(app, world.kanban.board_id, world.card) == before


def test_the_400_names_the_content_field_with_a_fixed_message(client, world):
    response = post_comment(client, world.kanban, world.card, content="")
    assert response.get_json()["error"]["fields"] == {"content": "Must be 1 to 2000 characters."}
    long = post_comment(client, world.kanban, world.card, content="secret " * 400)
    assert "secret" not in long.get_data(as_text=True)


def test_a_missing_or_deleted_card_is_404_and_creates_nothing(client, world, app, board_tracker):
    from app.models.card import Card

    gone = board_tracker.make_card(world.column, "Gone", order=2048.0)
    soft_delete(app, Card, gone)
    for card_id in (uuid.uuid4(), gone):
        response = post_comment(client, world.kanban, card_id, content="Hello")
        assert response.status_code == 404
    assert comment_kinds(app, world.kanban.board_id) == []
    assert len(comment_rows(app, gone, include_deleted=True)) == 0


def test_property_18_identical_posts_create_two_comments(client, world, app):
    """N5: the server does not deduplicate."""
    first = post_comment(client, world.kanban, world.card, content="Same text")
    second = post_comment(client, world.kanban, world.card, content="Same text")
    assert (first.status_code, second.status_code) == (201, 201)
    assert first.get_json()["data"]["id"] != second.get_json()["data"]["id"]
    contents = [r["content"] for r in comment_rows(app, world.card)]
    assert contents.count("Same text") == 2
