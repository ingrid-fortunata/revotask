"""AUTH-AC2.1–2.5: login through the HTTP API."""

import logging
import uuid

import jwt as pyjwt
import pytest
from sqlalchemy import delete

from app.blueprints.auth import service
from app.extensions import db
from app.models.user import User
from tests.auth_cases import load_cases
from tests.auth_helpers import JWT_TEST_SECRET, unique_email

PASSWORD = "Horse-4Bat"


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def account(app, client):
    """A registered account (real Argon2 hash). Removed after the test."""
    email = unique_email("login")
    response = client.post(
        "/api/auth/register", json={"name": "Login User", "email": email, "password": PASSWORD}
    )
    assert response.status_code == 201
    yield {"email": email, "id": response.get_json()["data"]["id"]}
    with app.app_context():
        db.session.execute(delete(User).where(User.email == email))
        db.session.commit()
        db.session.remove()


def login(client, **body):
    return client.post("/api/auth/login", json=body, headers={"X-Request-ID": "login-test"})


def test_valid_login_returns_token_ttl_and_the_public_user(client, account):
    response = login(client, email=account["email"], password=PASSWORD)
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert set(data) == {"access_token", "expires_in", "user"}
    assert data["expires_in"] == 3600
    assert data["user"] == {"id": account["id"], "name": "Login User", "email": account["email"]}
    assert response.headers["Cache-Control"] == "private, no-store"
    assert "password_hash" not in response.get_data(as_text=True)


def test_token_claims(client, account):
    token = login(client, email=account["email"], password=PASSWORD).get_json()["data"][
        "access_token"
    ]
    assert pyjwt.get_unverified_header(token)["alg"] == "HS256"
    claims = pyjwt.decode(token, JWT_TEST_SECRET, algorithms=["HS256"])
    assert claims["sub"] == account["id"]
    assert claims["exp"] - claims["iat"] == 3600
    assert str(uuid.UUID(claims["jti"])) == claims["jti"]
    for forbidden in ("name", "email", "password", "password_hash"):
        assert forbidden not in claims
    assert "Login User" not in token


@pytest.mark.parametrize("variant", [lambda e: e.upper(), lambda e: f"  {e}  "])
def test_email_matches_after_trim_and_lowercase(client, account, variant):
    response = login(client, email=variant(account["email"]), password=PASSWORD)
    assert response.status_code == 200


def test_login_does_not_apply_the_register_password_rules(client, account):
    # Login accepts any length from 1 and no composition check (AUTH-AC2.4). A short or
    # simple password gets the normal 401, never a policy message.
    response = login(client, email=account["email"], password="abc")
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_wrong_password_and_unknown_email_return_identical_401s(client, account):
    wrong = login(client, email=account["email"], password="wrong-pw-1")
    unknown = login(client, email=unique_email("nobody"), password=PASSWORD)
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.get_json() == unknown.get_json()
    error = wrong.get_json()["error"]
    assert error["code"] == "INVALID_CREDENTIALS"
    assert error["message"] == "Invalid email or password."
    assert "fields" not in error
    assert "access_token" not in wrong.get_data(as_text=True)
    assert "Set-Cookie" not in wrong.headers


def test_unknown_email_still_runs_a_password_verification(client, monkeypatch):
    calls = []
    original = service.verify_dummy
    monkeypatch.setattr(service, "verify_dummy", lambda p: calls.append(1) or original(p))
    assert login(client, email=unique_email("ghost"), password=PASSWORD).status_code == 401
    assert calls == [1]


def test_known_email_does_not_use_the_dummy_check(client, account, monkeypatch):
    calls = []
    monkeypatch.setattr(service, "verify_dummy", lambda p: calls.append(1))
    login(client, email=account["email"], password="wrong-pw-2")
    assert calls == []


def _rejected_cases():
    _, cases = load_cases("login")
    return [
        pytest.param(body, expect["fields"], id=case_id)
        for case_id, body, expect in cases
        if "fields" in expect
    ]


@pytest.mark.parametrize(("body", "fields"), _rejected_cases())
def test_invalid_input_returns_400_with_field_messages(client, body, fields):
    response = client.post("/api/auth/login", json=body)
    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["fields"] == fields


def test_unsupported_content_type_oversize_and_malformed_json(client):
    assert client.post("/api/auth/login", data="{}", content_type="text/plain").status_code == 415
    big = '{"email": "' + "a" * 70000 + '"}'
    assert (
        client.post("/api/auth/login", data=big, content_type="application/json").status_code == 413
    )
    assert (
        client.post("/api/auth/login", data="[]", content_type="application/json").status_code
        == 400
    )


def test_logs_contain_neither_the_password_nor_the_token(client, account, caplog):
    with caplog.at_level(logging.DEBUG, logger="revotask"):
        ok = login(client, email=account["email"], password=PASSWORD)
        login(client, email=account["email"], password="S3cret-pw!")
    token = ok.get_json()["data"]["access_token"]
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert PASSWORD not in text and "S3cret-pw!" not in text
    assert token not in text


def test_password_over_ten_characters_is_a_400_before_any_credential_check(client, account):
    """Revision 5 (C12, AUTH-AC2.4): 11 characters fail the length rule, not the credentials."""
    response = login(client, email=account["email"], password="a" * 11)
    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["fields"] == {"password": "Must be 1 to 10 characters."}
    assert login(client, email=account["email"], password="a" * 10).status_code == 401
