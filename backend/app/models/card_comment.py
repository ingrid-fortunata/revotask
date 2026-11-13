"""card_comments table. The author is immutable. Soft-deletable."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.extensions import db
from app.models.base import AuditMixin, SoftDeleteMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.card import Card
    from app.models.user import User


class CardComment(UUIDPrimaryKeyMixin, AuditMixin, SoftDeleteMixin, db.Model):
    __tablename__ = "card_comments"
    __table_args__ = (
        Index(
            "ix_card_comments_card_created_id",
            "card_id",
            "created_at",
            "id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    card_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("revotask.cards.id", ondelete="RESTRICT"), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("revotask.users.id", ondelete="RESTRICT"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)

    card: Mapped[Card] = relationship(back_populates="comments", foreign_keys="CardComment.card_id")
    author: Mapped[User] = relationship(
        back_populates="comments", foreign_keys="CardComment.author_id"
    )
