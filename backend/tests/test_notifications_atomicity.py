"""A notification and its change commit or roll back together (T13; Requirements 1.8, 2.6, 2.7).

Two injections for each writer (E17, E18, E24): the commit fails after the notification is
staged, and the notification write itself fails. After each, the stored cards, comments, events
and notifications equal the state before the request (Property 2). Rejected requests write none.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from app.extensions import db
from app.models.notification import Notification
from tests.kanban_helpers import make_kanban
from tests.notification_helpers import assign, comment, create_card, seed_world, snapshot

WRITERS = ["E17", "E18", "E24"]


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    kanban = make_kanban(board_tracker, app)
    ana = kanban.add_member("member", name="Ana")
    # An assignee on the card, so E24 notifies Ana. E18 reassigns it to Ben.
    return seed_world(kanban, assignee=ana)


def _request(endpoint: str, client, world):
    kanban = world.kanban
    return {
        "E17": lambda: create_card(client, kanban, world.column, assignee_id=str(world.ben.id)),
        "E18": lambda: assign(client, kanban, world.card, world.ben.id),
        "E24": lambda: comment(client, kanban, world.card, by=world.ben),
    }[endpoint]()


@pytest.mark.parametrize("endpoint", WRITERS)
def test_a_failing_commit_leaves_neither_the_change_nor_the_notification(
    client, world, app, monkeypatch, endpoint
):
    board_id = world.kanban.board_id
    before = snapshot(app, board_id)
    staged = {"fired": False, "notifications": 0}

    def fail_the_write_commit():
        staged["fired"] = True
        db.session.flush()
        # What this transaction can see just before the commit would have persisted it.
        staged["notifications"] = db.session.scalar(
            select(func.count()).select_from(Notification).where(Notification.board_id == board_id)
        )
        raise OperationalError("COMMIT", {}, Exception("injected failure before commit"))

    monkeypatch.setattr(db.session, "commit", fail_the_write_commit)
    try:
        response = _request(endpoint, client, world)
    finally:
        monkeypatch.undo()

    assert staged["fired"], "the injected failure did not run, so the test proves nothing"
    assert staged["notifications"] == 1  # the notification was staged with the change
    assert response.status_code == 500
    assert response.get_json()["error"]["code"] == "INTERNAL_ERROR"
    assert snapshot(app, board_id) == before


@pytest.mark.parametrize(
    ("endpoint", "target"),
    [
        ("E17", "app.blueprints.cards.service.add_notification"),
        ("E18", "app.blueprints.cards.service.add_notification"),
        ("E24", "app.blueprints.comments.service.add_notification"),
    ],
)
def test_a_failing_notification_write_leaves_no_change_comment_or_event(
    client, world, app, monkeypatch, endpoint, target
):
    before = snapshot(app, world.kanban.board_id)
    calls = []

    def fail(*args, **kwargs):
        calls.append(args)
        raise OperationalError("INSERT", {}, Exception("injected notification failure"))

    monkeypatch.setattr(target, fail)
    try:
        response = _request(endpoint, client, world)
    finally:
        monkeypatch.undo()

    assert calls, "the injected failure did not run, so the test proves nothing"
    assert response.status_code == 500
    assert snapshot(app, world.kanban.board_id) == before


def test_rejected_requests_write_no_notification(client, world, board_tracker, app):
    kanban = world.kanban
    stranger = board_tracker.make_user(name="Stranger")
    before = snapshot(app, kanban.board_id)
    # 400: an assignee who is not a participant (E17 and E18), a blank comment (E24).
    assert (
        create_card(client, kanban, world.column, assignee_id=str(stranger.id)).status_code == 400
    )
    assert assign(client, kanban, world.card, stranger.id).status_code == 400
    blank = client.post(
        f"/api/cards/{world.card}/comments",
        json={"content": "  "},
        headers=kanban.headers(world.ben),
    )
    assert blank.status_code == 400
    # 404: a missing card, and a nonmember commenting.
    assert assign(client, kanban, uuid.uuid4(), world.ben.id).status_code == 404
    assert comment(client, kanban, world.card, by=stranger).status_code == 404
    assert snapshot(app, kanban.board_id) == before
