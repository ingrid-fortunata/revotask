"""AUTH-AC3.1–3.4: one guard rejects every unacceptable credential with 401 AUTH_REQUIRED."""

import logging
import time
import uuid
from datetime import timedelta

import pytest

from app import create_app
from tests.auth_helpers import (
    JWT_TEST_SECRET,
    Tracker,
    bearer,
    decode_unverified,
    raw_token,
)
from tests.probe_routes import add_probe_routes

AUTH_MESSAGE = "Authentication is required."


@pytest.fixture(scope="module")
def guard_app(test_db_url):
    app = create_app(
        {
            "APP_ENV": "test",
            "DATABASE_URL": test_db_url,
            "JWT_SECRET_KEY": JWT_TEST_SECRET,
            "LOG_LEVEL": "INFO",
            "RATE_LIMIT_ENABLED": "false",
        }
    )
    add_probe_routes(app)
    app.testing = False
    return app


@pytest.fixture
def tracker(guard_app, schema_at_head):
    t = Tracker(guard_app)
    yield t
    t.cleanup()


@pytest.fixture
def client(guard_app, schema_at_head):
    return guard_app.test_client()


def assert_auth_required(response):
    assert response.status_code == 401
    body = response.get_json()
    assert set(body) == {"error"}, body
    error = body["error"]
    assert error["code"] == "AUTH_REQUIRED"
    assert error["message"] == AUTH_MESSAGE
    assert error["request_id"]
    assert "fields" not in error
    assert "msg" not in body


def test_valid_token_reaches_the_handler_with_the_user(client, tracker):
    user = tracker.make_user()
    response = client.get("/_t/protected", headers=bearer(tracker.token_for(user.id)))
    assert response.status_code == 200
    assert response.get_json() == {"data": {"user_id": str(user.id)}}


@pytest.mark.parametrize(
    "header",
    [
        None,
        "",
        "Bearer",
        "Bearer ",
        "Basic dXNlcjpwYXNz",
        "bearer-token-without-scheme",
        "Token abc",
    ],
)
def test_absent_or_malformed_authorization_header_returns_401(client, header):
    headers = {"Authorization": header} if header is not None else {}
    assert_auth_required(client.get("/_t/protected", headers=headers))


def test_garbage_token_returns_401(client):
    assert_auth_required(client.get("/_t/protected", headers=bearer("not.a.jwt")))
    assert_auth_required(client.get("/_t/protected", headers=bearer("a.b.c")))


def test_token_signed_with_another_secret_returns_401(client, tracker):
    user = tracker.make_user()
    now = int(time.time())
    token = raw_token(
        {"sub": str(user.id), "jti": str(uuid.uuid4()), "iat": now, "exp": now + 600},
        secret="a-different-secret-0123456789abcdef0123",
    )
    assert_auth_required(client.get("/_t/protected", headers=bearer(token)))


def test_alg_none_token_returns_401(client, tracker):
    user = tracker.make_user()
    now = int(time.time())
    token = raw_token(
        {"sub": str(user.id), "jti": str(uuid.uuid4()), "iat": now, "exp": now + 600},
        secret=None,
        algorithm="none",
    )
    assert_auth_required(client.get("/_t/protected", headers=bearer(token)))


def test_expired_token_returns_401(client, tracker):
    user = tracker.make_user()
    token = tracker.token_for(user.id, expires_delta=timedelta(seconds=-5))
    assert_auth_required(client.get("/_t/protected", headers=bearer(token)))


def test_revoked_token_returns_401(client, tracker):
    user = tracker.make_user()
    token = tracker.token_for(user.id)
    ok = client.get("/_t/protected", headers=bearer(token))
    assert ok.status_code == 200
    tracker.revoke(decode_unverified(token)["jti"])
    assert_auth_required(client.get("/_t/protected", headers=bearer(token)))


@pytest.mark.parametrize("missing", ["sub", "jti", "exp"])
def test_token_missing_a_required_claim_returns_401(client, tracker, missing):
    user = tracker.make_user()
    now = int(time.time())
    claims = {"sub": str(user.id), "jti": str(uuid.uuid4()), "iat": now, "exp": now + 600}
    del claims[missing]
    assert_auth_required(client.get("/_t/protected", headers=bearer(raw_token(claims))))


@pytest.mark.parametrize("jti", ["not-a-uuid", 12345])
def test_token_with_a_non_uuid_jti_returns_401(client, tracker, jti):
    user = tracker.make_user()
    now = int(time.time())
    claims = {"sub": str(user.id), "jti": jti, "iat": now, "exp": now + 600}
    assert_auth_required(client.get("/_t/protected", headers=bearer(raw_token(claims))))


def test_token_with_a_non_uuid_subject_returns_401(client):
    now = int(time.time())
    claims = {"sub": "not-a-uuid", "jti": str(uuid.uuid4()), "iat": now, "exp": now + 600}
    assert_auth_required(client.get("/_t/protected", headers=bearer(raw_token(claims))))


def test_token_for_a_user_that_does_not_exist_returns_401(client, tracker):
    token = tracker.token_for(uuid.uuid4())
    assert_auth_required(client.get("/_t/protected", headers=bearer(token)))


def test_every_failure_uses_the_same_message(client, tracker):
    user = tracker.make_user()
    expired = tracker.token_for(user.id, expires_delta=timedelta(seconds=-5))
    messages = {
        client.get("/_t/protected").get_json()["error"]["message"],
        client.get("/_t/protected", headers=bearer("junk")).get_json()["error"]["message"],
        client.get("/_t/protected", headers=bearer(expired)).get_json()["error"]["message"],
    }
    assert messages == {AUTH_MESSAGE}


def test_request_log_has_actor_id_for_authenticated_requests_and_never_a_token(
    client, tracker, caplog
):
    user = tracker.make_user()
    token = tracker.token_for(user.id)
    with caplog.at_level(logging.INFO, logger="revotask"):
        client.get("/_t/protected", headers={**bearer(token), "X-Request-ID": "guard-log-1"})
        client.get("/_t/protected", headers={**bearer("junk"), "X-Request-ID": "guard-log-2"})
    lines = {
        r.getMessage().split("request_id=")[1].split()[0]: r.getMessage() for r in caplog.records
    }
    assert f"actor_id={user.id}" in lines["guard-log-1"]
    assert "actor_id=-" in lines["guard-log-2"]
    assert "error_code=AUTH_REQUIRED" in lines["guard-log-2"]
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert token not in text
    assert "junk" not in text
