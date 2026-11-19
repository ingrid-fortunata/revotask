"""AUTH-AC4.1–4.5: logout revokes the presented token and nothing else."""

import threading
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, func, inspect, select
from sqlalchemy.exc import OperationalError

from app.blueprints.auth.service import revoke_token
from app.extensions import db
from app.models.revoked_token import RevokedToken
from app.models.user import User
from tests.auth_helpers import bearer, decode_unverified, unique_email

PASSWORD = "Horse-4Bat"


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def account(app, client):
    email = unique_email("logout")
    assert (
        client.post(
            "/api/auth/register", json={"name": "Logout User", "email": email, "password": PASSWORD}
        ).status_code
        == 201
    )
    jtis: list[uuid.UUID] = []
    yield {"email": email, "jtis": jtis}
    with app.app_context():
        if jtis:
            db.session.execute(delete(RevokedToken).where(RevokedToken.jti.in_(jtis)))
        db.session.execute(delete(User).where(User.email == email))
        db.session.commit()
        db.session.remove()


def sign_in(client, account):
    response = client.post(
        "/api/auth/login", json={"email": account["email"], "password": PASSWORD}
    )
    token = response.get_json()["data"]["access_token"]
    account["jtis"].append(uuid.UUID(decode_unverified(token)["jti"]))
    return token


def revoked_rows(app, jti):
    with app.app_context():
        return db.session.scalar(
            select(func.count()).select_from(RevokedToken).where(RevokedToken.jti == uuid.UUID(jti))
        )


def test_logout_returns_200_null_and_records_the_jti_and_expiry(client, app, account):
    token = sign_in(client, account)
    claims = decode_unverified(token)
    response = client.post("/api/auth/logout", headers=bearer(token))
    assert response.status_code == 200
    assert response.get_json() == {"data": None}
    assert response.headers["Cache-Control"] == "private, no-store"
    with app.app_context():
        row = db.session.get(RevokedToken, uuid.UUID(claims["jti"]))
        assert row is not None
        assert row.expires_at == datetime.fromtimestamp(claims["exp"], UTC)


def test_only_the_jti_and_expiry_are_stored_never_the_token(client, app, account):
    token = sign_in(client, account)
    client.post("/api/auth/logout", headers=bearer(token))
    with app.app_context():
        columns = {c["name"] for c in inspect(db.engine).get_columns("revoked_tokens", "revotask")}
        assert columns == {"jti", "expires_at"}


def test_revoked_token_is_rejected_on_logout_again(client, account):
    token = sign_in(client, account)
    assert client.post("/api/auth/logout", headers=bearer(token)).status_code == 200
    again = client.post("/api/auth/logout", headers=bearer(token))
    assert again.status_code == 401
    assert again.get_json()["error"]["code"] == "AUTH_REQUIRED"


def test_logout_revokes_only_the_presented_token(client, account):
    first = sign_in(client, account)
    second = sign_in(client, account)
    assert client.post("/api/auth/logout", headers=bearer(first)).status_code == 200
    assert client.post("/api/auth/logout", headers=bearer(first)).status_code == 401
    assert client.post("/api/auth/logout", headers=bearer(second)).status_code == 200


def test_logout_without_a_valid_token_returns_401(client):
    assert client.post("/api/auth/logout").status_code == 401
    assert client.post("/api/auth/logout", headers=bearer("junk")).status_code == 401


def test_revoking_the_same_jti_twice_leaves_one_row(app, schema_at_head):
    jti = uuid.uuid4()
    expires = datetime.now(UTC) + timedelta(hours=1)
    with app.app_context():
        try:
            revoke_token(jti=jti, expires_at=expires)
            revoke_token(jti=jti, expires_at=expires)
            count = db.session.scalar(
                select(func.count()).select_from(RevokedToken).where(RevokedToken.jti == jti)
            )
            assert count == 1
        finally:
            db.session.execute(delete(RevokedToken).where(RevokedToken.jti == jti))
            db.session.commit()
            db.session.remove()


def test_simultaneous_logouts_with_one_token_never_return_500(client, app, account):
    token = sign_in(client, account)
    barrier = threading.Barrier(4)
    statuses: list[int] = []
    lock = threading.Lock()

    def attempt():
        local = app.test_client()
        barrier.wait()
        response = local.post("/api/auth/logout", headers=bearer(token))
        with lock:
            statuses.append(response.status_code)

    threads = [threading.Thread(target=attempt) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert 200 in statuses
    assert set(statuses) <= {200, 401}
    assert revoked_rows(app, decode_unverified(token)["jti"]) == 1


def test_failed_revocation_returns_a_sanitized_500_and_keeps_the_token_valid(
    client, app, account, monkeypatch
):
    token = sign_in(client, account)

    def boom():
        raise OperationalError("INSERT leak-sql-sentinel", {}, Exception("leak-driver"))

    app.testing = False
    with monkeypatch.context() as patch:
        patch.setattr(db.session, "commit", boom)
        response = client.post("/api/auth/logout", headers=bearer(token))
    assert response.status_code == 500
    assert response.get_json()["error"]["code"] == "INTERNAL_ERROR"
    assert "leak" not in response.get_data(as_text=True)
    assert revoked_rows(app, decode_unverified(token)["jti"]) == 0
    assert client.post("/api/auth/logout", headers=bearer(token)).status_code == 200
