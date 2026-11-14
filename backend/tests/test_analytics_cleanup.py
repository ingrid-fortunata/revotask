"""Teardown isolation for the analytics tests (T14; Requirement 8.6).

Events that a test inserts for tracked boards, cards and users are removed by the tracker, and an
untracked sentinel board with an event must survive. Every write goes through the app built from
TEST_DATABASE_URL.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.extensions import db
from app.models.board_event import BoardEvent
from tests.analytics_helpers import WEEK_START, seed_events
from tests.boards_helpers import (
    count_rows,
    remove_untracked_sentinel,
    seed_untracked_sentinel,
    tracked_boards,
)
from tests.kanban_helpers import _read, make_kanban


def _event_ids(app, board_id) -> list:
    return _read(
        app,
        lambda: list(
            db.session.scalars(select(BoardEvent.id).where(BoardEvent.board_id == board_id))
        ),
    )


def _fail_after_events(tracker, app, state: dict) -> None:
    kanban = make_kanban(tracker, app)
    column = tracker.make_column(kanban.board_id, "Todo", order=1.0)
    card = tracker.make_card(column, "c", order=1.0)
    seed_events(
        app,
        kanban.board_id,
        [
            ("card_created", kanban.admin.id, card, WEEK_START + timedelta(hours=i))
            for i in range(3)
        ],
    )
    state["ids"] = _event_ids(app, kanban.board_id)
    raise AssertionError("harness: deliberate failure after events were written")


def test_teardown_removes_tracked_events_and_keeps_an_untracked_sentinel(app, schema_at_head):
    sentinel = seed_untracked_sentinel(app)
    try:
        teardown = tracked_boards(app)
        tracker = next(teardown)
        state: dict = {}
        try:
            with pytest.raises(AssertionError, match="deliberate failure"):
                _fail_after_events(tracker, app, state)
            # Precondition: the harness really wrote tracked events before it failed.
            assert len(state["ids"]) == 3
            assert count_rows(app, BoardEvent, state["ids"]) == 3
        finally:
            assert next(teardown, None) is None  # the finalizer ran to completion

        assert count_rows(app, BoardEvent, state["ids"]) == 0
        assert count_rows(app, BoardEvent, [sentinel["event"]]) == 1  # untouched
    finally:
        remove_untracked_sentinel(app, sentinel)
