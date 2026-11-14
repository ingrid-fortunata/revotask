"""analytics_bp: the board analytics read E29."""

from flask import Blueprint

analytics_bp = Blueprint("analytics", __name__)

from app.blueprints.analytics import routes  # noqa: E402,F401  (registers the routes)
