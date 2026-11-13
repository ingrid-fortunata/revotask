"""E30 GET /api/users/me. Profile updates (E31) arrive with T12."""

from flask import g, jsonify

from app.auth_guard import token_required
from app.blueprints.users import users_bp
from app.blueprints.users.schema import PublicUserSchema


@users_bp.get("/api/users/me")
@token_required
def get_me():
    return jsonify(data=PublicUserSchema().dump(g.current_user))
