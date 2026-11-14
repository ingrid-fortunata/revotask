"""Teardown isolation for the profile tests (T12, Requirement 8.7).

The harness creates tracked users, changes their profiles through E31 and then fails. The
tracker finalizer must still delete exactly the tracked users, and an untracked sentinel user
must survive. Every write goes through the app built from TEST_DATABASE_URL.
"""

from __future__ import annotations

import pytest

from app.models.user import User
from tests.boards_helpers import (
    count_rows,
    remove_untracked_sentinel,
    seed_untracked_sentinel,
    tracked_boards,
)
from tests.profile_helpers import patch_me, user_row


def _fail_after_profile_changes(tracker, app, state: dict) -> None:
    first = tracker.make_user(name="Profile One")
    second = tracker.make_user(name="Profile Two")
    client = app.test_client()
    assert (
        patch_me(
            client, tracker, first, {"name": "Changed One", "email": "changed-one@example.test"}
        ).status_code
        == 200
    )
    assert (
        patch_me(client, tracker, second, {"email": "changed-one@example.test"}).status_code == 409
    )
    state["ids"] = [first.id, second.id]
    raise AssertionError("harness: deliberate failure after profile changes")


def test_teardown_removes_tracked_users_and_keeps_an_untracked_sentinel(app, schema_at_head):
    sentinel = seed_untracked_sentinel(app)
    try:
        teardown = tracked_boards(app)
        tracker = next(teardown)
        state: dict = {}
        try:
            with pytest.raises(AssertionError, match="deliberate failure"):
                _fail_after_profile_changes(tracker, app, state)
            # Precondition: the harness really changed the rows before it failed.
            assert user_row(app, state["ids"][0])["name"] == "Changed One"
            assert count_rows(app, User, state["ids"]) == 2
        finally:
            assert next(teardown, None) is None  # the finalizer ran to completion

        assert count_rows(app, User, state["ids"]) == 0
        assert count_rows(app, User, tracker.user_ids) == 0
        assert count_rows(app, User, [sentinel["user"]]) == 1  # untouched
    finally:
        remove_untracked_sentinel(app, sentinel)
