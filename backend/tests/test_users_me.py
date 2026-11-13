"""AUTH-AC5.1–5.2, AUTH-AC4.2: the current-user read and replay of a revoked token."""

import uuid

import pytest

from tests.auth_helpers import Tracker, bearer, decode_unverified


@pytest.fixture
def tracker(app, schema_at_head):
    t = Tracker(app)
    yield t
    t.cleanup()


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def test_authenticated_request_returns_exactly_id_name_and_email(client, tracker):
    user = tracker.make_user(name="Grace Hopper")
    response = client.get("/api/users/me", headers=bearer(tracker.token_for(user.id)))
    assert response.status_code == 200
    assert response.get_json() == {
        "data": {"id": str(user.id), "name": "Grace Hopper", "email": user.email}
    }
    assert response.headers["Cache-Control"] == "private, no-store"
    assert "password" not in response.get_data(as_text=True)


def test_missing_or_invalid_token_returns_401(client):
    assert client.get("/api/users/me").status_code == 401
    response = client.get("/api/users/me", headers=bearer("junk"))
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "AUTH_REQUIRED"
    # AUTH-AC6.5: error responses from a guarded route are private and not stored too.
    assert response.headers["Cache-Control"] == "private, no-store"
    assert client.get("/api/users/me").headers["Cache-Control"] == "private, no-store"


def test_revoked_token_is_rejected(client, tracker):
    user = tracker.make_user()
    token = tracker.token_for(user.id)
    assert client.get("/api/users/me", headers=bearer(token)).status_code == 200
    tracker.revoke(decode_unverified(token)["jti"])
    assert client.get("/api/users/me", headers=bearer(token)).status_code == 401


def test_token_for_an_unknown_user_is_rejected(client, tracker):
    assert (
        client.get("/api/users/me", headers=bearer(tracker.token_for(uuid.uuid4()))).status_code
        == 401
    )


def test_patch_is_not_implemented_until_t12_and_returns_405_with_allow(client, tracker):
    user = tracker.make_user()
    response = client.patch(
        "/api/users/me", json={"name": "x"}, headers=bearer(tracker.token_for(user.id))
    )
    assert response.status_code == 405
    assert "GET" in response.headers["Allow"]
    assert response.get_json()["error"]["code"] == "METHOD_NOT_ALLOWED"


def test_login_then_logout_then_me_is_rejected_end_to_end(client):
    email = f"e2e-{uuid.uuid4().hex[:10]}@example.test"
    password = "correct horse battery staple"
    client.post("/api/auth/register", json={"name": "E2E", "email": email, "password": password})
    try:
        token = client.post(
            "/api/auth/login", json={"email": email, "password": password}
        ).get_json()["data"]["access_token"]
        assert client.get("/api/users/me", headers=bearer(token)).status_code == 200
        assert client.post("/api/auth/logout", headers=bearer(token)).status_code == 200
        replay = client.get("/api/users/me", headers=bearer(token))
        assert replay.status_code == 401
        assert replay.get_json()["error"]["code"] == "AUTH_REQUIRED"
    finally:
        from sqlalchemy import delete

        from app.extensions import db
        from app.models.revoked_token import RevokedToken
        from app.models.user import User

        with client.application.app_context():
            if "token" in locals():
                db.session.execute(
                    delete(RevokedToken).where(
                        RevokedToken.jti == uuid.UUID(decode_unverified(token)["jti"])
                    )
                )
            db.session.execute(delete(User).where(User.email == email))
            db.session.commit()
            db.session.remove()
