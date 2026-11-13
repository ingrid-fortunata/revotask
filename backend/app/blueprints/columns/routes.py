"""Column routes E13–E16. Thin routes: authenticate, validate, call the service, serialize (BE02).

Order per request (Requirements 1.12, 2.x): `token_required` authenticates, the path IDs and the
body shape are validated without a database lookup, then the service checks access, takes the
board lock and rechecks before any write.
"""

from __future__ import annotations

import uuid

from flask import g, jsonify

from app.auth_guard import parse_uuid, token_required
from app.blueprints.columns import columns_bp, service
from app.blueprints.columns.schema import (
    ColumnCreateSchema,
    ColumnPlainSchema,
    ColumnReorderSchema,
    ColumnUpdateSchema,
)
from app.exceptions import RequestValidationError
from app.validation import load_json_body


def _path_id(value: str) -> uuid.UUID:
    """The path ID as a UUID, or a 400 before any query runs."""
    parsed = parse_uuid(value)
    if parsed is None:
        raise RequestValidationError()
    return parsed


@columns_bp.post("/api/boards/<board_id>/columns")
@token_required
def create_column_view(board_id: str):
    board_uuid = _path_id(board_id)
    payload = load_json_body(ColumnCreateSchema())
    result = service.create_column(
        board_uuid, g.current_user.id, payload["name"], payload.get("is_done", False)
    )
    return (
        jsonify(
            data={
                "column": ColumnPlainSchema().dump(result["column"]),
                "position_version": result["position_version"],
            }
        ),
        201,
    )


@columns_bp.patch("/api/columns/<column_id>")
@token_required
def update_column_view(column_id: str):
    column_uuid = _path_id(column_id)
    payload = load_json_body(ColumnUpdateSchema())
    column = service.update_column(column_uuid, g.current_user.id, payload)
    return jsonify(data=ColumnPlainSchema().dump(column))


@columns_bp.delete("/api/columns/<column_id>")
@token_required
def delete_column_view(column_id: str):
    result = service.delete_column(_path_id(column_id), g.current_user.id)
    return jsonify(data={"position_version": result["position_version"]})


@columns_bp.patch("/api/boards/<board_id>/columns/reorder")
@token_required
def reorder_columns_view(board_id: str):
    board_uuid = _path_id(board_id)
    payload = load_json_body(ColumnReorderSchema())
    result = service.reorder_columns(
        board_uuid,
        g.current_user.id,
        payload["column_id"],
        payload["before_column_id"],
        payload["expected_position_version"],
    )
    return jsonify(
        data={
            "columns": ColumnPlainSchema(many=True).dump(result["columns"]),
            "position_version": result["position_version"],
        }
    )
