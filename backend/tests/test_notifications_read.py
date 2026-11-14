"""E28 mark read (T13; Requirement 4; Properties 8 to 10; decision B7)."""

from __future__ import annotations

import threading
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.extensions import db
from app.models.board import Board
from tests.kanban_helpers import (
    board_version,
    error_without_request_id,
    events,
    make_kanban,
    soft_delete,
)
from tests.notification_helpers import (
    ITEM_KEYS,
    insert_notification,
    list_as,
    mark_as,
    rows,
    seed_world,
)

LONG_AGO = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    return seed_world(make_kanban(board_tracker, app))


@pytest.fixture
def note(world, app):
    return insert_notification(
        app, world.ana.id, world.kanban.admin.id, world.kanban.board_id, world.card
    )


def test_the_first_call_sets_read_at_and_returns_the_item(client, world, note, app):
    response = mark_as(client, world.kanban, world.ana, note)
    assert response.status_code == 200
    item = response.get_json()["data"]
    assert set(item) == ITEM_KEYS
    assert item["id"] == str(note)
    assert item["read_at"] is not None
    stored = rows(app, world.ana.id)[0]["read_at"]
    assert stored is not None and datetime.fromisoformat(item["read_at"]) == stored
    assert list_as(client, world.kanban, world.ana).get_json()["data"]["unread_count"] == 0


def test_a_repeat_keeps_the_original_read_at_and_writes_nothing(client, world, app):
    note = insert_notification(
        app,
        world.ana.id,
        world.kanban.admin.id,
        world.kanban.board_id,
        world.card,
        read_at=LONG_AGO,
    )
    response = mark_as(client, world.kanban, world.ana, note)
    assert response.status_code == 200
    assert response.get_json()["data"]["read_at"] == LONG_AGO.isoformat()
    assert rows(app, world.ana.id)[0]["read_at"] == LONG_AGO


def test_a_non_uuid_path_is_400(client, world):
    response = client.patch(
        "/api/notifications/not-a-uuid/read", headers=world.kanban.headers(world.ana)
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"


def test_a_missing_foreign_and_hidden_id_give_one_404_and_change_nothing(client, world, note, app):
    kanban = world.kanban
    envelopes = []
    for user, target in (
        (world.ana, uuid.uuid4()),  # missing
        (world.ben, note),  # another user's
        (kanban.admin, note),  # a board admin is not the recipient
    ):
        response = mark_as(client, kanban, user, target)
        assert response.status_code == 404
        assert response.get_json()["error"]["code"] == "NOT_FOUND"
        envelopes.append(error_without_request_id(response))
    # Hidden: the board is soft-deleted.
    soft_delete(app, Board, kanban.board_id)
    response = mark_as(client, kanban, world.ana, note)
    assert response.status_code == 404
    envelopes.append(error_without_request_id(response))
    assert all(envelope == envelopes[0] for envelope in envelopes)
    assert rows(app, world.ana.id)[0]["read_at"] is None


def test_a_request_body_is_never_read(client, world, note):
    response = client.patch(
        f"/api/notifications/{note}/read",
        data="{not json",
        content_type="application/json",
        headers=world.kanban.headers(world.ana),
    )
    assert response.status_code == 200


def test_it_writes_no_event_or_version_and_takes_no_board_lock(client, world, note, app):
    kanban = world.kanban
    before = (events(app, kanban.board_id), board_version(app, kanban.board_id))
    outcome: dict = {}

    def request() -> None:
        outcome["response"] = mark_as(app.test_client(), kanban, world.ana, note)

    with app.app_context(), db.engine.begin() as holder:
        # Another transaction holds the board row lock while E28 runs. A lock-free E28 finishes.
        holder.execute(select(Board.id).where(Board.id == kanban.board_id).with_for_update())
        thread = threading.Thread(target=request)
        thread.start()
        thread.join(timeout=15)
        finished = not thread.is_alive()
    thread.join(timeout=15)
    assert finished, "E28 waited for the board lock"
    assert outcome["response"].status_code == 200
    assert (events(app, kanban.board_id), board_version(app, kanban.board_id)) == before
