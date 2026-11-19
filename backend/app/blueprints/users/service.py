"""Profile update service (E31). Owns the transaction and the password check (BE02, BE06)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.blueprints.auth.service import hash_password, verify_password
from app.exceptions import RequestValidationError
from app.extensions import db
from app.models.user import User

WRONG_PASSWORD = "Current password is incorrect."


def update_profile(
    user: User,
    *,
    name: str | None = None,
    current_password: str | None = None,
    new_password: str | None = None,
) -> User:
    """Store the submitted name and the new password hash (P2, P10, P14).

    The caller's row is locked and re-read, so every comparison uses the current values and
    overlapping updates of one account run one after the other. The current password is verified
    on that locked row, so a second change that used the same current password finds a new hash
    and is refused. A wrong password raises before any assignment and nothing is written, a valid
    name included (P16). Only changed columns are written, in one commit, so an omitted field is
    never overwritten and name and password apply together. A name equal to the stored one with
    no password pair writes nothing and `updated_at` stays. The schema guarantees that the two
    password arguments come together. The email is never an argument (P12).
    """
    try:
        row = db.session.scalar(
            select(User)
            .where(User.id == user.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if new_password is not None:
            if not verify_password(row.password_hash, current_password):
                db.session.rollback()  # release the row lock, write nothing
                raise RequestValidationError(fields={"current_password": WRONG_PASSWORD})
            row.password_hash = hash_password(new_password)
        if name is not None and name != row.name:
            row.name = name
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        raise
    return row
