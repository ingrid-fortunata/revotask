"""Board routes E05–E09. Thin routes: authenticate, validate, call the service, serialize (BE02).

Order per request (DD3, Requirements 7.9): `token_required` authenticates, path IDs and the body
are validated without a database lookup, then the service authorizes the caller against the board.
"""

from __future__ import annotations

import uuid

from flask import g, jsonify

from app.auth_guard import parse_uuid, token_required
from app.blueprints.boards import boards_bp, service
from app.blueprints.boards.schema import (
    BoardCreateSchema,
    BoardSummarySchema,
    BoardUpdateSchema,
    ColumnSchema,
    MemberAddSchema,
    MembershipSchema,
)
from app.exceptions import RequestValidationError
from app.validation import load_json_body


def _board_id(value: str) -> uuid.UUID:
    """Return the path board ID as a UUID, or raise 400 before any query runs."""
    board_id = parse_uuid(value)
    if board_id is None:
        raise RequestValidationError()
    return board_id


def _path_user_id(value: str) -> uuid.UUID:
    """Return the path user ID as a UUID, or raise 400 before any query runs."""
    user_id = parse_uuid(value)
    if user_id is None:
        raise RequestValidationError()
    return user_id


@boards_bp.get("/api/boards")
@token_required
def list_boards_view():
    boards = service.list_boards(g.current_user.id)
    return jsonify(data=BoardSummarySchema(many=True).dump(boards))


@boards_bp.post("/api/boards")
@token_required
def create_board_view():
    payload = load_json_body(BoardCreateSchema())
    board = service.create_board(g.current_user.id, payload["name"])
    return jsonify(data=BoardSummarySchema().dump(board)), 201


@boards_bp.get("/api/boards/<board_id>")
@token_required
def get_board_view(board_id: str):
    board = service.get_board_detail(_board_id(board_id), g.current_user.id)
    body = BoardSummarySchema().dump(board) | {
        "columns": ColumnSchema(many=True).dump(board["columns"])
    }
    return jsonify(data=body)


@boards_bp.patch("/api/boards/<board_id>")
@token_required
def rename_board_view(board_id: str):
    board_uuid = _board_id(board_id)
    payload = load_json_body(BoardUpdateSchema())
    board = service.rename_board(board_uuid, g.current_user.id, payload["name"])
    return jsonify(data=BoardSummarySchema().dump(board))


@boards_bp.delete("/api/boards/<board_id>")
@token_required
def delete_board_view(board_id: str):
    service.delete_board(_board_id(board_id), g.current_user.id)
    return jsonify(data=None)


@boards_bp.get("/api/boards/<board_id>/members")
@token_required
def list_members_view(board_id: str):
    members = service.list_members(_board_id(board_id), g.current_user.id)
    return jsonify(data=MembershipSchema(many=True).dump(members))


@boards_bp.post("/api/boards/<board_id>/members")
@token_required
def add_member_view(board_id: str):
    board_uuid = _board_id(board_id)
    payload = load_json_body(MemberAddSchema())
    member = service.add_member(board_uuid, g.current_user.id, payload["email"])
    return jsonify(data=MembershipSchema().dump(member)), 201


@boards_bp.delete("/api/boards/<board_id>/members/<user_id>")
@token_required
def remove_member_view(board_id: str, user_id: str):
    service.remove_member(_board_id(board_id), g.current_user.id, _path_user_id(user_id))
    return jsonify(data=None)
