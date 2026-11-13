"""Failed writes leave no partial state (task 3.9; cards extend it in task 5.9).

Requirement 5.x and Property 12. The commit that persists the change is made to fail after the
order, the version bump and the event are written inside the transaction. The next read must show
the state from before the request: same orders, same version, no event.
"""

from __future__ import annotations

import pytest
from sqlalchemy.exc import OperationalError

from app.extensions import db
from tests.kanban_helpers import (
    card_requests,
    card_snapshot,
    column_requests,
    column_snapshot,
    make_kanban,
    seed_cards,
    seed_columns,
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.mark.parametrize("endpoint", ["E13", "E14", "E15", "E16"])
def test_property_12_a_failed_commit_leaves_columns_version_and_events_unchanged(
    client, board_tracker, app, monkeypatch, endpoint
):
    kanban = make_kanban(board_tracker, app)
    cols = seed_columns(kanban)
    before = column_snapshot(app, kanban.board_id)
    injected = {"fired": False, "pending_new": 0, "pending_dirty": 0}

    def fail_the_write_commit():
        injected["fired"] = True
        # Everything is written inside the transaction before this point.
        injected["pending_new"] = len(db.session.new)
        injected["pending_dirty"] = len(db.session.dirty)
        db.session.flush()
        raise OperationalError("COMMIT", {}, Exception("injected failure before commit"))

    monkeypatch.setattr(db.session, "commit", fail_the_write_commit)
    try:
        response = column_requests(kanban, cols)[endpoint](client, kanban.headers())
    finally:
        monkeypatch.undo()

    assert injected["fired"], "the injected failure did not run, so the test proves nothing"
    if endpoint == "E16":
        assert injected["pending_new"] >= 1  # the column_reordered event was already in the session
    assert response.status_code == 500
    assert response.get_json()["error"]["code"] == "INTERNAL_ERROR"
    assert column_snapshot(app, kanban.board_id) == before


@pytest.mark.parametrize("endpoint", ["E17", "E18", "E19", "E20"])
def test_property_12_a_failed_commit_leaves_cards_version_and_events_unchanged(
    client, board_tracker, app, monkeypatch, endpoint
):
    kanban = make_kanban(board_tracker, app)
    t = seed_cards(kanban)
    before = card_snapshot(app, kanban.board_id, [t.todo, t.doing])
    injected = {"fired": False, "pending": 0}

    def fail_the_write_commit():
        injected["fired"] = True
        injected["pending"] = len(db.session.new) + len(db.session.dirty)
        db.session.flush()
        raise OperationalError("COMMIT", {}, Exception("injected failure before commit"))

    monkeypatch.setattr(db.session, "commit", fail_the_write_commit)
    try:
        response = card_requests(kanban, t)[endpoint](client, kanban.headers())
    finally:
        monkeypatch.undo()

    assert injected["fired"], "the injected failure did not run, so the test proves nothing"
    assert response.status_code == 500
    assert response.get_json()["error"]["code"] == "INTERNAL_ERROR"
    assert card_snapshot(app, kanban.board_id, [t.todo, t.doing]) == before
