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

from app.blueprints.auth.service import hash_password, verify_password
from app.blueprints.users import service as users_service
from app.extensions import db
from app.models.board_event import BoardEvent
from app.models.notification import Notification
from app.models.user import User
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

OLD_PASSWORD = "Old#pass1"
NEW_PASSWORD = "New#pass2"


def _make_user(tracker, app, **kwargs):
    """A tracked user whose stored password is OLD_PASSWORD."""
    user = tracker.make_user(**kwargs)
    with app.app_context():
        try:
            row = db.session.get(User, user.id)
            row.password_hash = hash_password(OLD_PASSWORD)
            db.session.commit()
        finally:
            db.session.remove()
    return user


PAIR = {"current_password": OLD_PASSWORD, "new_password": NEW_PASSWORD}


@pytest.mark.parametrize(
    ("body", "expected_name", "password_changes"),
    [
        pytest.param({"name": "New Name"}, "New Name", False, id="name-only"),
        pytest.param(dict(PAIR), "Old Name", True, id="password-pair-only"),
        pytest.param({"name": "New Name", **PAIR}, "New Name", True, id="name-and-pair"),
        pytest.param({"name": "  Padded Name  "}, "Padded Name", False, id="trimmed-name"),
    ],
)
def test_success_stores_only_the_submitted_fields(
    client, tracker, app, body, expected_name, password_changes
):
    user = _make_user(tracker, app, name="Old Name", email="old@example.test")
    before = user_row(app, user.id)
    response = patch_me(client, tracker, user, body)
    assert response.status_code == 200, response.get_json()
    assert response.get_json() == {
        "data": {"id": str(user.id), "name": expected_name, "email": "old@example.test"}
    }
    _assert_private(response)
    after = user_row(app, user.id)
    assert (after["name"], after["email"]) == (expected_name, "old@example.test")
    assert after["created_at"] == before["created_at"]
    assert after["updated_at"] > before["updated_at"]
    if password_changes:
        assert after["password_hash"] != before["password_hash"]
        assert verify_password(after["password_hash"], NEW_PASSWORD)
        assert not verify_password(after["password_hash"], OLD_PASSWORD)
    else:
        assert after["password_hash"] == before["password_hash"]


def test_response_has_no_secret_or_timestamp_field(client, tracker, app):
    user = _make_user(tracker, app)
    response = patch_me(client, tracker, user, {"name": "Shown", **PAIR})
    text = response.get_data(as_text=True)
    assert set(response.get_json()["data"]) == {"id", "name", "email"}
    assert not any(
        word in text
        for word in ("password", "hash", "created_at", "updated_at", OLD_PASSWORD, NEW_PASSWORD)
    )


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"name": "Same Name"}, id="same-name"),
        pytest.param({"name": "  Same Name  "}, id="same-name-padded"),
    ],
)
def test_an_unchanged_name_is_a_no_op(client, tracker, app, body):
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


def test_a_password_change_beside_an_unchanged_name_moves_updated_at(client, tracker, app):
    user = _make_user(tracker, app, name="Same Name")
    before = user_row(app, user.id)
    response = patch_me(client, tracker, user, {"name": "Same Name", **PAIR})
    assert response.status_code == 200
    after = user_row(app, user.id)
    assert after["name"] == "Same Name"
    assert after["password_hash"] != before["password_hash"]
    assert after["updated_at"] > before["updated_at"]


def test_the_same_new_password_still_stores_a_new_hash(client, tracker, app):
    user = _make_user(tracker, app)
    before = user_row(app, user.id)
    body = {"current_password": OLD_PASSWORD, "new_password": OLD_PASSWORD}
    assert patch_me(client, tracker, user, body).status_code == 200
    after = user_row(app, user.id)
    assert after["password_hash"] != before["password_hash"]  # a fresh salt
    assert after["updated_at"] > before["updated_at"]


def test_no_event_and_no_notification_is_recorded(client, tracker, app):
    user = _make_user(tracker, app)
    with app.app_context():
        counts = (
            db.session.scalar(select(func.count()).select_from(BoardEvent)),
            db.session.scalar(select(func.count()).select_from(Notification)),
        )
        db.session.remove()
    assert patch_me(client, tracker, user, {"name": "Changed", **PAIR}).status_code == 200
    with app.app_context():
        after = (
            db.session.scalar(select(func.count()).select_from(BoardEvent)),
            db.session.scalar(select(func.count()).select_from(Notification)),
        )
        db.session.remove()
    assert after == counts


# --- rejected input ----------------------------------------------------------------------

U = "Unknown field."
LEN8 = "Must be 8 to 10 characters."
COMP = "Must include an uppercase letter, a lowercase letter and a special character."

