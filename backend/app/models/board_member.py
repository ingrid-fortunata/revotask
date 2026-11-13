"""board_members table. Re-adding a member reactivates the same row. Soft-deletable."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.extensions import db
from app.models.base import AuditMixin, SoftDeleteMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.board import Board
    from app.models.user import User


class BoardMember(UUIDPrimaryKeyMixin, AuditMixin, SoftDeleteMixin, db.Model):
    __tablename__ = "board_members"
    __table_args__ = (
        UniqueConstraint("board_id", "user_id", name="uq_board_members_board_id_user_id"),
        CheckConstraint("role IN ('admin', 'member')", name="role"),
        Index(
            "ix_board_members_user_id_active",
            "user_id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    board_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("revotask.boards.id", ondelete="RESTRICT"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("revotask.users.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(db.String(8), nullable=False)

    board: Mapped[Board] = relationship(
        back_populates="members", foreign_keys="BoardMember.board_id"
    )
    user: Mapped[User] = relationship(
        back_populates="memberships", foreign_keys="BoardMember.user_id"
    )
