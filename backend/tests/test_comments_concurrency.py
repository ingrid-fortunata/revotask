"""Comment writes racing other board writes (task 2.7; Requirement 5.4, Property 10).

Each request runs in its own thread, test client and session on the guarded test database. The
board row lock serializes them, so each outcome must be one of the two serial orders and never a
500 or a half-written state.
"""

from __future__ import annotations

import pytest

from tests.comments_helpers import comment_kinds, comment_row, comment_rows, seed_comment_world
from tests.kanban_helpers import make_kanban, race


@pytest.fixture
def world(board_tracker, app, schema_at_head):
    return seed_comment_world(make_kanban(board_tracker, app))


def _post_job(world, user, content="Raced"):
    def job(client):
        return client.post(
            f"/api/cards/{world.card}/comments",
            json={"content": content},
            headers=world.kanban.headers(user),
        )

    return job


def test_property_10_a_comment_racing_a_member_removal_is_serial(world, app):
    kanban = world.kanban

    def remove(client):
        return client.delete(
            f"/api/boards/{kanban.board_id}/members/{world.member.id}", headers=kanban.headers()
        )

    results = race(app, [_post_job(world, world.member), remove])
    posted, removed = results
    assert removed.status_code == 200
    assert posted.status_code in (201, 404), posted.get_json()
    comments = [r for r in comment_rows(app, world.card) if r["content"] == "Raced"]
    created_events = comment_kinds(app, kanban.board_id).count("comment_created")
    if posted.status_code == 201:
        assert (len(comments), created_events) == (1, 1)
    else:
        assert (len(comments), created_events) == (0, 0)


def test_property_10_a_comment_racing_a_card_delete_is_serial(world, app):
    kanban = world.kanban

    def delete_card(client):
        return client.delete(f"/api/cards/{world.card}", headers=kanban.headers())

    results = race(app, [_post_job(world, kanban.admin), delete_card])
    posted, deleted = results
    assert deleted.status_code == 200
    assert posted.status_code in (201, 404), posted.get_json()
    raced = [r for r in comment_rows(app, world.card) if r["content"] == "Raced"]
    created_events = comment_kinds(app, kanban.board_id).count("comment_created")
    expected = 1 if posted.status_code == 201 else 0
    assert (len(raced), created_events) == (expected, expected)


@pytest.mark.parametrize("attempt", range(3))
def test_an_edit_racing_a_delete_by_the_author_ends_consistent(world, app, attempt):
    kanban = world.kanban

    def edit(client):
        return client.patch(
            f"/api/comments/{world.comment}",
            json={"content": f"Edited {attempt}"},
            headers=kanban.headers(world.member),
        )

    def delete(client):
        return client.delete(f"/api/comments/{world.comment}", headers=kanban.headers(world.member))

    edited, deleted = race(app, [edit, delete])
    assert deleted.status_code == 200
    assert edited.status_code in (200, 404), edited.get_json()
    row = comment_row(app, world.comment)
    assert row["deleted_at"] is not None
    assert row["content"] == (f"Edited {attempt}" if edited.status_code == 200 else "First comment")
