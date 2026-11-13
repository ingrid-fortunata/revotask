"""board_events table. Append-only analytics log, so it has occurred_at and no updated_at."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.extensions import db
from app.models.base import UUIDPrimaryKeyMixin


class BoardEvent(UUIDPrimaryKeyMixin, db.Model):
    __tablename__ = "board_events"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('card_created', 'card_moved', 'column_reordered', "
            "'comment_created', 'entered_done')",
            name="kind",
        ),
        Index("ix_board_events_board_occurred", "board_id", "occurred_at"),
    )

    board_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("revotask.boards.id", ondelete="RESTRICT"), nullable=False
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("revotask.users.id", ondelete="RESTRICT"), nullable=False
    )
    card_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("revotask.cards.id", ondelete="RESTRICT"), nullable=True
    )
    kind: Mapped[str] = mapped_column(db.String(24), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
