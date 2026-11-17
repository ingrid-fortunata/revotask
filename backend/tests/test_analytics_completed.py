"""E29 completed_cards (T14; Requirement 2; Property 2; decision A3)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import update

from app.extensions import db
from app.models.board_column import BoardColumn
from app.models.card import Card
from tests.analytics_helpers import (
    WEEK_END,
    WEEK_START,
    analytics_data,
    freeze,
    seed_events,
)
from tests.kanban_helpers import _write, board_version, make_kanban, set_done, soft_delete

INSIDE = WEEK_START + timedelta(days=2, hours=3)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


@pytest.fixture
def lanes(kanban, board_tracker, app):
    todo = board_tracker.make_column(kanban.board_id, "Todo", order=1024.0)
    done = board_tracker.make_column(kanban.board_id, "Done", order=2048.0)
    set_done(app, done)
    return todo, done


def _entered(kanban, card, at=INSIDE):
    return ("entered_done", kanban.admin.id, card, at)


def _completed(client, kanban) -> int:
    return analytics_data(client, kanban)["completed_cards"]


def test_a_week_with_no_completion_is_zero(client, kanban, monkeypatch):
    freeze(monkeypatch)
    assert _completed(client, kanban) == 0


def test_a_card_created_in_done_and_a_card_moved_into_done_both_count(
    client, kanban, lanes, board_tracker, app
):
    todo, done = lanes
    # Real writers. A card created in Done and a card moved into Done each write entered_done.
    created = client.post(
        f"/api/columns/{done}/cards", json={"title": "Born done"}, headers=kanban.headers()
    )
    assert created.status_code == 201
    moving = board_tracker.make_card(todo, "Move me", order=1024.0)
    moved = client.patch(
        f"/api/cards/{moving}/position",
        json={
            "column_id": str(done),
            "before_card_id": None,
            "expected_position_version": board_version(app, kanban.board_id),
        },
        headers=kanban.headers(),
    )
    assert moved.status_code == 200
    assert _completed(client, kanban) == 2


def test_the_same_card_entering_done_twice_counts_once(client, kanban, lanes, board_tracker, app):
    todo, done = lanes
    card = board_tracker.make_card(todo, "Back and forth", order=1024.0)

    def move(target):
        response = client.patch(
            f"/api/cards/{card}/position",
            json={
                "column_id": str(target),
                "before_card_id": None,
                "expected_position_version": board_version(app, kanban.board_id),
            },
            headers=kanban.headers(),
        )
        assert response.status_code == 200, response.get_json()

    move(done)
    move(todo)
    move(done)
    # Two entered_done rows exist for one card, and the card counts once (A3).
    assert _completed(client, kanban) == 1
    move(todo)
    # Dragged back out of Done: the figure drops (A3 revised).
    assert _completed(client, kanban) == 0


def test_repeated_events_for_one_card_count_once_and_distinct_cards_add_up(
    client, kanban, lanes, board_tracker, app, monkeypatch
):
    freeze(monkeypatch)
    _, done = lanes
    cards = [board_tracker.make_card(done, f"c{i}", order=float(i + 1)) for i in range(3)]
    seed_events(
        app,
        kanban.board_id,
        [
            _entered(kanban, cards[0]),
            _entered(kanban, cards[0], INSIDE + timedelta(hours=1)),
            _entered(kanban, cards[1]),
            _entered(kanban, cards[2]),
        ],
    )
    assert _completed(client, kanban) == 3


@pytest.mark.parametrize("later", ["deleted", "moved_out", "column_deleted", "column_not_done"])
def test_a_card_stops_counting_once_it_is_no_longer_in_an_active_done_column(
    client, kanban, lanes, board_tracker, app, monkeypatch, later
):
    freeze(monkeypatch)
    todo, done = lanes
    card = board_tracker.make_card(done, "Completed", order=1024.0)
    seed_events(app, kanban.board_id, [_entered(kanban, card)])
    if later == "deleted":
        soft_delete(app, Card, card)
    elif later == "moved_out":
        _write(
            app,
            lambda: db.session.execute(update(Card).where(Card.id == card).values(column_id=todo)),
        )
    elif later == "column_deleted":
        soft_delete(app, BoardColumn, done)
    else:
        _write(
            app,
            lambda: db.session.execute(
                update(BoardColumn).where(BoardColumn.id == done).values(is_done=False)
            ),
        )
    # A3 revised: the count follows where the card is now, not only the entered_done history.
    assert _completed(client, kanban) == 0


def test_other_actions_on_a_card_add_nothing(
    client, kanban, lanes, board_tracker, app, monkeypatch
):
    freeze(monkeypatch)
    _, done = lanes
    card = board_tracker.make_card(done, "Already done", order=1024.0)
    seed_events(
        app,
        kanban.board_id,
        [
            (
                "card_moved",
                kanban.admin.id,
                card,
                INSIDE,
            ),  # a move within Done writes no entered_done
            ("comment_created", kanban.admin.id, card, INSIDE),
            ("card_created", kanban.admin.id, card, INSIDE),
        ],
    )
    # An edit and an assignment write no event at all.
    edited = client.patch(f"/api/cards/{card}", json={"title": "Renamed"}, headers=kanban.headers())
    assert edited.status_code == 200
    assert _completed(client, kanban) == 0


def test_events_of_other_boards_and_other_weeks_do_not_count(
    client, kanban, lanes, board_tracker, app, monkeypatch
):
    freeze(monkeypatch)
    _, done = lanes
    mine = board_tracker.make_card(done, "mine", order=1.0)
    other = make_kanban(board_tracker, app, name="Other")
    other_column = board_tracker.make_column(other.board_id, "Done", order=1.0)
    set_done(app, other_column)
    elsewhere = board_tracker.make_card(other_column, "theirs", order=1.0)
    seed_events(app, other.board_id, [_entered(other, elsewhere)])
    seed_events(
        app,
        kanban.board_id,
        [
            _entered(kanban, mine, WEEK_START - timedelta(microseconds=1)),  # earlier week
            _entered(kanban, mine, WEEK_END),  # later week
        ],
    )
    assert _completed(client, kanban) == 0
    assert _completed(client, other) == 1
