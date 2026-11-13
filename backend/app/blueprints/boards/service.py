"""Board authorization, transactions and board services for E05–E09 (BE02, BE04, BE05, BE06).

Authorization is one function, so every board route applies the same rules (DD1). Writes use
check, lock, recheck (DD2): the first check reads the caller's membership, the lock serializes
board writes, and the recheck runs in a new statement so a membership removed while this
request waited for the lock is seen as removed.

Services take the caller's user ID and return plain dictionaries. Routes pass those dictionaries
to explicit schemas, so no ORM object reaches a response (DD9).
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import case, select, update
from sqlalchemy.engine import Row
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.exceptions import (
    NotFoundError,
    StateConflictError,
    UnauthorizedBoardAccessError,
    UserNotFoundError,
)
from app.extensions import db
from app.models.base import utcnow
from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.board_member import BoardMember
from app.models.card import Card
from app.models.user import User


@dataclass(frozen=True)
class BoardAccess:
    """The caller's verified access to one active board, with the board fields it reads."""

    board_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    name: str
    position_version: int


def _active_access(board_id: uuid.UUID, user_id: uuid.UUID) -> Row[Any] | None:
    """Return the caller's role and the board fields, or None when there is no active membership.

    One statement selects column values, not ORM entities, so each call reads the database again
    instead of returning an object cached in the session.
    """
    return db.session.execute(
        select(BoardMember.role, Board.name, Board.position_version)
        .join(Board, Board.id == BoardMember.board_id)
        .where(
            BoardMember.board_id == board_id,
            BoardMember.user_id == user_id,
            BoardMember.deleted_at.is_(None),
            Board.deleted_at.is_(None),
        )
    ).one_or_none()


def _lock_board(board_id: uuid.UUID) -> None:
    """Take the board row lock (SELECT ... FOR UPDATE) until the transaction ends."""
    db.session.scalar(select(Board.id).where(Board.id == board_id).with_for_update())


def authorize_board(
    board_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    role: str | None = None,
    lock: bool = False,
) -> BoardAccess:
    """Confirm the caller is an active participant of an active board, optionally with a role.

    A missing board, a deleted board, a nonmember and a removed member all raise NotFoundError
    (404). A participant whose role differs from `role` raises UnauthorizedBoardAccessError (403).
    With `lock=True` the board row is locked and membership is checked again after the lock, in
    a separate statement. Callers must pass `lock=True` before any write.
    """
    access = _active_access(board_id, user_id)
    if access is None:
        raise NotFoundError()
    if lock:
        _lock_board(board_id)
        access = _active_access(board_id, user_id)
        if access is None:
            raise NotFoundError()
    if role is not None and access.role != role:
        raise UnauthorizedBoardAccessError()
    return BoardAccess(
        board_id=board_id,
        user_id=user_id,
        role=access.role,
        name=access.name,
        position_version=access.position_version,
    )


def commit_or_rollback() -> None:
    """Commit the transaction. Roll back and re-raise on any SQLAlchemy failure (BE06)."""
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        raise


def _summary(board_id: uuid.UUID, name: str, role: str, position_version: int) -> dict:
    """The BoardSummary fields for one board as seen by one caller."""
    return {"id": board_id, "name": name, "role": role, "position_version": position_version}


def create_board(user_id: uuid.UUID, name: str) -> dict:
    """Create an active board and the caller's admin membership in one transaction (E06).

    Duplicate names are accepted (DD16).
    """
    board = Board(name=name, creator_id=user_id)
    board.members.append(BoardMember(user_id=user_id, role="admin"))
    db.session.add(board)
    commit_or_rollback()
    return _summary(board.id, board.name, "admin", board.position_version)


def list_boards(user_id: uuid.UUID) -> list[dict]:
    """Return the active boards on which the caller has an active membership (E05).

    Sorted by name in the database collation, then by ID (Requirements 1.3, R11).
    """
    rows = db.session.execute(
        select(Board.id, Board.name, BoardMember.role, Board.position_version)
        .join(BoardMember, BoardMember.board_id == Board.id)
        .where(
            BoardMember.user_id == user_id,
            BoardMember.deleted_at.is_(None),
            Board.deleted_at.is_(None),
        )
        .order_by(Board.name, Board.id)
    ).all()
    return [_summary(row.id, row.name, row.role, row.position_version) for row in rows]


