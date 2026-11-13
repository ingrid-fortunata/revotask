"""AUTH-AC6.1-6.4: register and login limits. These prove local behavior only (AUTH-AC6.6).

Counters live in process memory, one set per Gunicorn worker. The tests run in one process, so each
test builds its own app and resets the limiter first, which gives fresh counters. Login and
register use separate limit keys, so one endpoint never spends the other endpoint's quota.
"""

import time

import pytest
from sqlalchemy import delete

from app import create_app
from app.config import ConfigError, Settings
from app.extensions import db, limiter
from app.models.user import User
from tests.auth_helpers import JWT_TEST_SECRET, unique_email

PASSWORD = "Horse-Battery-42"


def make_app(test_db_url, enabled="true"):
    return create_app(
        {
            "APP_ENV": "test",
            "DATABASE_URL": test_db_url,
            "JWT_SECRET_KEY": JWT_TEST_SECRET,
            "LOG_LEVEL": "WARNING",
            "RATE_LIMIT_ENABLED": enabled,
        }
    )


@pytest.fixture
def limited_app(test_db_url, schema_at_head):
    app = make_app(test_db_url)
    limiter.reset()  # fresh counters: no quota is inherited from an earlier test
    emails: list[str] = []
    app.created_emails = emails
    yield app
    with app.app_context():
        db.session.execute(delete(User).where(User.email.in_(emails)))
        db.session.commit()
        db.session.remove()


def assert_rate_limited(response):
    assert response.status_code == 429
    error = response.get_json()["error"]
    assert error["code"] == "RATE_LIMITED"
    assert error["request_id"], "the request ID hook must run before the limiter"
    assert response.headers["X-Request-ID"] == error["request_id"]
    assert float(response.headers["Retry-After"]) >= 1
    assert response.headers["Cache-Control"] == "private, no-store"


def test_sixth_register_request_in_a_minute_returns_429_and_successes_count(limited_app):
    client = limited_app.test_client()
    for _ in range(5):
        email = unique_email("rl")
        limited_app.created_emails.append(email)
        response = client.post(
            "/api/auth/register", json={"name": "RL", "email": email, "password": PASSWORD}
        )
        assert response.status_code == 201
    blocked = client.post(
        "/api/auth/register", json={"name": "RL", "email": unique_email("rl"), "password": PASSWORD}
    )
    assert_rate_limited(blocked)
    assert blocked.get_json()["error"].get("fields") is None


def test_sixth_login_attempt_for_one_email_returns_429_but_another_email_is_unaffected(
    limited_app,
):
    client = limited_app.test_client()
    email = unique_email("rl")
    for _ in range(5):
        response = client.post("/api/auth/login", json={"email": email, "password": "wrong-one"})
        assert response.status_code == 401
    assert_rate_limited(client.post("/api/auth/login", json={"email": email, "password": "x"}))
    # The per-email key is the normalized address, so a case variant hits the same counter.
    assert_rate_limited(
        client.post("/api/auth/login", json={"email": email.upper(), "password": "x"})
    )
    other = client.post("/api/auth/login", json={"email": unique_email("rl"), "password": "x"})
    assert other.status_code == 401


def test_login_address_limit_applies_to_bodies_without_a_usable_email(limited_app):
    client = limited_app.test_client()
    for _ in range(20):
        assert (
            client.post("/api/auth/login", data="x", content_type="text/plain").status_code == 415
        )
    assert_rate_limited(client.post("/api/auth/login", data="x", content_type="text/plain"))


def test_a_malformed_body_does_not_break_the_email_key(limited_app):
    client = limited_app.test_client()
    for body in ("{bad", "[]", '{"email": 5}', '{"email": "  "}', ""):
        response = client.post("/api/auth/login", data=body, content_type="application/json")
        assert response.status_code == 400


def test_the_limit_resets_after_the_window(limited_app, monkeypatch):
    client = limited_app.test_client()
    email = unique_email("rl")
    for _ in range(5):
        client.post("/api/auth/login", json={"email": email, "password": "x"})
    assert client.post("/api/auth/login", json={"email": email, "password": "x"}).status_code == 429
    real_time = time.time
    monkeypatch.setattr(time, "time", lambda: real_time() + 61)
    assert client.post("/api/auth/login", json={"email": email, "password": "x"}).status_code == 401


