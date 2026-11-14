"""E31 (T12): success, rejected input, authentication and response shape.

Covers AC12.1 and Requirements 1, 2 and 3 of the profile spec. Rows are created through
`board_tracker` on TEST_DATABASE_URL and removed after each test.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.extensions import db
from app.models.board_event import BoardEvent
from app.models.notification import Notification
from tests.auth_helpers import bearer, decode_unverified, raw_token
from tests.profile_helpers import patch_me, user_row


@pytest.fixture
def tracker(board_tracker):
    return board_tracker


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def _assert_private(response):
    assert response.headers["Cache-Control"] == "private, no-store"


# --- success -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("body", "expected_name", "expected_email"),
    [
        pytest.param({"name": "New Name"}, "New Name", "old@example.test", id="name-only"),
        pytest.param(
            {"email": "new@example.test"}, "Old Name", "new@example.test", id="email-only"
        ),
        pytest.param(
            {"name": "New Name", "email": "new@example.test"},
            "New Name",
            "new@example.test",
            id="both",
        ),
        pytest.param(
            {"name": "  Padded Name  ", "email": "  MiXed@Example.TEST "},
            "Padded Name",
            "mixed@example.test",
            id="trimmed-and-lowercased",
        ),
    ],
)
def test_success_stores_only_the_submitted_normalized_fields(
    client, tracker, app, body, expected_name, expected_email
):
    user = tracker.make_user(name="Old Name", email="old@example.test")
    before = user_row(app, user.id)
    response = patch_me(client, tracker, user, body)
    assert response.status_code == 200, response.get_json()
    assert response.get_json() == {
        "data": {"id": str(user.id), "name": expected_name, "email": expected_email}
    }
    _assert_private(response)
    after = user_row(app, user.id)
    assert (after["name"], after["email"]) == (expected_name, expected_email)
    assert after["password_hash"] == before["password_hash"]
    assert after["created_at"] == before["created_at"]
    assert after["updated_at"] > before["updated_at"]


def test_response_has_no_secret_or_timestamp_field(client, tracker):
    user = tracker.make_user()
    response = patch_me(client, tracker, user, {"name": "Shown"})
    text = response.get_data(as_text=True)
    assert set(response.get_json()["data"]) == {"id", "name", "email"}
    assert not any(word in text for word in ("password", "hash", "created_at", "updated_at"))


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"name": "Same Name"}, id="same-name"),
        pytest.param({"name": "  Same Name  "}, id="same-name-padded"),
        pytest.param({"email": "same@example.test"}, id="same-email"),
        pytest.param({"email": "SAME@Example.TEST"}, id="own-email-in-another-case"),
        pytest.param({"name": "Same Name", "email": " Same@example.test "}, id="both-unchanged"),
    ],
)
def test_unchanged_values_are_a_no_op(client, tracker, app, body):
    user = tracker.make_user(name="Same Name", email="same@example.test")
    before = user_row(app, user.id)
    response = patch_me(client, tracker, user, body)
    assert response.status_code == 200, response.get_json()
    assert response.get_json()["data"] == {
        "id": str(user.id),
        "name": "Same Name",
        "email": "same@example.test",
    }
    assert user_row(app, user.id) == before  # including updated_at
    _assert_private(response)


def test_a_partial_change_beside_an_unchanged_field_moves_updated_at(client, tracker, app):
    user = tracker.make_user(name="Same Name", email="same@example.test")
    before = user_row(app, user.id)
    response = patch_me(client, tracker, user, {"name": "Same Name", "email": "other@example.test"})
    assert response.status_code == 200
    after = user_row(app, user.id)
    assert after["email"] == "other@example.test" and after["name"] == "Same Name"
    assert after["updated_at"] > before["updated_at"]


def test_no_event_and_no_notification_is_recorded(client, tracker, app):
    user = tracker.make_user()
    with app.app_context():
        counts = (
            db.session.scalar(select(func.count()).select_from(BoardEvent)),
            db.session.scalar(select(func.count()).select_from(Notification)),
        )
        db.session.remove()
    assert patch_me(client, tracker, user, {"name": "Changed"}).status_code == 200
    with app.app_context():
        after = (
            db.session.scalar(select(func.count()).select_from(BoardEvent)),
            db.session.scalar(select(func.count()).select_from(Notification)),
        )
        db.session.remove()
    assert after == counts


# --- rejected input ----------------------------------------------------------------------

REJECTED = [
    pytest.param({}, None, id="empty-object"),
    pytest.param(
        {"password": "Horse-Battery-42"}, {"password": "Unknown field."}, id="password-alone"
    ),
    pytest.param(
        {"name": "Valid", "password": "Horse-Battery-42"},
        {"password": "Unknown field."},
        id="password-beside-valid-name",
    ),
    pytest.param(
        {"current_password": "x"}, {"current_password": "Unknown field."}, id="current-password"
    ),
    pytest.param({"id": str(uuid.uuid4())}, {"id": "Unknown field."}, id="id"),
    pytest.param({"created_at": "2026-01-01"}, {"created_at": "Unknown field."}, id="created-at"),
    pytest.param(
        {"email": "new@example.test", "role": "admin"}, {"role": "Unknown field."}, id="unknown-key"
    ),
    pytest.param({"name": None}, {"name": "Required."}, id="name-null"),
    pytest.param({"email": None}, {"email": "Required."}, id="email-null"),
    pytest.param({"name": 5}, {"name": "Must be text."}, id="name-number"),
    pytest.param({"email": ["a@b.co"]}, {"email": "Must be text."}, id="email-array"),
    pytest.param({"name": "   "}, {"name": "Must be 1 to 80 characters."}, id="name-blank"),
    pytest.param({"name": "a" * 81}, {"name": "Must be 1 to 80 characters."}, id="name-81"),
    pytest.param({"email": ""}, {"email": "Enter a valid email address."}, id="email-blank"),
    pytest.param(
        {"email": "not-an-email"}, {"email": "Enter a valid email address."}, id="email-format"
    ),
    pytest.param(
        {"email": "a" * 243 + "@example.com"},
        {"email": "Must be at most 254 characters."},
        id="email-255",
    ),
]


@pytest.mark.parametrize(("body", "fields"), REJECTED)
def test_rejected_body_is_400_and_changes_nothing(client, tracker, app, body, fields):
    user = tracker.make_user(name="Keep Name", email="keep@example.test")
    before = user_row(app, user.id)
    response = patch_me(client, tracker, user, body)
    assert response.status_code == 400, response.get_json()
    error = response.get_json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    if fields is None:
        assert error["message"] == "Check the submitted fields." and "fields" not in error
    else:
        assert error["fields"] == fields
    assert user_row(app, user.id) == before
    _assert_private(response)


@pytest.mark.parametrize("payload", [[], "text", 5, None])
def test_a_non_object_body_is_400(client, tracker, app, payload):
    user = tracker.make_user()
    before = user_row(app, user.id)
    response = client.patch(
        "/api/users/me",
        data=json.dumps(payload),
        content_type="application/json",
        headers=bearer(tracker.token_for(user.id)),
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"
    assert user_row(app, user.id) == before


def test_malformed_json_is_400(client, tracker):
    user = tracker.make_user()
    response = client.patch(
        "/api/users/me",
        data="{not json",
        content_type="application/json",
        headers=bearer(tracker.token_for(user.id)),
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"


def test_wrong_media_type_is_415(client, tracker):
    user = tracker.make_user()
    response = client.patch(
        "/api/users/me",
        data="name=x",
        content_type="text/plain",
        headers=bearer(tracker.token_for(user.id)),
    )
    assert response.status_code == 415
    assert response.get_json()["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"


def test_oversized_body_is_413(client, tracker, app):
    user = tracker.make_user()
    limit = app.config["MAX_CONTENT_LENGTH"]
    response = client.patch(
        "/api/users/me",
        data='{"name": "' + "a" * (limit + 10) + '"}',
        content_type="application/json",
        headers=bearer(tracker.token_for(user.id)),
    )
    assert response.status_code == 413
    assert response.get_json()["error"]["code"] == "CONTENT_TOO_LARGE"


# --- authentication ----------------------------------------------------------------------


def test_no_token_is_401_and_changes_nothing(client, tracker, app):
    user = tracker.make_user(name="Keep Name")
    before = user_row(app, user.id)
    response = client.patch("/api/users/me", json={"name": "Hacked"})
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "AUTH_REQUIRED"
    _assert_private(response)
    assert user_row(app, user.id) == before


def test_malformed_token_is_401(client):
    response = client.patch("/api/users/me", json={"name": "x"}, headers=bearer("junk"))
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "AUTH_REQUIRED"


def test_expired_token_is_401_and_changes_nothing(client, tracker, app):
    user = tracker.make_user(name="Keep Name")
    token = tracker.token_for(user.id, expires_delta=timedelta(seconds=-5))
    response = client.patch("/api/users/me", json={"name": "Hacked"}, headers=bearer(token))
    assert response.status_code == 401
    assert user_row(app, user.id)["name"] == "Keep Name"


def test_revoked_token_is_401_and_changes_nothing(client, tracker, app):
    user = tracker.make_user(name="Keep Name")
    token = tracker.token_for(user.id)
    tracker.revoke(decode_unverified(token)["jti"])
    response = client.patch("/api/users/me", json={"name": "Hacked"}, headers=bearer(token))
    assert response.status_code == 401
    assert user_row(app, user.id)["name"] == "Keep Name"


def test_token_for_an_unknown_user_is_401(client, tracker):
    token = tracker.token_for(uuid.uuid4())
    response = client.patch("/api/users/me", json={"name": "x"}, headers=bearer(token))
    assert response.status_code == 401


def test_token_without_exp_is_401(client, tracker):
    user = tracker.make_user()
    token = raw_token(
        {
            "sub": str(user.id),
            "jti": str(uuid.uuid4()),
            "type": "access",
            "fresh": False,
            "iat": int(time.time()),
        }
    )
    response = client.patch("/api/users/me", json={"name": "x"}, headers=bearer(token))
    assert response.status_code == 401


# --- check order -------------------------------------------------------------------------


def test_a_bad_token_wins_over_a_bad_body(client):
    response = client.patch("/api/users/me", json={"password": "x"}, headers=bearer("junk"))
    assert response.status_code == 401


def test_a_bad_body_wins_over_a_duplicate_email(client, tracker, app):
    owner = tracker.make_user(email="taken@example.test")
    user = tracker.make_user(name="Keep Name")
    before = user_row(app, user.id)
    response = patch_me(client, tracker, user, {"email": owner.email, "password": "x"})
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"] == {"password": "Unknown field."}
    assert user_row(app, user.id) == before


def test_the_caller_is_the_token_user_and_no_other_row_changes(client, tracker, app):
    other = tracker.make_user(name="Other Name", email="other@example.test")
    user = tracker.make_user(name="Mine")
    before = user_row(app, other.id)
    assert patch_me(client, tracker, user, {"name": "Mine Changed"}).status_code == 200
    assert user_row(app, other.id) == before


def test_other_methods_on_the_route_stay_405(client, tracker):
    user = tracker.make_user()
    response = client.put(
        "/api/users/me", json={"name": "x"}, headers=bearer(tracker.token_for(user.id))
    )
    assert response.status_code == 405
    assert {"GET", "PATCH"} <= set(response.headers["Allow"].replace(" ", "").split(","))
