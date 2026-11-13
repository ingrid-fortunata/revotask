"""Helpers for boards tests: `BoardTracker` records every row a test creates and removes them.

Extends the `Tracker` pattern in `auth_helpers.py` (Requirements 7.12, DD15). Cleanup deletes only
tracked IDs and the rows that reference them, in foreign-key order. It never uses TRUNCATE and
never matches names. The tracker only writes to the app it is given, and conftest builds that app
from TEST_DATABASE_URL through `db_guard`.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any

from flask import Flask
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.extensions import db
from app.models.base import utcnow
from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.board_event import BoardEvent
from app.models.board_member import BoardMember
from app.models.card import Card
from app.models.card_comment import CardComment
from app.models.notification import Notification
from app.models.revoked_token import RevokedToken
from app.models.user import User
from tests.auth_helpers import PLACEHOLDER_HASH, Tracker


class BoardTracker(Tracker):
    """Tracks users, boards, columns, cards and memberships, then deletes exactly those rows."""

    def __init__(self, app: Flask):
        super().__init__(app)
        self.board_ids: list[uuid.UUID] = []
        self.column_ids: list[uuid.UUID] = []
        self.card_ids: list[uuid.UUID] = []
        self.membership_ids: list[uuid.UUID] = []

    # Creation helpers. Each one writes through the app and records the new ID.

    def make_board(self, creator_id: uuid.UUID, name: str = "Test board") -> uuid.UUID:
        with self.app.app_context():
            board = Board(creator_id=creator_id, name=name)
            db.session.add(board)
            db.session.commit()
            board_id = board.id
        self.board_ids.append(board_id)
        return board_id

    def make_membership(
        self, board_id: uuid.UUID, user_id: uuid.UUID, role: str = "member"
    ) -> uuid.UUID:
        with self.app.app_context():
            row = BoardMember(board_id=board_id, user_id=user_id, role=role)
            db.session.add(row)
            db.session.commit()
            row_id = row.id
        self.membership_ids.append(row_id)
        return row_id

    def make_column(self, board_id: uuid.UUID, name: str = "Todo", order: float = 1.0) -> uuid.UUID:
        with self.app.app_context():
            column = BoardColumn(board_id=board_id, name=name, order=order)
            db.session.add(column)
            db.session.commit()
            column_id = column.id
        self.column_ids.append(column_id)
        return column_id

    def make_card(
        self,
        column_id: uuid.UUID,
        title: str = "Test card",
        assignee_id: uuid.UUID | None = None,
        order: float = 1.0,
    ) -> uuid.UUID:
        with self.app.app_context():
            card = Card(column_id=column_id, title=title, assignee_id=assignee_id, order=order)
            db.session.add(card)
            db.session.commit()
            card_id = card.id
        self.card_ids.append(card_id)
        return card_id

    def record_board_from_response(self, response: Any) -> uuid.UUID:
        """Track the board ID from an E06 201 response (`{"data": {"id": ...}}`)."""
        assert response.status_code == 201, response.status_code
        board_id = uuid.UUID(response.get_json()["data"]["id"])
        self.board_ids.append(board_id)
        return board_id

    def record_column_from_response(self, response: Any) -> uuid.UUID:
        """Track the column ID from an E13 201 response (`{"data": {"column": {"id": ...}}}`).

        The column belongs to a tracked board, so cleanup also removes it by board. Recording its
        ID keeps the tracker's lists complete for assertions.
        """
        assert response.status_code == 201, response.status_code
        column_id = uuid.UUID(response.get_json()["data"]["column"]["id"])
        self.column_ids.append(column_id)
        return column_id

    def record_card_from_response(self, response: Any) -> uuid.UUID:
        """Track the card ID from an E17 201 response (`{"data": {"card": {"id": ...}}}`)."""
        assert response.status_code == 201, response.status_code
        card_id = uuid.UUID(response.get_json()["data"]["card"]["id"])
        self.card_ids.append(card_id)
        return card_id

    # Removal

    def cleanup(self) -> None:
        """Delete the tracked rows, then the tracked tokens and users. Safe to call twice."""
        with self.app.app_context():
            try:
                delete_tracked_rows(
                    db.session,
                    board_ids=self.board_ids,
                    column_ids=self.column_ids,
                    card_ids=self.card_ids,
                    user_ids=self.user_ids,
                    jtis=self.jtis,
                )
                db.session.commit()
            except Exception:
                db.session.rollback()
                raise
            finally:
                db.session.remove()


def delete_tracked_rows(
    session: Session,
    *,
    board_ids: list[uuid.UUID],
    column_ids: list[uuid.UUID],
    card_ids: list[uuid.UUID],
    user_ids: list[uuid.UUID],
    jtis: list[uuid.UUID],
) -> None:
    """Delete only rows selected by tracked IDs, referencing children before parents.

    Cards and columns are selected first, so the child rows that reference them (comments,
    events, notifications) can be removed before the parents. Rows in the same tables that belong
    to untracked boards or users are not touched.
    """
    columns_of_tracked_boards = select(BoardColumn.id).where(BoardColumn.board_id.in_(board_ids))
    doomed_card_ids = list(
        session.scalars(
            select(Card.id).where(
                Card.id.in_(card_ids)
                | Card.column_id.in_(columns_of_tracked_boards)
                | Card.column_id.in_(column_ids)
                | Card.assignee_id.in_(user_ids)
            )
        )
    )
    doomed_column_ids = list(
        session.scalars(
            select(BoardColumn.id).where(
                BoardColumn.board_id.in_(board_ids) | BoardColumn.id.in_(column_ids)
            )
        )
    )

    session.execute(
        delete(CardComment).where(
            CardComment.card_id.in_(doomed_card_ids) | CardComment.author_id.in_(user_ids)
        )
    )
    session.execute(
        delete(Notification).where(
            Notification.board_id.in_(board_ids)
            | Notification.card_id.in_(doomed_card_ids)
            | Notification.recipient_id.in_(user_ids)
            | Notification.actor_id.in_(user_ids)
        )
    )
    session.execute(
        delete(BoardEvent).where(
            BoardEvent.board_id.in_(board_ids)
            | BoardEvent.card_id.in_(doomed_card_ids)
            | BoardEvent.actor_id.in_(user_ids)
        )
    )
    session.execute(delete(Card).where(Card.id.in_(doomed_card_ids)))
    session.execute(delete(BoardColumn).where(BoardColumn.id.in_(doomed_column_ids)))
    session.execute(
        delete(BoardMember).where(
            BoardMember.board_id.in_(board_ids) | BoardMember.user_id.in_(user_ids)
        )
    )
    session.execute(delete(Board).where(Board.id.in_(board_ids)))
    if jtis:
        session.execute(delete(RevokedToken).where(RevokedToken.jti.in_(jtis)))
    session.execute(delete(User).where(User.id.in_(user_ids)))


def tracked_boards(app: Flask) -> Iterator[BoardTracker]:
    """Yield a `BoardTracker` and always clean up, including when the test body raises.

    Pytest runs the code after `yield` at teardown whether or not the test failed. The conftest
    fixture delegates here, so the tests can also drive this generator directly.
    """
    tracker = BoardTracker(app)
    try:
        yield tracker
    finally:
        tracker.cleanup()


def seed_untracked_sentinel(app: Flask) -> dict[str, uuid.UUID]:
    """Insert a user, board, column, card, event and membership that no tracker records.

    Returns their IDs. The caller must remove them with `remove_untracked_sentinel`.
    """
    with app.app_context():
        user = User(
            name="Sentinel",
            email=f"sentinel-{uuid.uuid4().hex[:12]}@example.test",
            password_hash=PLACEHOLDER_HASH,
        )
        db.session.add(user)
        db.session.flush()
        board = Board(creator_id=user.id, name="Sentinel board")
        db.session.add(board)
        db.session.flush()
        membership = BoardMember(board_id=board.id, user_id=user.id, role="admin")
        column = BoardColumn(board_id=board.id, name="Sentinel column", order=1.0)
        db.session.add_all([membership, column])
        db.session.flush()
        card = Card(column_id=column.id, title="Sentinel card", assignee_id=user.id, order=1.0)
        db.session.add(card)
        db.session.flush()
        event = BoardEvent(
            board_id=board.id,
            actor_id=user.id,
            card_id=card.id,
            kind="card_created",
            occurred_at=utcnow(),
        )
        db.session.add(event)
        db.session.commit()
        ids = {
            "user": user.id,
            "board": board.id,
            "membership": membership.id,
            "column": column.id,
            "card": card.id,
            "event": event.id,
        }
        db.session.remove()
        return ids


def remove_untracked_sentinel(app: Flask, ids: dict[str, uuid.UUID]) -> None:
    """Remove the sentinel rows by their own IDs, after the assertions are done."""
    with app.app_context():
        try:
            db.session.execute(delete(BoardEvent).where(BoardEvent.id == ids["event"]))
            db.session.execute(delete(Card).where(Card.id == ids["card"]))
            db.session.execute(delete(BoardColumn).where(BoardColumn.id == ids["column"]))
            db.session.execute(delete(BoardMember).where(BoardMember.id == ids["membership"]))
            db.session.execute(delete(Board).where(Board.id == ids["board"]))
            db.session.execute(delete(User).where(User.id == ids["user"]))
            db.session.commit()
        finally:
            db.session.remove()


def count_rows(app: Flask, model: type, ids: list[uuid.UUID]) -> int:
    """Count rows of `model` whose primary key is in `ids`."""
    with app.app_context():
        try:
            return len(list(db.session.scalars(select(model.id).where(model.id.in_(ids)))))
        finally:
            db.session.remove()
