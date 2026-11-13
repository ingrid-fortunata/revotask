"""Ordering, version and audit helpers shared by the columns and cards services (D4, DD3).

Columns and cards use one ordering algorithm, so it lives here once. Nothing in this module
commits. The calling service holds the board lock and commits once at the end, so the order, the
version and the events of one request are written in one transaction (BE06).
"""

from __future__ import annotations

import math
import uuid
from collections.abc import Sequence

from sqlalchemy import update

from app.exceptions import StateConflictError
from app.extensions import db
from app.models.base import utcnow
from app.models.board import Board
from app.models.board_event import BoardEvent

STEP = 1024.0

# `boards.position_version` is a PostgreSQL INTEGER. The same bound limits E16 and E20 input.
MAX_POSITION_VERSION = 2_147_483_647

VERSION_LIMIT_MESSAGE = "This board has reached its change limit."


def allocate_order(siblings: Sequence[float], index: int) -> float | None:
    """Return the order for an item inserted at `index` among `siblings`, or None to rebalance.

    `siblings` holds the order values of the destination list without the moving row, sorted by
    `(order, id)`. An index at or past the end appends: last + 1024, or 1024 for an empty list.
    Index 0 takes half of the first value, and any other index takes the midpoint of its two
    neighbors. A candidate that is not finite, not positive or not strictly between its neighbors
    (equal neighbors, or precision exhausted) returns None, and the caller rebalances (D4 step 3).
    """
    if not siblings:
        return STEP
    if index >= len(siblings):
        lo, hi = siblings[-1], math.inf
        candidate = lo + STEP
    elif index <= 0:
        lo, hi = 0.0, siblings[0]
        candidate = hi / 2
    else:
        lo, hi = siblings[index - 1], siblings[index]
        candidate = (lo + hi) / 2
    if math.isfinite(candidate) and candidate > 0 and lo < candidate < hi:
        return candidate
    return None


def rebalanced_orders(count: int) -> list[float]:
    """Order values 1024, 2048, … for `count` items in their final sequence."""
    return [STEP * (position + 1) for position in range(count)]


def is_unchanged(
    current_ids: Sequence[uuid.UUID], moved_id: uuid.UUID, anchor_id: uuid.UUID | None
) -> bool:
    """True when the moved item already sits where the request puts it (K6).

    `current_ids` is the destination list in order and includes the moved item, so it applies to a
    move inside one list only. A null anchor means the end, so the item must already be last.
    Otherwise the anchor must be the item's next sibling.
    """
    if moved_id not in current_ids:
        return False
    position = current_ids.index(moved_id)
    if anchor_id is None:
        return position == len(current_ids) - 1
    return position + 1 < len(current_ids) and current_ids[position + 1] == anchor_id


def bump_position_version(board_id: uuid.UUID) -> int:
    """Add 1 to the board's `position_version` and return the new value.

    The update only matches below the INTEGER ceiling. At the ceiling it raises StateConflictError,
    the caller's transaction rolls back and nothing is written (DD12).
    """
    new_version = db.session.execute(
        update(Board)
        .where(Board.id == board_id, Board.position_version < MAX_POSITION_VERSION)
        .values(position_version=Board.position_version + 1)
        .returning(Board.position_version)
        .execution_options(synchronize_session=False)
    ).scalar_one_or_none()
    if new_version is None:
        raise StateConflictError(VERSION_LIMIT_MESSAGE)
    return new_version


def record_event(
    board_id: uuid.UUID, actor_id: uuid.UUID, kind: str, card_id: uuid.UUID | None = None
) -> None:
    """Add one audit event to the session. The caller commits it with the change itself."""
    db.session.add(
        BoardEvent(
            board_id=board_id, actor_id=actor_id, card_id=card_id, kind=kind, occurred_at=utcnow()
        )
    )
