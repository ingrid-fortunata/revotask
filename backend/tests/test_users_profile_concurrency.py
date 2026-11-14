"""E31 overlapping updates of one account (T12, P10, Property 7).

Each request runs in its own thread, test client and session on the guarded test database. The
user row lock serializes them, so every outcome is one serial order and an omitted field is
never overwritten.
"""

from __future__ import annotations

import threading
import time

import pytest
from sqlalchemy import select, update

from app.extensions import db
from app.models.user import User
from tests.kanban_helpers import race
from tests.profile_helpers import patch_me, user_row


@pytest.fixture
def tracker(board_tracker):
    return board_tracker


def test_the_last_request_wins_a_field_it_submits(app, schema_at_head, tracker):
    """A request that sends the stored name must still write it after a concurrent change.

    A second session holds the row lock. The request starts, passes the guard and blocks on the
    lock. The second session changes the name and commits. The request then re-reads the row,
    sees a different name and writes its own. Without the row lock the request would compare
    against its stale copy, treat the value as unchanged and leave the other session's name.
    """
    user = tracker.make_user(name="Original")
    result: dict = {}

    def request():
        result["response"] = patch_me(app.test_client(), tracker, user, {"name": "Original"})

    with app.app_context(), db.engine.connect() as connection:
        connection.execute(select(User.id).where(User.id == user.id).with_for_update())
        thread = threading.Thread(target=request)
        thread.start()
        time.sleep(0.6)
        assert thread.is_alive(), "the request did not wait for the row lock"
        connection.execute(update(User).where(User.id == user.id).values(name="Other Session"))
        connection.commit()
    thread.join(timeout=30)
    assert not thread.is_alive()
    assert result["response"].status_code == 200
    assert user_row(app, user.id)["name"] == "Original"
    assert result["response"].get_json()["data"]["name"] == "Original"


def test_a_name_only_and_an_email_only_request_keep_both_values(app, schema_at_head, tracker):
    user = tracker.make_user(name="Start Name", email="start@example.test")
    for round_number in range(12):
        name = f"Name {round_number}"
        email = f"round-{round_number}@example.test"
        results = race(
            app,
            [
                lambda c, n=name: patch_me(c, tracker, user, {"name": n}),
                lambda c, e=email: patch_me(c, tracker, user, {"email": e}),
            ],
        )
        assert [r.status_code for r in results] == [200, 200], [r.get_json() for r in results]
        row = user_row(app, user.id)
        assert (row["name"], row["email"]) == (name, email), f"round {round_number}"


def test_two_requests_for_one_field_leave_one_of_the_values_and_no_conflict(
    app, schema_at_head, tracker
):
    user = tracker.make_user(name="Start Name")
    for round_number in range(8):
        names = (f"A {round_number}", f"B {round_number}")
        results = race(
            app,
            [lambda c, n=n: patch_me(c, tracker, user, {"name": n}) for n in names],
        )
        assert [r.status_code for r in results] == [200, 200]
        assert user_row(app, user.id)["name"] in names


def test_both_fields_in_one_request_are_applied_together(app, schema_at_head, tracker):
    """A reader never sees the new name with the old email or the reverse (Property 7)."""
    first = ("Pair One", "pair-one@example.test")
    second = ("Pair Two", "pair-two@example.test")
    user = tracker.make_user(name=first[0], email=first[1])
    seen: set[tuple[str, str]] = set()
    stop = threading.Event()
    failures: list[BaseException] = []

    def reader():
        try:
            with app.app_context(), db.engine.connect() as connection:
                while not stop.is_set():
                    row = connection.execute(
                        select(User.name, User.email).where(User.id == user.id)
                    ).one()
                    seen.add((row.name, row.email))
                    connection.rollback()
        except BaseException as exc:  # noqa: BLE001 - surface any reader failure
            failures.append(exc)

    thread = threading.Thread(target=reader)
    thread.start()
    try:
        client = app.test_client()
        for round_number in range(20):
            name, email = second if round_number % 2 == 0 else first
            response = patch_me(client, tracker, user, {"name": name, "email": email})
            assert response.status_code == 200
    finally:
        stop.set()
        thread.join(timeout=30)
    assert not failures, failures
    assert seen <= {first, second}, seen