def test_limits_do_not_apply_when_disabled(test_db_url, schema_at_head):
    client = make_app(test_db_url, enabled="false").test_client()
    for _ in range(8):
        response = client.post("/api/auth/register", json={})
        assert response.status_code == 400


def test_health_and_other_routes_are_not_limited(limited_app):
    client = limited_app.test_client()
    assert all(client.get("/api/health").status_code == 200 for _ in range(30))


@pytest.mark.parametrize(
    ("value", "expected"),
    [(None, True), ("", True), ("true", True), ("TRUE", True), ("false", False)],
)
def test_rate_limit_flag_values(value, expected):
    env = {
        "APP_ENV": "development",
        "DATABASE_URL": "postgresql+psycopg://u:p@h/d",
        "JWT_SECRET_KEY": "k",
    }
    if value is not None:
        env["RATE_LIMIT_ENABLED"] = value
    assert Settings.from_env(env).rate_limit_enabled is expected


def test_rate_limit_flag_rejects_other_values_without_echoing_them():
    env = {
        "APP_ENV": "development",
        "DATABASE_URL": "postgresql+psycopg://u:p@h/d",
        "JWT_SECRET_KEY": "k",
        "RATE_LIMIT_ENABLED": "maybe-sentinel",
    }
    with pytest.raises(ConfigError) as caught:
        Settings.from_env(env)
    assert "RATE_LIMIT_ENABLED" in str(caught.value)
    assert "maybe-sentinel" not in str(caught.value)


def test_rate_limit_cannot_be_disabled_in_production():
    env = {
        "APP_ENV": "production",
        "DATABASE_URL": "postgresql+psycopg://u:p@h/d",
        "JWT_SECRET_KEY": "k" * 40,
        "RATE_LIMIT_ENABLED": "false",
    }
    with pytest.raises(ConfigError) as caught:
        Settings.from_env(env)
    assert str(caught.value).startswith("RATE_LIMIT_ENABLED")
    assert "false" not in str(caught.value).split(":", 1)[0]


def test_five_invalid_logins_then_429_for_one_normalized_email(limited_app):
    """AUTH-AC6.2: the first five invalid attempts for one email get 401, the sixth gets 429.

    The attempts use different spellings of one normalized email (case and padding), so the test
    also shows that the limit key is the normalized address and not the raw string.
    """
    client = limited_app.test_client()
    email = unique_email("login-seq")
    spellings = [email, email.upper(), f"  {email}  ", email.title(), email, f" {email.upper()}"]
    responses = [
        client.post("/api/auth/login", json={"email": spelling, "password": "wrong-password-0"})
        for spelling in spellings
    ]
    assert [r.status_code for r in responses] == [401, 401, 401, 401, 401, 429]
    for invalid in responses[:5]:
        assert invalid.get_json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert_rate_limited(responses[5])


def test_login_and_register_spend_separate_quotas(limited_app):
    """A blocked login does not block registration, and registration does not use login quota."""
    client = limited_app.test_client()
    email = unique_email("separate")
    for _ in range(6):
        client.post("/api/auth/login", json={"email": email, "password": "wrong-password-0"})
    assert_rate_limited(client.post("/api/auth/login", json={"email": email, "password": "x"}))

    limited_app.created_emails.append(email)
    registered = client.post(
        "/api/auth/register", json={"name": "Separate", "email": email, "password": PASSWORD}
    )
    assert registered.status_code == 201, "a blocked login must not block registration"


def test_retry_after_is_sent_only_with_429(limited_app):
    """A 401 from a limited endpoint carries no Retry-After. Only the 429 does (RFC 9110)."""
    client = limited_app.test_client()
    email = unique_email("retry-after")
    statuses = []
    for _ in range(6):
        response = client.post(
            "/api/auth/login", json={"email": email, "password": "wrong-password-0"}
        )
        statuses.append(response.status_code)
        if response.status_code == 401:
            assert "Retry-After" not in response.headers
        else:
            assert response.status_code == 429
            assert "Retry-After" in response.headers
    assert statuses == [401, 401, 401, 401, 401, 429]
