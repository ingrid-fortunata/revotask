"""columns_bp: column routes E13–E16 (ordered columns, Done rules, versioned reorder)."""

from flask import Blueprint

columns_bp = Blueprint("columns", __name__)

from app.blueprints.columns import routes  # noqa: E402,F401  (registers the routes)
