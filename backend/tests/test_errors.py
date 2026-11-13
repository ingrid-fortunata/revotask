"""FND-AC7.4–7.6: the shared JSON envelope for 404, 405, 500 and 503, with fixed messages."""

from unittest import mock

import pytest

from app import create_app
from app.extensions import db
from tests.probe_routes import add_probe_routes

ENV = {
    "APP_ENV": "development",
    "DATABASE_URL": "postgresql+psycopg://revotask:err-pw@127.0.0.1:1/revotask_dev",
    "JWT_SECRET_KEY": "err-test-secret-0123456789abcdef",
    "LOG_LEVEL": "INFO",
}


@pytest.fixture
def app():
    app = create_app(ENV)
    add_probe_routes(app)
    app.testing = False  # Handlers must run as they do in production.
    return app


@pytest.fixture
def client(app):
    return app.test_client()


def envelope(response):
    body = response.get_json()
    assert set(body) == {"error"}, body
    return body["error"]


def test_unknown_path_returns_404_envelope_without_fields(client):
    response = client.get("/does-not-exist", headers={"X-Request-ID": "e-404"})
    assert response.status_code == 404
    assert response.mimetype == "application/json"
    error = envelope(response)
    assert error == {
        "code": "NOT_FOUND",
        "message": "Resource not found.",
        "request_id": "e-404",
    }


def test_unsupported_method_returns_405_with_allow_header(client):
    response = client.put("/_t/ok", headers={"X-Request-ID": "e-405"})
    assert response.status_code == 405
    assert response.headers["Allow"].split(", ") == sorted(response.headers["Allow"].split(", "))
    assert "GET" in response.headers["Allow"].split(", ")
    error = envelope(response)
    assert error["code"] == "METHOD_NOT_ALLOWED"
    assert error["message"] == "Method not allowed."
    assert error["request_id"] == "e-405"


def test_unexpected_exception_returns_sanitized_500_and_rolls_back(client, monkeypatch):
    spy = mock.Mock()
    monkeypatch.setattr(db.session, "rollback", spy)
    response = client.get("/_t/boom")
    assert response.status_code == 500
    error = envelope(response)
    assert error["code"] == "INTERNAL_ERROR"
    assert error["message"] == "Something went wrong."
    assert "leak-sentinel-exc-text" not in response.get_data(as_text=True)
    assert error["request_id"]
    spy.assert_called_once_with()


def test_service_unavailable_returns_503_envelope(client):
    response = client.get("/_t/unavailable")
    assert response.status_code == 503
    error = envelope(response)
    assert error["code"] == "SERVICE_UNAVAILABLE"
    assert error["message"] == "The service is temporarily unavailable. Try again shortly."


def test_api_error_subclass_carries_field_errors(client):
    response = client.get("/_t/validation")
    assert response.status_code == 400
    error = envelope(response)
    assert error["code"] == "VALIDATION_ERROR"
    assert error["fields"] == {"title": "Required."}


def test_other_framework_400_keeps_flask_default_response_until_t03(client):
    response = client.get("/_t/bad")
    assert response.status_code == 400
    assert response.mimetype == "text/html"
    assert "error" not in (response.get_json(silent=True) or {})
