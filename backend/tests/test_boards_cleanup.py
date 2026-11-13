"""Teardown isolation for boards test data (Requirements 7.12, DD15).

The harness creates tracked rows and then fails. The tracker finalizer must still delete every
tracked row, including the memberships and cards that reference them, and must leave an untracked
sentinel set alone. Every write goes through the app built from TEST_DATABASE_URL.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from dotenv import dotenv_values
from sqlalchemy import make_url

from app.extensions import db
from app.models.board import Board
from app.models.board_column import BoardColumn
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
            assert len(tracker.user_ids) == 2
            assert count_rows(app, BoardMember, tracker.membership_ids) == 2
        finally:
            assert next(teardown, None) is None  # the finalizer ran to completion

        assert count_rows(app, User, tracker.user_ids) == 0
        assert count_rows(app, Board, tracker.board_ids) == 0
        assert count_rows(app, BoardColumn, [state["column_id"]]) == 0
        assert count_rows(app, Card, [state["card_id"]]) == 0
        assert count_rows(app, CardComment, [state["comment_id"]]) == 0
        assert count_rows(app, BoardMember, tracker.membership_ids) == 0

        # The untracked sentinel rows are still there.
        assert count_rows(app, User, [sentinel["user"]]) == 1
        assert count_rows(app, Board, [sentinel["board"]]) == 1
        assert count_rows(app, BoardMember, [sentinel["membership"]]) == 1
        assert count_rows(app, BoardColumn, [sentinel["column"]]) == 1
        assert count_rows(app, Card, [sentinel["card"]]) == 1
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
