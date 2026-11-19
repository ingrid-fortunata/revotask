"""Helpers for the profile (E31) tests (T12).

Users are created through `board_tracker` (a `BoardTracker`, which extends `Tracker`), so every
row is removed at teardown even when an assertion fails. Reads open their own app context and
remove the session afterwards, so they never share a transaction with a request under test.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select

from app.blueprints.auth.service import hash_password
from app.extensions import db
from app.models.user import User
from tests.auth_helpers import bearer

PASSWORD = "Horse-4Bat"  # fixed non-secret test value, 10 characters, meets the register rule
NEW_PASSWORD = "New#pass2"  # a second fixed non-secret test value


def patch_me(client, tracker, user, body: Any = None, **kwargs):
    """PATCH /api/users/me as `user`. `body` is sent as JSON unless `data` is passed."""
    headers = bearer(tracker.token_for(user.id))
    if body is not None:
        kwargs["json"] = body
    return client.patch("/api/users/me", headers=headers, **kwargs)


def user_row(app, user_id: uuid.UUID) -> dict[str, Any]:
    with app.app_context():
        try:
            row = db.session.scalar(select(User).where(User.id == user_id))
            return {
                "name": row.name,
                "email": row.email,
                "password_hash": row.password_hash,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
        finally:
            db.session.remove()


def make_login_user(tracker, app, name: str = "Login User") -> Any:
    """A tracked user whose password is `PASSWORD`, so a fresh login works."""
    user = tracker.make_user(name=name)
    with app.app_context():
        try:
            row = db.session.get(User, user.id)
            row.password_hash = hash_password(PASSWORD)
            db.session.commit()
        finally:
            db.session.remove()
    return user
