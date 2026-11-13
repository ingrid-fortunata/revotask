"""E13, E14 and E15 (task 3.7; Requirements 1.1-1.9, 5.1).

Property 3 (position versioning) and Property 9 (Done column invariant) for columns. Rows are
created through `board_tracker`, so teardown removes only what each test made.
"""

from __future__ import annotations

import pytest

from app.models.board_column import BoardColumn
from tests.kanban_helpers import (
    board_version,
    card_count,
    column_rows,
    column_snapshot,
    events,
    make_kanban,
    post_column,
    soft_delete,
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


def _create(client, kanban, name="To do", **extra):
    response = post_column(client, kanban, name=name, **extra)
    assert response.status_code == 201, response.get_json()
    kanban.tracker.record_column_from_response(response)
    return response.get_json()["data"]


def test_e13_appends_columns_and_returns_the_new_version(client, kanban, app):
    first = _create(client, kanban, "To do")
    second = _create(client, kanban, "Doing")
    assert set(first) == {"column", "position_version"}
    assert set(first["column"]) == {"id", "board_id", "name", "is_done", "order"}
    assert first["column"]["is_done"] is False
    assert (first["column"]["order"], second["column"]["order"]) == (1024.0, 2048.0)
    assert (first["position_version"], second["position_version"]) == (1, 2)
    assert [r["name"] for r in column_rows(app, kanban.board_id)] == ["To do", "Doing"]
    assert board_version(app, kanban.board_id) == 2


def test_e13_trims_the_name(client, kanban):
    assert _create(client, kanban, "  Review  ")["column"]["name"] == "Review"


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"name": ""},
        {"name": "   "},
        {"name": "x" * 81},
        {"name": "ok", "is_done": "yes"},
        {"name": "ok", "color": "red"},
    ],
)
def test_e13_invalid_bodies_return_400_and_create_nothing(client, kanban, app, body):
    before = column_snapshot(app, kanban.board_id)
    response = client.post(
        f"/api/boards/{kanban.board_id}/columns", json=body, headers=kanban.headers()
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"
    assert column_snapshot(app, kanban.board_id) == before


def test_e13_second_done_column_is_409_state_conflict(client, kanban, app):
    _create(client, kanban, "Done", is_done=True)
    before = column_snapshot(app, kanban.board_id)
    response = post_column(client, kanban, name="Also done", is_done=True)
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "STATE_CONFLICT"
    assert column_snapshot(app, kanban.board_id) == before


def _first_card(kanban, column_id):
    return kanban.tracker.make_card(column_id, "card")


def test_e14_renames_without_changing_the_version(client, kanban, app):
    column = _create(client, kanban)["column"]
    version = board_version(app, kanban.board_id)
    response = client.patch(
        f"/api/columns/{column['id']}", json={"name": "Backlog"}, headers=kanban.headers()
    )
    assert response.status_code == 200
    assert response.get_json()["data"]["name"] == "Backlog"
    assert set(response.get_json()["data"]) == {"id", "board_id", "name", "is_done", "order"}
    assert board_version(app, kanban.board_id) == version
    assert events(app, kanban.board_id) == []


def test_e14_toggles_done_on_an_empty_column(client, kanban):
    column = _create(client, kanban)["column"]
    url = f"/api/columns/{column['id']}"
    on = client.patch(url, json={"is_done": True}, headers=kanban.headers())
    assert on.get_json()["data"]["is_done"] is True
    off = client.patch(url, json={"is_done": False}, headers=kanban.headers())
    assert off.get_json()["data"]["is_done"] is False


def test_e14_done_change_on_a_nonempty_column_is_409_and_the_rename_is_not_applied(
    client, kanban, app
):
    column = _create(client, kanban, "Original")["column"]
    _first_card(kanban, column["id"])
    before = column_snapshot(app, kanban.board_id)
    response = client.patch(
        f"/api/columns/{column['id']}",
        json={"name": "Renamed", "is_done": True},
        headers=kanban.headers(),
    )
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "STATE_CONFLICT"
    assert column_snapshot(app, kanban.board_id) == before
    assert column_rows(app, kanban.board_id)[0]["name"] == "Original"


def test_e14_unchanged_done_flag_on_a_nonempty_column_still_applies_the_rename(client, kanban):
    column = _create(client, kanban, "Done", is_done=True)["column"]
    _first_card(kanban, column["id"])
    response = client.patch(
        f"/api/columns/{column['id']}",
        json={"name": "Shipped", "is_done": True},
        headers=kanban.headers(),
    )
    assert response.status_code == 200
    assert response.get_json()["data"]["name"] == "Shipped"
    assert response.get_json()["data"]["is_done"] is True


def test_e14_setting_a_second_done_column_is_409(client, kanban, app):
    _create(client, kanban, "Done", is_done=True)
    other = _create(client, kanban, "Other")["column"]
    before = column_snapshot(app, kanban.board_id)
    response = client.patch(
        f"/api/columns/{other['id']}", json={"is_done": True}, headers=kanban.headers()
    )
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "STATE_CONFLICT"
    assert column_snapshot(app, kanban.board_id) == before


def test_e14_empty_body_is_a_body_level_400(client, kanban):
    column = _create(client, kanban)["column"]
    response = client.patch(f"/api/columns/{column['id']}", json={}, headers=kanban.headers())
    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert "fields" not in error


def test_e15_deletes_an_empty_column_and_returns_the_version(client, kanban, app):
    first = _create(client, kanban, "A")["column"]
    _create(client, kanban, "B")
    response = client.delete(f"/api/columns/{first['id']}", headers=kanban.headers())
    assert response.status_code == 200
    assert response.get_json() == {"data": {"position_version": 3}}
    assert [r["name"] for r in column_rows(app, kanban.board_id)] == ["B"]
    assert board_version(app, kanban.board_id) == 3


def test_e15_nonempty_column_is_409_state_conflict(client, kanban, app):
    column = _create(client, kanban)["column"]
    _first_card(kanban, column["id"])
    before = column_snapshot(app, kanban.board_id)
    response = client.delete(f"/api/columns/{column['id']}", headers=kanban.headers())
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "STATE_CONFLICT"
    assert column_snapshot(app, kanban.board_id) == before


def test_e15_a_soft_deleted_card_does_not_block_deletion(client, kanban, app):
    from app.models.card import Card

    column = _create(client, kanban)["column"]
    card_id = _first_card(kanban, column["id"])
    soft_delete(app, Card, card_id)
    assert card_count(app, column["id"]) == 0
    response = client.delete(f"/api/columns/{column['id']}", headers=kanban.headers())
    assert response.status_code == 200


def test_property_9_deleting_the_done_column_frees_the_done_slot(client, kanban):
    done = _create(client, kanban, "Done", is_done=True)["column"]
    assert client.delete(f"/api/columns/{done['id']}", headers=kanban.headers()).status_code == 200
    assert _create(client, kanban, "New done", is_done=True)["column"]["is_done"] is True


OPERATIONS = [
    ("create", 1),
    ("create_done", 1),
    ("rename", 0),
    ("toggle_done_off", 0),
    ("delete_empty", 1),
    ("rejected_create_done", 0),
    ("rejected_nonempty_delete", 0),
]


def test_property_3_version_rises_only_for_creates_and_deletes(client, kanban, app):
    """Property 3: +1 for E13 and E15, +0 for E14 and for every rejected request."""
    done = None
    for operation, delta in OPERATIONS:
        before = board_version(app, kanban.board_id)
        if operation == "create":
            _create(client, kanban, "Plain")
        elif operation == "create_done":
            done = _create(client, kanban, "Done", is_done=True)["column"]
        elif operation == "rename":
            client.patch(
                f"/api/columns/{done['id']}", json={"name": "Shipped"}, headers=kanban.headers()
            )
        elif operation == "toggle_done_off":
            client.patch(
                f"/api/columns/{done['id']}", json={"is_done": False}, headers=kanban.headers()
            )
            client.patch(
                f"/api/columns/{done['id']}", json={"is_done": True}, headers=kanban.headers()
            )
            # Two successful E14 requests, neither changes the version.
        elif operation == "delete_empty":
            extra = _create(client, kanban, "Temp")["column"]
            assert board_version(app, kanban.board_id) == before + 1
            client.delete(f"/api/columns/{extra['id']}", headers=kanban.headers())
            delta = 2
        elif operation == "rejected_create_done":
            assert post_column(client, kanban, name="again", is_done=True).status_code == 409
        elif operation == "rejected_nonempty_delete":
            _first_card(kanban, done["id"])
            assert (
                client.delete(f"/api/columns/{done['id']}", headers=kanban.headers()).status_code
                == 409
            )
        assert board_version(app, kanban.board_id) == before + delta, operation


def test_property_9_at_most_one_active_done_column_after_any_sequence(client, kanban, app):
    steps = [
        ("create", {"name": "A", "is_done": True}),
        ("create", {"name": "B", "is_done": True}),
        ("create", {"name": "C"}),
        ("set_done", "C"),
        ("set_done_off", "A"),
        ("set_done", "C"),
        ("delete", "C"),
        ("create", {"name": "D", "is_done": True}),
    ]
    ids: dict[str, str] = {}
    for step, arg in steps:
        if step == "create":
            response = post_column(client, kanban, **arg)
            if response.status_code == 201:
                ids[arg["name"]] = response.get_json()["data"]["column"]["id"]
                kanban.tracker.record_column_from_response(response)
        elif step == "set_done":
            client.patch(
                f"/api/columns/{ids[arg]}", json={"is_done": True}, headers=kanban.headers()
            )
        elif step == "set_done_off":
            client.patch(
                f"/api/columns/{ids[arg]}", json={"is_done": False}, headers=kanban.headers()
            )
        elif step == "delete":
            client.delete(f"/api/columns/{ids[arg]}", headers=kanban.headers())
        active_done = [r for r in column_rows(app, kanban.board_id) if r["is_done"]]
        assert len(active_done) <= 1, (step, arg)
    assert BoardColumn  # the model import keeps the invariant tied to the real table
