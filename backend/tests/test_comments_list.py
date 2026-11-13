"""E23 list comments (task 2.2; Requirements 1.1-1.6, 4.2). Property 8."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from app.extensions import db
from app.models.card_comment import CardComment
from app.models.user import User
from tests.comments_helpers import make_comment_row, seed_comment_world
from tests.kanban_helpers import _write, make_kanban, soft_delete, soft_delete_membership

FIELDS = {"id", "card_id", "author_id", "author_name", "content", "created_at", "updated_at"}


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    return seed_comment_world(make_kanban(board_tracker, app))


def _get(client, world, user=None):
    return client.get(f"/api/cards/{world.card}/comments", headers=world.kanban.headers(user))


def test_an_empty_card_returns_an_empty_list(client, world, board_tracker):
    empty = board_tracker.make_card(world.column, "Empty", order=2048.0)
    response = client.get(f"/api/cards/{empty}/comments", headers=world.kanban.headers())
    assert response.status_code == 200
    assert response.get_json() == {"data": []}


def test_returns_the_documented_fields_with_the_author_name(client, world):
    response = _get(client, world)
    assert response.status_code == 200
    (item,) = response.get_json()["data"]
    assert set(item) == FIELDS
    assert item["id"] == str(world.comment)
    assert item["card_id"] == str(world.card)
    assert item["author_id"] == str(world.member.id)
    assert item["author_name"] == "Mia"
    assert item["content"] == "First comment"


def test_property_8_orders_by_creation_time_then_id(client, world, app):
    base = datetime(2026, 1, 1, 9, 0, tzinfo=UTC)
    author = world.member.id
    late = make_comment_row(app, world.card, author, "late", created_at=base + timedelta(hours=2))
    early = make_comment_row(app, world.card, author, "early", created_at=base)
    tie_a = make_comment_row(app, world.card, author, "tie a", created_at=base + timedelta(hours=1))
    tie_b = make_comment_row(app, world.card, author, "tie b", created_at=base + timedelta(hours=1))
    ties = sorted([tie_a, tie_b], key=lambda value: value.bytes)
    got = [item["id"] for item in _get(client, world).get_json()["data"]]
    # The seeded comment was created now, which is after every fixed timestamp above.
    assert got == [str(early), str(ties[0]), str(ties[1]), str(late), str(world.comment)]


def test_property_8_a_deleted_comment_is_omitted(client, world, app):
    other = make_comment_row(app, world.card, world.member.id, "Gone")
    soft_delete(app, CardComment, other)
    ids = [item["id"] for item in _get(client, world).get_json()["data"]]
    assert ids == [str(world.comment)]


def test_the_list_is_not_paginated(client, world, app):
    for index in range(60):
        make_comment_row(app, world.card, world.member.id, f"c{index}")
    assert len(_get(client, world).get_json()["data"]) == 61


def test_author_name_is_the_current_name(client, world, app):
    def rename():
        db.session.execute(
            update(User).where(User.id == world.member.id).values(name="Mia Renamed")
        )

    _write(app, rename)
    (item,) = _get(client, world).get_json()["data"]
    assert item["author_name"] == "Mia Renamed"


def test_a_removed_authors_comments_are_still_listed_to_others(client, world, app):
    soft_delete_membership(app, world.kanban.board_id, world.member.id)
    (item,) = _get(client, world).get_json()["data"]  # as the admin
    assert item["author_id"] == str(world.member.id)
    assert _get(client, world, world.member).status_code == 404  # the removed author cannot read


def test_a_comment_on_another_card_is_not_listed(client, world, board_tracker, app):
    other_card = board_tracker.make_card(world.column, "Other", order=2048.0)
    make_comment_row(app, other_card, world.member.id, "Elsewhere")
    ids = [item["id"] for item in _get(client, world).get_json()["data"]]
    assert ids == [str(world.comment)]


def test_a_missing_card_is_404(client, world):
    response = client.get(f"/api/cards/{uuid.uuid4()}/comments", headers=world.kanban.headers())
    assert response.status_code == 404