REJECTED = [
    pytest.param({}, None, id="empty-object"),
    pytest.param({"email": "new@example.test"}, {"email": U}, id="email-alone"),
    pytest.param(
        {"name": "Valid", "email": "new@example.test"}, {"email": U}, id="email-beside-name"
    ),
    pytest.param({**PAIR, "email": "new@example.test"}, {"email": U}, id="email-beside-pair"),
    pytest.param({"email": None}, {"email": U}, id="email-null"),
    pytest.param({"password": NEW_PASSWORD}, {"password": U}, id="password-alone"),
    pytest.param(
        {"name": "Valid", "password": NEW_PASSWORD}, {"password": U}, id="password-beside-name"
    ),
    pytest.param({"password_hash": "x"}, {"password_hash": U}, id="password-hash"),
    pytest.param({"id": str(uuid.uuid4())}, {"id": U}, id="id"),
    pytest.param({"created_at": "2026-01-01"}, {"created_at": U}, id="created-at"),
    pytest.param({"name": "Valid", "role": "admin"}, {"role": U}, id="unknown-key"),
    pytest.param({"name": None}, {"name": "Required."}, id="name-null"),
    pytest.param({"name": 5}, {"name": "Must be text."}, id="name-number"),
    pytest.param({"name": "   "}, {"name": "Must be 1 to 80 characters."}, id="name-blank"),
    pytest.param({"name": "a" * 81}, {"name": "Must be 1 to 80 characters."}, id="name-81"),
    pytest.param({**PAIR, "new_password": "Aa1!aaa"}, {"new_password": LEN8}, id="new-7-chars"),
    pytest.param(
        {**PAIR, "new_password": "Aa1!aaaaaaa"}, {"new_password": LEN8}, id="new-11-chars"
    ),
    pytest.param(
        {**PAIR, "new_password": "aa1!aaaa"}, {"new_password": COMP}, id="new-no-uppercase"
    ),
    pytest.param(
        {**PAIR, "new_password": "AA1!AAAA"}, {"new_password": COMP}, id="new-no-lowercase"
    ),
    pytest.param({**PAIR, "new_password": "Aa1aaaaa"}, {"new_password": COMP}, id="new-no-special"),
    pytest.param({**PAIR, "new_password": None}, {"new_password": "Required."}, id="new-null"),
    pytest.param({**PAIR, "new_password": 5}, {"new_password": "Must be text."}, id="new-number"),
    pytest.param(
        {**PAIR, "current_password": ""},
        {"current_password": "Must be 1 to 10 characters."},
        id="current-empty",
    ),
    pytest.param(
        {**PAIR, "current_password": "a" * 11},
        {"current_password": "Must be 1 to 10 characters."},
        id="current-11-chars",
    ),
    pytest.param(
        {**PAIR, "current_password": None}, {"current_password": "Required."}, id="current-null"
    ),
    pytest.param(
        {**PAIR, "current_password": ["x"]},
        {"current_password": "Must be text."},
        id="current-array",
    ),
    pytest.param(
        {"current_password": OLD_PASSWORD}, {"new_password": "Required."}, id="current-only"
    ),
    pytest.param({"new_password": NEW_PASSWORD}, {"current_password": "Required."}, id="new-only"),
    pytest.param(
        {"name": "Valid", "new_password": NEW_PASSWORD},
        {"current_password": "Required."},
        id="new-only-beside-name",
    ),
]


@pytest.mark.parametrize(("body", "fields"), REJECTED)
def test_rejected_body_is_400_and_changes_nothing(client, tracker, app, body, fields):
    user = _make_user(tracker, app, name="Keep Name", email="keep@example.test")
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
    response = client.patch("/api/users/me", json={"email": "x"}, headers=bearer("junk"))
    assert response.status_code == 401


def test_a_bad_body_wins_over_a_wrong_current_password(client, tracker, app):
    user = _make_user(tracker, app, name="Keep Name")
    before = user_row(app, user.id)
    body = {
        "current_password": "Wrong#pw1",
        "new_password": NEW_PASSWORD,
        "email": "x@example.test",
    }
    response = patch_me(client, tracker, user, body)
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"] == {"email": U}
    assert user_row(app, user.id) == before


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({}, id="empty-object"),
        pytest.param({"new_password": NEW_PASSWORD}, id="half-pair"),
        pytest.param({**PAIR, "new_password": "short"}, id="invalid-new-password"),
        pytest.param({**PAIR, "email": "a@b.co"}, id="unknown-key"),
    ],
)
def test_no_password_check_runs_for_a_rejected_body(client, tracker, app, monkeypatch, body):
    calls = []
    monkeypatch.setattr(
        users_service,
        "verify_password",
        lambda *args, **kwargs: calls.append(args) or True,
    )
    user = _make_user(tracker, app)
    assert patch_me(client, tracker, user, body).status_code == 400
    assert calls == []


def test_a_password_check_runs_once_for_a_valid_pair(client, tracker, app, monkeypatch):
    calls = []
    real = users_service.verify_password
    monkeypatch.setattr(
        users_service,
        "verify_password",
        lambda *args, **kwargs: calls.append(args) or real(*args, **kwargs),
    )
    user = _make_user(tracker, app)
    assert patch_me(client, tracker, user, PAIR).status_code == 200
    assert len(calls) == 1


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
