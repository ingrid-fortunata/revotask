"""revoked_tokens table. Keyed by JWT jti. The token value itself is never stored (D2)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.extensions import db


class RevokedToken(db.Model):
    __tablename__ = "revoked_tokens"
    __table_args__ = (Index("ix_revoked_tokens_expires_at", "expires_at"),)

    jti: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
