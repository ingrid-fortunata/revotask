"""E02 register, E03 login and E04 logout. Thin routes: decode, call, serialize (BE02)."""

import uuid
from datetime import UTC, datetime

from flask import g, jsonify, request
from werkzeug.exceptions import HTTPException

from app.auth_guard import token_required
from app.blueprints.auth import auth_bp
from app.blueprints.auth.schema import LoginSchema, RegisterSchema, normalize_email
from app.blueprints.auth.service import login_user, register_user, revoke_token
from app.blueprints.users.schema import PublicUserSchema
from app.config import LOGIN_ADDRESS_RATE_LIMIT, LOGIN_EMAIL_RATE_LIMIT, REGISTER_RATE_LIMIT
from app.extensions import limiter
from app.validation import load_json_body


def _login_email() -> str | None:
    """The normalized email in the body, or None when the body has no usable one."""
    try:
        payload = request.get_json(silent=True)
    except HTTPException:  # for example an oversized body, which the route reports as 413
        return None
    email = payload.get("email") if isinstance(payload, dict) else None
    if isinstance(email, str) and email.strip():
        return normalize_email(email)
    return None


def login_email_key() -> str:
    return _login_email() or ""


def no_login_email() -> bool:
    return _login_email() is None


@auth_bp.post("/api/auth/register")
@limiter.limit(REGISTER_RATE_LIMIT)
def register():
    user = register_user(**load_json_body(RegisterSchema()))
    return jsonify(data=PublicUserSchema().dump(user)), 201


@auth_bp.post("/api/auth/login")
@limiter.limit(LOGIN_ADDRESS_RATE_LIMIT)
@limiter.limit(LOGIN_EMAIL_RATE_LIMIT, key_func=login_email_key, exempt_when=no_login_email)
def login():
    user, token, ttl = login_user(**load_json_body(LoginSchema()))
    return jsonify(
        data={
            "access_token": token,
            "expires_in": ttl,
            "user": PublicUserSchema().dump(user),
        }
    )


@auth_bp.post("/api/auth/logout")
@token_required
def logout():
    revoke_token(jti=uuid.UUID(g.token_jti), expires_at=datetime.fromtimestamp(g.token_exp, UTC))
    return jsonify(data=None)
