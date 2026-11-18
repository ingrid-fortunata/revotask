"""Helpers shared by the analytics tests (T14, E29).

Boards, users, columns and cards come from `board_tracker` and `make_kanban`, whose cleanup
already removes `board_events` by tracked board, card and actor, so no test needs its own
teardown. Events that a test inserts directly use only tracked IDs. Readers open their own app
context and remove the session afterwards. `freeze` replaces the one time source of the analytics
service (design R7), so no test depends on the real date.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, update

from app.extensions import db
from app.models.board import Board
from app.models.board_event import BoardEvent
from tests.kanban_helpers import Kanban, _read, _write

DATA_KEYS = {
    "week_start",
    "week_end",
    "window",
    "cards_per_column",
    "completed_cards",
    "member_activity",
}
COLUMN_KEYS = {"column_id", "name", "count"}
ACTIVITY_KEYS = {"user_id", "name", "count"}

# A Saturday. Its UTC week runs from Monday 2026-11-09 00:00:00Z to 2026-11-16 00:00:00Z.
SATURDAY = "2026-11-14T12:00:00+00:00"
WEEK_START = datetime.fromisoformat("2026-11-09T00:00:00+00:00")
WEEK_END = datetime.fromisoformat("2026-11-16T00:00:00+00:00")


def freeze(monkeypatch, iso: str = SATURDAY) -> datetime:
    """Replace the analytics clock with a fixed moment. A non-UTC offset is allowed."""
    moment = datetime.fromisoformat(iso)
    monkeypatch.setattr("app.blueprints.analytics.service.utcnow", lambda: moment)
    return moment


def seed_events(
    app, board_id: uuid.UUID, rows: list[tuple[str, uuid.UUID, uuid.UUID | None, datetime]]
) -> None:
    """Insert `(kind, actor_id, card_id, occurred_at)` rows. IDs must be tracked by the test."""

    def work() -> None:
        db.session.add_all(
            BoardEvent(board_id=board_id, actor_id=actor, card_id=card, kind=kind, occurred_at=at)
            for kind, actor, card, at in rows
        )

    _write(app, work)


def get_analytics(
    client,
    kanban: Kanban,
    *,
    user: Any | None = None,
    board_id: uuid.UUID | str | None = None,
    query: str = "",
):
    target = kanban.board_id if board_id is None else board_id
    return client.get(f"/api/boards/{target}/analytics{query}", headers=kanban.headers(user))


def analytics_data(client, kanban: Kanban, **kwargs) -> dict:
    response = get_analytics(client, kanban, **kwargs)
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]


def sprint_board(app, board_id: uuid.UUID, start: str | None, end: str | None) -> None:
    """Set or clear a board's sprint directly. `start` and `end` are `YYYY-MM-DD` or None."""
    values = {
        "sprint_start": datetime.fromisoformat(start).date() if start else None,
        "sprint_end": datetime.fromisoformat(end).date() if end else None,
    }
    _write(
        app, lambda: db.session.execute(update(Board).where(Board.id == board_id).values(**values))
    )


def event_count(app, board_id: uuid.UUID) -> int:
    """How many `board_events` rows a board has. A sprint edit must not change it."""
    return _read(
        app,
        lambda: db.session.scalar(
            select(func.count()).select_from(BoardEvent).where(BoardEvent.board_id == board_id)
        ),
    )
