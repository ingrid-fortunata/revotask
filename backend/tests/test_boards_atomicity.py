"""BT7 atomicity and concurrency tests (task 2.14).

Requirements 1.1, 4.4, 5.5 and 7.5; design DD2 (check, lock, recheck), DD6 (E12 clears assignments
in the same transaction) and the `_commit()` rollback rule (BE06).

- A failure at the E06 commit, after the board and membership rows are written, leaves no board
  and no membership behind.
- Two concurrent E11 requests for the same user give exactly one 201 and one 409 and exactly one
  membership row.
- A concurrent E11 and E12 on the same user end in one of the two serial outcomes, and never in
  two active membership rows for the pair.

Each request thread uses its own Flask test client, so each request runs in its own app context
with its own database session. Every row is created through `board_tracker`, which removes it after
the test, even when an assertion fails. The app is built from TEST_DATABASE_URL through conftest.
The tests do not read or change data created by other test files.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from typing import Any

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.exc import OperationalError

from app.extensions import db
from app.models.base import utcnow
from app.models.board import Board
from app.models.board_member import BoardMember
from tests.auth_helpers import bearer

THREAD_TIMEOUT_SECONDS = 60


def _headers(board_tracker, user_id) -> dict[str, str]:
    return bearer(board_tracker.token_for(user_id))


def _members_url(board_id) -> str:
    return f"/api/boards/{board_id}/members"


def _count_boards_created_by(app, user_id) -> int:
    with app.app_context():
        try:
            return db.session.scalar(
                select(func.count()).select_from(Board).where(Board.creator_id == user_id)
            )
        finally:
            db.session.remove()


def _membership_rows(app, board_id, user_id) -> list[tuple[Any, str, Any]]:
    """Every membership row for the pair as (row ID, role, deleted_at), read from the database."""
    with app.app_context():
        try:
            rows = db.session.execute(
                select(BoardMember.id, BoardMember.role, BoardMember.deleted_at).where(
                    BoardMember.board_id == board_id, BoardMember.user_id == user_id
                )
            ).all()
            return [(row.id, row.role, row.deleted_at) for row in rows]
        finally:
            db.session.remove()


def _soft_delete_membership(app, board_id, user_id) -> None:
    with app.app_context():
        try:
            db.session.execute(
                update(BoardMember)
                .where(BoardMember.board_id == board_id, BoardMember.user_id == user_id)
                .values(deleted_at=utcnow())
            )
            db.session.commit()
        finally:
            db.session.remove()


def _race(app, jobs: list[Callable[[Any], Any]]) -> list[Any]:
    """Run each job in its own thread and its own test client, all released at the same moment.

    A job receives a test client and returns the response. Results come back in job order.
    Any thread error or a thread still running after the timeout fails the test.
    """
    barrier = threading.Barrier(len(jobs))
    results: list[Any] = [None] * len(jobs)
    errors: list[BaseException] = []

    def worker(index: int, job: Callable[[Any], Any]) -> None:
        try:
            barrier.wait(timeout=THREAD_TIMEOUT_SECONDS)
            results[index] = job(app.test_client())
        except Exception as exc:  # noqa: BLE001 - every thread failure must reach the test thread
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(i, job)) for i, job in enumerate(jobs)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=THREAD_TIMEOUT_SECONDS)
    assert not any(thread.is_alive() for thread in threads), "a request thread did not finish"
    assert not errors, errors
    return results


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def test_e06_failure_after_the_first_insert_leaves_no_board_and_no_membership(
    client, board_tracker, app, monkeypatch
):
    creator = board_tracker.make_user(name="Creator")
    real_commit = db.session.commit
    injected = {"fired": False, "board_pending": False}

    def fail_after_first_insert():
        # Only the E06 commit fails. Its pending board is flushed first, so the board and the
        # admin membership are written inside the transaction. The failure then comes after the
        # first insert. Any other commit runs normally.
        if not any(isinstance(obj, Board) for obj in db.session.new):
            return real_commit()
        injected["board_pending"] = True
        db.session.flush()
        injected["fired"] = True
        raise OperationalError("COMMIT", {}, Exception("injected failure after first insert"))

    monkeypatch.setattr(db.session, "commit", fail_after_first_insert)
    try:
        response = client.post(
            "/api/boards",
            json={"name": "Atomic board"},
            headers=_headers(board_tracker, creator.id),
        )
    finally:
        monkeypatch.undo()

    assert injected["board_pending"], "no board was pending, so the injection proves nothing"
    assert injected["fired"], "the injected failure did not run"
    assert response.status_code == 500
    assert response.get_json()["error"]["code"] == "INTERNAL_ERROR"
    assert _count_boards_created_by(app, creator.id) == 0
    with app.app_context():
        try:
            membership_count = db.session.scalar(
                select(func.count())
                .select_from(BoardMember)
                .where(BoardMember.user_id == creator.id)
            )
        finally:
            db.session.remove()
    assert membership_count == 0


def test_concurrent_double_add_member_gives_one_201_and_one_409(board_tracker, app):
    admin = board_tracker.make_user(name="Admin")
    target = board_tracker.make_user(name="Target")
    board_id = board_tracker.make_board(admin.id, name="Race board")
    board_tracker.make_membership(board_id, admin.id, "admin")
    headers = _headers(board_tracker, admin.id)
    url = _members_url(board_id)
    body = {"email": target.email}

    results = _race(
        app,
        [
            lambda c: c.post(url, json=body, headers=headers),
            lambda c: c.post(url, json=body, headers=headers),
        ],
    )

    statuses = sorted(response.status_code for response in results)
    assert statuses == [201, 409], statuses
    conflict = next(response for response in results if response.status_code == 409)
    assert conflict.get_json()["error"]["code"] == "STATE_CONFLICT"
    rows = _membership_rows(app, board_id, target.id)
    assert len(rows) == 1
    _, role, deleted_at = rows[0]
    assert role == "member"
    assert deleted_at is None


def test_concurrent_add_and_remove_of_the_same_user_ends_in_a_serial_outcome(board_tracker, app):
    admin = board_tracker.make_user(name="Admin")
    target = board_tracker.make_user(name="Target")
    board_id = board_tracker.make_board(admin.id, name="Race board")
    board_tracker.make_membership(board_id, admin.id, "admin")
    board_tracker.make_membership(board_id, target.id, "member")
    # Start from a removed member, so both orders can succeed: E11 reactivates the row (201),
    # then E12 finds an active membership (200). Or E12 finds none (404), then E11 reactivates.
    _soft_delete_membership(app, board_id, target.id)
    headers = _headers(board_tracker, admin.id)

    add_response, remove_response = _race(
        app,
        [
            lambda c: c.post(_members_url(board_id), json={"email": target.email}, headers=headers),
            lambda c: c.delete(f"{_members_url(board_id)}/{target.id}", headers=headers),
        ],
    )

    observed = (add_response.status_code, remove_response.status_code)
    rows = _membership_rows(app, board_id, target.id)
    active = [row for row in rows if row[2] is None]
    # One row per pair always (uq_board_members_board_id_user_id), reused by reactivation.
    assert len(rows) == 1, rows
    assert len(active) <= 1, rows
    if observed == (201, 200):
        # Serial order E11 then E12: E11 reactivates, E12 removes. The user ends removed.
        assert active == [], rows
    elif observed == (201, 404):
        # Serial order E12 then E11: E12 finds no active membership, E11 reactivates. The user
        # ends active as a member.
        assert len(active) == 1, rows
        assert active[0][1] == "member", rows
    else:
        pytest.fail(f"E11 and E12 statuses do not match a serial order: {observed}")
