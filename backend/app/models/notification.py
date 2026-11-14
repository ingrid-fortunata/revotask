"""notifications table. Append-only apart from read_at, so it has created_at and no updated_at."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.extensions import db
from app.models.base import UUIDPrimaryKeyMixin, utcnow

if TYPE_CHECKING:
    from app.models.user import User


class Notification(UUIDPrimaryKeyMixin, db.Model):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint("kind IN ('assigned', 'commented')", name="kind"),
        Index(
            "ix_notifications_recipient_created_id",
            "recipient_id",
            "created_at",
            "id",
        ),
        Index(
            "ix_notifications_recipient_unread",
            "recipient_id",
            postgresql_where=text("read_at IS NULL"),
        ),
    )

    recipient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("revotask.users.id", ondelete="RESTRICT"), nullable=False
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("revotask.users.id", ondelete="RESTRICT"), nullable=False
    )
    # Plain foreign keys to boards and cards. The notification queries join them explicitly, so no
    # relationship is added (T13, R6).
    board_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("revotask.boards.id", ondelete="RESTRICT"), nullable=False
    )
    card_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("revotask.cards.id", ondelete="RESTRICT"), nullable=False
    )
    kind: Mapped[str] = mapped_column(db.String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    recipient: Mapped[User] = relationship(
        back_populates="notifications", foreign_keys="Notification.recipient_id"
    )
