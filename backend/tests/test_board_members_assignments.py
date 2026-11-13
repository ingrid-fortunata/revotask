"""BT5 E12 assignment-clearing tests (task 2.10).

Requirements 5.1, 5.5, 5.9 and 7.5, and design DD6 (AC04.2). Covers the success case, where E12
on board 1 clears the removed member's active card assignments on that board only, and the
rollback case, where a failure at the commit that persists the removal leaves the membership and
every assignment as they were.

Every row is created through `board_tracker`, which removes it after the test, even on failure.
The app is built from TEST_DATABASE_URL through the conftest fixtures.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

import pytest
from sqlalchemy import select, update
from sqlalchemy.exc import OperationalError

from app.extensions import db
from app.models.base import utcnow
from app.models.board_member import BoardMember
from app.models.card import Card
from tests.auth_helpers import bearer


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@dataclass(frozen=True)
class Seed:
    """Two boards, A as admin of both, B as member of both, and cards on each board."""

    admin_id: uuid.UUID
    member_id: uuid.UUID
    board_one: uuid.UUID
    board_two: uuid.UUID
    membership_one: uuid.UUID
    membership_two: uuid.UUID
    card_b1: uuid.UUID
    card_b1_second: uuid.UUID
    card_b1_deleted: uuid.UUID
    card_a1: uuid.UUID
    card_b2: uuid.UUID

    @property
    def card_ids(self) -> list[uuid.UUID]:
        return [
            self.card_b1,
            self.card_b1_second,
            self.card_b1_deleted,
            self.card_a1,
            self.card_b2,
        ]


def _seed(board_tracker, app) -> Seed:
    admin = board_tracker.make_user(name="Admin A")
    member = board_tracker.make_user(name="Member B")
    board_one = board_tracker.make_board(admin.id, name="Board one")
    board_two = board_tracker.make_board(admin.id, name="Board two")
    board_tracker.make_membership(board_one, admin.id, "admin")
    board_tracker.make_membership(board_two, admin.id, "admin")
    membership_one = board_tracker.make_membership(board_one, member.id, "member")
    membership_two = board_tracker.make_membership(board_two, member.id, "member")
    column_one = board_tracker.make_column(board_one, name="Todo one")
    column_two = board_tracker.make_column(board_two, name="Todo two")
    card_b1 = board_tracker.make_card(column_one, title="B on one", assignee_id=member.id)
    card_b1_second = board_tracker.make_card(
        column_one, title="B on one again", assignee_id=member.id, order=2.0
    )
    card_b1_deleted = board_tracker.make_card(
        column_one, title="B deleted", assignee_id=member.id, order=3.0
    )
    card_a1 = board_tracker.make_card(column_one, title="A on one", assignee_id=admin.id, order=4.0)
    card_b2 = board_tracker.make_card(column_two, title="B on two", assignee_id=member.id)
    _soft_delete_card(app, card_b1_deleted)
    return Seed(
        admin_id=admin.id,
        member_id=member.id,
        board_one=board_one,
        board_two=board_two,
        membership_one=membership_one,
        membership_two=membership_two,
        card_b1=card_b1,
        card_b1_second=card_b1_second,
        card_b1_deleted=card_b1_deleted,
        card_a1=card_a1,
        card_b2=card_b2,
    )


def _soft_delete_card(app, card_id: uuid.UUID) -> None:
    with app.app_context():
        try:
            db.session.execute(update(Card).where(Card.id == card_id).values(deleted_at=utcnow()))
            db.session.commit()
        finally:
            db.session.remove()


def _card_state(app, card_ids: list[uuid.UUID]) -> dict[uuid.UUID, tuple[Any, Any]]:
    """Each card as (assignee_id, deleted_at), read from the database."""
    with app.app_context():
        try:
            rows = db.session.execute(
                select(Card.id, Card.assignee_id, Card.deleted_at).where(Card.id.in_(card_ids))
            ).all()
            return {row.id: (row.assignee_id, row.deleted_at) for row in rows}
        finally:
            db.session.remove()


def _membership_deleted_at(app, row_id: uuid.UUID) -> Any:
    with app.app_context():
        try:
            return db.session.scalar(select(BoardMember.deleted_at).where(BoardMember.id == row_id))
        finally:
            db.session.remove()


def _headers(board_tracker, user_id: uuid.UUID) -> dict[str, str]:
    return bearer(board_tracker.token_for(user_id))


def _remove_url(board_id: uuid.UUID, user_id: uuid.UUID) -> str:
    return f"/api/boards/{board_id}/members/{user_id}"


def test_e12_on_board_one_clears_only_the_removed_members_active_board_one_assignments(
    client, board_tracker, app
):
    seed = _seed(board_tracker, app)
    before = _card_state(app, seed.card_ids)

    response = client.delete(
        _remove_url(seed.board_one, seed.member_id),
        headers=_headers(board_tracker, seed.admin_id),
    )

    assert response.status_code == 200
    assert response.get_json() == {"data": None}
    after = _card_state(app, seed.card_ids)
    # Active board one cards assigned to B are cleared.
    assert after[seed.card_b1] == (None, None)
    assert after[seed.card_b1_second] == (None, None)
    # Board two cards assigned to B keep their assignment.
    assert after[seed.card_b2] == before[seed.card_b2]
    assert after[seed.card_b2][0] == seed.member_id
    # The soft-deleted card on board one and A's card are unchanged.
    assert after[seed.card_b1_deleted] == before[seed.card_b1_deleted]
    assert after[seed.card_b1_deleted][0] == seed.member_id
    assert after[seed.card_a1] == before[seed.card_a1]
    assert after[seed.card_a1][0] == seed.admin_id


def test_e12_soft_deletes_membership_on_board_one_and_keeps_board_two_membership(
    client, board_tracker, app
):
    seed = _seed(board_tracker, app)

    response = client.delete(
        _remove_url(seed.board_one, seed.member_id),
        headers=_headers(board_tracker, seed.admin_id),
    )

    assert response.status_code == 200
    assert _membership_deleted_at(app, seed.membership_one) is not None
    assert _membership_deleted_at(app, seed.membership_two) is None


def test_failed_commit_after_clearing_keeps_membership_active_and_assignments_unchanged(
    client, board_tracker, app, monkeypatch
):
    seed = _seed(board_tracker, app)
    before_cards = _card_state(app, seed.card_ids)
    before_membership = _membership_deleted_at(app, seed.membership_one)
    real_commit = db.session.commit
    injected = {"fired": False, "assignee_in_transaction": "not-read"}

    def fail_the_membership_commit():
        # Only the commit that persists the removal fails. Its in-session view must already show
        # the soft-deleted membership, and the card UPDATE must have run in the same transaction.
        removal_pending = db.session.scalar(
            select(BoardMember.deleted_at).where(BoardMember.id == seed.membership_one)
        )
        if removal_pending is None:
            return real_commit()
        injected["fired"] = True
        injected["assignee_in_transaction"] = db.session.scalar(
            select(Card.assignee_id).where(Card.id == seed.card_b1)
        )
        raise OperationalError("COMMIT", {}, Exception("injected failure before commit"))

    monkeypatch.setattr(db.session, "commit", fail_the_membership_commit)
    try:
        response = client.delete(
            _remove_url(seed.board_one, seed.member_id),
            headers=_headers(board_tracker, seed.admin_id),
        )
    finally:
        monkeypatch.undo()

    assert injected["fired"], "the injected failure did not run, so the test proves nothing"
    assert injected["assignee_in_transaction"] is None
    assert response.status_code == 500
    assert response.get_json()["error"]["code"] == "INTERNAL_ERROR"
    assert _membership_deleted_at(app, seed.membership_one) == before_membership
    assert before_membership is None
    assert _card_state(app, seed.card_ids) == before_cards
