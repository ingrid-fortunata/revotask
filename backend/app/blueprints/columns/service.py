"""Column services for E13–E16 (BE02, BE04, BE06, DD1).

Every write follows the check order of the design: resolve the board from the addressed column,
`authorize_board(..., lock=True)` (404 for a nonmember, lock, recheck, 403 for a Member), reload
the column under the lock, compare the version where one is sent, validate the destination, then
write, bump the version, record events and commit once. Services return plain dictionaries.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.blueprints.boards.service import authorize_board, commit_or_rollback
from app.exceptions import (
    InvalidDestinationError,
    NotFoundError,
    PositionConflictError,
    StateConflictError,
)
from app.extensions import db
from app.models.base import utcnow
from app.models.board_column import BoardColumn
from app.models.card import Card
from app.positions import (
    allocate_order,
    bump_position_version,
    is_unchanged,
    rebalanced_orders,
    record_event,
)

DONE_UNIQUE_INDEX = "uq_board_columns_board_id_active_done"
SECOND_DONE_MESSAGE = "A board can have only one Done column."
NONEMPTY_DONE_MESSAGE = "Move or delete the cards in this column before changing its Done flag."
NONEMPTY_DELETE_MESSAGE = "Move or delete the cards in this column before deleting it."


def _plain(column: BoardColumn) -> dict[str, Any]:
    return {
        "id": column.id,
        "board_id": column.board_id,
        "name": column.name,
        "is_done": column.is_done,
        "order": column.order,
    }


def board_of_column(column_id: uuid.UUID) -> uuid.UUID:
    """The board of an active column, or NotFoundError. Access is checked next, not here."""
    board_id = db.session.scalar(
        select(BoardColumn.board_id).where(
            BoardColumn.id == column_id, BoardColumn.deleted_at.is_(None)
        )
    )
    if board_id is None:
        raise NotFoundError()
    return board_id


def load_column(column_id: uuid.UUID, board_id: uuid.UUID) -> BoardColumn:
    """Reload one active column of this board with its current values, or NotFoundError.

    `populate_existing` replaces anything cached in the session, so a change committed by another
    transaction while this request waited for the board lock is seen (DD1).
    """
    column = db.session.scalar(
        select(BoardColumn)
        .where(
            BoardColumn.id == column_id,
            BoardColumn.board_id == board_id,
            BoardColumn.deleted_at.is_(None),
        )
        .execution_options(populate_existing=True)
    )
    if column is None:
        raise NotFoundError()
    return column


def _active_columns(board_id: uuid.UUID) -> list[Any]:
    return db.session.execute(
        select(BoardColumn.id, BoardColumn.order)
        .where(BoardColumn.board_id == board_id, BoardColumn.deleted_at.is_(None))
        .order_by(BoardColumn.order, BoardColumn.id)
    ).all()


def _plain_columns(board_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = db.session.execute(
        select(
            BoardColumn.id,
            BoardColumn.board_id,
            BoardColumn.name,
            BoardColumn.is_done,
            BoardColumn.order,
        )
        .where(BoardColumn.board_id == board_id, BoardColumn.deleted_at.is_(None))
        .order_by(BoardColumn.order, BoardColumn.id)
    ).all()
    return [row._asdict() for row in rows]


def _has_active_cards(column_id: uuid.UUID) -> bool:
    return (
        db.session.scalar(
            select(func.count())
            .select_from(Card)
            .where(Card.column_id == column_id, Card.deleted_at.is_(None))
        )
        > 0
    )


def _other_done_exists(board_id: uuid.UUID, column_id: uuid.UUID | None) -> bool:
    statement = (
        select(func.count())
        .select_from(BoardColumn)
        .where(
            BoardColumn.board_id == board_id,
            BoardColumn.is_done.is_(True),
            BoardColumn.deleted_at.is_(None),
        )
    )
    if column_id is not None:
        statement = statement.where(BoardColumn.id != column_id)
    return db.session.scalar(statement) > 0


def _write_orders(ids_in_order: list[uuid.UUID]) -> None:
    """Rebalance: give the columns 1024, 2048, … in the given sequence (primary-key bulk update)."""
    db.session.execute(
        update(BoardColumn),
        [
            {"id": column_id, "order": order}
            for column_id, order in zip(
                ids_in_order, rebalanced_orders(len(ids_in_order)), strict=True
            )
        ],
    )


def _is_done_conflict(exc: IntegrityError) -> bool:
    diag = getattr(exc.orig, "diag", None)
    return (
        getattr(exc.orig, "sqlstate", None) == "23505"
        and getattr(diag, "constraint_name", None) == DONE_UNIQUE_INDEX
    )


def _commit_done_aware() -> None:
    """Commit. A duplicate active Done column that slipped past the check becomes a 409 (DD6)."""
    try:
        commit_or_rollback()
    except IntegrityError as exc:
        if _is_done_conflict(exc):
            raise StateConflictError(SECOND_DONE_MESSAGE) from None
        raise


def create_column(board_id: uuid.UUID, user_id: uuid.UUID, name: str, is_done: bool) -> dict:
    """Append an active column to the board as its admin (E13)."""
    authorize_board(board_id, user_id, role="admin", lock=True)
    if is_done and _other_done_exists(board_id, None):
        raise StateConflictError(SECOND_DONE_MESSAGE)
    existing = _active_columns(board_id)
    order = allocate_order([row.order for row in existing], len(existing))
    if order is None:
        _write_orders([row.id for row in existing])
        order = rebalanced_orders(len(existing) + 1)[-1]
    column = BoardColumn(board_id=board_id, name=name, is_done=is_done, order=order)
    db.session.add(column)
    try:
        db.session.flush()
    except IntegrityError as exc:
        db.session.rollback()
        if _is_done_conflict(exc):
            raise StateConflictError(SECOND_DONE_MESSAGE) from None
        raise
    created = _plain(column)
    version = bump_position_version(board_id)
    _commit_done_aware()
    return {"column": created, "position_version": version}


def update_column(column_id: uuid.UUID, user_id: uuid.UUID, changes: dict[str, Any]) -> dict:
    """Rename a column and/or change its Done flag as admin (E14, K9). No version change.

    The whole request is atomic: a rejected Done change also leaves the name unchanged.
    """
    board_id = board_of_column(column_id)
    authorize_board(board_id, user_id, role="admin", lock=True)
    column = load_column(column_id, board_id)
    if "is_done" in changes and changes["is_done"] != column.is_done:
        if _has_active_cards(column_id):
            raise StateConflictError(NONEMPTY_DONE_MESSAGE)
        if changes["is_done"] and _other_done_exists(board_id, column_id):
            raise StateConflictError(SECOND_DONE_MESSAGE)
        column.is_done = changes["is_done"]
    if "name" in changes:
        column.name = changes["name"]
    updated = _plain(column)
    _commit_done_aware()
    return updated


def delete_column(column_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    """Soft-delete an empty column as admin and return the new version (E15)."""
    board_id = board_of_column(column_id)
    authorize_board(board_id, user_id, role="admin", lock=True)
    column = load_column(column_id, board_id)
    if _has_active_cards(column_id):
        raise StateConflictError(NONEMPTY_DELETE_MESSAGE)
    column.deleted_at = utcnow()
    version = bump_position_version(board_id)
    commit_or_rollback()
    return {"position_version": version}


def reorder_columns(
    board_id: uuid.UUID,
    user_id: uuid.UUID,
    column_id: uuid.UUID,
    before_column_id: uuid.UUID | None,
    expected_version: int,
) -> dict:
    """Place a column before an anchor (or at the end) as admin, under the board lock (E16, D4).

    Order of checks: access (404, 403), lock, the moved column under the lock (404, L1), the
    version (409), then the anchor (400). A position that does not change writes nothing.
    """
    access = authorize_board(board_id, user_id, role="admin", lock=True)
    moved = load_column(column_id, board_id)
    if expected_version != access.position_version:
        raise PositionConflictError()
    rows = _active_columns(board_id)
    ids = [row.id for row in rows]
    if before_column_id == column_id or (
        before_column_id is not None and before_column_id not in ids
    ):
        raise InvalidDestinationError()
    if is_unchanged(ids, column_id, before_column_id):
        return {"columns": _plain_columns(board_id), "position_version": access.position_version}

    siblings = [row for row in rows if row.id != column_id]
    index = (
        len(siblings)
        if before_column_id is None
        else [row.id for row in siblings].index(before_column_id)
    )
    order = allocate_order([row.order for row in siblings], index)
    if order is None:
        sequence = [row.id for row in siblings]
        sequence.insert(index, column_id)
        _write_orders(sequence)
    else:
        moved.order = order
    version = bump_position_version(board_id)
    record_event(board_id, user_id, "column_reordered")
    commit_or_rollback()
    return {"columns": _plain_columns(board_id), "position_version": version}
