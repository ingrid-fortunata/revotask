"""board_columns table: ordered DOUBLE PRECISION position, one active Done column per board."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Float, Uuid

from app.extensions import db
from app.models.base import AuditMixin, SoftDeleteMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.board import Board
    from app.models.card import Card

# NaN sorts above Infinity in PostgreSQL. So `NaN < 'Infinity'` is false and NaN is rejected.
FINITE_POSITIVE_ORDER = '"order" > 0 AND "order" < \'Infinity\'::double precision'


class BoardColumn(UUIDPrimaryKeyMixin, AuditMixin, SoftDeleteMixin, db.Model):
    __tablename__ = "board_columns"
    __table_args__ = (
        CheckConstraint(FINITE_POSITIVE_ORDER, name="order_finite_positive"),
        Index(
            "uq_board_columns_board_id_active_done",
            "board_id",
            unique=True,
            postgresql_where=text("is_done AND deleted_at IS NULL"),
        ),
        Index(
            "ix_board_columns_board_order_id",
            "board_id",
            "order",
            "id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    board_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("revotask.boards.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(db.String(80), nullable=False)
    is_done: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Named `order` to match the data model. Stored as PostgreSQL DOUBLE PRECISION (D4).
    order: Mapped[float] = mapped_column("order", Float(precision=53), nullable=False)

    board: Mapped[Board] = relationship(
        back_populates="columns", foreign_keys="BoardColumn.board_id"
    )
    cards: Mapped[list[Card]] = relationship(back_populates="column")
