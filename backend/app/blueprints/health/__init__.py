"""Public health check for E01. This is not one of the eight feature Blueprints (A8)."""

from flask import Blueprint

health_bp = Blueprint("health", __name__)

from app.blueprints.health import routes  # noqa: E402,F401  (registers the route)
