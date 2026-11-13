"""users_bp: the current-user read (E30). Profile updates (E31) arrive with T12."""

from flask import Blueprint

users_bp = Blueprint("users", __name__)

from app.blueprints.users import routes  # noqa: E402,F401  (registers the routes)
