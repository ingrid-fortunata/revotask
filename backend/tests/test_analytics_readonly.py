"""E29 is read-only and fails cleanly (T14; Requirement 5.4, 5.5; Property 8; decision A6)."""

from __future__ import annotations

import threading

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from app.extensions import db
from app.models.board import Board
from app.models.board_event import BoardEvent
from app.models.card import Card
from app.models.card_comment import CardComment
from app.models.notification import Notification
from tests.analytics_helpers import WEEK_START, analytics_data, freeze, get_analytics, seed_events
from tests.kanban_helpers import _read, board_version, make_kanban


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


def _counts(app, board_id) -> tuple:
    def work():
        def count(model, *where):
            return db.session.scalar(select(func.count()).select_from(model).where(*where))

        return (
            count(BoardEvent, BoardEvent.board_id == board_id),
            count(Notification, Notification.board_id == board_id),
            count(Card),
            count(CardComment),
            board_version(app, board_id),
        )

    return _read(app, work)


def test_it_writes_no_row_event_notification_or_version(
    client, kanban, app, board_tracker, monkeypatch
):
    freeze(monkeypatch)
    column = board_tracker.make_column(kanban.board_id, "Todo", order=1.0)
    card = board_tracker.make_card(column, "c", order=1.0)
    seed_events(app, kanban.board_id, [("card_created", kanban.admin.id, card, WEEK_START)])
    before = _counts(app, kanban.board_id)
    for _ in range(3):
        analytics_data(client, kanban)
    assert _counts(app, kanban.board_id) == before


def test_it_does_not_wait_for_the_board_lock(client, kanban, app):
    outcome: dict = {}

    def request() -> None:
        outcome["response"] = get_analytics(app.test_client(), kanban)

    with app.app_context(), db.engine.begin() as holder:
        # Another transaction holds the board row lock while E29 runs. A lock-free read finishes.
        holder.execute(select(Board.id).where(Board.id == kanban.board_id).with_for_update())
        thread = threading.Thread(target=request)
        thread.start()
        thread.join(timeout=15)
        finished = not thread.is_alive()
    thread.join(timeout=15)
    assert finished, "E29 waited for the board lock"
    assert outcome["response"].status_code == 200


def test_a_failing_read_returns_the_sanitized_500_and_no_partial_result(
    client, kanban, monkeypatch
):
    original = db.session.execute
    calls = {"n": 0}

    def fail_on_the_second_statement(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 2:  # the access check ran, the first aggregate fails
            raise OperationalError("SELECT secret_table", {}, Exception("connection lost"))
        return original(*args, **kwargs)

    monkeypatch.setattr(db.session, "execute", fail_on_the_second_statement)
    response = get_analytics(client, kanban)
    assert response.status_code == 500
    body = response.get_data(as_text=True)
    assert "secret_table" not in body and "connection lost" not in body
    assert response.get_json()["error"]["code"] == "INTERNAL_ERROR"
    assert "data" not in response.get_json()
    assert response.headers["Cache-Control"] == "private, no-store"
