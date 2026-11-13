"""Comment routes E23–E26. Thin routes: authenticate, validate, call the service, serialize (BE02).

Order per request: `token_required`, then the path ID and the body shape without a database
lookup, then the service checks access, takes the board lock for a write and rechecks before any
write.
"""

from __future__ import annotations

import uuid

from flask import g, jsonify

from app.auth_guard import parse_uuid, token_required
from app.blueprints.comments import comments_bp, service
from app.blueprints.comments.schema import CommentContentSchema, CommentSchema
from app.exceptions import RequestValidationError
from app.validation import load_json_body


def _path_id(value: str) -> uuid.UUID:
    """The path ID as a UUID, or a 400 before any query runs."""
    parsed = parse_uuid(value)
    if parsed is None:
        raise RequestValidationError()
    return parsed


@comments_bp.get("/api/cards/<card_id>/comments")
@token_required
def list_comments_view(card_id: str):
    comments = service.list_comments(_path_id(card_id), g.current_user.id)
    return jsonify(data=CommentSchema(many=True).dump(comments))


@comments_bp.post("/api/cards/<card_id>/comments")
@token_required
def create_comment_view(card_id: str):
    card_uuid = _path_id(card_id)
    payload = load_json_body(CommentContentSchema())
    comment = service.create_comment(card_uuid, g.current_user.id, payload["content"])
    return jsonify(data=CommentSchema().dump(comment)), 201


@comments_bp.patch("/api/comments/<comment_id>")
@token_required
def update_comment_view(comment_id: str):
    comment_uuid = _path_id(comment_id)
    payload = load_json_body(CommentContentSchema())
    comment = service.update_comment(comment_uuid, g.current_user.id, payload["content"])
    return jsonify(data=CommentSchema().dump(comment))


@comments_bp.delete("/api/comments/<comment_id>")
@token_required
def delete_comment_view(comment_id: str):
    comment = service.delete_comment(_path_id(comment_id), g.current_user.id)
    return jsonify(data=CommentSchema().dump(comment))
