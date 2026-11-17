"""E29 UTC week boundaries and format (T14; Requirement 4; Properties 5 and 6; decision A2)."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

import pytest

from app.blueprints.analytics.service import week_bounds
from tests.analytics_helpers import WEEK_END, WEEK_START, analytics_data, freeze, seed_events
from tests.kanban_helpers import make_kanban, set_done

ZULU = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


def _window(client, kanban) -> tuple[str, str]:
    data = analytics_data(client, kanban)
    return data["week_start"], data["week_end"]


def test_an_instant_belongs_to_exactly_one_week(client, kanban, app, board_tracker, monkeypatch):
    freeze(monkeypatch)
    column = board_tracker.make_column(kanban.board_id, "Done", order=1.0)
    set_done(app, column)
    cards = [board_tracker.make_card(column, f"c{i}", order=float(i + 1)) for i in range(4)]
    moments = [
        WEEK_START - timedelta(microseconds=1),  # earlier week
        WEEK_START,  # inside (inclusive)
        WEEK_END - timedelta(microseconds=1),  # inside
        WEEK_END,  # next week (exclusive)
    ]
    rows = []
    for card, at in zip(cards, moments, strict=True):
        rows.append(("card_created", kanban.admin.id, card, at))
        rows.append(("entered_done", kanban.admin.id, card, at))
    seed_events(app, kanban.board_id, rows)
    data = analytics_data(client, kanban)
    assert data["completed_cards"] == 2
    assert data["member_activity"][0]["count"] == 2


def test_sunday_night_and_monday_midnight_are_different_weeks(
    client, kanban, app, board_tracker, monkeypatch
):
    column = board_tracker.make_column(kanban.board_id, "Done", order=1.0)
    set_done(app, column)
    old, new = (board_tracker.make_card(column, n, order=float(i + 1)) for i, n in enumerate("ab"))
    last_second = datetime(2026, 11, 15, 23, 59, 59, tzinfo=UTC)
    first_second = datetime(2026, 11, 16, 0, 0, 0, tzinfo=UTC)
    seed_events(
        app,
        kanban.board_id,
        [
            ("entered_done", kanban.admin.id, old, last_second),
            ("entered_done", kanban.admin.id, new, first_second),
        ],
    )
    freeze(monkeypatch, "2026-11-15T23:59:59+00:00")
    assert _window(client, kanban) == ("2026-11-09T00:00:00Z", "2026-11-16T00:00:00Z")
    assert analytics_data(client, kanban)["completed_cards"] == 1  # only the Sunday event
    freeze(monkeypatch, "2026-11-16T00:00:00+00:00")
    assert _window(client, kanban) == ("2026-11-16T00:00:00Z", "2026-11-23T00:00:00Z")
    assert analytics_data(client, kanban)["completed_cards"] == 1  # only the Monday event


@pytest.mark.parametrize(
    ("now", "start", "end"),
    [
        ("2027-01-01T10:00:00+00:00", "2026-12-28T00:00:00Z", "2027-01-04T00:00:00Z"),  # new year
        ("2028-02-29T12:00:00+00:00", "2028-02-28T00:00:00Z", "2028-03-06T00:00:00Z"),  # leap day
        ("2026-11-16T05:00:00+07:00", "2026-11-09T00:00:00Z", "2026-11-16T00:00:00Z"),  # Sunday UTC
        ("2026-11-15T23:00:00-05:00", "2026-11-16T00:00:00Z", "2026-11-23T00:00:00Z"),  # Monday UTC
    ],
)
def test_year_leap_day_and_offset_clocks_give_the_utc_week(
    client, kanban, monkeypatch, now, start, end
):
    freeze(monkeypatch, now)
    assert _window(client, kanban) == (start, end)


def test_the_timestamps_end_in_z_and_span_seven_days(client, kanban, monkeypatch):
    freeze(monkeypatch)
    start, end = _window(client, kanban)
    assert ZULU.match(start) and ZULU.match(end)
    parse = lambda text: datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
    assert parse(end) - parse(start) == timedelta(days=7)
    assert parse(start).weekday() == 0 and parse(start).time().isoformat() == "00:00:00"


@pytest.mark.parametrize("offset", range(7))
def test_week_bounds_for_every_weekday(offset):
    now = datetime(2026, 11, 9, 13, 37, 21, tzinfo=UTC) + timedelta(days=offset)
    assert week_bounds(now) == (WEEK_START, WEEK_END)


def test_week_bounds_at_the_edges():
    assert week_bounds(WEEK_START) == (WEEK_START, WEEK_END)
    assert week_bounds(WEEK_END - timedelta(microseconds=1)) == (WEEK_START, WEEK_END)
    assert week_bounds(WEEK_END)[0] == WEEK_END
