"""JWT guard for protected routes (BE04, DD1, DD2).

Flask-JWT-Extended verifies the signature and expiry. This module makes every failure return
the same 401 `AUTH_REQUIRED` envelope (the library defaults use 422 and a different body),
checks the revocation list, and loads the user so services receive a `User` and never touch
the token.
"""

from __future__ import annotations

import uuid
from functools import wraps
from typing import Any

from flask import g
from flask_jwt_extended import JWTManager, get_jwt, get_jwt_identity, verify_jwt_in_request

from app.errors import error_response
from app.exceptions import AuthRequiredError
from app.extensions import db
from app.models.revoked_token import RevokedToken
from app.models.user import User


def parse_uuid(value: Any) -> uuid.UUID | None:
    """Return a UUID for a string UUID, or None for anything else."""
    if not isinstance(value, str):
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def _auth_required(*_args: Any):
    return error_response(
        AuthRequiredError.status, AuthRequiredError.code, AuthRequiredError.message
    )


def register_jwt_handlers(jwt: JWTManager) -> None:
    """Replace every library error response with AUTH_REQUIRED and add the blocklist check."""

    @jwt.token_in_blocklist_loader
    def is_revoked(_header: dict, payload: dict) -> bool:
        jti = parse_uuid(payload.get("jti"))
        # A token without a usable jti cannot be revoked later, so it is refused.
        return jti is None or db.session.get(RevokedToken, jti) is not None

    jwt.unauthorized_loader(_auth_required)
    jwt.invalid_token_loader(_auth_required)
    jwt.expired_token_loader(_auth_required)
    jwt.revoked_token_loader(_auth_required)
    jwt.token_verification_failed_loader(_auth_required)


def token_required(view):
    """Require a valid, unrevoked access token for an existing user.

    Sets `g.current_user`, `g.token_jti`, `g.token_exp` and `g.actor_id` for the view.
    """

    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any):
        verify_jwt_in_request()
        claims = get_jwt()
        user_id = parse_uuid(get_jwt_identity())
        exp = claims.get("exp")
        # PyJWT does not require `exp`, so a token without one would never expire.
        if user_id is None or isinstance(exp, bool) or not isinstance(exp, int | float):
            raise AuthRequiredError()
        user = db.session.get(User, user_id)
        if user is None:
            raise AuthRequiredError()
        g.current_user = user
        g.token_jti = claims["jti"]
        g.token_exp = exp
        g.actor_id = str(user.id)
        return view(*args, **kwargs)

    return wrapper
