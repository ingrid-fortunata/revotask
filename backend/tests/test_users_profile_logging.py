"""E31 logging (T12, Requirements 3.7 and 8.5): no name, password or body in the log output."""

from __future__ import annotations

import logging

import pytest

from tests.profile_helpers import PASSWORD, make_login_user, patch_me


@pytest.fixture
def tracker(board_tracker):
    return board_tracker


def test_a_profile_update_logs_no_name_password_or_body(app, schema_at_head, tracker, caplog):
    user = make_login_user(tracker, app)
    client = app.test_client()
    sentinel_name = "Sentinel-Name-93817"
    sentinel_new = "Sn#93817xy"
    sentinel_wrong = "Sw#93817xy"
    sentinel_email = "sentinel-93817@example.test"
    with caplog.at_level(logging.DEBUG, logger="revotask"):
        # A name change, a password change, a wrong current password and a rejected body.
        assert patch_me(client, tracker, user, {"name": sentinel_name}).status_code == 200
        wrong = {"current_password": sentinel_wrong, "new_password": sentinel_new}
        assert patch_me(client, tracker, user, wrong).status_code == 400
        right = {"current_password": PASSWORD, "new_password": sentinel_new}
        assert patch_me(client, tracker, user, right).status_code == 200
        assert patch_me(client, tracker, user, {"email": sentinel_email}).status_code == 400
    assert caplog.records, "expected the request log lines to be captured"
    for needle in (sentinel_name, sentinel_new, sentinel_wrong, sentinel_email, PASSWORD):
        assert needle not in caplog.text
