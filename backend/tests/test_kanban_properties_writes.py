"""Feature: kanban, Properties 3, 5, 6, 9, 10, 12 and 18 over one operation script (task 5.11).

One board runs a fixed script of writes. After each step the test checks the version delta and the
event kinds written, which together are the version and event properties. The rejection rows cover
Properties 5 and 6. Atomicity (12) and the ceiling (18) have their own files over every endpoint.
"""

from __future__ import annotations

import uuid

import pytest

from tests.kanban_helpers import (
    board_version,
    events,
    make_kanban,
    move,
    post_card,
    post_column,
    reorder,
    seed_cards,
    set_done,
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def test_properties_3_and_10_version_delta_and_events_per_operation(client, board_tracker, app):
    kanban = make_kanban(board_tracker, app)
    t = seed_cards(kanban)
    set_done(app, t.doing)
    events_seen = 0
    version = 0

    def run(label, response, ok_status, delta, kinds):
        nonlocal events_seen, version
        assert response.status_code == ok_status, (label, response.get_json())
        version += delta
        assert board_version(app, kanban.board_id) == version, label
        written = [kind for kind, _a, _c in events(app, kanban.board_id)][events_seen:]
        assert sorted(written) == sorted(kinds), label
        events_seen += len(written)

    column = post_column(client, kanban, name="Extra")
    kanban.tracker.record_column_from_response(column)
    extra = column.get_json()["data"]["column"]["id"]
    run("create column", column, 201, 1, [])
    card = post_card(client, kanban, t.todo, title="N")
    kanban.tracker.record_card_from_response(card)
    new_card = card.get_json()["data"]["card"]["id"]
    run("create card in todo", card, 201, 1, ["card_created"])
    done_card = post_card(client, kanban, t.doing, title="D")
    kanban.tracker.record_card_from_response(done_card)
    run("create card in done", done_card, 201, 1, ["card_created", "entered_done"])
    run(
        "edit card",
        client.patch(f"/api/cards/{t.x1}", json={"title": "E"}, headers=kanban.headers()),
        200,
        0,
        [],
    )
    run(
        "rename column",
        client.patch(f"/api/columns/{extra}", json={"name": "Z"}, headers=kanban.headers()),
        200,
        0,
        [],
    )
    run(
        "move into done",
        move(client, kanban, t.x1, t.doing, None, version),
        200,
        1,
        ["card_moved", "entered_done"],
    )
    run(
        "move within done",
        move(client, kanban, t.x1, t.doing, t.y1, version),
        200,
        1,
        ["card_moved"],
    )
    run("unchanged move", move(client, kanban, t.x1, t.doing, t.y1, version), 200, 0, [])
    run(
        "move out of done",
        move(client, kanban, t.x1, t.todo, None, version),
        200,
        1,
        ["card_moved"],
    )
    run(
        "reorder columns",
        reorder(client, kanban, extra, t.todo, version),
        200,
        1,
        ["column_reordered"],
    )
    run("unchanged reorder", reorder(client, kanban, extra, t.todo, version), 200, 0, [])
    run(
        "delete card", client.delete(f"/api/cards/{new_card}", headers=kanban.headers()), 200, 1, []
    )
    run(
        "delete empty column",
        client.delete(f"/api/columns/{extra}", headers=kanban.headers()),
        200,
        1,
        [],
    )


REJECTIONS = [
    ("stale version", lambda c, k, t, v: move(c, k, t.x1, t.doing, None, v + 5), 409),
    ("self anchor", lambda c, k, t, v: move(c, k, t.x1, t.todo, t.x1, v), 400),
    ("unknown anchor", lambda c, k, t, v: move(c, k, t.x1, t.doing, uuid.uuid4(), v), 400),
    ("unknown destination", lambda c, k, t, v: move(c, k, t.x1, uuid.uuid4(), None, v), 400),
    ("stale beats self anchor", lambda c, k, t, v: move(c, k, t.x1, t.todo, t.x1, v + 1), 409),
    (
        "stale beats unknown anchor",
        lambda c, k, t, v: move(c, k, t.x1, t.doing, uuid.uuid4(), v + 1),
        409,
    ),
    ("column stale", lambda c, k, t, v: reorder(c, k, t.todo, t.doing, v + 1), 409),
    ("column self anchor", lambda c, k, t, v: reorder(c, k, t.todo, t.todo, v), 400),
    (
        "column stale beats self anchor",
        lambda c, k, t, v: reorder(c, k, t.todo, t.todo, v + 1),
        409,
    ),
]


@pytest.mark.parametrize(("label", "attempt", "status"), REJECTIONS, ids=[r[0] for r in REJECTIONS])
def test_properties_5_and_6_rejections_have_the_agreed_status_and_write_nothing(
    client, board_tracker, app, label, attempt, status
):
    kanban = make_kanban(board_tracker, app)
    t = seed_cards(kanban)
    version = board_version(app, kanban.board_id)
    response = attempt(client, kanban, t, version)
    assert response.status_code == status, label
    assert board_version(app, kanban.board_id) == version
    assert events(app, kanban.board_id) == []
    code = response.get_json()["error"]["code"]
    assert code == ("POSITION_CONFLICT" if status == 409 else "VALIDATION_ERROR")
