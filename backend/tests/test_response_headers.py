"""AUTH-AC6.5: responses under /api/ are private and not stored, except E01."""

import pytest

from app import create_app
from tests.probe_routes import add_probe_routes

ENV = {
    "APP_ENV": "development",
    "DATABASE_URL": "postgresql+psycopg://revotask:hdr-pw@127.0.0.1:1/revotask_dev",
    "JWT_SECRET_KEY": "headers-test-secret-0123456789abcdef",
    "LOG_LEVEL": "INFO",
    "RATE_LIMIT_ENABLED": "false",
}


@pytest.fixture
def client():
    app = create_app(ENV)
    add_probe_routes(app)
    app.testing = False
    return app.test_client()


def test_api_success_response_is_private_and_not_stored(client):
    response = client.get("/api/_t/private")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "private, no-store"


@pytest.mark.parametrize(
    ("method", "path", "status"),
    [("get", "/api/does-not-exist", 404), ("post", "/api/health", 405)],
)
def test_api_error_responses_are_private_and_not_stored(client, method, path, status):
    response = getattr(client, method)(path)
    assert response.status_code == status
    assert response.headers["Cache-Control"] == "private, no-store"


def test_health_response_is_not_marked_by_the_app(client):
    # The database is unreachable in this app, so health answers 503. The header rule
    # depends on the endpoint, not the outcome.
    response = client.get("/api/health")
    assert response.status_code == 503
    assert "Cache-Control" not in response.headers


def test_paths_outside_api_are_unchanged(client):
    response = client.get("/_t/ok")
    assert response.status_code == 200
    assert "Cache-Control" not in response.headers
