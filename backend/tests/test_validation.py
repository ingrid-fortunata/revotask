"""AUTH-AC7.1, AUTH-AC7.5: JSON body failures use the shared envelope with 400, 413 or 415."""

import json

import pytest

from app import create_app
from app.config import MAX_REQUEST_BODY_BYTES
from tests.probe_routes import add_probe_routes

ENV = {
    "APP_ENV": "development",
    "DATABASE_URL": "postgresql+psycopg://revotask:val-pw@127.0.0.1:1/revotask_dev",
    "JWT_SECRET_KEY": "validation-test-secret-0123456789abcdef",
    "LOG_LEVEL": "INFO",
    "RATE_LIMIT_ENABLED": "false",
}
JSON = {"Content-Type": "application/json", "X-Request-ID": "val-1"}


@pytest.fixture
def client():
    app = create_app(ENV)
    add_probe_routes(app)
    app.testing = False
    return app.test_client()


def error_of(response):
    body = response.get_json()
    assert set(body) == {"error"}, body
    return body["error"]


@pytest.mark.parametrize("raw", ["{not json", "", "[1, 2]", "null", '"text"', "12"])
def test_bad_json_or_non_object_body_returns_400_without_fields(client, raw):
    response = client.post("/_t/json", data=raw, headers=JSON)
    assert response.status_code == 400
    error = error_of(response)
    assert error["code"] == "VALIDATION_ERROR"
    assert error["request_id"] == "val-1"
    assert "fields" not in error


@pytest.mark.parametrize("content_type", [None, "text/plain", "application/x-www-form-urlencoded"])
def test_missing_or_non_json_content_type_returns_415(client, content_type):
    headers = {"X-Request-ID": "val-2"}
    if content_type:
        headers["Content-Type"] = content_type
    response = client.post("/_t/json", data='{"name": "x"}', headers=headers)
    assert response.status_code == 415
    error = error_of(response)
    assert error["code"] == "UNSUPPORTED_MEDIA_TYPE"
    assert error["request_id"] == "val-2"


def test_json_content_type_with_charset_is_accepted(client):
    response = client.post(
        "/_t/json",
        data='{"name": "x"}',
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    assert response.status_code == 200
    assert response.get_json() == {"data": {"name": "x"}}


def _body_of_size(size):
    filler = "a" * (size - len('{"name": ""}'))
    body = json.dumps({"name": filler})
    assert len(body.encode()) == size
    return body


def test_body_at_the_limit_is_accepted_and_one_byte_over_returns_413(client):
    at_limit = client.post("/_t/json", data=_body_of_size(MAX_REQUEST_BODY_BYTES), headers=JSON)
    assert at_limit.status_code == 200
    over = client.post("/_t/json", data=_body_of_size(MAX_REQUEST_BODY_BYTES + 1), headers=JSON)
    assert over.status_code == 413
    error = error_of(over)
    assert error["code"] == "CONTENT_TOO_LARGE"
    assert error["request_id"] == "val-1"


def test_wrong_content_type_wins_over_an_oversized_body(client):
    response = client.post(
        "/_t/json",
        data=_body_of_size(MAX_REQUEST_BODY_BYTES + 1),
        headers={"Content-Type": "text/plain"},
    )
    assert response.status_code == 415


def test_field_errors_use_fixed_messages_and_never_echo_the_input(client):
    sentinel = "leak-sentinel-value-777"
    response = client.post("/_t/json", json={"name": sentinel, "extra": sentinel}, headers=JSON)
    assert response.status_code == 400
    error = error_of(response)
    assert error["fields"] == {"extra": "Unknown field."}
    assert sentinel not in response.get_data(as_text=True)


def test_missing_field_returns_the_schema_message(client):
    response = client.post("/_t/json", json={}, headers=JSON)
    assert error_of(response)["fields"] == {"name": "Required."}
