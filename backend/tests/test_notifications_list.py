"""E27 list (T13; Requirement 3; Properties 6 and 7; decisions B1, B5, B6)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from app.blueprints.notifications import service as notification_service
from app.extensions import db
from app.models.board import Board
from app.models.card import Card
from app.models.user import User
from tests.kanban_helpers import _write, make_kanban
from tests.notification_helpers import (
    ITEM_KEYS,
    insert_notification,
    list_as,
    seed_world,
    set_read_at,
)

BASE = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
STANDARD = "Check the submitted fields."


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    return seed_world(make_kanban(board_tracker, app))


def _insert(world, app, count: int, *, same_time: bool = False) -> list:
    ids = []
    for index in range(count):
        moment = BASE if same_time else BASE + timedelta(seconds=index)
        ids.append(
            insert_notification(
                app,
                world.ana.id,
                world.kanban.admin.id,
                world.kanban.board_id,
                world.card,
                created_at=moment,
            )
        )
    return ids


def _data(response) -> dict:
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]


def test_an_account_with_no_notification_gets_an_empty_page(client, world):
    data = _data(list_as(client, world.kanban, world.ana))
    assert data == {"items": [], "page": 1, "per_page": 20, "total": 0, "unread_count": 0}


def test_newest_first(client, world, app):
    ids = _insert(world, app, 4)
    data = _data(list_as(client, world.kanban, world.ana))
    assert [item["id"] for item in data["items"]] == [str(i) for i in reversed(ids)]


def test_rows_with_one_created_at_follow_the_id_descending(client, world, app):
    ids = _insert(world, app, 6, same_time=True)
    data = _data(list_as(client, world.kanban, world.ana))
    assert [item["id"] for item in data["items"]] == [str(i) for i in sorted(ids, reverse=True)]


def test_pages_neither_repeat_nor_skip_and_counts_ignore_the_page(client, world, app):
    ids = _insert(world, app, 45, same_time=False)
    for note in ids[:10]:
        set_read_at(app, note, BASE)
    seen: list[str] = []
    sizes = []
    for page in (1, 2, 3):
        data = _data(list_as(client, world.kanban, world.ana, f"?page={page}&per_page=20"))
        sizes.append(len(data["items"]))
        seen += [item["id"] for item in data["items"]]
        assert (data["total"], data["unread_count"], data["page"], data["per_page"]) == (
            45,
            35,
            page,
            20,
        )
    assert sizes == [20, 20, 5]
    assert seen == [str(i) for i in reversed(ids)]
    # A page past the end: empty items and the true counts.
    past = _data(list_as(client, world.kanban, world.ana, "?page=4&per_page=20"))
    assert past["items"] == []
    assert (past["total"], past["unread_count"]) == (45, 35)


def test_per_page_bounds(client, world, app):
    _insert(world, app, 3)
    assert len(_data(list_as(client, world.kanban, world.ana, "?per_page=1"))["items"]) == 1
    assert len(_data(list_as(client, world.kanban, world.ana, "?per_page=50"))["items"]) == 3
    assert _data(list_as(client, world.kanban, world.ana, "?page=3&per_page=1"))["items"][0]["id"]


def test_the_largest_accepted_page_is_an_empty_200(client, world, app):
    _insert(world, app, 2)
    data = _data(list_as(client, world.kanban, world.ana, "?page=2147483647&per_page=50"))
    assert data["items"] == []
    assert (data["total"], data["unread_count"], data["page"]) == (2, 2, 2147483647)


def test_the_item_is_the_allowlist_with_current_display_fields(client, world, app):
    _insert(world, app, 1)
    _write(
        app,
        lambda: db.session.execute(
            update(User).where(User.id == world.kanban.admin.id).values(name="Renamed Actor")
        ),
    )
    _write(
        app,
        lambda: db.session.execute(
            update(Board).where(Board.id == world.kanban.board_id).values(name="Renamed Board")
        ),
    )
    _write(
        app,
        lambda: db.session.execute(
            update(Card).where(Card.id == world.card).values(title="Renamed Card")
        ),
    )
    item = _data(list_as(client, world.kanban, world.ana))["items"][0]
    assert set(item) == ITEM_KEYS
    assert (item["actor_name"], item["board_name"], item["card_title"]) == (
        "Renamed Actor",
        "Renamed Board",
        "Renamed Card",
    )
    assert item["kind"] == "assigned"
    assert item["read_at"] is None
    assert item["created_at"].endswith("+00:00")
    assert item["actor_id"] == str(world.kanban.admin.id)
    assert item["board_id"] == str(world.kanban.board_id)
    assert item["card_id"] == str(world.card)


# --- query validation ------------------------------------------------------------------


BAD_PAGE = [
    "0",
    "-1",
    "1.5",
    "%2B1",
    "01",
    "%201",
    "1%20",
    "1%0A",
    "0x1",
    "1e2",
    "true",
    "",
    "2147483648",
    "12345678901",
    "%D9%A1",
]
BAD_PER_PAGE = ["0", "51", "-1", "1.5", "01", "", "abc", "100"]


@pytest.fixture
def no_read(monkeypatch):
    def boom(*args, **kwargs):
        raise AssertionError("an invalid query reached the database")

    monkeypatch.setattr(notification_service, "list_notifications", boom)


@pytest.mark.parametrize("value", BAD_PAGE)
def test_an_invalid_page_is_400_before_any_read(client, world, no_read, value):
    response = list_as(client, world.kanban, world.ana, f"?page={value}")
    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["fields"] == {"page": "Must be a whole number from 1 to 2147483647."}


@pytest.mark.parametrize("value", BAD_PER_PAGE)
def test_an_invalid_per_page_is_400_before_any_read(client, world, no_read, value):
    response = list_as(client, world.kanban, world.ana, f"?per_page={value}")
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"] == {
        "per_page": "Must be a whole number from 1 to 50."
    }


def test_a_repeated_parameter_is_400_with_its_field(client, world, no_read):
    response = list_as(client, world.kanban, world.ana, "?page=1&page=2")
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"] == {"page": "Send one value."}


@pytest.mark.parametrize("query", ["?foo=1", "?page=1&foo=2", "?q=a"])
def test_an_unknown_parameter_is_400_with_the_standard_message_and_no_field(
    client, world, no_read, query
):
    response = list_as(client, world.kanban, world.ana, query)
    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["message"] == STANDARD
    assert "fields" not in error


def test_the_accepted_edges_are_200(client, world):
    for query in ("?page=1&per_page=1", "?page=2147483647&per_page=50", "?page=1", "?per_page=20"):
        assert list_as(client, world.kanban, world.ana, query).status_code == 200
