"""E31 and sessions (T12, P8): an email change leaves tokens valid, and login follows the email."""

from __future__ import annotations

import pytest

from tests.auth_helpers import bearer, decode_unverified
from tests.profile_helpers import PASSWORD, make_login_user, patch_me


@pytest.fixture
def tracker(board_tracker):
    return board_tracker


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def _login(client, email, password=PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_token_identity_is_the_user_id_not_the_email(tracker):
    user = tracker.make_user()
    claims = decode_unverified(tracker.token_for(user.id))
    assert claims["sub"] == str(user.id)
    assert user.email not in str(claims)


def test_the_existing_session_stays_valid_and_e30_returns_the_new_email(client, tracker, app):
    user = make_login_user(tracker, app)
    token = _login(client, user.email).get_json()["data"]["access_token"]
    new_email = f"moved-{user.email}"
    response = client.patch("/api/users/me", json={"email": new_email}, headers=bearer(token))
    assert response.status_code == 200
    me = client.get("/api/users/me", headers=bearer(token))
    assert me.status_code == 200
    assert me.get_json()["data"] == {"id": str(user.id), "name": "Login User", "email": new_email}
    # The same token still writes, so the session was neither revoked nor reissued.
    assert (
        client.patch("/api/users/me", json={"name": "After"}, headers=bearer(token)).status_code
        == 200
    )


def test_a_token_minted_before_the_change_works_after_it(client, tracker, app):
    user = make_login_user(tracker, app)
    token = tracker.token_for(user.id)
    assert patch_me(client, tracker, user, {"email": f"new-{user.email}"}).status_code == 200
    assert client.get("/api/users/me", headers=bearer(token)).status_code == 200


def test_a_fresh_login_works_with_the_new_email_and_fails_with_the_old(client, tracker, app):
    user = make_login_user(tracker, app)
    new_email = f"new-{user.email}"
    assert patch_me(client, tracker, user, {"email": new_email.upper()}).status_code == 200
    fresh = _login(client, new_email)
    assert fresh.status_code == 200
    assert fresh.get_json()["data"]["user"]["email"] == new_email
    old = _login(client, user.email)
    assert old.status_code == 401
    assert old.get_json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_the_password_still_works_after_a_name_and_email_change(client, tracker, app):
    user = make_login_user(tracker, app)
    new_email = f"again-{user.email}"
    patch_me(client, tracker, user, {"name": "Renamed", "email": new_email})
    assert _login(client, new_email).status_code == 200
    assert _login(client, new_email, "Wrong-Password-1!").status_code == 401
