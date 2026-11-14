"""Trigger rules for notifications (T13, Requirements 1 and 2; Property 1; decisions B2, B3).

Each case asserts the stored rows and the response status. Only a new assignee other than the
caller and the previous assignee, and a comment by someone other than the assignee, notify.
"""

from __future__ import annotations

import uuid

import pytest

from tests.kanban_helpers import board_version, events, make_kanban
from tests.notification_helpers import (
    assign,
    board_rows,
    comment,
    create_card,
    rows,
    seed_world,
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    return seed_world(make_kanban(board_tracker, app))


# --- E17 ---------------------------------------------------------------------------------


def test_e17_with_another_assignee_notifies_that_user_once(client, world, app):
    kanban = world.kanban
    response = create_card(client, kanban, world.column, assignee_id=str(world.ana.id))
    assert response.status_code == 201
    card_id = uuid.UUID(response.get_json()["data"]["card"]["id"])
    stored = rows(app, world.ana.id)
    assert len(stored) == 1
    note = stored[0]
    assert note["kind"] == "assigned"
    assert note["actor_id"] == kanban.admin.id
    assert note["board_id"] == kanban.board_id
    assert note["card_id"] == card_id
    assert note["read_at"] is None
    assert note["created_at"] is not None
    assert len(board_rows(app, kanban.board_id)) == 1


def test_e17_assigning_to_the_caller_creates_none(client, world, app):
    response = create_card(
        client, world.kanban, world.column, by=world.ana, assignee_id=str(world.ana.id)
    )
    assert response.status_code == 201
    assert board_rows(app, world.kanban.board_id) == []


def test_e17_without_an_assignee_creates_none(client, world, app):
    assert create_card(client, world.kanban, world.column).status_code == 201
    assert board_rows(app, world.kanban.board_id) == []


# --- E18 ---------------------------------------------------------------------------------


def test_e18_new_assignee_is_notified_and_repeats_are_not(client, world, app):
    kanban = world.kanban
    assert assign(client, kanban, world.card, world.ana.id).status_code == 200
    assert len(rows(app, world.ana.id)) == 1
    # The same assignee again, with other fields changed too: no new row.
    assert assign(client, kanban, world.card, world.ana.id, title="Renamed").status_code == 200
    assert len(rows(app, world.ana.id)) == 1
    # Clearing the assignee notifies nobody.
    assert assign(client, kanban, world.card, None).status_code == 200
    assert len(board_rows(app, kanban.board_id)) == 1
    # A title-only edit notifies nobody.
    response = client.patch(
        f"/api/cards/{world.card}", json={"title": "Again"}, headers=kanban.headers()
    )
    assert response.status_code == 200
    assert len(board_rows(app, kanban.board_id)) == 1


def test_e18_reassignment_notifies_only_the_new_assignee(client, world, app):
    kanban = world.kanban
    assert assign(client, kanban, world.card, world.ana.id).status_code == 200
    assert assign(client, kanban, world.card, world.ben.id).status_code == 200
    assert len(rows(app, world.ana.id)) == 1
    assert len(rows(app, world.ben.id)) == 1
    assert rows(app, kanban.admin.id) == []


def test_e18_the_caller_assigning_themselves_creates_none(client, world, app):
    assert assign(client, world.kanban, world.card, world.ben.id, by=world.ben).status_code == 200
    assert board_rows(app, world.kanban.board_id) == []


def test_e18_unassigned_then_a_then_b_then_a_by_a_third_user_notifies_a_twice(client, world, app):
    kanban = world.kanban
    for assignee in (world.ana, world.ben, world.ana):
        assert assign(client, kanban, world.card, assignee.id).status_code == 200
    assert len(rows(app, world.ana.id)) == 2
    assert len(rows(app, world.ben.id)) == 1
    assert all(note["kind"] == "assigned" for note in board_rows(app, kanban.board_id))


# --- E24 ---------------------------------------------------------------------------------


@pytest.fixture
def assigned(board_tracker, app):
    kanban = make_kanban(board_tracker, app)
    ana = kanban.add_member("member", name="Ana")
    world = seed_world(kanban, assignee=ana)
    return world, ana


def test_e24_a_comment_by_another_user_notifies_the_assignee(client, assigned, app):
    world, ana = assigned
    response = comment(client, world.kanban, world.card, by=world.ben)
    assert response.status_code == 201
    stored = rows(app, ana.id)
    assert len(stored) == 1
    assert stored[0]["kind"] == "commented"
    assert stored[0]["actor_id"] == world.ben.id
    assert stored[0]["card_id"] == world.card
    assert stored[0]["board_id"] == world.kanban.board_id


def test_e24_a_comment_by_the_assignee_creates_none(client, assigned, app):
    world, ana = assigned
    assert comment(client, world.kanban, world.card, by=ana).status_code == 201
    assert board_rows(app, world.kanban.board_id) == []


def test_e24_a_comment_on_an_unassigned_card_creates_none(client, world, app):
    assert comment(client, world.kanban, world.card, by=world.ben).status_code == 201
    assert board_rows(app, world.kanban.board_id) == []


def test_e24_two_comments_create_two_rows(client, assigned, app):
    world, ana = assigned
    for text in ("One", "One"):
        assert (
            comment(client, world.kanban, world.card, by=world.ben, content=text).status_code == 201
        )
    assert len(rows(app, ana.id)) == 2


def test_an_edit_or_a_delete_of_a_comment_creates_none(client, assigned, app):
    world, ana = assigned
    kanban = world.kanban
    created = comment(client, kanban, world.card, by=world.ben).get_json()["data"]
    assert len(rows(app, ana.id)) == 1
    edit = client.patch(
        f"/api/comments/{created['id']}",
        json={"content": "Edited"},
        headers=kanban.headers(world.ben),
    )
    assert edit.status_code == 200
    delete = client.delete(f"/api/comments/{created['id']}", headers=kanban.headers(world.ben))
    assert delete.status_code == 200
    assert len(rows(app, ana.id)) == 1  # the earlier notification stays


# --- nothing else notifies ---------------------------------------------------------------


def test_removal_delete_and_move_create_none(client, assigned, board_tracker, app):
    world, ana = assigned
    kanban = world.kanban
    other = board_tracker.make_card(world.column, "Other", order=2048.0)
    version = board_version(app, kanban.board_id)
    move = client.patch(
        f"/api/cards/{world.card}/position",
        json={
            "column_id": str(world.column),
            "before_card_id": None,
            "expected_position_version": version,
        },
        headers=kanban.headers(),
    )
    assert move.status_code == 200
    delete = client.delete(f"/api/cards/{other}", headers=kanban.headers())
    assert delete.status_code == 200
    remove = client.delete(
        f"/api/boards/{kanban.board_id}/members/{ana.id}", headers=kanban.headers()
    )
    assert remove.status_code == 200
    assert board_rows(app, kanban.board_id) == []


def test_created_at_is_set_and_follows_commit_order(client, world, app):
    kanban = world.kanban
    assert assign(client, kanban, world.card, world.ana.id).status_code == 200
    assert assign(client, kanban, world.card, world.ben.id).status_code == 200
    first = rows(app, world.ana.id)[0]["created_at"]
    second = rows(app, world.ben.id)[0]["created_at"]
    assert first is not None and second is not None
    assert second >= first


def test_a_notification_writes_no_event_and_no_version_change(client, world, app):
    kanban = world.kanban
    before_events = events(app, kanban.board_id)
    before_version = board_version(app, kanban.board_id)
    assert assign(client, kanban, world.card, world.ana.id).status_code == 200
    assert events(app, kanban.board_id) == before_events
    assert board_version(app, kanban.board_id) == before_version
    assert len(rows(app, world.ana.id)) == 1
