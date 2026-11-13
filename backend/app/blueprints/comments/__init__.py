"""comments_bp: comment routes E23–E26 (list, add, edit and delete a card's comments)."""

from flask import Blueprint

comments_bp = Blueprint("comments", __name__)

from app.blueprints.comments import routes  # noqa: E402,F401  (registers the routes)
