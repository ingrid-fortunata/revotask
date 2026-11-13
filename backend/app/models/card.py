"""cards table: title, optional description and assignee, DOUBLE PRECISION order. Soft-deletable."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Float, Uuid

from app.extensions import db
from app.models.base import AuditMixin, SoftDeleteMixin, UUIDPrimaryKeyMixin
from app.models.board_column import FINITE_POSITIVE_ORDER

if TYPE_CHECKING:
    from app.models.board_column import BoardColumn
    from app.models.card_comment import CardComment
    from app.models.user import User


class Card(UUIDPrimaryKeyMixin, AuditMixin, SoftDeleteMixin, db.Model):
    __tablename__ = "cards"
    __table_args__ = (
        CheckConstraint(FINITE_POSITIVE_ORDER, name="order_finite_positive"),
        Index(
            "ix_cards_column_order_id",
            "column_id",
            "order",
            "id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_cards_assignee_id_active",
            "assignee_id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    column_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("revotask.board_columns.id", ondelete="RESTRICT"), nullable=False
    )
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("revotask.users.id", ondelete="RESTRICT"), nullable=True
    )
    title: Mapped[str] = mapped_column(db.String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[float] = mapped_column("order", Float(precision=53), nullable=False)

    column: Mapped[BoardColumn] = relationship(
        back_populates="cards", foreign_keys="Card.column_id"
    )
    assignee: Mapped[User | None] = relationship(
        back_populates="assigned_cards", foreign_keys="Card.assignee_id"
    )
    comments: Mapped[list[CardComment]] = relationship(back_populates="card")
