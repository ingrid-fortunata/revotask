"""E31 and sessions (T12, P15): a password change leaves tokens valid, and login follows it."""

from __future__ import annotations

import pytest

from tests.auth_helpers import bearer, decode_unverified
from tests.profile_helpers import NEW_PASSWORD, PASSWORD, make_login_user, patch_me

PAIR = {"current_password": PASSWORD, "new_password": NEW_PASSWORD}


@pytest.fixture
def tracker(board_tracker):
    return board_tracker


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def _login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_token_identity_is_the_user_id_not_the_email_or_password(tracker):
    user = tracker.make_user()
    claims = decode_unverified(tracker.token_for(user.id))
    assert claims["sub"] == str(user.id)
    assert user.email not in str(claims)


def test_the_existing_session_stays_valid_and_e30_returns_the_unchanged_email(client, tracker, app):
    user = make_login_user(tracker, app)
    token = _login(client, user.email, PASSWORD).get_json()["data"]["access_token"]
    response = client.patch("/api/users/me", json=PAIR, headers=bearer(token))
    assert response.status_code == 200
    me = client.get("/api/users/me", headers=bearer(token))
    assert me.status_code == 200
    assert me.get_json()["data"] == {"id": str(user.id), "name": "Login User", "email": user.email}
    # The same token still writes, so the session was neither revoked nor reissued.
    assert (
        client.patch("/api/users/me", json={"name": "After"}, headers=bearer(token)).status_code
        == 200
    )


def test_every_open_session_stays_valid_after_a_password_change(client, tracker, app):
    user = make_login_user(tracker, app)
    first = _login(client, user.email, PASSWORD).get_json()["data"]["access_token"]
    second = _login(client, user.email, PASSWORD).get_json()["data"]["access_token"]
    assert patch_me(client, tracker, user, PAIR).status_code == 200
    for token in (first, second, tracker.token_for(user.id)):
        assert client.get("/api/users/me", headers=bearer(token)).status_code == 200


def test_a_fresh_login_works_with_the_new_password_and_fails_with_the_old(client, tracker, app):
    user = make_login_user(tracker, app)
    assert patch_me(client, tracker, user, PAIR).status_code == 200
    fresh = _login(client, user.email, NEW_PASSWORD)
    assert fresh.status_code == 200
    assert fresh.get_json()["data"]["user"]["email"] == user.email  # the login key is unchanged
    old = _login(client, user.email, PASSWORD)
    assert old.status_code == 401
    assert old.get_json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_a_failed_password_change_keeps_the_old_password(client, tracker, app):
    user = make_login_user(tracker, app)
    body = {"current_password": "Wrong#pw1", "new_password": NEW_PASSWORD}
    assert patch_me(client, tracker, user, body).status_code == 400
    assert _login(client, user.email, PASSWORD).status_code == 200
    assert _login(client, user.email, NEW_PASSWORD).status_code == 401


def test_a_name_change_leaves_the_password_working(client, tracker, app):
    user = make_login_user(tracker, app)
    assert patch_me(client, tracker, user, {"name": "Renamed"}).status_code == 200
    assert _login(client, user.email, PASSWORD).status_code == 200
