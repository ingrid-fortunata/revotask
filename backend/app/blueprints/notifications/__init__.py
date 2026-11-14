"""notifications_bp: the recipient routes E27 (list) and E28 (mark read)."""

from flask import Blueprint

notifications_bp = Blueprint("notifications", __name__)

from app.blueprints.notifications import routes  # noqa: E402,F401  (registers the routes)
