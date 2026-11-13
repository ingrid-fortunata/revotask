"""boards_bp: board routes E05–E09 now, member routes E10–E12 with task 2.4."""

from flask import Blueprint

boards_bp = Blueprint("boards", __name__)

from app.blueprints.boards import routes  # noqa: E402,F401  (registers the routes)
