"""E30 GET /api/users/me and E31 PATCH /api/users/me. Thin routes: decode, call, serialize."""

from flask import g, jsonify

from app.auth_guard import token_required
from app.blueprints.users import users_bp
from app.blueprints.users.schema import ProfileUpdateSchema, PublicUserSchema
from app.blueprints.users.service import update_profile
from app.exceptions import RequestValidationError
from app.validation import load_json_body


@users_bp.get("/api/users/me")
@token_required
def get_me():
    return jsonify(data=PublicUserSchema().dump(g.current_user))


@users_bp.patch("/api/users/me")
@token_required
def patch_me():
    data = load_json_body(ProfileUpdateSchema())
    if not data:  # `{}`: nothing to update (C23). The standard message, no field entry.
        raise RequestValidationError()
    user = update_profile(g.current_user, **data)
    return jsonify(data=PublicUserSchema().dump(user))
