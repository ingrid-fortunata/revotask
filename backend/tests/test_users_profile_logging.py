"""E31 logging (T12, Requirement 3.7): no name, email or body in the log output."""

from __future__ import annotations

import logging

import pytest

from tests.profile_helpers import patch_me


@pytest.fixture
def tracker(board_tracker):
    return board_tracker


def test_a_profile_update_logs_no_name_email_or_body(app, schema_at_head, tracker, caplog):
    owner = tracker.make_user(email="log-taken@example.test")
    user = tracker.make_user()
    client = app.test_client()
    sentinel_name = "Sentinel-Name-93817"
    sentinel_email = "sentinel-93817@example.test"
    with caplog.at_level(logging.DEBUG, logger="revotask"):
        assert (
            patch_me(
                client, tracker, user, {"name": sentinel_name, "email": sentinel_email}
            ).status_code
            == 200
        )
        assert (
            patch_me(
                client, tracker, user, {"name": sentinel_name, "password": "Sentinel-Pw-93817!"}
            ).status_code
            == 400
        )
        assert patch_me(client, tracker, user, {"email": owner.email}).status_code == 409
    assert caplog.records, "expected the request log lines to be captured"
    for needle in (sentinel_name, sentinel_email, "Sentinel-Pw-93817!", owner.email):
        assert needle not in caplog.text
