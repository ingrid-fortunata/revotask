"""Analytics route E29. Thin route: authenticate, validate, call the service, serialize.

Order: `token_required` (401), the path ID (400), the query (400, no parameter is accepted), then
board access inside the service (404). Nothing is read before both 400 checks.
"""

from __future__ import annotations

from flask import g, jsonify

from app.auth_guard import parse_uuid, token_required
from app.blueprints.analytics import analytics_bp, service
from app.blueprints.analytics.schema import AnalyticsQuerySchema, AnalyticsSchema
from app.exceptions import RequestValidationError
from app.validation import load_query_args


@analytics_bp.get("/api/boards/<board_id>/analytics")
@token_required
def board_analytics_view(board_id: str):
    board_uuid = parse_uuid(board_id)
    if board_uuid is None:
        raise RequestValidationError()
    load_query_args(AnalyticsQuerySchema())
    result = service.board_analytics(board_uuid, g.current_user.id)
    return jsonify(data=AnalyticsSchema().dump(result))
