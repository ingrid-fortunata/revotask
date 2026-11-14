"""Concurrent writers and readers of notifications (T13; Requirements 1.2, 2.5, 4.3).

Properties 3 and 8.

The board lock serializes the writers, so the second of two assignments to one new assignee sees
no change, and a comment sees the assignee that the commit order shows. Two marks of one row
commit one `read_at`. Each thread has its own client and session.
"""

from __future__ import annotations

from datetime import datetime

import pytest

from tests.kanban_helpers import make_kanban, race
from tests.notification_helpers import (
    assign,
    board_rows,
    clear_notifications,
    comment,
    insert_notification,
    mark_as,
    rows,
    seed_world,
    set_assignee,
)

REPEATS = 5


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def test_two_concurrent_assignments_to_one_user_create_one_notification(board_tracker, app, client):
    world = seed_world(make_kanban(board_tracker, app))
    kanban = world.kanban
    for _ in range(REPEATS):
        set_assignee(app, world.card, None)
        clear_notifications(app, kanban.board_id)
        results = race(
            app,
            [
                lambda c: assign(c, kanban, world.card, world.ben.id),
                lambda c: assign(c, kanban, world.card, world.ben.id, by=world.ana),
            ],
        )
        assert [r.status_code for r in results] == [200, 200]
        assert len(rows(app, world.ben.id)) == 1


def test_a_comment_racing_with_a_reassignment_notifies_the_committed_assignee(
    board_tracker, app, client
):
    kanban = make_kanban(board_tracker, app)
    carol = kanban.add_member("member", name="Carol")
    world = seed_world(kanban, assignee=None)
    for _ in range(REPEATS):
        set_assignee(app, world.card, world.ana.id)
        clear_notifications(app, kanban.board_id)
        results = race(
            app,
            [
                lambda c: assign(c, kanban, world.card, world.ben.id),
                lambda c: comment(c, kanban, world.card, by=carol),
            ],
        )
        assert [r.status_code for r in results] == [200, 201]
        stored = board_rows(app, kanban.board_id)
        commented = [n for n in stored if n["kind"] == "commented"]
        assigned = [n for n in stored if n["kind"] == "assigned"]
        assert len(commented) == 1
        assert len(assigned) == 1 and assigned[0]["recipient_id"] == world.ben.id
        # The comment committed after the reassignment exactly when its row is the later one.
        after = commented[0]["created_at"] > assigned[0]["created_at"]
        assert commented[0]["recipient_id"] == (world.ben.id if after else world.ana.id)


def test_two_concurrent_marks_keep_one_read_at(board_tracker, app, client):
    world = seed_world(make_kanban(board_tracker, app))
    kanban = world.kanban
    note = insert_notification(app, world.ana.id, kanban.admin.id, kanban.board_id, world.card)
    results = race(
        app,
        [
            lambda c: mark_as(c, kanban, world.ana, note),
            lambda c: mark_as(c, kanban, world.ana, note),
        ],
    )
    assert [r.status_code for r in results] == [200, 200]
    stored = rows(app, world.ana.id)[0]["read_at"]
    assert stored is not None
    returned = {datetime.fromisoformat(r.get_json()["data"]["read_at"]) for r in results}
    assert returned == {stored}  # both responses carry the one committed value
