"""Teardown isolation for the notification tests (T13, Requirement 10.6).

The harness creates tracked users, a board and a card, writes notifications through E18 and then
fails. The tracker finalizer must still delete exactly the tracked notifications, and an
untracked sentinel notification must survive. Every write goes through the app built from
TEST_DATABASE_URL.
"""

from __future__ import annotations

import pytest
from sqlalchemy import delete

from app.extensions import db
from app.models.notification import Notification
from tests.boards_helpers import (
    count_rows,
    remove_untracked_sentinel,
    seed_untracked_sentinel,
    tracked_boards,
)
from tests.kanban_helpers import make_kanban
from tests.notification_helpers import assign, board_rows, insert_notification, seed_world


def _fail_after_a_notification(tracker, app, state: dict) -> None:
    world = seed_world(make_kanban(tracker, app))
    assert assign(app.test_client(), world.kanban, world.card, world.ana.id).status_code == 200
    state["ids"] = [row["id"] for row in board_rows(app, world.kanban.board_id)]
    raise AssertionError("harness: deliberate failure after a notification")


def test_teardown_removes_tracked_notifications_and_keeps_an_untracked_sentinel(
    app, schema_at_head
):
    sentinel = seed_untracked_sentinel(app)
    sentinel_note = insert_notification(
        app, sentinel["user"], sentinel["user"], sentinel["board"], sentinel["card"]
    )
    try:
        teardown = tracked_boards(app)
        tracker = next(teardown)
        state: dict = {}
        try:
            with pytest.raises(AssertionError, match="deliberate failure"):
                _fail_after_a_notification(tracker, app, state)
            # Precondition: the harness really wrote a tracked notification before it failed.
            assert len(state["ids"]) == 1
            assert count_rows(app, Notification, state["ids"]) == 1
        finally:
            assert next(teardown, None) is None  # the finalizer ran to completion

        assert count_rows(app, Notification, state["ids"]) == 0
        assert count_rows(app, Notification, [sentinel_note]) == 1  # untouched
    finally:
        with app.app_context():
            try:
                db.session.execute(delete(Notification).where(Notification.id == sentinel_note))
                db.session.commit()
            finally:
                db.session.remove()
        remove_untracked_sentinel(app, sentinel)
