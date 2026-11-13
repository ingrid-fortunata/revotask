"""Comment services for E23–E26 (BE02, BE04, BE06, DD1, DD3, DD5, DD6).

Same sequence as the card services: resolve the board from the addressed card or comment, then
`authorize_board` (with the board lock for a write), reload the addressed resource under the lock,
check authorship for an edit or a delete, and only then write and commit once. Comment writes
never change `position_version` (DD4). Only a new comment records an event.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select

from app.blueprints.boards.service import authorize_board, commit_or_rollback
from app.blueprints.cards.service import board_of_card, load_card
from app.exceptions import NotFoundError, UnauthorizedBoardAccessError
from app.extensions import db
from app.models.base import utcnow
from app.models.board_column import BoardColumn
from app.models.card import Card
from app.models.card_comment import CardComment
from app.models.user import User
from app.positions import record_event

_FIELDS = (
    CardComment.id,
    CardComment.card_id,
    CardComment.author_id,
    User.name.label("author_name"),
    CardComment.content,
    CardComment.created_at,
    CardComment.updated_at,
)


def board_of_comment(comment_id: uuid.UUID) -> uuid.UUID:
    """The board of an active comment on an active card in an active column, or NotFoundError."""
    board_id = db.session.scalar(
        select(BoardColumn.board_id)
        .join(Card, Card.column_id == BoardColumn.id)
        .join(CardComment, CardComment.card_id == Card.id)
        .where(
            CardComment.id == comment_id,
            CardComment.deleted_at.is_(None),
            Card.deleted_at.is_(None),
            BoardColumn.deleted_at.is_(None),
        )
    )
    if board_id is None:
        raise NotFoundError()
    return board_id


def load_comment(comment_id: uuid.UUID, board_id: uuid.UUID) -> CardComment:
    """Reload one active comment of this board with its current values, or NotFoundError."""
    comment = db.session.scalar(
        select(CardComment)
        .join(Card, Card.id == CardComment.card_id)
        .join(BoardColumn, BoardColumn.id == Card.column_id)
        .where(
            CardComment.id == comment_id,
            CardComment.deleted_at.is_(None),
            Card.deleted_at.is_(None),
            BoardColumn.board_id == board_id,
            BoardColumn.deleted_at.is_(None),
        )
        .execution_options(populate_existing=True)
    )
    if comment is None:
        raise NotFoundError()
    return comment


def _comment_dict(comment_id: uuid.UUID) -> dict[str, Any]:
    """The public Comment fields with `author_name` from a join on `users.name` (DD7)."""
    row = db.session.execute(
        select(*_FIELDS)
        .join(User, User.id == CardComment.author_id)
        .where(CardComment.id == comment_id)
    ).one()
    return dict(row._mapping)


def _comment_rows(card_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = db.session.execute(
        select(*_FIELDS)
        .join(User, User.id == CardComment.author_id)
        .where(CardComment.card_id == card_id, CardComment.deleted_at.is_(None))
        .order_by(CardComment.created_at, CardComment.id)
    ).all()
    return [dict(row._mapping) for row in rows]


def list_comments(card_id: uuid.UUID, user_id: uuid.UUID) -> list[dict[str, Any]]:
    """The active comments of a card in creation order, for any participant (E23)."""
    board_id = board_of_card(card_id)
    authorize_board(board_id, user_id)
    return _comment_rows(card_id)


def create_comment(card_id: uuid.UUID, user_id: uuid.UUID, content: str) -> dict[str, Any]:
    """Add a comment as any participant and record `comment_created` (E24)."""
    board_id = board_of_card(card_id)
    authorize_board(board_id, user_id, lock=True)
    load_card(card_id, board_id)
    # One clock reading, so a new comment never looks edited (N1, DD6).
    now = utcnow()
    comment = CardComment(
        card_id=card_id, author_id=user_id, content=content, created_at=now, updated_at=now
    )
    db.session.add(comment)
    db.session.flush()
    record_event(board_id, user_id, "comment_created", card_id)
    # T13 adds the assignee notification here, in this transaction.
    created = _comment_dict(comment.id)
    commit_or_rollback()
    return created


def _own_comment(comment_id: uuid.UUID, user_id: uuid.UUID) -> CardComment:
    """The caller's own active comment under the board lock, or 404 / 403 (DD1, DD3)."""
    board_id = board_of_comment(comment_id)
    authorize_board(board_id, user_id, lock=True)
    comment = load_comment(comment_id, board_id)
    if comment.author_id != user_id:
        raise UnauthorizedBoardAccessError()
    return comment


def update_comment(comment_id: uuid.UUID, user_id: uuid.UUID, content: str) -> dict[str, Any]:
    """Change the text of the caller's own comment (E25).

    The same trimmed text returns the comment without a write, so `updated_at` stays (DD5).
    """
    comment = _own_comment(comment_id, user_id)
    if content == comment.content:
        return _comment_dict(comment_id)
    comment.content = content
    db.session.flush()
    updated = _comment_dict(comment_id)
    commit_or_rollback()
    return updated


def delete_comment(comment_id: uuid.UUID, user_id: uuid.UUID) -> dict[str, Any]:
    """Soft-delete the caller's own comment and return it as it was (E26, M3)."""
    comment = _own_comment(comment_id, user_id)
    snapshot = _comment_dict(comment_id)
    comment.deleted_at = utcnow()
    commit_or_rollback()
    return snapshot
