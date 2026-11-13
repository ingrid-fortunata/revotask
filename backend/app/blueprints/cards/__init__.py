"""cards_bp: card routes E17–E20 (create, edit, delete, versioned move). E21–E22 land in T11."""

from flask import Blueprint

cards_bp = Blueprint("cards", __name__)

from app.blueprints.cards import routes  # noqa: E402,F401  (registers the routes)
