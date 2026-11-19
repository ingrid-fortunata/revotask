"""E31 overlapping updates of one account (T12, P10, Properties 5 to 7).

Each request runs in its own thread, test client and session on the guarded test database. The
user row lock serializes them, so every outcome is one serial order and an omitted field is
never overwritten.
"""

from __future__ import annotations

import threading
import time

import pytest
from sqlalchemy import select, update

from app.blueprints.auth.service import hash_password, verify_password
from app.extensions import db
from app.models.user import User
from tests.kanban_helpers import race
from tests.profile_helpers import NEW_PASSWORD, PASSWORD, make_login_user, patch_me, user_row


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


def test_a_name_only_and_a_password_request_keep_both_changes(app, schema_at_head, tracker):
    user = make_login_user(tracker, app, name="Start Name")
    current = PASSWORD
    for round_number in range(8):
        name = f"Name {round_number}"
        new = f"Nw#{round_number}pass9"
        results = race(
            app,
            [
                lambda c, n=name: patch_me(c, tracker, user, {"name": n}),
                lambda c, cur=current, nw=new: patch_me(
                    c, tracker, user, {"current_password": cur, "new_password": nw}
                ),
            ],
        )
        assert [r.status_code for r in results] == [200, 200], [r.get_json() for r in results]
        row = user_row(app, user.id)
        assert row["name"] == name, f"round {round_number}"
        assert verify_password(row["password_hash"], new), f"round {round_number}"
        current = new


def test_two_name_requests_leave_one_of_the_values_and_no_conflict(app, schema_at_head, tracker):
    user = tracker.make_user(name="Start Name")
    for round_number in range(8):
        names = (f"A {round_number}", f"B {round_number}")
        results = race(
            app,
            [lambda c, n=n: patch_me(c, tracker, user, {"name": n}) for n in names],
        )
        assert [r.status_code for r in results] == [200, 200]
        assert user_row(app, user.id)["name"] in names


def test_two_password_requests_with_one_current_password_leave_one_winner(
    app, schema_at_head, tracker
):
    """The check runs on the locked row, so the second change finds a new hash (Property 6)."""
    user = make_login_user(tracker, app)
    current = PASSWORD
    for round_number in range(6):
        news = (f"Aa#{round_number}pass1", f"Bb#{round_number}pass2")
        results = race(
            app,
            [
                lambda c, nw=nw, cur=current: patch_me(
                    c, tracker, user, {"current_password": cur, "new_password": nw}
                )
                for nw in news
            ],
        )
        codes = sorted(r.status_code for r in results)
        assert codes == [200, 400], [r.get_json() for r in results]
        loser = next(r for r in results if r.status_code == 400)
        assert loser.get_json()["error"]["fields"] == {
            "current_password": "Current password is incorrect."
        }
        winner = news[[r.status_code for r in results].index(200)]
        row = user_row(app, user.id)
        assert verify_password(row["password_hash"], winner), f"round {round_number}"
        current = winner


def test_the_password_check_waits_for_the_row_lock(app, schema_at_head, tracker):
    """A change that started with the old password is refused after another session changed it.

    A second session holds the row lock and then stores a new hash. The request passes the guard
    and blocks on the lock. When the other session commits, the request verifies against the
    new hash, so its `current_password` no longer matches. A check before the lock would pass.
    """
    user = make_login_user(tracker, app)
    result: dict = {}
    body = {"current_password": PASSWORD, "new_password": NEW_PASSWORD}

    def request():
        result["response"] = patch_me(app.test_client(), tracker, user, body)

    with app.app_context(), db.engine.connect() as connection:
        connection.execute(select(User.id).where(User.id == user.id).with_for_update())
        thread = threading.Thread(target=request)
        thread.start()
        time.sleep(0.6)
        assert thread.is_alive(), "the request did not wait for the row lock"
        connection.execute(
            update(User).where(User.id == user.id).values(password_hash=hash_password("Other#pw99"))
        )
        connection.commit()
    thread.join(timeout=30)
    assert not thread.is_alive()
    assert result["response"].status_code == 400
    assert verify_password(user_row(app, user.id)["password_hash"], "Other#pw99")


def test_name_and_password_in_one_request_are_applied_together(app, schema_at_head, tracker):
    """A reader never sees the new name with the old hash or the reverse (Property 5)."""
    user = make_login_user(tracker, app, name="Pair One")
    seen: set[tuple[str, str]] = set()
    stop = threading.Event()
    failures: list[BaseException] = []
    first_hash = user_row(app, user.id)["password_hash"]

    def reader():
        try:
            with app.app_context(), db.engine.connect() as connection:
                while not stop.is_set():
                    row = connection.execute(
                        select(User.name, User.password_hash).where(User.id == user.id)
                    ).one()
                    seen.add((row.name, row.password_hash))
                    connection.rollback()
        except BaseException as exc:  # noqa: BLE001 - surface any reader failure
            failures.append(exc)

    thread = threading.Thread(target=reader)
    thread.start()
    pairs = [("Pair One", PASSWORD), ("Pair Two", NEW_PASSWORD)]
    try:
        client = app.test_client()
        current = PASSWORD
        for round_number in range(10):
            name = pairs[(round_number + 1) % 2][0]
            new = pairs[(round_number + 1) % 2][1]
            body = {"name": name, "current_password": current, "new_password": new}
            assert patch_me(client, tracker, user, body).status_code == 200
            current = new
    finally:
        stop.set()
        thread.join(timeout=30)
    assert not failures, failures
    # Every hash a reader saw belongs to a committed state: the first hash with "Pair One",
    # or a later hash with the name that the same request stored. Never a mix of both.
    names_by_hash: dict[str, set[str]] = {}
    for name, password_hash in seen:
        names_by_hash.setdefault(password_hash, set()).add(name)
    assert all(len(names) == 1 for names in names_by_hash.values()), names_by_hash
    assert names_by_hash.get(first_hash, {"Pair One"}) == {"Pair One"}
