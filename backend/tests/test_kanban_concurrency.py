"""Concurrent column writes (task 3.9; cards extend it in task 5.9).

Requirements 2.9 and 1.7; Properties 3 and 9. Each request runs in its own thread, test client and
database session, on the guarded test database. The board row lock serializes them.
"""

from __future__ import annotations

import pytest

from tests.kanban_helpers import (
    board_version,
    card_titles,
    column_rows,
    make_kanban,
    race,
    seed_cards,
    seed_columns,
    soft_delete_membership,
)


@pytest.fixture
def kanban(board_tracker, app, schema_at_head):
    return make_kanban(board_tracker, app)


def _reorder_job(kanban, moved, before, version):
    def job(client):
        return client.patch(
            f"/api/boards/{kanban.board_id}/columns/reorder",
            json={
                "column_id": str(moved),
                "before_column_id": None if before is None else str(before),
                "expected_position_version": version,
            },
            headers=kanban.headers(),
        )

    return job


def test_two_reorders_with_one_version_commit_one_and_conflict_one(kanban, app):
    cols = seed_columns(kanban)
    results = race(
        app,
        [_reorder_job(kanban, cols.c, cols.a, 0), _reorder_job(kanban, cols.a, None, 0)],
    )
    statuses = sorted(r.status_code for r in results)
    assert statuses == [200, 409], statuses
    conflict = next(r for r in results if r.status_code == 409)
    assert conflict.get_json()["error"]["code"] == "POSITION_CONFLICT"
    assert board_version(app, kanban.board_id) == 1
    names = [r["name"] for r in column_rows(app, kanban.board_id)]
    assert names in (["C", "A", "B"], ["B", "C", "A"]), names


def test_two_simultaneous_done_columns_leave_at_most_one(kanban, app):
    def create_done(client):
        return client.post(
            f"/api/boards/{kanban.board_id}/columns",
            json={"name": "Done", "is_done": True},
            headers=kanban.headers(),
        )

    results = race(app, [create_done, create_done])
    statuses = sorted(r.status_code for r in results)
    assert statuses == [201, 409], statuses
    assert (
        next(r for r in results if r.status_code == 409).get_json()["error"]["code"]
        == "STATE_CONFLICT"
    )
    assert len([r for r in column_rows(app, kanban.board_id) if r["is_done"]]) == 1
    for response in results:
        if response.status_code == 201:
            kanban.tracker.record_column_from_response(response)


def test_a_create_racing_a_reorder_ends_in_a_serial_outcome(kanban, app):
    cols = seed_columns(kanban)

    def create(client):
        return client.post(
            f"/api/boards/{kanban.board_id}/columns", json={"name": "New"}, headers=kanban.headers()
        )

    results = race(app, [create, _reorder_job(kanban, cols.c, cols.a, 0)])
    created, moved = results
    assert created.status_code == 201
    kanban.tracker.record_column_from_response(created)
    # The create always succeeds. The reorder sent version 0: it wins if it runs first and
    # conflicts if the create bumped the version before it.
    assert moved.status_code in (200, 409)
    successes = 1 + (1 if moved.status_code == 200 else 0)
    assert board_version(app, kanban.board_id) == successes
    if moved.status_code == 409:
        assert moved.get_json()["error"]["code"] == "POSITION_CONFLICT"


def test_a_reorder_racing_a_member_removal_commits_both(kanban, app):
    cols = seed_columns(kanban)
    member = kanban.add_member("member")

    def remove(client):
        return client.delete(
            f"/api/boards/{kanban.board_id}/members/{member.id}", headers=kanban.headers()
        )

    results = race(app, [remove, _reorder_job(kanban, cols.c, cols.a, 0)])
    assert [r.status_code for r in results] == [200, 200]
    assert board_version(app, kanban.board_id) == 1


def _move_job(kanban, card_id, column_id, before, version, user=None):
    def job(client):
        return client.patch(
            f"/api/cards/{card_id}/position",
            json={
                "column_id": str(column_id),
                "before_card_id": None if before is None else str(before),
                "expected_position_version": version,
            },
            headers=kanban.headers(user),
        )

    return job


def test_two_card_moves_with_one_version_commit_one_and_conflict_one(kanban, app):
    t = seed_cards(kanban)
    results = race(
        app,
        [
            _move_job(kanban, t.x1, t.doing, None, 0),
            _move_job(kanban, t.x2, t.doing, t.y1, 0),
        ],
    )
    assert sorted(r.status_code for r in results) == [200, 409]
    conflict = next(r for r in results if r.status_code == 409)
    assert conflict.get_json()["error"]["code"] == "POSITION_CONFLICT"
    assert board_version(app, kanban.board_id) == 1
    assert len(card_titles(app, t.todo)) + len(card_titles(app, t.doing)) == 3


def test_a_card_create_racing_a_move_ends_in_a_serial_outcome(kanban, app):
    t = seed_cards(kanban)

    def create(client):
        return client.post(
            f"/api/columns/{t.todo}/cards", json={"title": "New"}, headers=kanban.headers()
        )

    created, moved = race(app, [create, _move_job(kanban, t.x1, t.doing, None, 0)])
    assert created.status_code == 201
    kanban.tracker.record_card_from_response(created)
    assert moved.status_code in (200, 409)
    assert board_version(app, kanban.board_id) == 1 + (1 if moved.status_code == 200 else 0)
    if moved.status_code == 409:
        assert moved.get_json()["error"]["code"] == "POSITION_CONFLICT"


def test_a_move_by_a_member_racing_that_members_removal_is_serial(kanban, app):
    """Either the move commits first and the removal follows, or the removal wins (move is 404)."""
    t = seed_cards(kanban)
    member = kanban.add_member("member")

    def remove(client):
        return client.delete(
            f"/api/boards/{kanban.board_id}/members/{member.id}", headers=kanban.headers()
        )

    removal, moved = race(app, [remove, _move_job(kanban, t.x1, t.doing, None, 0, member)])
    assert removal.status_code == 200
    assert moved.status_code in (200, 404)
    if moved.status_code == 404:
        assert moved.get_json()["error"]["code"] == "NOT_FOUND"
        assert board_version(app, kanban.board_id) == 0
        assert card_titles(app, t.doing) == ["Y1"]
    else:
        assert board_version(app, kanban.board_id) == 1


def test_a_move_after_the_removal_commits_is_404(kanban, app):
    t = seed_cards(kanban)
    member = kanban.add_member("member")
    soft_delete_membership(app, kanban.board_id, member.id)
    response = _move_job(kanban, t.x1, t.doing, None, 0, member)(app.test_client())
    assert response.status_code == 404
    assert board_version(app, kanban.board_id) == 0
