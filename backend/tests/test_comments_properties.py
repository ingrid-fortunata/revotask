"""Parameterized properties of the comments API (task 2.9), over fixed tables.

Properties 1, 3, 5, 6 and 8 end to end through the HTTP routes. The named files cover each in
detail. This file checks the cross-cutting statements once, over a table of callers and a table
of content values.
"""

from __future__ import annotations

import pytest

from tests.comments_helpers import (
    comment_kinds,
    comment_rows,
    comment_snapshot,
    post_comment,
    seed_comment_world,
)
from tests.kanban_helpers import board_version, make_kanban, soft_delete_membership


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    return seed_comment_world(make_kanban(board_tracker, app))


@pytest.mark.parametrize(
    ("content", "stored"),
    [
        ("a", "a"),
        ("  trimmed  ", "trimmed"),
        ("a" * 2000, "a" * 2000),
        ("  " + "b" * 2000 + "  ", "b" * 2000),  # 2,000 characters after trimming is accepted
        ("one\ntwo", "one\ntwo"),
        ("\n\none\n\ntwo\n\n", "one\n\ntwo"),
        ("<b>bold</b> & <script>x</script>", "<b>bold</b> & <script>x</script>"),
    ],
)
def test_property_1_content_that_meets_the_rule_is_stored_trimmed_and_unchanged(
    client, world, app, content, stored
):
    response = post_comment(client, world.kanban, world.card, content=content)
    assert response.status_code == 201
    assert response.get_json()["data"]["content"] == stored
    assert comment_rows(app, world.card)[-1]["content"] == stored


@pytest.mark.parametrize("content", ["", " ", "\n\t ", "a" * 2001, "  " + "b" * 2001])
def test_property_1_content_that_breaks_the_rule_is_400(client, world, app, content):
    before = comment_snapshot(app, world.kanban.board_id, world.card)
    response = post_comment(client, world.kanban, world.card, content=content)
    assert response.status_code == 400
    assert comment_snapshot(app, world.kanban.board_id, world.card) == before


CALLERS = {
    "author": (200, None),
    "admin": (403, "FORBIDDEN"),
    "member": (403, "FORBIDDEN"),
    "removed_author": (404, "NOT_FOUND"),
    "nonmember": (404, "NOT_FOUND"),
}


@pytest.mark.parametrize("caller", list(CALLERS))
@pytest.mark.parametrize("action", ["edit", "delete"])
def test_property_3_only_the_author_with_access_may_edit_or_delete(
    client, world, board_tracker, app, caller, action
):
    kanban = world.kanban
    user = {
        "author": world.member,
        "admin": kanban.admin,
        "member": kanban.add_member("member", name="Omar"),
        "removed_author": world.member,
        "nonmember": board_tracker.make_user(name="Stranger"),
    }[caller]
    if caller == "removed_author":
        soft_delete_membership(app, kanban.board_id, world.member.id)
    expected_status, expected_code = CALLERS[caller]
    before = comment_snapshot(app, kanban.board_id, world.card)
    headers = kanban.headers(user)
    response = (
        client.patch(f"/api/comments/{world.comment}", json={"content": "New"}, headers=headers)
        if action == "edit"
        else client.delete(f"/api/comments/{world.comment}", headers=headers)
    )
    assert response.status_code == expected_status
    if expected_code:
        assert response.get_json()["error"]["code"] == expected_code
        assert comment_snapshot(app, kanban.board_id, world.card) == before


def test_property_5_and_6_a_sequence_of_comment_writes_changes_no_position_and_one_event_each(
    client, world, app
):
    kanban = world.kanban
    version = board_version(app, kanban.board_id)
    first = post_comment(client, kanban, world.card, content="One").get_json()["data"]["id"]
    post_comment(client, kanban, world.card, content="Two")
    client.patch(f"/api/comments/{first}", json={"content": "One edited"}, headers=kanban.headers())
    client.delete(f"/api/comments/{first}", headers=kanban.headers())
    assert board_version(app, kanban.board_id) == version
    assert comment_kinds(app, kanban.board_id) == ["comment_created", "comment_created"]


def test_property_8_the_list_follows_creation_order_across_posts(client, world, app):
    kanban = world.kanban
    ids = [world.comment]
    for index in range(5):
        response = post_comment(client, kanban, world.card, content=f"n{index}")
        ids.append(response.get_json()["data"]["id"])
    listed = client.get(f"/api/cards/{world.card}/comments", headers=kanban.headers())
    assert [item["id"] for item in listed.get_json()["data"]] == [str(i) for i in ids]
