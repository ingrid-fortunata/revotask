"""Shared JSON error envelope and global error handlers (FND-AC7.4–7.6, BE05).

Every error from this slice uses the envelope from docs/API.md:
{"error": {"code", "message", "request_id", "fields"?}}. Messages are fixed strings.
Exception text never reaches a response body.
"""

from __future__ import annotations

import logging

from flask import Flask, g, jsonify
from flask import Response as FlaskResponse
from werkzeug.exceptions import HTTPException, MethodNotAllowed, NotFound

from app.exceptions import ApiError
from app.extensions import db

logger = logging.getLogger("revotask.errors")


def error_response(
    status: int,
    code: str,
    message: str,
    *,
    fields: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
) -> FlaskResponse:
    """Build the standard error envelope and record its code for request logging."""
    body: dict[str, object] = {
        "code": code,
        "message": message,
        "request_id": g.get("request_id", ""),
    }
    if fields:
        body["fields"] = fields
    g.error_code = code
    response = jsonify(error=body)
    response.status_code = status
    for name, value in (headers or {}).items():
        response.headers[name] = value
    return response


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def handle_api_error(exc: ApiError) -> FlaskResponse:
        return error_response(exc.status, exc.code, exc.message, fields=exc.fields)

    @app.errorhandler(HTTPException)
    def handle_http_exception(exc: HTTPException) -> FlaskResponse:
        if isinstance(exc, NotFound):
            return error_response(404, "NOT_FOUND", "Resource not found.")
        if isinstance(exc, MethodNotAllowed):
            allowed = ", ".join(sorted(exc.valid_methods or []))
            headers = {"Allow": allowed} if allowed else None
            return error_response(405, "METHOD_NOT_ALLOWED", "Method not allowed.", headers=headers)
        if exc.code is not None and exc.code >= 500:
            return error_response(exc.code, "INTERNAL_ERROR", "Something went wrong.")
        # Other framework errors (400, 413, 415 and similar) keep Flask's default response
        # until T03 defines their JSON envelope (requirements open item 4).
        return exc.get_response()

    @app.errorhandler(Exception)
    def handle_unexpected_exception(exc: Exception) -> FlaskResponse:
        # The database session may be mid-transaction after a failure. Roll it back first.
        db.session.rollback()
        # Log the class name only. The message can contain driver details or parameters.
        logger.error("unhandled_exception error_class=%s", type(exc).__name__)
        return error_response(500, "INTERNAL_ERROR", "Something went wrong.")
