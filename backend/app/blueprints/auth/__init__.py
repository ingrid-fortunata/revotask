"""auth_bp: register (E02), login (E03) and logout (E04)."""

from flask import Blueprint

auth_bp = Blueprint("auth", __name__)

from app.blueprints.auth import routes  # noqa: E402,F401  (registers the routes)