def get_board_detail(board_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    """Return the board with its active columns and nested active cards (E07, DD10).

    Three statements run whatever the board contains: the membership and board check, then the
    columns and the cards from `read_columns`. Each read excludes soft-deleted rows and rows under
    a deleted column. With no columns, `columns` is an empty list.
    """
    access = authorize_board(board_id, user_id)
    columns = read_columns(board_id)
    return _summary(board_id, access.name, access.role, access.position_version) | {
        "columns": columns
    }


def read_columns(board_id: uuid.UUID, column_ids: Sequence[uuid.UUID] | None = None) -> list[dict]:
    """Return the board's active columns with their active cards, in `(order, id)` order.

    Two statements run whatever the board contains. With `column_ids` only those columns (and their
    cards) are returned, which is how E20 sends the affected lists. The caller has already
    authorized access to `board_id`. Rows of soft-deleted columns and soft-deleted cards are never
    read.
    """
    column_filter = [BoardColumn.board_id == board_id, BoardColumn.deleted_at.is_(None)]
    card_filter = [
        BoardColumn.board_id == board_id,
        BoardColumn.deleted_at.is_(None),
        Card.deleted_at.is_(None),
    ]
    if column_ids is not None:
        column_filter.append(BoardColumn.id.in_(column_ids))
        card_filter.append(BoardColumn.id.in_(column_ids))
    column_rows = db.session.execute(
        select(BoardColumn.id, BoardColumn.name, BoardColumn.is_done, BoardColumn.order)
        .where(*column_filter)
        .order_by(BoardColumn.order, BoardColumn.id)
    ).all()
    card_rows = db.session.execute(
        select(
            Card.id,
            Card.column_id,
            Card.title,
            Card.description,
            Card.assignee_id,
            User.name.label("assignee_name"),
            Card.order,
        )
        .join(BoardColumn, BoardColumn.id == Card.column_id)
        .outerjoin(User, User.id == Card.assignee_id)
        .where(*card_filter)
        .order_by(Card.order, Card.id)
    ).all()

    columns: dict[uuid.UUID, dict] = {
        row.id: {
            "id": row.id,
            "board_id": board_id,
            "name": row.name,
            "is_done": row.is_done,
            "order": row.order,
            "cards": [],
        }
        for row in column_rows
    }
    for card in card_rows:
        columns[card.column_id]["cards"].append(
            {
                "id": card.id,
                "column_id": card.column_id,
                "title": card.title,
                "description": card.description,
                "assignee_id": card.assignee_id,
                "assignee_name": card.assignee_name,
                "order": card.order,
            }
        )
    return list(columns.values())


def rename_board(board_id: uuid.UUID, user_id: uuid.UUID, name: str) -> dict:
    """Rename an active board as its admin under the board lock (E08)."""
    access = authorize_board(board_id, user_id, role="admin", lock=True)
    db.session.execute(update(Board).where(Board.id == board_id).values(name=name))
    commit_or_rollback()
    return _summary(board_id, name, access.role, access.position_version)


def delete_board(board_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Soft-delete an active board as its admin under the board lock (E09).

    Columns, cards and memberships stay in place. Parent filters hide them after this write.
    """
    authorize_board(board_id, user_id, role="admin", lock=True)
    db.session.execute(update(Board).where(Board.id == board_id).values(deleted_at=utcnow()))
    commit_or_rollback()


ALREADY_MEMBER_MESSAGE = "This user is already a member of the board."
ADMIN_REMOVAL_MESSAGE = "The board admin cannot be removed."
BOARD_MEMBER_UNIQUE_CONSTRAINT = "uq_board_members_board_id_user_id"


def _is_membership_conflict(exc: IntegrityError) -> bool:
    """True when the insert failed on the (board, user) unique constraint (SQLSTATE 23505)."""
    diag = getattr(exc.orig, "diag", None)
    return (
        getattr(exc.orig, "sqlstate", None) == "23505"
        and getattr(diag, "constraint_name", None) == BOARD_MEMBER_UNIQUE_CONSTRAINT
    )


def _membership_row(
    board_id: uuid.UUID, user_id: uuid.UUID, *, active_only: bool
) -> BoardMember | None:
    """Read one membership row with its current column values, not a cached ORM copy.

    `populate_existing` replaces any stale attributes already in the session, so a row changed by
    another transaction after the board lock is read as it is now.
    """
    statement = select(BoardMember).where(
        BoardMember.board_id == board_id, BoardMember.user_id == user_id
    )
    if active_only:
        statement = statement.where(BoardMember.deleted_at.is_(None))
    return db.session.scalar(statement.execution_options(populate_existing=True))


def list_members(board_id: uuid.UUID, user_id: uuid.UUID) -> list[dict]:
    """Return the active participants of a board for any participant (E10).

    Order: the admin first, then name in the database collation, then `user_id` (R6, R11).
    """
    authorize_board(board_id, user_id)
    rows = db.session.execute(
        select(BoardMember.user_id, User.name, BoardMember.role)
        .join(User, User.id == BoardMember.user_id)
        .where(BoardMember.board_id == board_id, BoardMember.deleted_at.is_(None))
        .order_by(
            case((BoardMember.role == "admin", 0), else_=1),
            User.name,
            BoardMember.user_id,
        )
    ).all()
    return [{"user_id": row.user_id, "name": row.name, "role": row.role} for row in rows]


def add_member(board_id: uuid.UUID, user_id: uuid.UUID, email: str) -> dict:
    """Add a registered user to the board as `member` (E11, DD4, DD8).

    The admin check and board lock run before the user lookup, so an unregistered email is only
    reported to an admin of this board. `email` is already trimmed and lowercased by the schema.
    """
    authorize_board(board_id, user_id, role="admin", lock=True)
    target = db.session.scalar(select(User).where(User.email == email))
    if target is None:
        raise UserNotFoundError()
    target_id, target_name = target.id, target.name

    row = _membership_row(board_id, target_id, active_only=False)
    if row is not None and row.deleted_at is None:
        raise StateConflictError(ALREADY_MEMBER_MESSAGE)
    if row is None:
        db.session.add(BoardMember(board_id=board_id, user_id=target_id, role="member"))
    else:
        # Reactivate the same row (DD4). The board is never removed as admin, so the role is member.
        row.deleted_at = None
        row.role = "member"
    try:
        commit_or_rollback()
    except IntegrityError as exc:
        # Backstop for a duplicate insert the board lock did not serialize (E11, 409).
        if _is_membership_conflict(exc):
            raise StateConflictError(ALREADY_MEMBER_MESSAGE) from None
        raise
    return {"user_id": target_id, "name": target_name, "role": "member"}


def remove_member(board_id: uuid.UUID, user_id: uuid.UUID, target_id: uuid.UUID) -> None:
    """Soft-delete a member and clear that user's card assignments on this board (E12, DD6).

    Under the board lock, the membership is soft-deleted and every active card assigned to the
    target in an active column of this board is unassigned. Both writes commit together (DD6, R1).
    Cards on other boards, soft-deleted cards and cards in soft-deleted columns keep their
    assignments (Requirements 5.9, kanban review L7).
    """
    authorize_board(board_id, user_id, role="admin", lock=True)
    row = _membership_row(board_id, target_id, active_only=True)
    if row is None:
        raise NotFoundError()
    if row.role == "admin":
        raise StateConflictError(ADMIN_REMOVAL_MESSAGE)
    row.deleted_at = utcnow()
    db.session.execute(
        update(Card)
        .where(
            Card.assignee_id == target_id,
            Card.deleted_at.is_(None),
            Card.column_id.in_(
                select(BoardColumn.id).where(
                    BoardColumn.board_id == board_id, BoardColumn.deleted_at.is_(None)
                )
            ),
        )
        .values(assignee_id=None)
        .execution_options(synchronize_session=False)
    )
    commit_or_rollback()
