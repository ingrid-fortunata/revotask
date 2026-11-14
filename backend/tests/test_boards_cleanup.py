"""Teardown isolation for boards test data (Requirements 7.12, DD15).

The harness creates tracked rows and then fails. The tracker finalizer must still delete every
tracked row, including the memberships and cards that reference them, and must leave an untracked
sentinel set alone. Every write goes through the app built from TEST_DATABASE_URL.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from dotenv import dotenv_values
from sqlalchemy import func, make_url, select

from app.extensions import db
from app.models.base import utcnow
from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.board_event import BoardEvent
from app.models.board_member import BoardMember
from app.models.card import Card
from app.models.card_comment import CardComment
from app.models.user import User
from tests.boards_helpers import (
    BoardTracker,
    count_rows,
    remove_untracked_sentinel,
    seed_untracked_sentinel,
    tracked_boards,
)
from tests.db_guard import UnsafeTestDatabaseError, assert_safe_test_database

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _fail_after_tracked_setup(tracker: BoardTracker, state: dict) -> None:
    """Harness: create a board with members, a column, a card and a comment, then fail."""
    owner = tracker.make_user(name="Owner")
    member = tracker.make_user(name="Member")
    board_id = tracker.make_board(owner.id, name="Teardown board")
    tracker.make_membership(board_id, owner.id, "admin")
    tracker.make_membership(board_id, member.id, "member")
    column_id = tracker.make_column(board_id)
    card_id = tracker.make_card(column_id, assignee_id=member.id)
    with tracker.app.app_context():
        try:
            comment = CardComment(card_id=card_id, author_id=member.id, content="tracked")
            db.session.add(comment)
            db.session.commit()
            state["comment_id"] = comment.id
        finally:
            db.session.remove()
    with tracker.app.app_context():
        try:
            event = BoardEvent(
                board_id=board_id,
                actor_id=member.id,
                card_id=card_id,
                kind="card_moved",
                occurred_at=utcnow(),
            )
            db.session.add(event)
            db.session.commit()
            state["event_id"] = event.id
        finally:
            db.session.remove()
    state["board_id"] = board_id
    state["column_id"] = column_id
    state["card_id"] = card_id
    raise AssertionError("harness: deliberate failure after tracked rows were created")


def test_teardown_removes_tracked_rows_after_failed_harness(app, schema_at_head):
    sentinel = seed_untracked_sentinel(app)
    try:
        teardown = tracked_boards(app)
        tracker = next(teardown)
        state: dict = {}
        try:
            with pytest.raises(AssertionError, match="deliberate failure"):
                _fail_after_tracked_setup(tracker, state)

            # Precondition: the harness really created the rows before the failure.
            assert count_rows(app, Board, [state["board_id"]]) == 1
            assert count_rows(app, Card, [state["card_id"]]) == 1
            assert count_rows(app, BoardEvent, [state["event_id"]]) == 1
            assert len(tracker.user_ids) == 2
            assert count_rows(app, BoardMember, tracker.membership_ids) == 2
        finally:
            assert next(teardown, None) is None  # the finalizer ran to completion

        assert count_rows(app, User, tracker.user_ids) == 0
        assert count_rows(app, Board, tracker.board_ids) == 0
        assert count_rows(app, BoardColumn, [state["column_id"]]) == 0
        assert count_rows(app, Card, [state["card_id"]]) == 0
        assert count_rows(app, CardComment, [state["comment_id"]]) == 0
        assert count_rows(app, BoardEvent, [state["event_id"]]) == 0
        assert count_rows(app, BoardMember, tracker.membership_ids) == 0

        # The untracked sentinel rows are still there.
        assert count_rows(app, User, [sentinel["user"]]) == 1
        assert count_rows(app, Board, [sentinel["board"]]) == 1
        assert count_rows(app, BoardMember, [sentinel["membership"]]) == 1
        assert count_rows(app, BoardColumn, [sentinel["column"]]) == 1
        assert count_rows(app, Card, [sentinel["card"]]) == 1
        assert count_rows(app, BoardEvent, [sentinel["event"]]) == 1
        assert count_rows(app, CardComment, [sentinel["comment"]]) == 1
    finally:
        remove_untracked_sentinel(app, sentinel)


def test_teardown_removes_api_created_comments_and_keeps_an_untracked_comment(app, schema_at_head):
    """Task 2.9: comments and events made through E24 are tracked by their board and removed."""
    from tests.comments_helpers import seed_comment_world
    from tests.kanban_helpers import make_kanban

    sentinel = seed_untracked_sentinel(app)
    try:
        teardown = tracked_boards(app)
        tracker = next(teardown)
        state: dict = {}
        try:
            with pytest.raises(AssertionError, match="deliberate failure"):
                kanban = make_kanban(tracker, app)
                world = seed_comment_world(kanban)
                response = app.test_client().post(
                    f"/api/cards/{world.card}/comments",
                    json={"content": "Made through the API"},
                    headers=kanban.headers(),
                )
                assert response.status_code == 201
                state["api_comment"] = uuid.UUID(response.get_json()["data"]["id"])
                state["seed_comment"] = world.comment
                state["board_id"] = kanban.board_id
                assert count_rows(app, CardComment, [state["api_comment"], world.comment]) == 2
                raise AssertionError("harness: deliberate failure after the comment was posted")
        finally:
            assert next(teardown, None) is None

        assert count_rows(app, CardComment, [state["api_comment"], state["seed_comment"]]) == 0
        with app.app_context():
            try:
                events_left = db.session.scalar(
                    select(func.count()).where(BoardEvent.board_id == state["board_id"])
                )
            finally:
                db.session.remove()
        assert events_left == 0
        assert count_rows(app, CardComment, [sentinel["comment"]]) == 1
        assert count_rows(app, BoardEvent, [sentinel["event"]]) == 1
    finally:
        remove_untracked_sentinel(app, sentinel)


def test_tracker_app_writes_only_to_the_test_database(app, test_db_url):
    with app.app_context():
        try:
            engine_database = db.engine.url.database
        finally:
            db.session.remove()
    assert engine_database.endswith("_test")
    assert engine_database == make_url(test_db_url).database


def test_guard_refuses_a_test_url_equal_to_database_url(test_db_url):
    dev_url = dotenv_values(BACKEND_DIR / ".env").get("DATABASE_URL")
    assert dev_url, "backend/.env must define DATABASE_URL for this check"
    assert dev_url != test_db_url, "DATABASE_URL and TEST_DATABASE_URL must differ"
    with pytest.raises(UnsafeTestDatabaseError, match="same database"):
        assert_safe_test_database(dev_url, dev_url)


class _FakeResponse:
    """The two members `record_*_from_response` read from a Flask test response."""

    def __init__(self, status_code: int, body: dict):
        self.status_code = status_code
        self._body = body

    def get_json(self) -> dict:
        return self._body


def test_record_helpers_read_ids_from_the_201_bodies(app, schema_at_head):
    """E13 and E17 do not exist yet, so the helpers run on stand-in responses (task 2.4).

    Groups 3 and 5 use them on real responses.
    """
    import uuid

    column_id, card_id = uuid.uuid4(), uuid.uuid4()
    tracker = BoardTracker(app)
    assert (
        tracker.record_column_from_response(
            _FakeResponse(201, {"data": {"column": {"id": str(column_id)}, "position_version": 1}})
        )
        == column_id
    )
    assert (
        tracker.record_card_from_response(
            _FakeResponse(201, {"data": {"card": {"id": str(card_id)}, "position_version": 2}})
        )
        == card_id
    )
    assert tracker.column_ids == [column_id]
    assert tracker.card_ids == [card_id]
    with pytest.raises(AssertionError):
        tracker.record_card_from_response(_FakeResponse(400, {}))


def test_teardown_after_my_tasks_and_search_requests_keeps_the_sentinel(app, schema_at_head):
    """T11 task 2.5: rows behind E21 and E22 requests are tracked and removed after a failure.

    The untracked sentinel board, its card (assigned to the untracked sentinel user) and its
    membership survive, and E21 for a tracked user never returns the sentinel's card.
    """
    from tests.kanban_helpers import make_kanban
    from tests.search_helpers import my_tasks_get, search_get

    sentinel = seed_untracked_sentinel(app)
    try:
        teardown = tracked_boards(app)
        tracker = next(teardown)
        state: dict = {}
        try:
            with pytest.raises(AssertionError, match="deliberate failure"):
                kanban = make_kanban(tracker, app)
                column_id = tracker.make_column(kanban.board_id)
                card_id = tracker.make_card(column_id, "Search me", assignee_id=kanban.admin.id)
                client = app.test_client()
                tasks = my_tasks_get(client, kanban.headers()).get_json()["data"]
                found = search_get(client, kanban.headers(), kanban.board_id, "search").get_json()
                assert [item["id"] for item in tasks] == [str(card_id)]
                assert [item["id"] for item in found["data"]] == [str(card_id)]
                state["card_id"] = card_id
                state["board_id"] = kanban.board_id
                raise AssertionError("harness: deliberate failure after the reads")
        finally:
            assert next(teardown, None) is None

        assert count_rows(app, Card, [state["card_id"]]) == 0
        assert count_rows(app, Board, [state["board_id"]]) == 0
        assert count_rows(app, Board, [sentinel["board"]]) == 1
        assert count_rows(app, BoardMember, [sentinel["membership"]]) == 1
        assert count_rows(app, BoardColumn, [sentinel["column"]]) == 1
        assert count_rows(app, Card, [sentinel["card"]]) == 1
        assert count_rows(app, User, [sentinel["user"]]) == 1
    finally:
        remove_untracked_sentinel(app, sentinel)
