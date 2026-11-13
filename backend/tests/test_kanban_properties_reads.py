"""Feature: kanban, Property 4: Authoritative order (task 5.11).

After each move in a fixed script, the lists in the move response equal what E07 returns, sorted
by `(order, id)`, including after rebalances.
"""

from __future__ import annotations

import pytest

from tests.kanban_helpers import e07_columns, make_kanban, move, seed_cards


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


# (card key, destination column key, anchor key or None). Keys: x1 x2 y1 n1 n2, todo doing.
SCRIPT = [
    ("x1", "doing", None),
    ("x2", "doing", "y1"),
    ("y1", "todo", None),
    ("x1", "todo", "y1"),
    ("n2", "doing", "x2"),
    ("n1", "doing", "n2"),  # lands between nextafter-close orders, so a rebalance runs
    ("x2", "todo", None),
    ("y1", "doing", "n1"),
    ("n2", "doing", None),
    ("x1", "doing", "x1"),  # invalid self anchor, must change nothing
]


def test_property_4_move_responses_match_e07_after_every_step(client, board_tracker, app):
    import math

    kanban = make_kanban(board_tracker, app)
    t = seed_cards(kanban)
    n1 = board_tracker.make_card(t.doing, "N1", order=1.0)
    n2 = board_tracker.make_card(t.doing, "N2", order=math.nextafter(1.0, 2.0))
    ids = {"x1": t.x1, "x2": t.x2, "y1": t.y1, "n1": n1, "n2": n2}
    columns = {"todo": t.todo, "doing": t.doing}
    version = 0
    for card, destination, anchor in SCRIPT:
        response = move(
            client,
            kanban,
            ids[card],
            columns[destination],
            ids[anchor] if anchor else None,
            version,
        )
        if response.status_code == 400:
            assert (card, anchor) == ("x1", "x1")
            continue
        assert response.status_code == 200, (card, destination, anchor, response.get_json())
        data = response.get_json()["data"]
        version = data["position_version"]
        detail = {c["id"]: c for c in e07_columns(client, kanban.headers(), kanban.board_id)}
        for column in data["columns"]:
            served = [(c["id"], c["order"]) for c in detail[column["id"]]["cards"]]
            assert [(c["id"], c["order"]) for c in column["cards"]] == served
            assert [(o, i) for i, o in served] == sorted((o, i) for i, o in served)
