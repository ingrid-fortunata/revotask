"""Card routes E17–E22. Thin routes: authenticate, validate, call the service, serialize (BE02).

Order per request: `token_required`, then path IDs and the body shape without a database lookup,
then the service checks access, takes the board lock and rechecks before any write.
"""

from __future__ import annotations

import uuid

from flask import g, jsonify

from app.auth_guard import parse_uuid, token_required
from app.blueprints.boards.schema import CardSchema, ColumnSchema
from app.blueprints.cards import cards_bp, service
from app.blueprints.cards.schema import (
    CardCreateSchema,
    CardPositionSchema,
    CardSearchQuerySchema,
    CardUpdateSchema,
    MyTasksQuerySchema,
    SearchResultSchema,
    TaskItemSchema,
)
from app.exceptions import RequestValidationError
from app.validation import load_json_body, load_query_args


def _path_id(value: str) -> uuid.UUID:
    """The path ID as a UUID, or a 400 before any query runs."""
    parsed = parse_uuid(value)
    if parsed is None:
        raise RequestValidationError()
    return parsed


@cards_bp.post("/api/columns/<column_id>/cards")
@token_required
def create_card_view(column_id: str):
    column_uuid = _path_id(column_id)
    payload = load_json_body(CardCreateSchema())
    result = service.create_card(column_uuid, g.current_user.id, payload)
    return (
        jsonify(
            data={
                "card": CardSchema().dump(result["card"]),
                "position_version": result["position_version"],
            }
        ),
        201,
    )


@cards_bp.patch("/api/cards/<card_id>")
@token_required
def update_card_view(card_id: str):
    card_uuid = _path_id(card_id)
    payload = load_json_body(CardUpdateSchema())
    card = service.update_card(card_uuid, g.current_user.id, payload)
    return jsonify(data=CardSchema().dump(card))


@cards_bp.delete("/api/cards/<card_id>")
@token_required
def delete_card_view(card_id: str):
    result = service.delete_card(_path_id(card_id), g.current_user.id)
    return jsonify(data={"position_version": result["position_version"]})


@cards_bp.patch("/api/cards/<card_id>/position")
@token_required
def move_card_view(card_id: str):
    card_uuid = _path_id(card_id)
    payload = load_json_body(CardPositionSchema())
    result = service.move_card(
        card_uuid,
        g.current_user.id,
        payload["column_id"],
        payload["before_card_id"],
        payload["expected_position_version"],
    )
    return jsonify(
        data={
            "card": CardSchema().dump(result["card"]),
            "columns": ColumnSchema(many=True).dump(result["columns"]),
            "position_version": result["position_version"],
        }
    )


@cards_bp.get("/api/cards")
@token_required
def list_my_tasks_view():
    """E21. The only accepted query is `assignee=me` (S3). Read-only."""
    load_query_args(MyTasksQuerySchema())
    return jsonify(data=TaskItemSchema(many=True).dump(service.my_tasks(g.current_user.id)))


@cards_bp.get("/api/boards/<board_id>/cards/search")
@token_required
def search_cards_view(board_id: str):
    """E22. Order: path ID (400), query (400), then board access (404). Read-only."""
    board_uuid = _path_id(board_id)
    query = load_query_args(CardSearchQuerySchema())
    cards = service.search_cards(board_uuid, g.current_user.id, query["q"])
    return jsonify(data=SearchResultSchema(many=True).dump(cards))
