"""FND-AC7.1–7.3, FND-AC7.5: health reports ok or a fixed 503 envelope, and only reads."""

import logging
import time

import pytest
from sqlalchemy import create_engine, event

from app import create_app
from app.blueprints.health.service import check_database
from app.config import HEALTH_STATEMENT_TIMEOUT_MS
from app.exceptions import ServiceUnavailableError

JWT_TEST_SECRET = "health-test-secret-0123456789abcdef"
UNREACHABLE_URL = "postgresql+psycopg://revotask:health-pw-sentinel@127.0.0.1:1/revotask_test"


@pytest.fixture
def client(app):
    return app.test_client()


def test_health_returns_ok_without_credentials(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {"data": {"status": "ok"}}
    assert response.headers.get("X-Request-ID")


def test_unreachable_database_returns_the_fixed_503_envelope(caplog):
    app = create_app(
        {
            "APP_ENV": "test",
            "DATABASE_URL": UNREACHABLE_URL,
            "JWT_SECRET_KEY": JWT_TEST_SECRET,
            "LOG_LEVEL": "WARNING",
        }
    )
    started = time.perf_counter()
    with caplog.at_level(logging.WARNING, logger="revotask.health"):
        response = app.test_client().get("/api/health")
    elapsed = time.perf_counter() - started

    assert response.status_code == 503
    body = response.get_json()
    assert body["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert body["error"]["message"] == (
        "The service is temporarily unavailable. Try again shortly."
    )
    assert body["error"]["request_id"] == response.headers["X-Request-ID"]

    text = response.get_data(as_text=True)
    for leaked in ("127.0.0.1", "health-pw-sentinel", "revotask_test", "Traceback"):
        assert leaked not in text
    assert "health_check_failed error_class=OperationalError" in caplog.text
    assert "health-pw-sentinel" not in caplog.text
    # Design bound: 2 s connection timeout plus 1 s statement timeout, with a margin.
    assert elapsed < 4.0


def test_slow_database_fails_within_the_statement_bound(test_db_url):
    engine = create_engine(test_db_url)
    try:
        started = time.perf_counter()
        with pytest.raises(ServiceUnavailableError):
            check_database(
                engine,
                statement_timeout_ms=HEALTH_STATEMENT_TIMEOUT_MS,
                probe_sql="SELECT pg_sleep(5)",
            )
        elapsed = time.perf_counter() - started
    finally:
        engine.dispose()
    # 1 s statement timeout plus a margin for connection setup. A 5 s sleep must not finish.
    assert elapsed < 3.0


def test_health_probe_issues_only_read_and_timeout_statements(test_db_url):
    engine = create_engine(test_db_url)
    statements = []

    @event.listens_for(engine, "before_cursor_execute")
    def capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement.strip().upper())

    try:
        check_database(engine, statement_timeout_ms=HEALTH_STATEMENT_TIMEOUT_MS)
    finally:
        engine.dispose()

    assert statements, "the probe should run at least one statement"
    for statement in statements:
        assert statement.startswith("SELECT"), statement
        assert not any(word in statement for word in ("INSERT", "UPDATE", "DELETE", "CREATE"))


def test_post_to_health_returns_405_with_allow_header(client):
    response = client.post("/api/health")
    assert response.status_code == 405
    assert response.get_json()["error"]["code"] == "METHOD_NOT_ALLOWED"
    assert "GET" in response.headers["Allow"].split(", ")
