"""Helpers for authentication tests: committed users, minted tokens and cleanup.

Guard, logout and race tests need real commits across connections, so they cannot use the
rolled-back `db_session` fixture. Every row a test creates is tracked and deleted afterward.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import jwt as pyjwt
from flask import Flask
from flask_jwt_extended import create_access_token
from sqlalchemy import delete

from app.extensions import db
from app.models.revoked_token import RevokedToken
from app.models.user import User

JWT_TEST_SECRET = "conftest-only-secret-0123456789abcdef"
PLACEHOLDER_HASH = "$argon2id$placeholder-not-a-real-hash"


class Tracker:
    """Remembers rows created by a test so they can be removed."""

    def __init__(self, app: Flask):
        self.app = app
        self.user_ids: list[uuid.UUID] = []
        self.emails: list[str] = []
        self.jtis: list[uuid.UUID] = []

    def make_user(self, email: str | None = None, name: str = "Test User") -> User:
        email = email or f"t-{uuid.uuid4().hex[:12]}@example.test"
        with self.app.app_context():
            user = User(name=name, email=email, password_hash=PLACEHOLDER_HASH)
            db.session.add(user)
            db.session.commit()
            self.user_ids.append(user.id)
            self.emails.append(email)
            db.session.expunge(user)
            return user

    def token_for(self, user_id: uuid.UUID | str, **kwargs) -> str:
        with self.app.app_context():
            return create_access_token(identity=str(user_id), **kwargs)

    def revoke(self, jti: str) -> None:
        with self.app.app_context():
            db.session.add(RevokedToken(jti=uuid.UUID(jti), expires_at=_now() + timedelta(hours=1)))
            db.session.commit()
            self.jtis.append(uuid.UUID(jti))

    def cleanup(self) -> None:
        with self.app.app_context():
            if self.jtis:
                db.session.execute(delete(RevokedToken).where(RevokedToken.jti.in_(self.jtis)))
            if self.user_ids:
                db.session.execute(delete(User).where(User.id.in_(self.user_ids)))
            db.session.commit()
            db.session.remove()


def _now():
    from datetime import UTC, datetime

    return datetime.now(UTC)


def decode_unverified(token: str) -> dict:
    return pyjwt.decode(token, options={"verify_signature": False})


def raw_token(claims: dict, secret: str | None = JWT_TEST_SECRET, algorithm: str = "HS256") -> str:
    """Encode arbitrary claims, including malformed sets the library would never produce."""
    return pyjwt.encode(claims, secret, algorithm=algorithm)


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def unique_email(prefix: str = "reg") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}@example.test"
