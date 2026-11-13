"""FND-AC7.7, FND-AC7.8: request IDs on every response and safe per-request logging."""

import logging
import re

import pytest

from app import create_app
from tests.probe_routes import add_probe_routes

ENV = {
    "APP_ENV": "development",
    "DATABASE_URL": "postgresql+psycopg://revotask:ctx-pw@127.0.0.1:1/revotask_dev",
    "JWT_SECRET_KEY": "ctx-test-secret-0123456789abcdef",
    "LOG_LEVEL": "INFO",
}


@pytest.fixture
def client():
    app = create_app(ENV)
    add_probe_routes(app)
    app.testing = True
    return app.test_client()


def test_valid_inbound_request_id_is_reused(client):
    response = client.get("/_t/ok", headers={"X-Request-ID": "abc-123_XYZ"})
    assert response.headers["X-Request-ID"] == "abc-123_XYZ"


@pytest.mark.parametrize("candidate", ["bad id!", "x" * 65, "has/slash", ""])
def test_invalid_inbound_request_id_is_replaced(client, candidate):
    response = client.get("/_t/ok", headers={"X-Request-ID": candidate})
    generated = response.headers["X-Request-ID"]
    assert generated != candidate
    assert re.fullmatch(r"[0-9a-f]{32}", generated)


def test_request_id_is_set_on_success_unknown_path_method_error_and_internal_error(client):
    responses = [
        client.get("/_t/ok"),
        client.get("/does-not-exist"),
        client.post("/_t/ok"),
        client.get("/_t/boom"),
    ]
    for response in responses:
        assert response.headers.get("X-Request-ID"), response.status_code


def test_request_log_contains_safe_fields_for_a_successful_request(client, caplog):
    with caplog.at_level(logging.INFO, logger="revotask.request"):
        client.get("/_t/ok", headers={"X-Request-ID": "log-id-1"})
    line = next(r.getMessage() for r in caplog.records if "request_id=log-id-1" in r.getMessage())
    assert "method=GET" in line
    assert "route=/_t/ok" in line
    assert "status=200" in line
    assert "error_code=-" in line
    assert "duration_ms=" in line


def test_unmatched_route_is_logged_as_unmatched_with_error_code(client, caplog):
    with caplog.at_level(logging.INFO, logger="revotask.request"):
        client.get("/nowhere", headers={"X-Request-ID": "log-id-2"})
    line = next(r.getMessage() for r in caplog.records if "request_id=log-id-2" in r.getMessage())
    assert "route=<unmatched>" in line
    assert "status=404" in line
    assert "error_code=NOT_FOUND" in line


def test_logs_never_contain_headers_query_or_body_values(client, caplog):
    with caplog.at_level(logging.INFO, logger="revotask"):
        client.post(
            "/_t/echo?secret=QUERY-SENTINEL",
            json={"password": "BODY-SENTINEL"},
            headers={"Authorization": "Bearer TOKEN-SENTINEL"},
        )
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "request_id=" in text
    for sentinel in ("QUERY-SENTINEL", "BODY-SENTINEL", "TOKEN-SENTINEL"):
        assert sentinel not in text


def test_request_log_level_follows_status(client, caplog):
    with caplog.at_level(logging.INFO, logger="revotask.request"):
        client.get("/_t/boom")
    levels = [r.levelno for r in caplog.records if "status=500" in r.getMessage()]
    assert levels == [logging.ERROR]
