"""E31 password change (T12 Revision 2, P14 and P16): the current password and atomicity.

Replaces the Revision 1 duplicate-email file. E31 returns no 409 now. A wrong current password is
a 400 on `fields.current_password`, and it rolls the whole update back.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text

from app.blueprints.auth.service import verify_password
from app.extensions import db
from tests.profile_helpers import NEW_PASSWORD, PASSWORD, make_login_user, patch_me, user_row

WRONG = "Wrong#pw1"
MESSAGE = "Current password is incorrect."


@pytest.fixture
def tracker(board_tracker):
    return board_tracker


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def test_a_wrong_current_password_is_a_400_on_that_field_and_changes_nothing(client, tracker, app):
    user = make_login_user(tracker, app, name="Keep Name")
    before = user_row(app, user.id)
    response = patch_me(
        client, tracker, user, {"current_password": WRONG, "new_password": NEW_PASSWORD}
    )
    assert response.status_code == 400
    body = response.get_json()["error"]
    assert body["code"] == "VALIDATION_ERROR"
    assert body["fields"] == {"current_password": MESSAGE}
    assert response.headers["Cache-Control"] == "private, no-store"
    for secret in (WRONG, NEW_PASSWORD, PASSWORD):
        assert secret not in response.get_data(as_text=True)
    assert user_row(app, user.id) == before


def test_a_valid_name_beside_a_wrong_password_is_not_stored(client, tracker, app):
    user = make_login_user(tracker, app, name="Keep Name")
    before = user_row(app, user.id)
    body = {"name": "Should Not Stick", "current_password": WRONG, "new_password": NEW_PASSWORD}
    assert patch_me(client, tracker, user, body).status_code == 400
    after = user_row(app, user.id)
    assert after["name"] == "Keep Name"
    assert after["password_hash"] == before["password_hash"]
    assert after["updated_at"] == before["updated_at"]


def test_a_wrong_password_is_not_a_401_so_the_session_stays(client, tracker, app):
    user = make_login_user(tracker, app)
    body = {"current_password": WRONG, "new_password": NEW_PASSWORD}
    assert patch_me(client, tracker, user, body).status_code == 400
    assert patch_me(client, tracker, user, {"name": "Still In"}).status_code == 200


def test_a_right_password_stores_a_new_argon2id_hash(client, tracker, app):
    user = make_login_user(tracker, app)
    before = user_row(app, user.id)
    body = {"name": "Both Changed", "current_password": PASSWORD, "new_password": NEW_PASSWORD}
    response = patch_me(client, tracker, user, body)
    assert response.status_code == 200
    after = user_row(app, user.id)
    assert after["name"] == "Both Changed"
    assert after["password_hash"].startswith("$argon2id$")
    assert after["password_hash"] != before["password_hash"]
    assert verify_password(after["password_hash"], NEW_PASSWORD)
    assert not verify_password(after["password_hash"], PASSWORD)


def test_the_email_is_the_same_after_every_request(client, tracker, app):
    user = make_login_user(tracker, app)
    email = user_row(app, user.id)["email"]
    attempts = [
        {"name": "One"},
        {"current_password": PASSWORD, "new_password": NEW_PASSWORD},
        {"current_password": WRONG, "new_password": PASSWORD},
        {"email": "other@example.test"},
        {"name": "Two", "email": "other@example.test"},
    ]
    for body in attempts:
        patch_me(client, tracker, user, body)
        assert user_row(app, user.id)["email"] == email


def test_a_stored_hash_that_cannot_be_read_is_the_same_400_and_not_a_500(client, tracker, app):
    user = make_login_user(tracker, app)
    with app.app_context():
        db.session.execute(
            text("UPDATE users SET password_hash = 'not-a-hash' WHERE id = :id"), {"id": user.id}
        )
        db.session.commit()
        db.session.remove()
    response = patch_me(
        client, tracker, user, {"current_password": PASSWORD, "new_password": NEW_PASSWORD}
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"] == {"current_password": MESSAGE}
    assert user_row(app, user.id)["password_hash"] == "not-a-hash"


def test_there_is_no_409_for_any_body(client, tracker, app):
    """No unique column is written, so E31 never answers EMAIL_ALREADY_EXISTS."""
    other = tracker.make_user(email="held@example.test")
    user = make_login_user(tracker, app)
    for body in ({"email": other.email}, {"name": "x", "email": other.email}):
        response = patch_me(client, tracker, user, body)
        assert response.status_code == 400
        assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"
