"""E29 sprint window (Revision 2; Requirement 9; Properties P22 and P23; decision C40).

The clock is fixed with `freeze`, so no test depends on the real date. A board with a sprint counts
inside `[sprint_start 00:00:00Z, the day after sprint_end 00:00:00Z)`. A board without one keeps
the UTC week.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.blueprints.analytics.service import board_window
from tests.analytics_helpers import (
    DATA_KEYS,
    analytics_data,
    event_count,
    freeze,
    get_analytics,
    seed_events,
    sprint_board,
)
from tests.kanban_helpers import make_kanban, set_done

ZULU = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
START = datetime(2026, 11, 16, tzinfo=UTC)
END_EXCLUSIVE = datetime(2026, 11, 23, tzinfo=UTC)
MICRO = timedelta(microseconds=1)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


def _done_column(kanban, app, board_tracker):
    column = board_tracker.make_column(kanban.board_id, "Done", order=1.0)
    set_done(app, column)
    return column


def _seed_at(kanban, app, board_tracker, moments):
    """One Done card per moment, each with a `card_created` and an `entered_done` event."""
    column = _done_column(kanban, app, board_tracker)
    cards = [
        board_tracker.make_card(column, f"c{i}", order=float(i + 1)) for i in range(len(moments))
    ]
    rows = []
    for card, at in zip(cards, moments, strict=True):
        rows.append(("card_created", kanban.admin.id, card, at))
        rows.append(("entered_done", kanban.admin.id, card, at))
    seed_events(app, kanban.board_id, rows)
    return column, cards


def test_the_window_edges_belong_to_exactly_one_period(
    client, kanban, app, board_tracker, monkeypatch
):
    freeze(monkeypatch)
    sprint_board(app, kanban.board_id, "2026-11-16", "2026-11-22")
    _seed_at(
        kanban,
        app,
        board_tracker,
        [START - MICRO, START, END_EXCLUSIVE - MICRO, END_EXCLUSIVE],
    )
    data = analytics_data(client, kanban)
    assert data["window"] == "sprint"
    assert (data["week_start"], data["week_end"]) == (
        "2026-11-16T00:00:00Z",
        "2026-11-23T00:00:00Z",
    )
    assert data["completed_cards"] == 2  # the start instant and the last microsecond
    assert data["member_activity"][0]["count"] == 2  # card_created at the same two instants


def test_a_one_day_sprint_covers_that_day_in_full(client, kanban, app, board_tracker, monkeypatch):
    freeze(monkeypatch)
    sprint_board(app, kanban.board_id, "2026-11-18", "2026-11-18")
    day = datetime(2026, 11, 18, tzinfo=UTC)
    _seed_at(
        kanban,
        app,
        board_tracker,
        [
            day - MICRO,
            day,
            day + timedelta(hours=12),
            day + timedelta(days=1) - MICRO,
            day + timedelta(days=1),
        ],
    )
    data = analytics_data(client, kanban)
    assert (data["week_start"], data["week_end"]) == (
        "2026-11-18T00:00:00Z",
        "2026-11-19T00:00:00Z",
    )
    assert data["completed_cards"] == 3


def test_a_ninety_day_sprint_counts_its_last_day(client, kanban, app, board_tracker, monkeypatch):
    freeze(monkeypatch)
    sprint_board(app, kanban.board_id, "2026-11-01", "2027-01-29")
    last_instant = datetime(2027, 1, 30, tzinfo=UTC) - MICRO
    _seed_at(kanban, app, board_tracker, [last_instant, last_instant + MICRO])
    data = analytics_data(client, kanban)
    assert data["week_end"] == "2027-01-30T00:00:00Z"
    assert data["completed_cards"] == 1


@pytest.mark.parametrize(
    ("start", "end", "expected_end"),
    [
        ("2026-12-30", "2027-01-02", "2027-01-03T00:00:00Z"),  # across a year
        ("2028-02-27", "2028-03-01", "2028-03-02T00:00:00Z"),  # across a leap day
        ("2026-11-30", "2026-12-01", "2026-12-02T00:00:00Z"),  # across a month
    ],
)
def test_the_window_end_is_the_day_after_the_sprint_end(
    client, kanban, app, monkeypatch, start, end, expected_end
):
    freeze(monkeypatch)
    sprint_board(app, kanban.board_id, start, end)
    data = analytics_data(client, kanban)
    assert (data["week_start"], data["week_end"]) == (f"{start}T00:00:00Z", expected_end)
    assert ZULU.match(data["week_start"]) and ZULU.match(data["week_end"])


@pytest.mark.parametrize(
    ("start", "end"),
    [("2035-06-01", "2035-06-14"), ("2020-01-06", "2020-01-12")],
    ids=["future", "past"],
)
def test_a_sprint_that_does_not_hold_today_counts_nothing(
    client, kanban, app, board_tracker, monkeypatch, start, end
):
    freeze(
        monkeypatch
    )  # Saturday 2026-11-14, inside the UTC week that the board would otherwise use
    sprint_board(app, kanban.board_id, start, end)
    _seed_at(kanban, app, board_tracker, [datetime(2026, 11, 14, 8, tzinfo=UTC)])
    data = analytics_data(client, kanban)
    assert data["window"] == "sprint"
    assert data["completed_cards"] == 0
    assert data["member_activity"] == []


def test_a_board_without_a_sprint_keeps_the_utc_week(
    client, kanban, app, board_tracker, monkeypatch
):
    freeze(monkeypatch)
    _seed_at(kanban, app, board_tracker, [datetime(2026, 11, 14, 8, tzinfo=UTC)])
    data = analytics_data(client, kanban)
    assert data["window"] == "week"
    assert (data["week_start"], data["week_end"]) == (
        "2026-11-09T00:00:00Z",
        "2026-11-16T00:00:00Z",
    )
    assert data["completed_cards"] == 1


def test_the_response_has_exactly_six_keys_and_no_query_is_accepted(
    client, kanban, app, monkeypatch
):
    freeze(monkeypatch)
    sprint_board(app, kanban.board_id, "2026-11-16", "2026-11-22")
    assert set(analytics_data(client, kanban)) == DATA_KEYS
    response = get_analytics(client, kanban, query="?week=2026-11-09")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"


def test_editing_and_clearing_the_sprint_changes_only_the_next_window(
    client, kanban, app, board_tracker, monkeypatch
):
    """P23: events and `cards_per_column` stay, the window follows the stored range."""
    freeze(monkeypatch)
    column, _ = _seed_at(
        kanban,
        app,
        board_tracker,
        [datetime(2026, 11, 3, 9, tzinfo=UTC), datetime(2026, 11, 14, 9, tzinfo=UTC)],
    )
    events_before = event_count(app, kanban.board_id)

    patch = lambda body: client.patch(  # noqa: E731
        f"/api/boards/{kanban.board_id}", json=body, headers=kanban.headers()
    )
    assert patch({"sprint_start": "2026-11-01", "sprint_end": "2026-11-07"}).status_code == 200
    first = analytics_data(client, kanban)
    assert (first["window"], first["completed_cards"]) == ("sprint", 1)  # the 3 Nov card

    assert patch({"sprint_start": "2026-11-08", "sprint_end": "2026-11-14"}).status_code == 200
    second = analytics_data(client, kanban)
    assert (second["window"], second["completed_cards"]) == ("sprint", 1)  # the 14 Nov card
    assert second["week_start"] == "2026-11-08T00:00:00Z"

    assert patch({"sprint_start": None, "sprint_end": None}).status_code == 200
    cleared = analytics_data(client, kanban)
    assert cleared["window"] == "week"
    assert cleared["week_start"] == "2026-11-09T00:00:00Z"
    assert cleared["completed_cards"] == 1  # only the 14 Nov card falls in the UTC week

    assert event_count(app, kanban.board_id) == events_before
    assert first["cards_per_column"] == second["cards_per_column"] == cleared["cards_per_column"]
    assert first["cards_per_column"][0]["column_id"] == str(column)


def test_the_member_sees_the_same_window_as_the_admin(client, kanban, app, monkeypatch):
    freeze(monkeypatch)
    sprint_board(app, kanban.board_id, "2026-11-16", "2026-11-22")
    member = kanban.add_member()
    assert analytics_data(client, kanban, user=member) == analytics_data(client, kanban)


@pytest.mark.parametrize(
    ("sprint", "expected"),
    [
        (("2026-11-16", "2026-11-22"), (START, END_EXCLUSIVE, "sprint")),
        (("2026-11-16", "2026-11-16"), (START, START + timedelta(days=1), "sprint")),
        ((None, None), (datetime(2026, 11, 9, tzinfo=UTC), START, "week")),
    ],
)
def test_board_window_unit(sprint, expected):
    now = datetime(2026, 11, 14, 12, tzinfo=UTC)
    access = SimpleNamespace(
        sprint_start=datetime.fromisoformat(sprint[0]).date() if sprint[0] else None,
        sprint_end=datetime.fromisoformat(sprint[1]).date() if sprint[1] else None,
    )
    assert board_window(access, now) == expected
