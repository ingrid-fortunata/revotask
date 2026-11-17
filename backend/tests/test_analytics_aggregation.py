"""E29 aggregates are not inflated by each other (T14; Requirements 1.5, 3.6; Property 4)."""

from __future__ import annotations

from collections import Counter
from datetime import timedelta

import pytest

from tests.analytics_helpers import WEEK_START, analytics_data, freeze, seed_events
from tests.kanban_helpers import board_version, events, make_kanban, set_done

INSIDE = WEEK_START + timedelta(days=3)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


def test_many_columns_cards_and_events_give_exact_figures(
    client, kanban, app, board_tracker, monkeypatch
):
    freeze(monkeypatch)
    ben = kanban.add_member("member", name="Ben")
    columns = [
        board_tracker.make_column(kanban.board_id, f"Col{i}", order=float(i + 1)) for i in range(5)
    ]
    set_done(app, columns[0])  # completions only count while the card is in Done
    cards = [
        board_tracker.make_card(column, f"card{index}", order=float(index + 1))
        for column in columns
        for index in range(6)
    ]
    rows = []
    for round_ in range(40):  # 40 moves by each of two users, spread over the 30 cards
        card = cards[round_ % len(cards)]
        rows.append(("card_moved", kanban.admin.id, card, INSIDE))
        rows.append(("card_moved", ben.id, card, INSIDE))
    for card in cards[:6]:  # the six cards of Done complete, each recorded three times
        rows.extend(("entered_done", kanban.admin.id, card, INSIDE) for _ in range(3))
    rows.extend(("comment_created", kanban.admin.id, cards[0], INSIDE) for _ in range(10))
    seed_events(app, kanban.board_id, rows)

    data = analytics_data(client, kanban)
    assert [item["count"] for item in data["cards_per_column"]] == [6] * 5  # not 6 x events
    assert data["completed_cards"] == 6  # not 18
    assert [(i["name"], i["count"]) for i in data["member_activity"]] == [
        ("Admin", 50),
        ("Ben", 40),
    ]


def test_figures_match_the_rows_written_by_the_real_writers(client, kanban, app, board_tracker):
    ana = kanban.add_member("member", name="Ana")
    headers = {"admin": kanban.headers(), "ana": kanban.headers(ana)}

    def call(method, path, who, **body):
        response = getattr(client, method)(path, json=body or None, headers=headers[who])
        assert response.status_code in (200, 201), response.get_json()
        return response.get_json()["data"]

    todo = call("post", f"/api/boards/{kanban.board_id}/columns", "admin", name="Todo")["column"]
    done = call(
        "post", f"/api/boards/{kanban.board_id}/columns", "admin", name="Done", is_done=True
    )["column"]
    first = call("post", f"/api/columns/{todo['id']}/cards", "ana", title="One")["card"]
    call("post", f"/api/columns/{done['id']}/cards", "admin", title="Two")  # created in Done
    call(
        "patch",
        f"/api/cards/{first['id']}/position",
        "ana",
        column_id=done["id"],
        before_card_id=None,
        expected_position_version=board_version(app, kanban.board_id),
    )
    call(
        "patch",
        f"/api/boards/{kanban.board_id}/columns/reorder",
        "admin",
        column_id=done["id"],
        before_column_id=todo["id"],
        expected_position_version=board_version(app, kanban.board_id),
    )
    call("post", f"/api/cards/{first['id']}/comments", "ana", content="nice")
    call("post", f"/api/cards/{first['id']}/comments", "admin", content="thanks")

    written = events(app, kanban.board_id)  # (kind, actor_id, card_id)
    expected_completed = len({card for kind, _, card in written if kind == "entered_done"})
    expected_activity = Counter(actor for kind, actor, _ in written if kind != "entered_done")
    data = analytics_data(client, kanban)
    assert data["completed_cards"] == expected_completed == 2
    assert {i["user_id"]: i["count"] for i in data["member_activity"]} == {
        str(actor): count for actor, count in expected_activity.items()
    }
    # Admin: reorder, card created in Done and one comment (the two column creates write no
    # event) = 3. Ana: card created, card moved and one comment = 3.
    assert sorted(expected_activity.values()) == [3, 3]
    assert [(c["name"], c["count"]) for c in data["cards_per_column"]] == [("Done", 2), ("Todo", 0)]
