"""E31 duplicate email (T12, P3): 409 from uq_users_email, full rollback, concurrent requests."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.extensions import db
from app.models.user import User
from tests.kanban_helpers import race
from tests.profile_helpers import patch_me, user_row


@pytest.fixture
def tracker(board_tracker):
    return board_tracker


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def _assert_conflict(response):
    assert response.status_code == 409, response.get_json()
    error = response.get_json()["error"]
    assert error["code"] == "EMAIL_ALREADY_EXISTS"
    assert error["message"] == "An account with this email already exists."
    assert response.headers["Cache-Control"] == "private, no-store"


@pytest.mark.parametrize(
    "variant", ["taken@example.test", "TAKEN@Example.TEST", "  taken@example.test "]
)
def test_another_users_email_is_409_and_nothing_changes(client, tracker, app, variant):
    tracker.make_user(email="taken@example.test", name="Owner")
    user = tracker.make_user(name="Keep Name", email="mine@example.test")
    before = user_row(app, user.id)
    _assert_conflict(patch_me(client, tracker, user, {"email": variant}))
    assert user_row(app, user.id) == before


def test_a_valid_name_beside_a_taken_email_leaves_the_original_name(client, tracker, app):
    """P3: the 409 rolls the whole update back, so the name is not stored."""
    tracker.make_user(email="taken@example.test", name="Owner")
    user = tracker.make_user(name="Original Name", email="mine@example.test")
    before = user_row(app, user.id)
    _assert_conflict(
        patch_me(client, tracker, user, {"name": "Brand New Name", "email": "taken@example.test"})
    )
    after = user_row(app, user.id)
    assert after["name"] == "Original Name"  # read straight from the database
    assert after == before


def test_e30_shows_the_unchanged_values_after_a_409(client, tracker):
    from tests.auth_helpers import bearer

    tracker.make_user(email="taken@example.test")
    user = tracker.make_user(name="Original Name", email="mine@example.test")
    _assert_conflict(
        patch_me(client, tracker, user, {"name": "New", "email": "taken@example.test"})
    )
    me = client.get("/api/users/me", headers=bearer(tracker.token_for(user.id))).get_json()["data"]
    assert (me["name"], me["email"]) == ("Original Name", "mine@example.test")


def test_the_conflict_does_not_block_a_later_valid_update(client, tracker, app):
    tracker.make_user(email="taken@example.test")
    user = tracker.make_user(name="Original Name")
    _assert_conflict(patch_me(client, tracker, user, {"email": "taken@example.test"}))
    assert patch_me(client, tracker, user, {"name": "Later Name"}).status_code == 200
    assert user_row(app, user.id)["name"] == "Later Name"


def test_two_users_requesting_one_new_email_at_once_commit_once(client, tracker, app):
    first = tracker.make_user(name="First")
    second = tracker.make_user(name="Second")
    target = "contested-new@example.test"

    def job(user):
        return lambda c: patch_me(c, tracker, user, {"name": f"{user.id}"[:8], "email": target})

    results = race(app, [job(first), job(second)])
    assert sorted(r.status_code for r in results) == [200, 409], [r.get_json() for r in results]
    winner, loser = (first, second) if results[0].status_code == 200 else (second, first)
    assert user_row(app, winner.id)["email"] == target
    assert user_row(app, loser.id)["email"] != target
    # The loser's valid name was rolled back with the email (P3).
    assert user_row(app, loser.id)["name"] in ("First", "Second")
    with app.app_context():
        count = db.session.scalar(
            select(func.count()).select_from(User).where(User.email == target)
        )
        db.session.remove()
    assert count == 1
