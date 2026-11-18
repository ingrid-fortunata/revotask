"""boards table: name, creator, position_version, optional sprint range. Soft-deletable."""

from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.extensions import db
from app.models.base import AuditMixin, SoftDeleteMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.board_column import BoardColumn
    from app.models.board_member import BoardMember
    from app.models.user import User


class Board(UUIDPrimaryKeyMixin, AuditMixin, SoftDeleteMixin, db.Model):
    __tablename__ = "boards"
    __table_args__ = (
        CheckConstraint("position_version >= 0", name="position_version_nonnegative"),
        # Both sprint dates or neither. The range holds 1 to 90 days counting both ends (SP4, DS1).
        CheckConstraint(
            "(sprint_start IS NULL AND sprint_end IS NULL) OR "
            "(sprint_start IS NOT NULL AND sprint_end IS NOT NULL "
            "AND sprint_end >= sprint_start AND sprint_end - sprint_start <= 89)",
            name="sprint_range_valid",
        ),
    )

    creator_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("revotask.users.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(db.String(100), nullable=False)
    position_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    sprint_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    sprint_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    creator: Mapped[User] = relationship(
        back_populates="created_boards", foreign_keys="Board.creator_id"
    )
    members: Mapped[list[BoardMember]] = relationship(back_populates="board")
    columns: Mapped[list[BoardColumn]] = relationship(back_populates="board")
