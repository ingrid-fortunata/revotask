"""Authentication services: password hashing now, register, login and logout in later tasks.

Services own the business rules and transactions (BE02, BE06). Routes only decode, call and
serialize.
"""

from __future__ import annotations

import functools
import secrets
import uuid
from datetime import datetime

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from flask_jwt_extended import create_access_token
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.config import ACCESS_TOKEN_TTL_SECONDS
from app.exceptions import EmailAlreadyExistsError, InvalidCredentialsError
from app.extensions import db
from app.models.revoked_token import RevokedToken
from app.models.user import User

EMAIL_UNIQUE_CONSTRAINT = "uq_users_email"

# argon2-cffi defaults: Argon2id with the RFC 9106 low-memory profile (A3).
_hasher = PasswordHasher()


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(stored_hash: str, plain: str) -> bool:
    """True only for a matching password. Any other outcome, including a bad hash, is False."""
    try:
        return _hasher.verify(stored_hash, plain)
    except VerifyMismatchError, VerificationError, InvalidHashError:
        return False


@functools.cache
def _dummy_hash() -> str:
    return _hasher.hash(secrets.token_urlsafe(16))


def verify_dummy(plain: str) -> None:
    """Spend the same work as a real check, so an unknown email costs about the same time."""
    verify_password(_dummy_hash(), plain)


def is_unique_violation(exc: IntegrityError, constraint: str) -> bool:
    """True when the database rejected the insert for the named unique constraint (23505)."""
    orig = exc.orig
    diag = getattr(orig, "diag", None)
    return (
        getattr(orig, "sqlstate", None) == "23505"
        and getattr(diag, "constraint_name", None) == constraint
    )


def register_user(*, name: str, email: str, password: str) -> User:
    """Create an account. The unique constraint decides duplicates, even for simultaneous requests.

    Hashing happens before the transaction opens, so no connection is held during Argon2 work.
    """
    user = User(name=name, email=email, password_hash=hash_password(password))
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        if is_unique_violation(exc, EMAIL_UNIQUE_CONSTRAINT):
            raise EmailAlreadyExistsError() from None
        raise
    return user


def login_user(*, email: str, password: str) -> tuple[User, str, int]:
    """Check credentials and issue an access token. `email` is already normalized.

    A wrong password and an unknown email raise the same error and cost about the same time.
    """
    user = db.session.scalar(select(User).where(User.email == email))
    if user is None:
        verify_dummy(password)
        raise InvalidCredentialsError()
    if not verify_password(user.password_hash, password):
        raise InvalidCredentialsError()
    token = create_access_token(identity=str(user.id))
    return user, token, ACCESS_TOKEN_TTL_SECONDS


def revoke_token(*, jti: uuid.UUID, expires_at: datetime) -> None:
    """Record the token's `jti` so the guard refuses it. Repeating the call changes nothing.

    The token value is never stored. On any database failure the transaction is rolled back
    and the error propagates, so the API never reports a revocation that did not persist.
    """
    statement = (
        pg_insert(RevokedToken)
        .values(jti=jti, expires_at=expires_at)
        .on_conflict_do_nothing(index_elements=["jti"])
    )
    try:
        db.session.execute(statement)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        raise
