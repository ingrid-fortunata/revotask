"""Board analytics for E29 (T14, design DD2 to DD7).

The window is the board's sprint when it has one and the UTC week otherwise (Revision 2, DS7).

Three separate statements, each filtered by the board itself and none joined to another's table,
so a column with many cards or a card with many events cannot multiply another figure (D6).
The read takes no board lock, writes nothing and records no event. `utcnow` is imported by name so
a test can replace it with a fixed clock (R7).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Any

from sqlalchemy import and_, desc, func, select

from app.blueprints.boards.service import BoardAccess, authorize_board
from app.extensions import db
from app.models.base import utcnow
from app.models.board_column import BoardColumn
from app.models.board_event import BoardEvent
from app.models.card import Card
from app.models.user import User

# The four kinds that count as member activity (A1, C36). `entered_done` is left out on purpose:
# it is written beside `card_created` and `card_moved`, so counting it would score one completion
# twice. It feeds `completed_cards` only.
COUNTED_KINDS = ("card_created", "card_moved", "column_reordered", "comment_created")


def week_bounds(now: datetime) -> tuple[datetime, datetime]:
    """Monday 00:00:00 UTC of the week that holds `now`, and the next Monday (exclusive)."""
    now = now.astimezone(UTC)
    start = datetime(now.year, now.month, now.day, tzinfo=UTC) - timedelta(days=now.weekday())
    return start, start + timedelta(days=7)


def board_window(access: BoardAccess, now: datetime) -> tuple[datetime, datetime, str]:
    """The counting window, end exclusive, and its kind: `"sprint"` or `"week"` (C40).

    A sprint runs from `sprint_start` 00:00:00 UTC to the day after `sprint_end` 00:00:00 UTC, so
    both dates count in full. A board without one keeps the UTC week of `now` (C34).
    """
    if access.sprint_start is None or access.sprint_end is None:
        start, end = week_bounds(now)
        return start, end, "week"
    start = datetime.combine(access.sprint_start, time.min, tzinfo=UTC)
    end = datetime.combine(access.sprint_end + timedelta(days=1), time.min, tzinfo=UTC)
    return start, end, "sprint"


def _iso_z(moment: datetime) -> str:
    """ISO 8601 UTC ending in `Z` (A2). `UtcDateTime` writes `+00:00`, so it is not used here."""
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def board_analytics(board_id: uuid.UUID, user_id: uuid.UUID) -> dict[str, Any]:
    """The three aggregates for one board and its sprint or the current UTC week (E29)."""
    access = authorize_board(board_id, user_id)  # 404 for a nonmember or a missing board, no lock
    start, end, window = board_window(access, utcnow())
    in_window = and_(
        BoardEvent.board_id == board_id,
        BoardEvent.occurred_at >= start,
        BoardEvent.occurred_at < end,
    )
    columns = db.session.execute(
        select(BoardColumn.id, BoardColumn.name, func.count(Card.id))
        # The active-card test sits in the join condition, so an empty column keeps its row.
        .outerjoin(Card, and_(Card.column_id == BoardColumn.id, Card.deleted_at.is_(None)))
        .where(BoardColumn.board_id == board_id, BoardColumn.deleted_at.is_(None))
        .group_by(BoardColumn.id, BoardColumn.name, BoardColumn.order)
        .order_by(BoardColumn.order, BoardColumn.id)
    ).all()
    # A card counts only while it still sits in an active Done column (A3 revised): the event says
    # it entered Done this week, the join says it is still there. Moving it out lowers the count.
    completed = db.session.execute(
        select(func.count(func.distinct(BoardEvent.card_id)))
        .join(Card, Card.id == BoardEvent.card_id)
        .join(BoardColumn, BoardColumn.id == Card.column_id)
        .where(
            in_window,
            BoardEvent.kind == "entered_done",
            Card.deleted_at.is_(None),
            BoardColumn.is_done.is_(True),
            BoardColumn.deleted_at.is_(None),
        )
    ).scalar_one()
    # ponytail: kind is filtered after the (board_id, occurred_at) range scan. Add kind to the
    # index only if a board's events in a window (a week, or up to 90 days for a sprint) make the
    # scan measurable.
    activity = db.session.execute(
        select(User.id, User.name, func.count(BoardEvent.id).label("n"))
        .join(User, User.id == BoardEvent.actor_id)
        .where(in_window, BoardEvent.kind.in_(COUNTED_KINDS))
        .group_by(User.id, User.name)
        .order_by(desc("n"), func.lower(User.name), User.id)
    ).all()
    return {
        "week_start": _iso_z(start),
        "week_end": _iso_z(end),
        "window": window,
        "cards_per_column": [
            {"column_id": row[0], "name": row[1], "count": row[2]} for row in columns
        ],
        "completed_cards": completed,
        "member_activity": [
            {"user_id": row[0], "name": row[1], "count": row[2]} for row in activity
        ],
    }
