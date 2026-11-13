"""Order allocation, unchanged-position detection, version bump and events (task 2.6).

Property 1 (Order allocation): for every sibling list in the table and every index, the result is
a finite positive number strictly between its neighbors, or None so that the caller rebalances.
The pure tests need no database. The last tests use `board_tracker` on TEST_DATABASE_URL.
"""

from __future__ import annotations

import math
import uuid

import pytest
from sqlalchemy import select

from app.exceptions import StateConflictError
from app.extensions import db
from app.models.board import Board
from app.models.board_event import BoardEvent
from app.positions import (
    MAX_POSITION_VERSION,
    STEP,
    allocate_order,
    bump_position_version,
    is_unchanged,
    rebalanced_orders,
    record_event,
)

TINY = 5e-324  # the smallest positive double
HUGE = 1e308


def test_empty_list_gets_the_first_step():
    assert allocate_order([], 0) == STEP == 1024.0


def test_append_is_last_plus_step():
    assert allocate_order([1024.0, 2048.0], 2) == 3072.0
    assert allocate_order([1024.0, 2048.0], 99) == 3072.0  # an index past the end appends


def test_prepend_is_half_of_the_first_value():
    assert allocate_order([1024.0, 2048.0], 0) == 512.0
    assert allocate_order([1024.0, 2048.0], -3) == 512.0  # a negative index prepends


def test_interior_insert_is_the_midpoint():
    assert allocate_order([1024.0, 2048.0, 4096.0], 1) == 1536.0
    assert allocate_order([1024.0, 2048.0, 4096.0], 2) == 3072.0


def test_equal_neighbors_have_no_strict_midpoint():
    assert allocate_order([5.0, 5.0], 1) is None
    assert allocate_order([5.0, 5.0, 5.0], 2) is None


def test_adjacent_doubles_have_no_strict_midpoint():
    low = 1.0
    high = math.nextafter(low, math.inf)
    assert allocate_order([low, high], 1) is None


def test_prepend_before_the_smallest_positive_double_needs_a_rebalance():
    # TINY / 2 rounds to 0.0, which is not positive.
    assert allocate_order([TINY, 1.0], 0) is None


def test_append_after_a_huge_value_needs_a_rebalance():
    # HUGE + 1024 == HUGE, so the candidate is not above the last value.
    assert allocate_order([HUGE], 1) is None


def test_append_that_overflows_to_infinity_needs_a_rebalance():
    assert allocate_order([1.7976931348623157e308], 1) is None


def test_rebalanced_orders_are_strictly_increasing_steps_from_1024():
    assert rebalanced_orders(0) == []
    assert rebalanced_orders(4) == [1024.0, 2048.0, 3072.0, 4096.0]
    orders = rebalanced_orders(50)
    assert all(low < high for low, high in zip(orders, orders[1:], strict=False))
    assert all(math.isfinite(value) and value > 0 for value in orders)


SIBLING_TABLE = [
    [],
    [1024.0],
    [1024.0, 2048.0],
    [1024.0, 2048.0, 4096.0, 8192.0],
    [1.0, math.nextafter(1.0, 2.0), 2.0],
    [5.0, 5.0, 5.0],
    [TINY, 1.0],
    [HUGE],
    [1.0, 1e-300, 1e300],
]


@pytest.mark.parametrize("siblings", SIBLING_TABLE)
def test_property_1_result_is_strictly_between_neighbors_or_none(siblings):
    ordered = sorted(siblings)
    for index in range(len(ordered) + 1):
        result = allocate_order(ordered, index)
        if result is None:
            continue
        assert math.isfinite(result) and result > 0
        lower = ordered[index - 1] if index > 0 else 0.0
        upper = ordered[index] if index < len(ordered) else math.inf
        assert lower < result < upper, (ordered, index, result)


@pytest.mark.parametrize("siblings", SIBLING_TABLE)
def test_property_1_a_none_result_is_followed_by_a_valid_rebalance(siblings):
    ordered = sorted(siblings)
    for index in range(len(ordered) + 1):
        if allocate_order(ordered, index) is None:
            orders = rebalanced_orders(len(ordered) + 1)
            assert orders == sorted(set(orders))


A, B, C, D = (uuid.UUID(int=n) for n in (1, 2, 3, 4))


@pytest.mark.parametrize(
    ("current", "moved", "anchor", "expected"),
    [
        ([A, B, C], B, C, True),  # the anchor is the next sibling
        ([A, B, C], C, None, True),  # last item, appended
        ([A, B, C], A, B, True),
        ([A, B, C], B, None, False),  # B would move to the end
        ([A, B, C], C, A, False),  # C would move to the front
        ([A, B, C], A, C, False),  # A would move one place down
        ([A, B, C], C, B, False),  # the anchor is the previous sibling
        ([A], A, None, True),
        ([A, B, C], D, None, False),  # the moved item is not in this list
        ([A, B, C], B, D, False),  # the anchor is not in this list
    ],
)
def test_is_unchanged(current, moved, anchor, expected):
    assert is_unchanged(current, moved, anchor) is expected


def _set_version(app, board_id: uuid.UUID, version: int) -> None:
    with app.app_context():
        try:
            db.session.execute(
                Board.__table__.update()
                .where(Board.id == board_id)
                .values(position_version=version)
            )
            db.session.commit()
        finally:
            db.session.remove()


def _version(app, board_id: uuid.UUID) -> int:
    with app.app_context():
        try:
            return db.session.scalar(select(Board.position_version).where(Board.id == board_id))
        finally:
            db.session.remove()


def test_bump_adds_one_and_returns_the_new_version(app, board_tracker):
    owner = board_tracker.make_user()
    board_id = board_tracker.make_board(owner.id)
    with app.app_context():
        try:
            assert bump_position_version(board_id) == 1
            assert bump_position_version(board_id) == 2
            db.session.commit()
        finally:
            db.session.remove()
    assert _version(app, board_id) == 2


def test_bump_at_the_ceiling_raises_and_leaves_the_version(app, board_tracker):
    owner = board_tracker.make_user()
    board_id = board_tracker.make_board(owner.id)
    _set_version(app, board_id, MAX_POSITION_VERSION)
    with app.app_context():
        try:
            with pytest.raises(StateConflictError) as raised:
                bump_position_version(board_id)
            assert raised.value.message == "This board has reached its change limit."
            db.session.rollback()
        finally:
            db.session.remove()
    assert _version(app, board_id) == MAX_POSITION_VERSION


def test_bump_one_below_the_ceiling_still_works(app, board_tracker):
    owner = board_tracker.make_user()
    board_id = board_tracker.make_board(owner.id)
    _set_version(app, board_id, MAX_POSITION_VERSION - 1)
    with app.app_context():
        try:
            assert bump_position_version(board_id) == MAX_POSITION_VERSION
            db.session.commit()
        finally:
            db.session.remove()


def test_record_event_is_written_only_when_the_caller_commits(app, board_tracker):
    owner = board_tracker.make_user()
    board_id = board_tracker.make_board(owner.id)
    with app.app_context():
        try:
            record_event(board_id, owner.id, "column_reordered")
            db.session.rollback()
            assert (
                db.session.scalars(select(BoardEvent).where(BoardEvent.board_id == board_id)).all()
                == []
            )
            record_event(board_id, owner.id, "column_reordered")
            db.session.commit()
            events = db.session.scalars(
                select(BoardEvent).where(BoardEvent.board_id == board_id)
            ).all()
            assert [(e.kind, e.actor_id, e.card_id) for e in events] == [
                ("column_reordered", owner.id, None)
            ]
            assert events[0].occurred_at is not None
        finally:
            db.session.remove()
