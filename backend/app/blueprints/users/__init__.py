"""users_bp: the current-user read (E30) and the profile update (E31)."""

from flask import Blueprint

users_bp = Blueprint("users", __name__)

from app.blueprints.users import routes  # noqa: E402,F401  (registers the routes)
