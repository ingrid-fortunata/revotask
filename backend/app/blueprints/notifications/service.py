"""Notification services for E27–E28 and the write side of E17, E18 and E24 (T13).

`add_notification` stages one row and leaves the commit to the caller, like `record_event`, so a
notification shares one transaction with the change that caused it (DD1). Every read and the E28
update go through `_visible`, the one visibility filter (DD3). This module imports only models and
`boards.service`, so the card and comment services can import it without a cycle.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Select, and_, func, select, update

from app.blueprints.boards.service import commit_or_rollback
from app.exceptions import NotFoundError
from app.extensions import db
from app.models.base import utcnow
from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.board_member import BoardMember
from app.models.card import Card
from app.models.notification import Notification
from app.models.user import User

_ITEM_COLUMNS = (
    Notification.id,
    Notification.kind,
    Notification.board_id,
    Notification.card_id,
    Notification.actor_id,
    User.name.label("actor_name"),
    Board.name.label("board_name"),
    Card.title.label("card_title"),
    Notification.created_at,
    Notification.read_at,
)


def add_notification(
    recipient_id: uuid.UUID,
    actor_id: uuid.UUID,
    board_id: uuid.UUID,
    card_id: uuid.UUID,
    kind: str,
) -> None:
    """Stage one notification in the session. The caller commits it with its own change."""
    db.session.add(
        Notification(
            recipient_id=recipient_id,
            actor_id=actor_id,
            board_id=board_id,
            card_id=card_id,
            kind=kind,
            created_at=utcnow(),
        )
    )


def _visible(stmt: Select, user_id: uuid.UUID) -> Select:
    """Restrict `stmt` to the caller's visible notifications (B4).

    The card, its column and its board are active, and the recipient is an active member of that
    board. Rows are never deleted, so a rejoining member sees them again with their `read_at`.
    """
    return (
        stmt.select_from(Notification)
        .join(Card, Card.id == Notification.card_id)
        .join(BoardColumn, BoardColumn.id == Card.column_id)
        .join(Board, Board.id == BoardColumn.board_id)
        .join(
            BoardMember,
            and_(
                BoardMember.board_id == Board.id,
                BoardMember.user_id == Notification.recipient_id,
                BoardMember.deleted_at.is_(None),
            ),
        )
        .where(
            Notification.recipient_id == user_id,
            Card.deleted_at.is_(None),
            BoardColumn.deleted_at.is_(None),
            Board.deleted_at.is_(None),
        )
    )


def _items(user_id: uuid.UUID) -> Select:
    return _visible(select(*_ITEM_COLUMNS).join(User, User.id == Notification.actor_id), user_id)


def list_notifications(user_id: uuid.UUID, page: int, per_page: int) -> dict[str, Any]:
    """E27: one page of the caller's visible notifications, newest first, with both counts.

    Read-only: no lock, event or write. The counts cover every page and are present on an empty
    page. They are a separate statement, so they may differ by one concurrent commit from the
    items; the next poll corrects it (R2). The offset is a Python integer, so the largest
    accepted `page` times `per_page` cannot overflow before it reaches the 64-bit OFFSET.
    """
    rows = db.session.execute(
        _items(user_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(per_page)
        .offset((page - 1) * per_page)
    ).all()
    total, unread = db.session.execute(
        _visible(select(func.count(), func.count().filter(Notification.read_at.is_(None))), user_id)
    ).one()
    return {
        "items": [row._asdict() for row in rows],
        "page": page,
        "per_page": per_page,
        "total": total,
        "unread_count": unread,
    }


def mark_read(notification_id: uuid.UUID, user_id: uuid.UUID) -> dict[str, Any]:
    """E28: set `read_at` once on a visible notification of the caller and return the item.

    One conditional update (`read_at IS NULL`), so two concurrent calls commit one value: the
    second waits for the row lock, re-checks the predicate, matches nothing and then reads the
    first value. No board lock. A missing, foreign or hidden ID matches nothing in the select
    either and gives the same 404. If a removal hides the row between the update and the select,
    the rollback undoes the update (R5).
    """
    db.session.execute(
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.recipient_id == user_id,
            Notification.read_at.is_(None),
            Notification.id.in_(_visible(select(Notification.id), user_id).correlate(None)),
        )
        .values(read_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    row = db.session.execute(
        _items(user_id).where(Notification.id == notification_id)
    ).one_or_none()
    if row is None:
        db.session.rollback()
        raise NotFoundError()
    commit_or_rollback()
    return row._asdict()
