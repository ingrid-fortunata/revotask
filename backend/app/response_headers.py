"""Private caching for API responses (AUTH-AC6.5, D2).

Every response under /api/ is private except the public health check, so routes added by
later slices are private by default.
"""

from __future__ import annotations

from flask import Flask, Response, request

PUBLIC_ENDPOINTS = frozenset({"health.get_health"})
PRIVATE_CACHE_CONTROL = "private, no-store"


def register_response_headers(app: Flask) -> None:
    @app.after_request
    def mark_private(response: Response) -> Response:
        if request.path.startswith("/api/") and request.endpoint not in PUBLIC_ENDPOINTS:
            response.headers["Cache-Control"] = PRIVATE_CACHE_CONTROL
        return response
