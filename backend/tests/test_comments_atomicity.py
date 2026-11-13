"""A failed commit leaves no partial comment state (task 2.8; Requirement 5.5, Property 9).

The commit that persists the change is made to fail after the comment and its event are written
inside the transaction. The next read must show the state from before the request.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from app.extensions import db
from app.models.board_event import BoardEvent
from app.models.card_comment import CardComment
from tests.comments_helpers import comment_snapshot, seed_comment_world
from tests.kanban_helpers import make_kanban


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.mark.parametrize("endpoint", ["E24", "E25", "E26"])
def test_property_9_a_failed_commit_leaves_comments_and_events_unchanged(
    client, board_tracker, app, monkeypatch, endpoint
):
    world = seed_comment_world(make_kanban(board_tracker, app))
    kanban = world.kanban
    before = comment_snapshot(app, kanban.board_id, world.card)
    injected = {"fired": False, "comments": 0, "events": 0}

    def fail_the_write_commit():
        injected["fired"] = True
        db.session.flush()
        # What this transaction can see just before the commit would have persisted it.
        injected["comments"] = db.session.scalar(
            select(func.count()).where(CardComment.card_id == world.card)
        )
        injected["events"] = db.session.scalar(
            select(func.count()).where(BoardEvent.board_id == kanban.board_id)
        )
        raise OperationalError("COMMIT", {}, Exception("injected failure before commit"))

    requests = {
        "E24": lambda: client.post(
            f"/api/cards/{world.card}/comments",
            json={"content": "Never saved"},
            headers=kanban.headers(),
        ),
        "E25": lambda: client.patch(
            f"/api/comments/{world.comment}",
            json={"content": "Never saved"},
            headers=kanban.headers(world.member),
        ),
        "E26": lambda: client.delete(
            f"/api/comments/{world.comment}", headers=kanban.headers(world.member)
        ),
    }
    monkeypatch.setattr(db.session, "commit", fail_the_write_commit)
    try:
        response = requests[endpoint]()
    finally:
        monkeypatch.undo()

    assert injected["fired"], "the injected failure did not run, so the test proves nothing"
    if endpoint == "E24":
        # The comment and its event were both written inside the transaction before the failure.
        assert (injected["comments"], injected["events"]) == (2, 1)
    assert response.status_code == 500
    assert response.get_json()["error"]["code"] == "INTERNAL_ERROR"
    assert comment_snapshot(app, kanban.board_id, world.card) == before
