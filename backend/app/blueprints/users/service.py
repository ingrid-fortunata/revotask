"""Profile update service (E31). Owns the transaction and the uniqueness decision (BE02, BE06)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.blueprints.auth.service import EMAIL_UNIQUE_CONSTRAINT, is_unique_violation
from app.exceptions import EmailAlreadyExistsError
from app.extensions import db
from app.models.user import User


def update_profile(user: User, *, name: str | None = None, email: str | None = None) -> User:
    """Store the submitted name and email that differ from the stored ones (P2, P10).

    The caller's row is locked and re-read, so the comparison uses the current values and
    overlapping updates of one account run one after the other. Only the changed columns are
    written, in one commit, so an omitted field is never overwritten and both submitted fields
    apply together. With no difference there is no UPDATE and `updated_at` stays. A duplicate
    email is decided by `uq_users_email`, which rolls the whole update back (P3).
    """
    try:
        row = db.session.scalar(
            select(User)
            .where(User.id == user.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if name is not None and name != row.name:
            row.name = name
        if email is not None and email != row.email:
            row.email = email
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        if is_unique_violation(exc, EMAIL_UNIQUE_CONSTRAINT):
            raise EmailAlreadyExistsError() from None
        raise
    except SQLAlchemyError:
        db.session.rollback()
        raise
    return row
