"""Helpers shared by the notification tests (T13, E27 and E28 and the E17, E18 and E24 writers).

Users, the board, the column and the card come from `board_tracker`, whose cleanup already
removes notifications by tracked board, card, recipient and actor, so no test needs its own
teardown. Rows that a test inserts directly use only tracked IDs. Readers open their own app
context and remove the session afterwards, so they never share a transaction with a request
under test.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import delete, func, select, update

from app.extensions import db
from app.models.board_event import BoardEvent
from app.models.card import Card
from app.models.card_comment import CardComment
from app.models.notification import Notification
from tests.kanban_helpers import Kanban, _read, _write, board_version

ITEM_KEYS = {
    "id",
    "kind",
    "board_id",
    "card_id",
    "actor_id",
    "actor_name",
    "board_name",
    "card_title",
    "created_at",
    "read_at",
}


@dataclass(frozen=True)
class NotifyWorld:
    """A board with an admin and two members (Ana and Ben), one column and one unassigned card."""

    kanban: Kanban
    ana: Any
    ben: Any
    column: uuid.UUID
    card: uuid.UUID


def seed_world(kanban: Kanban, *, assignee: Any | None = None) -> NotifyWorld:
    tracker = kanban.tracker
    ana = kanban.add_member("member", name="Ana")
    ben = kanban.add_member("member", name="Ben")
    column = tracker.make_column(kanban.board_id, "Todo", order=1024.0)
    card = tracker.make_card(
        column, "Fix login", assignee_id=assignee.id if assignee else None, order=1024.0
    )
    return NotifyWorld(kanban=kanban, ana=ana, ben=ben, column=column, card=card)


def _as_dict(row: Notification) -> dict[str, Any]:
    return {
        "id": row.id,
        "recipient_id": row.recipient_id,
        "actor_id": row.actor_id,
        "board_id": row.board_id,
        "card_id": row.card_id,
        "kind": row.kind,
        "created_at": row.created_at,
        "read_at": row.read_at,
    }


def rows(app, recipient_id: uuid.UUID | None = None, *, card_id: uuid.UUID | None = None) -> list:
    """Stored notifications, optionally of one recipient or one card, oldest first."""

    def work() -> list[dict[str, Any]]:
        stmt = select(Notification).order_by(Notification.created_at, Notification.id)
        if recipient_id is not None:
            stmt = stmt.where(Notification.recipient_id == recipient_id)
        if card_id is not None:
            stmt = stmt.where(Notification.card_id == card_id)
        return [_as_dict(row) for row in db.session.scalars(stmt)]

    return _read(app, work)


def board_rows(app, board_id: uuid.UUID) -> list[dict[str, Any]]:
    def work() -> list[dict[str, Any]]:
        stmt = select(Notification).where(Notification.board_id == board_id)
        return [_as_dict(row) for row in db.session.scalars(stmt.order_by(Notification.id))]

    return _read(app, work)


def insert_notification(
    app,
    recipient_id: uuid.UUID,
    actor_id: uuid.UUID,
    board_id: uuid.UUID,
    card_id: uuid.UUID,
    *,
    kind: str = "assigned",
    created_at: datetime | None = None,
    read_at: datetime | None = None,
) -> uuid.UUID:
    """Insert one notification directly, for list and read tests that need exact timestamps."""
    holder: dict[str, uuid.UUID] = {}

    def work() -> None:
        row = Notification(
            recipient_id=recipient_id,
            actor_id=actor_id,
            board_id=board_id,
            card_id=card_id,
            kind=kind,
            read_at=read_at,
        )
        if created_at is not None:
            row.created_at = created_at
        db.session.add(row)
        db.session.flush()
        holder["id"] = row.id

    _write(app, work)
    return holder["id"]


def set_read_at(app, notification_id: uuid.UUID, read_at: datetime | None) -> None:
    _write(
        app,
        lambda: db.session.execute(
            update(Notification).where(Notification.id == notification_id).values(read_at=read_at)
        ),
    )


def clear_notifications(app, board_id: uuid.UUID) -> None:
    _write(
        app,
        lambda: db.session.execute(delete(Notification).where(Notification.board_id == board_id)),
    )


def set_assignee(app, card_id: uuid.UUID, assignee_id: uuid.UUID | None) -> None:
    """Change the assignee without a request, so no notification is written."""
    _write(
        app,
        lambda: db.session.execute(
            update(Card).where(Card.id == card_id).values(assignee_id=assignee_id)
        ),
    )


def assign(client, kanban: Kanban, card_id, assignee_id, by: Any | None = None, **extra):
    """E18 with an assignee (a user ID, or None to clear it)."""
    body: dict[str, Any] = {"assignee_id": str(assignee_id) if assignee_id else None, **extra}
    return client.patch(f"/api/cards/{card_id}", json=body, headers=kanban.headers(by))


def create_card(client, kanban: Kanban, column_id, by: Any | None = None, **body):
    body.setdefault("title", "New card")
    return client.post(f"/api/columns/{column_id}/cards", json=body, headers=kanban.headers(by))


def comment(client, kanban: Kanban, card_id, by: Any | None = None, content: str = "Hello"):
    return client.post(
        f"/api/cards/{card_id}/comments", json={"content": content}, headers=kanban.headers(by)
    )


def list_as(client, kanban: Kanban, user: Any, query: str = ""):
    return client.get(f"/api/notifications{query}", headers=kanban.headers(user))


def mark_as(client, kanban: Kanban, user: Any, notification_id):
    return client.patch(f"/api/notifications/{notification_id}/read", headers=kanban.headers(user))


def snapshot(app, board_id: uuid.UUID) -> tuple:
    """Cards, comments, events, notifications and the board version, to compare across a request."""

    def work() -> tuple:
        from app.models.board_column import BoardColumn

        card_state = sorted(
            (str(row.id), row.title, str(row.assignee_id), row.deleted_at is not None)
            for row in db.session.scalars(
                select(Card)
                .join(BoardColumn, BoardColumn.id == Card.column_id)
                .where(BoardColumn.board_id == board_id)
            )
        )
        comments = db.session.scalar(
            select(func.count())
            .select_from(CardComment)
            .join(Card, Card.id == CardComment.card_id)
            .join(BoardColumn, BoardColumn.id == Card.column_id)
            .where(BoardColumn.board_id == board_id)
        )
        events = db.session.scalar(
            select(func.count()).select_from(BoardEvent).where(BoardEvent.board_id == board_id)
        )
        notes = db.session.scalar(
            select(func.count()).select_from(Notification).where(Notification.board_id == board_id)
        )
        return (card_state, comments, events, notes)

    return (*_read(app, work), board_version(app, board_id))
