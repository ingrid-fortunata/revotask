"""Request IDs and one structured log line per request (FND-AC7.7, FND-AC7.8, BE05).

Log lines carry request ID, method, matched route pattern, status, error code and duration.
Headers, query strings, paths with IDs and bodies are never logged, so tokens and
credentials stay out of the logs.
"""

from __future__ import annotations

import logging
import re
import time
import uuid

from flask import Flask, Response, g, request

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
request_logger = logging.getLogger("revotask.request")


def _incoming_request_id() -> str:
    candidate = request.headers.get(REQUEST_ID_HEADER, "")
    if _REQUEST_ID_PATTERN.fullmatch(candidate):
        return candidate
    return uuid.uuid4().hex


def _configure_logging(level_name: str) -> None:
    root = logging.getLogger("revotask")
    root.setLevel(level_name)
    if not root.handlers and not logging.getLogger().handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        root.addHandler(handler)


def register_request_context(app: Flask) -> None:
    _configure_logging(app.config["LOG_LEVEL"])

    @app.before_request
    def start_request() -> None:
        g.request_id = _incoming_request_id()
        g.request_started = time.perf_counter()
        g.error_code = None

    @app.after_request
    def finish_request(response: Response) -> Response:
        response.headers[REQUEST_ID_HEADER] = g.get("request_id", "")
        duration_ms = (time.perf_counter() - g.get("request_started", time.perf_counter())) * 1000
        route = request.url_rule.rule if request.url_rule else "<unmatched>"
        level = logging.ERROR if response.status_code >= 500 else logging.INFO
        request_logger.log(
            level,
            "request_id=%s method=%s route=%s status=%d error_code=%s duration_ms=%.1f actor_id=%s",
            g.get("request_id", ""),
            request.method,
            route,
            response.status_code,
            g.get("error_code") or "-",
            duration_ms,
            g.get("actor_id") or "-",
        )
        return response
