"""Helpers shared by the comments tests (E23–E26).

Rows are created through `board_tracker` (users, board, column, card) or inserted directly with
`make_comment_row`. The tracker's cleanup removes comments by tracked card and tracked author, so
no test needs its own teardown (Requirement 9.6). Readers open their own app context and remove
the session afterwards, so they never share a transaction with a request under test.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select

from app.extensions import db
from app.models.base import utcnow
from app.models.card_comment import CardComment
from tests.kanban_helpers import Kanban, _read, board_version, column_rows, events


@dataclass(frozen=True)
class CommentWorld:
    """A board with an admin and a member, one column, one card and one comment by the member."""

    kanban: Kanban
    member: Any
    column: uuid.UUID
    card: uuid.UUID
    comment: uuid.UUID


def make_comment_row(
    app,
    card_id: uuid.UUID,
    author_id: uuid.UUID,
    content: str = "Seed comment",
    *,
    created_at: datetime | None = None,
) -> uuid.UUID:
    """Insert a comment directly. Both timestamps are the same instant, like E24 writes them."""
    from tests.kanban_helpers import _write

    holder: dict[str, uuid.UUID] = {}

    def work() -> None:
        moment = created_at or utcnow()
        row = CardComment(
            card_id=card_id,
            author_id=author_id,
            content=content,
            created_at=moment,
            updated_at=moment,
        )
        db.session.add(row)
        db.session.flush()
        holder["id"] = row.id

    _write(app, work)
    return holder["id"]


def seed_comment_world(kanban: Kanban) -> CommentWorld:
    tracker = kanban.tracker
    member = kanban.add_member("member", name="Mia")
    column = tracker.make_column(kanban.board_id, "Todo", order=1024.0)
    card = tracker.make_card(column, "Card", order=1024.0)
    comment = make_comment_row(kanban.app, card, member.id, "First comment")
    return CommentWorld(kanban=kanban, member=member, column=column, card=card, comment=comment)


def post_comment(client, kanban: Kanban, card_id, user: Any | None = None, **body) -> Any:
    return client.post(f"/api/cards/{card_id}/comments", json=body, headers=kanban.headers(user))


def comment_rows(app, card_id: uuid.UUID, *, include_deleted: bool = False) -> list[dict]:
    """Comments of a card as dictionaries, sorted by `(created_at, id)`."""

    def work():
        statement = select(CardComment).where(CardComment.card_id == card_id)
        if not include_deleted:
            statement = statement.where(CardComment.deleted_at.is_(None))
        rows = db.session.scalars(statement.order_by(CardComment.created_at, CardComment.id)).all()
        return [
            {
                "id": r.id,
                "card_id": r.card_id,
                "author_id": r.author_id,
                "content": r.content,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
                "deleted_at": r.deleted_at,
            }
            for r in rows
        ]

    return _read(app, work)


def comment_row(app, comment_id: uuid.UUID) -> dict:
    def work():
        row = db.session.get(CardComment, comment_id)
        return {
            "id": row.id,
            "card_id": row.card_id,
            "author_id": row.author_id,
            "content": row.content,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
            "deleted_at": row.deleted_at,
        }

    return _read(app, work)


def comment_kinds(app, board_id: uuid.UUID) -> list[str]:
    return [kind for kind, _actor, _card in events(app, board_id)]


def comment_snapshot(app, board_id: uuid.UUID, card_id: uuid.UUID) -> tuple:
    """Everything a rejected comment request must leave alone."""
    comments = [
        (r["id"], r["content"], r["updated_at"], r["deleted_at"])
        for r in comment_rows(app, card_id, include_deleted=True)
    ]
    columns = [(r["id"], r["order"], r["deleted_at"]) for r in column_rows(app, board_id)]
    return (comments, board_version(app, board_id), events(app, board_id), columns)


def comment_requests(w: CommentWorld) -> dict[str, Callable[..., Any]]:
    """One valid request for each of E23 to E26, as `fn(client, headers) -> response`.

    E25 and E26 address the member's comment, so only the member (the author) may succeed.
    """
    return {
        "E23": lambda c, h: c.get(f"/api/cards/{w.card}/comments", headers=h),
        "E24": lambda c, h: c.post(
            f"/api/cards/{w.card}/comments", json={"content": "New comment"}, headers=h
        ),
        "E25": lambda c, h: c.patch(
            f"/api/comments/{w.comment}", json={"content": "Edited text"}, headers=h
        ),
        "E26": lambda c, h: c.delete(f"/api/comments/{w.comment}", headers=h),
    }


def invalid_comment_requests(w: CommentWorld) -> dict[str, Callable[..., Any]]:
    """A request with a body that fails shape validation, for E24 and E25."""
    return {
        "E24": lambda c, h: c.post(
            f"/api/cards/{w.card}/comments", json={"content": ""}, headers=h
        ),
        "E25": lambda c, h: c.patch(f"/api/comments/{w.comment}", json={"x": 1}, headers=h),
    }
