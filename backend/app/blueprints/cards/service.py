"""Card services for E17–E20 (BE02, BE04, BE06, DD1).

Same sequence as the column services: resolve the board from the addressed resource, then
`authorize_board(..., lock=True)`, reload the resource under the lock, compare the version where
one is sent, validate the destination, and only then write, bump the version, record events and
commit once. Any participant, Admin or Member, may change any card on the board.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import and_, func, select, update

from app.blueprints.boards.service import authorize_board, commit_or_rollback, read_columns
from app.blueprints.columns.service import board_of_column, load_column
from app.blueprints.notifications.service import add_notification
from app.exceptions import (
    InvalidDestinationError,
    NotFoundError,
    PositionConflictError,
    RequestValidationError,
)
from app.extensions import db
from app.models.base import utcnow
from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.board_member import BoardMember
from app.models.card import Card
from app.models.user import User
from app.positions import (
    allocate_order,
    bump_position_version,
    is_unchanged,
    rebalanced_orders,
    record_event,
)

ASSIGNEE_MESSAGE = "Choose a participant of this board."
SEARCH_LIMIT = 20


def board_of_card(card_id: uuid.UUID) -> uuid.UUID:
    """The board of an active card in an active column, or NotFoundError. Access is checked next."""
    board_id = db.session.scalar(
        select(BoardColumn.board_id)
        .join(Card, Card.column_id == BoardColumn.id)
        .where(Card.id == card_id, Card.deleted_at.is_(None), BoardColumn.deleted_at.is_(None))
    )
    if board_id is None:
        raise NotFoundError()
    return board_id


def load_card(card_id: uuid.UUID, board_id: uuid.UUID) -> Card:
    """Reload one active card of this board with its current values, or NotFoundError (DD1)."""
    card = db.session.scalar(
        select(Card)
        .join(BoardColumn, BoardColumn.id == Card.column_id)
        .where(
            Card.id == card_id,
            Card.deleted_at.is_(None),
            BoardColumn.board_id == board_id,
            BoardColumn.deleted_at.is_(None),
        )
        .execution_options(populate_existing=True)
    )
    if card is None:
        raise NotFoundError()
    return card


def _require_participant(board_id: uuid.UUID, assignee_id: uuid.UUID) -> None:
    """The assignee must be an active participant of the board, checked under the lock (DD7)."""
    row = db.session.scalar(
        select(BoardMember.id).where(
            BoardMember.board_id == board_id,
            BoardMember.user_id == assignee_id,
            BoardMember.deleted_at.is_(None),
        )
    )
    if row is None:
        raise RequestValidationError(fields={"assignee_id": ASSIGNEE_MESSAGE})


def _card_dict(card_id: uuid.UUID) -> dict[str, Any]:
    """The public Card fields with `assignee_name` from a join on `users.name`."""
    row = db.session.execute(
        select(
            Card.id,
            Card.column_id,
            Card.title,
            Card.description,
            Card.assignee_id,
            User.name.label("assignee_name"),
            Card.order,
        )
        .outerjoin(User, User.id == Card.assignee_id)
        .where(Card.id == card_id)
    ).one()
    return row._asdict()


def _active_cards(column_id: uuid.UUID, *, exclude: uuid.UUID | None = None) -> list[Any]:
    statement = select(Card.id, Card.order).where(
        Card.column_id == column_id, Card.deleted_at.is_(None)
    )
    if exclude is not None:
        statement = statement.where(Card.id != exclude)
    return db.session.execute(statement.order_by(Card.order, Card.id)).all()


def _write_orders(ids_in_order: list[uuid.UUID]) -> None:
    """Rebalance: give the cards 1024, 2048, … in this sequence (primary-key bulk update)."""
    db.session.execute(
        update(Card),
        [
            {"id": card_id, "order": order}
            for card_id, order in zip(
                ids_in_order, rebalanced_orders(len(ids_in_order)), strict=True
            )
        ],
    )


def create_card(column_id: uuid.UUID, user_id: uuid.UUID, data: dict[str, Any]) -> dict:
    """Append a card to a column as any participant (E17)."""
    board_id = board_of_column(column_id)
    authorize_board(board_id, user_id, lock=True)
    column = load_column(column_id, board_id)
    assignee_id = data.get("assignee_id")
    if assignee_id is not None:
        _require_participant(board_id, assignee_id)
    existing = _active_cards(column_id)
    order = allocate_order([row.order for row in existing], len(existing))
    if order is None:
        _write_orders([row.id for row in existing])
        order = rebalanced_orders(len(existing) + 1)[-1]
    card = Card(
        column_id=column_id,
        title=data["title"],
        description=data.get("description"),
        assignee_id=assignee_id,
        order=order,
    )
    db.session.add(card)
    db.session.flush()
    card_id = card.id
    version = bump_position_version(board_id)
    record_event(board_id, user_id, "card_created", card_id)
    if column.is_done:
        record_event(board_id, user_id, "entered_done", card_id)
    # A new assignee other than the caller is told in this transaction (B2, C28).
    if assignee_id is not None and assignee_id != user_id:
        add_notification(assignee_id, user_id, board_id, card_id, "assigned")
    created = _card_dict(card_id)
    commit_or_rollback()
    return {"card": created, "position_version": version}


def update_card(card_id: uuid.UUID, user_id: uuid.UUID, changes: dict[str, Any]) -> dict:
    """Edit title, description or assignee of a card (E18). Omitted fields keep their value.

    The column, the order and the board version do not change.
    """
    board_id = board_of_card(card_id)
    authorize_board(board_id, user_id, lock=True)
    card = load_card(card_id, board_id)
    # Read under the lock, before the change, so "unchanged" is an exact test (C28).
    previous_assignee = card.assignee_id
    if changes.get("assignee_id") is not None:
        _require_participant(board_id, changes["assignee_id"])
    for field in ("title", "description", "assignee_id"):
        if field in changes:
            setattr(card, field, changes[field])
    db.session.flush()
    new_assignee = changes.get("assignee_id")
    if new_assignee is not None and new_assignee != previous_assignee and new_assignee != user_id:
        add_notification(new_assignee, user_id, board_id, card_id, "assigned")
    updated = _card_dict(card_id)
    commit_or_rollback()
    return updated


def delete_card(card_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    """Soft-delete a card and return the new version (E19)."""
    board_id = board_of_card(card_id)
    authorize_board(board_id, user_id, lock=True)
    card = load_card(card_id, board_id)
    card.deleted_at = utcnow()
    version = bump_position_version(board_id)
    commit_or_rollback()
    return {"position_version": version}


def move_card(
    card_id: uuid.UUID,
    user_id: uuid.UUID,
    column_id: uuid.UUID,
    before_card_id: uuid.UUID | None,
    expected_version: int,
) -> dict:
    """Move a card within or across columns of its board under the board lock (E20, D4).

    Order of checks: access (404), lock, the card under the lock (404), the version (409), then
    the destination column and anchor (400). A position that does not change writes nothing and
    keeps the version. `columns` holds only the affected lists, each with its active cards.
    """
    board_id = board_of_card(card_id)
    access = authorize_board(board_id, user_id, lock=True)
    card = load_card(card_id, board_id)
    if expected_version != access.position_version:
        raise PositionConflictError()

    destination = db.session.execute(
        select(BoardColumn.id, BoardColumn.is_done).where(
            BoardColumn.id == column_id,
            BoardColumn.board_id == board_id,
            BoardColumn.deleted_at.is_(None),
        )
    ).one_or_none()
    if destination is None or before_card_id == card_id:
        raise InvalidDestinationError()
    siblings = _active_cards(column_id, exclude=card_id)
    if before_card_id is not None and before_card_id not in {row.id for row in siblings}:
        raise InvalidDestinationError()

    source_column_id = card.column_id
    source_is_done = db.session.scalar(
        select(BoardColumn.is_done).where(BoardColumn.id == source_column_id)
    )
    if source_column_id == column_id:
        current_ids = [row.id for row in _active_cards(column_id)]
        if is_unchanged(current_ids, card_id, before_card_id):
            return {
                "card": _card_dict(card_id),
                "columns": read_columns(board_id, [column_id]),
                "position_version": access.position_version,
            }

    index = (
        len(siblings)
        if before_card_id is None
        else [row.id for row in siblings].index(before_card_id)
    )
    order = allocate_order([row.order for row in siblings], index)
    card.column_id = column_id
    if order is None:
        db.session.flush()
        sequence = [row.id for row in siblings]
        sequence.insert(index, card_id)
        _write_orders(sequence)
    else:
        card.order = order
    db.session.flush()

    version = bump_position_version(board_id)
    record_event(board_id, user_id, "card_moved", card_id)
    if destination.is_done and not source_is_done:
        record_event(board_id, user_id, "entered_done", card_id)
    affected = [column_id] if source_column_id == column_id else [source_column_id, column_id]
    result = {
        "card": _card_dict(card_id),
        "columns": read_columns(board_id, affected),
        "position_version": version,
    }
    commit_or_rollback()
    return result


def my_tasks(user_id: uuid.UUID) -> list[dict[str, Any]]:
    """E21: every active card assigned to the caller on an active board they belong to.

    Read-only: no lock, event or write. The membership join checks access in the same snapshot, so
    a removal hides the board's cards at once. Sorted by lower-case board name, board ID, column
    order, card order, then card ID (S1, Q5). Done cards are included (S2).
    """
    rows = db.session.execute(
        select(
            Card.id,
            Card.column_id,
            Card.title,
            Card.description,
            Card.assignee_id,
            User.name.label("assignee_name"),
            Card.order,
            Board.id.label("board_id"),
            Board.name.label("board_name"),
        )
        .join(BoardColumn, BoardColumn.id == Card.column_id)
        .join(Board, Board.id == BoardColumn.board_id)
        .join(
            BoardMember,
            and_(
                BoardMember.board_id == Board.id,
                BoardMember.user_id == user_id,
                BoardMember.deleted_at.is_(None),
            ),
        )
        .join(User, User.id == Card.assignee_id)
        .where(
            Card.assignee_id == user_id,
            Card.deleted_at.is_(None),
            BoardColumn.deleted_at.is_(None),
            Board.deleted_at.is_(None),
        )
        .order_by(func.lower(Board.name), Board.id, BoardColumn.order, Card.order, Card.id)
    ).all()
    return [row._asdict() for row in rows]


def search_cards(board_id: uuid.UUID, user_id: uuid.UUID, q: str) -> list[dict[str, Any]]:
    """E22: up to 20 active cards of the board whose title contains `q`, in board order.

    Read-only: no lock, event or write. `autoescape` makes `%`, `_` and the escape character
    literal. Case-insensitive, title only. A nonmember gets the generic 404 (C1).
    """
    authorize_board(board_id, user_id)
    rows = db.session.execute(
        select(Card.id, Card.title, Card.column_id)
        .join(BoardColumn, BoardColumn.id == Card.column_id)
        .where(
            BoardColumn.board_id == board_id,
            BoardColumn.deleted_at.is_(None),
            Card.deleted_at.is_(None),
            Card.title.icontains(q, autoescape=True),
        )
        .order_by(BoardColumn.order, Card.order, Card.id)
        .limit(SEARCH_LIMIT)
    ).all()
    return [row._asdict() for row in rows]
