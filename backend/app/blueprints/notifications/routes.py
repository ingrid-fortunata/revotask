"""Notification routes E27–E28. Thin routes: authenticate, validate, call the service, serialize.

E27 order: `token_required`, then the query (400, no database access), then the read. E28 order:
`token_required`, then the path ID (400), then the update and lookup (404). E28 reads no body.
"""

from __future__ import annotations

from flask import g, jsonify

from app.auth_guard import parse_uuid, token_required
from app.blueprints.notifications import notifications_bp, service
from app.blueprints.notifications.schema import NotificationListQuerySchema, NotificationSchema
from app.exceptions import RequestValidationError
from app.validation import load_query_args


@notifications_bp.get("/api/notifications")
@token_required
def list_notifications():
    query = load_query_args(NotificationListQuerySchema())
    result = service.list_notifications(g.current_user.id, query["page"], query["per_page"])
    result["items"] = NotificationSchema(many=True).dump(result["items"])
    return jsonify(data=result)


@notifications_bp.patch("/api/notifications/<notification_id>/read")
@token_required
def mark_read_view(notification_id: str):
    notification_uuid = parse_uuid(notification_id)
    if notification_uuid is None:
        raise RequestValidationError()
    item = service.mark_read(notification_uuid, g.current_user.id)
    return jsonify(data=NotificationSchema().dump(item))
