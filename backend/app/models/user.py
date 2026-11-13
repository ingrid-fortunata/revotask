"""users table. Not soft-deletable in v1 (data-model.md), so there is no deleted_at."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import AuditMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.board import Board
    from app.models.board_member import BoardMember
    from app.models.card import Card
    from app.models.card_comment import CardComment
    from app.models.notification import Notification


class User(UUIDPrimaryKeyMixin, AuditMixin, db.Model):
    __tablename__ = "users"
    __table_args__ = (
        # Normalized email is enforced in the database too, even for inserts that skip the app (A3).
        CheckConstraint("email = lower(btrim(email))", name="email_normalized"),
    )

    name: Mapped[str] = mapped_column(db.String(80), nullable=False)
    email: Mapped[str] = mapped_column(db.String(254), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)

    created_boards: Mapped[list[Board]] = relationship(
        back_populates="creator", foreign_keys="Board.creator_id"
    )
    memberships: Mapped[list[BoardMember]] = relationship(
        back_populates="user", foreign_keys="BoardMember.user_id"
    )
    assigned_cards: Mapped[list[Card]] = relationship(
        back_populates="assignee", foreign_keys="Card.assignee_id"
    )
    comments: Mapped[list[CardComment]] = relationship(
        back_populates="author", foreign_keys="CardComment.author_id"
    )
    notifications: Mapped[list[Notification]] = relationship(
        back_populates="recipient", foreign_keys="Notification.recipient_id"
    )
