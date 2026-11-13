"""AUTH-AC1.1–1.6: registration through the HTTP API."""

import threading
import uuid

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.user import User
from tests.auth_cases import load_cases
from tests.auth_helpers import unique_email

PASSWORD = "correct horse battery staple"


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def created(app):
    """Emails registered by a test. Their rows are removed afterward."""
    emails: list[str] = []
    yield emails
    with app.app_context():
        db.session.execute(delete(User).where(User.email.in_(emails)))
        db.session.commit()
        db.session.remove()


def register(client, **body):
    return client.post("/api/auth/register", json=body, headers={"X-Request-ID": "reg-test"})


def count_users(app, email):
    with app.app_context():
        return db.session.scalar(select(func.count()).select_from(User).where(User.email == email))


def test_valid_registration_returns_201_with_only_the_public_user(client, app, created):
    email = unique_email()
    created.append(email)
    response = register(client, name="  Ada Lovelace ", email=email.upper(), password=PASSWORD)
    assert response.status_code == 201
    data = response.get_json()["data"]
    assert set(data) == {"id", "name", "email"}
    assert uuid.UUID(data["id"])
    assert data["name"] == "Ada Lovelace"
    assert data["email"] == email
    text = response.get_data(as_text=True).lower()
    assert PASSWORD.lower() not in text
    assert "password" not in text and "hash" not in text and "access_token" not in text
    assert "Set-Cookie" not in response.headers
    assert response.headers["Cache-Control"] == "private, no-store"


def test_stored_password_is_an_argon2id_hash(client, app, created):
    email = unique_email()
    created.append(email)
    assert register(client, name="Ada", email=email, password=PASSWORD).status_code == 201
    with app.app_context():
        user = db.session.scalar(select(User).where(User.email == email))
        assert user.password_hash.startswith("$argon2id$")
        assert PASSWORD not in user.password_hash
        assert user.name == "Ada"


def _rejected_cases():
    _, cases = load_cases("register")
    return [
        pytest.param(body, expect["fields"], id=case_id)
        for case_id, body, expect in cases
        if "fields" in expect
    ]


@pytest.mark.parametrize(("body", "fields"), _rejected_cases())
def test_invalid_input_returns_400_with_field_messages(client, app, body, fields):
    response = client.post("/api/auth/register", json=body, headers={"X-Request-ID": "reg-400"})
    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["fields"] == fields
    assert error["request_id"] == "reg-400"
    assert count_users(app, str(body.get("email", "")).strip().lower()) == 0


def test_extra_field_is_rejected_and_nothing_is_created(client, app, created):
    email = unique_email()
    created.append(email)
    response = register(client, name="Ada", email=email, password=PASSWORD, role="admin")
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"] == {"role": "Unknown field."}
    assert count_users(app, email) == 0


def test_unsupported_content_type_and_oversize_and_malformed_json(client):
    assert (
        client.post("/api/auth/register", data="{}", content_type="text/plain").status_code == 415
    )
    big = '{"name": "' + "a" * 70000 + '"}'
    assert (
        client.post("/api/auth/register", data=big, content_type="application/json").status_code
        == 413
    )
    assert (
        client.post("/api/auth/register", data="{oops", content_type="application/json").status_code
        == 400
    )


@pytest.mark.parametrize(
    "variant", [lambda e: e.upper(), lambda e: f"  {e}  ", lambda e: e.title()]
)
def test_duplicate_email_variants_return_409_and_create_no_second_row(
    client, app, created, variant
):
    email = unique_email()
    created.append(email)
    assert register(client, name="First", email=email, password=PASSWORD).status_code == 201
    response = register(client, name="Second", email=variant(email), password=PASSWORD)
    assert response.status_code == 409
    error = response.get_json()["error"]
    assert error["code"] == "EMAIL_ALREADY_EXISTS"
    assert error["request_id"] == "reg-test"
    assert count_users(app, email) == 1


def test_eight_simultaneous_registrations_of_one_email_create_one_account(app, created):
    email = unique_email("race")
    created.append(email)
    barrier = threading.Barrier(8)
    statuses: list[int] = []
    lock = threading.Lock()

    def attempt(n):
        client = app.test_client()
        barrier.wait()
        response = client.post(
            "/api/auth/register",
            json={"name": f"Racer {n}", "email": email, "password": PASSWORD},
        )
        with lock:
            statuses.append(response.status_code)

    threads = [threading.Thread(target=attempt, args=(n,)) for n in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(statuses) == [201] + [409] * 7
    assert count_users(app, email) == 1


def test_other_database_failures_return_the_sanitized_500(client, app, created, monkeypatch):
    email = unique_email()
    created.append(email)

    def boom():
        raise IntegrityError(
            "INSERT leak-sql-sentinel", {"p": "leak-param"}, Exception("leak-driver")
        )

    monkeypatch.setattr(db.session, "commit", boom)
    app.testing = False
    response = register(client, name="Ada", email=email, password=PASSWORD)
    assert response.status_code == 500
    text = response.get_data(as_text=True)
    assert response.get_json()["error"]["code"] == "INTERNAL_ERROR"
    assert "leak" not in text and "INSERT" not in text
