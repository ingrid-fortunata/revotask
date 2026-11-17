"""E29 member_activity (T14; Requirement 3; Property 3; decisions A1 and A4)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import update

from app.extensions import db
from app.models.user import User
from tests.analytics_helpers import (
    ACTIVITY_KEYS,
    WEEK_START,
    analytics_data,
    freeze,
    seed_events,
)
from tests.kanban_helpers import _write, board_version, make_kanban, set_done

INSIDE = WEEK_START + timedelta(days=1)
COUNTED = ["card_created", "card_moved", "column_reordered", "comment_created"]


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


def _activity(client, kanban) -> list[tuple[str, int]]:
    return [(i["name"], i["count"]) for i in analytics_data(client, kanban)["member_activity"]]


@pytest.mark.parametrize("kind", COUNTED)
def test_each_counted_kind_counts_once(client, kanban, app, board_tracker, monkeypatch, kind):
    freeze(monkeypatch)
    column = board_tracker.make_column(kanban.board_id, "Todo", order=1.0)
    card = board_tracker.make_card(column, "c", order=1.0)
    seed_events(app, kanban.board_id, [(kind, kanban.admin.id, card, INSIDE)])
    assert _activity(client, kanban) == [("Admin", 1)]


def test_entered_done_is_not_activity(client, kanban, app, board_tracker, monkeypatch):
    freeze(monkeypatch)
    column = board_tracker.make_column(kanban.board_id, "Done", order=1.0)
    set_done(app, column)
    card = board_tracker.make_card(column, "c", order=1.0)
    seed_events(app, kanban.board_id, [("entered_done", kanban.admin.id, card, INSIDE)])
    data = analytics_data(client, kanban)
    assert data["member_activity"] == []
    assert data["completed_cards"] == 1


def test_completing_a_card_adds_exactly_one_activity_event(client, kanban, app, board_tracker):
    todo = board_tracker.make_column(kanban.board_id, "Todo", order=1024.0)
    done = board_tracker.make_column(kanban.board_id, "Done", order=2048.0)
    set_done(app, done)
    member = kanban.add_member("member", name="Mia")
    # A card created in Done: card_created and entered_done are written, one activity event.
    created = client.post(
        f"/api/columns/{done}/cards", json={"title": "Born done"}, headers=kanban.headers(member)
    )
    assert created.status_code == 201
    assert _activity(client, kanban) == [("Mia", 1)]
    # A card moved into Done: card_moved and entered_done are written, one more activity event.
    moving = board_tracker.make_card(todo, "Move me", order=1024.0)
    moved = client.patch(
        f"/api/cards/{moving}/position",
        json={
            "column_id": str(done),
            "before_card_id": None,
            "expected_position_version": board_version(app, kanban.board_id),
        },
        headers=kanban.headers(member),
    )
    assert moved.status_code == 200
    assert _activity(client, kanban) == [("Mia", 2)]
    assert analytics_data(client, kanban)["completed_cards"] == 2


def test_a_removed_member_stays_listed_and_an_idle_member_does_not(client, kanban, board_tracker):
    todo = board_tracker.make_column(kanban.board_id, "Todo", order=1024.0)
    leaver = kanban.add_member("member", name="Leaver")
    kanban.add_member("member", name="Idle")
    made = client.post(
        f"/api/columns/{todo}/cards", json={"title": "By leaver"}, headers=kanban.headers(leaver)
    )
    assert made.status_code == 201
    removed = client.delete(
        f"/api/boards/{kanban.board_id}/members/{leaver.id}", headers=kanban.headers()
    )
    assert removed.status_code == 200
    # The leaver's work stays, the idle member never appears (A4).
    assert _activity(client, kanban) == [("Leaver", 1)]


def test_the_current_name_is_shown(client, kanban, app, board_tracker, monkeypatch):
    freeze(monkeypatch)
    column = board_tracker.make_column(kanban.board_id, "Todo", order=1.0)
    card = board_tracker.make_card(column, "c", order=1.0)
    seed_events(app, kanban.board_id, [("card_created", kanban.admin.id, card, INSIDE)])
    _write(
        app,
        lambda: db.session.execute(
            update(User).where(User.id == kanban.admin.id).values(name="Renamed Admin")
        ),
    )
    assert _activity(client, kanban) == [("Renamed Admin", 1)]


def test_the_order_is_count_then_lowercase_name_then_user_id(
    client, kanban, app, board_tracker, monkeypatch
):
    freeze(monkeypatch)
    column = board_tracker.make_column(kanban.board_id, "Todo", order=1.0)
    card = board_tracker.make_card(column, "c", order=1.0)
    people = {
        "Zed": (kanban.add_member("member", name="Zed"), 3),
        "bob": (kanban.add_member("member", name="bob"), 2),
        "Alice": (kanban.add_member("member", name="Alice"), 2),
        "alice": (kanban.add_member("member", name="alice"), 2),
        "Cy": (kanban.add_member("member", name="Cy"), 1),
    }
    rows = [
        ("card_moved", user.id, card, INSIDE)
        for user, count in people.values()
        for _ in range(count)
    ]
    seed_events(app, kanban.board_id, rows)
    items = analytics_data(client, kanban)["member_activity"]
    expected = sorted(
        ((user.id, name, count) for name, (user, count) in people.items()),
        key=lambda item: (-item[2], item[1].lower(), str(item[0])),
    )
    assert [(i["user_id"], i["name"], i["count"]) for i in items] == [
        (str(uid), name, count) for uid, name, count in expected
    ]
    assert [i["count"] for i in items] == [3, 2, 2, 2, 1]


def test_an_empty_week_is_an_empty_list_and_items_carry_no_email(
    client, kanban, app, board_tracker, monkeypatch
):
    freeze(monkeypatch)
    assert analytics_data(client, kanban)["member_activity"] == []
    column = board_tracker.make_column(kanban.board_id, "Todo", order=1.0)
    card = board_tracker.make_card(column, "c", order=1.0)
    seed_events(app, kanban.board_id, [("card_created", kanban.admin.id, card, INSIDE)])
    item = analytics_data(client, kanban)["member_activity"][0]
    assert set(item) == ACTIVITY_KEYS
