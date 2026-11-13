"""Member 403 tests for the Admin-only endpoints E08, E09, E11 and E12 (task 2.12).

Requirements 3.2, 3.3, 4.7 and 7.5. A Member sends an otherwise valid request to each endpoint and
gets 403 FORBIDDEN. The board name, `deleted_at`, every membership and every card assignment must be
identical before and after the request (BE07). The Admin check runs the same request on a separate,
identically seeded board, so the Admin success never changes the state the Member check reads.
Every row is created through `board_tracker`, which removes it after the test.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import pytest
from sqlalchemy import select

from app.extensions import db
from app.models.board import Board
from app.models.board_member import BoardMember
from app.models.card import Card
from tests.auth_helpers import bearer

RENAME_TO = "Renamed in roles test"
BOARD_NAME = "Roles board"


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@dataclass(frozen=True)
class Seed:
    """One board with an admin, a member, a removal target, an outsider and four cards."""

    board_id: Any
    admin_id: Any
    member_id: Any
    target_id: Any
    target_card_id: Any
    outsider_id: Any
    outsider_name: str
    outsider_email: str
    card_ids: tuple[Any, ...]


def _seed(board_tracker) -> Seed:
    admin = board_tracker.make_user(name="Admin Owner")
    member = board_tracker.make_user(name="Team Member")
    target = board_tracker.make_user(name="Removal Target")
    outsider = board_tracker.make_user(name="Registered Outsider")
    board_id = board_tracker.make_board(admin.id, name=BOARD_NAME)
    board_tracker.make_membership(board_id, admin.id, "admin")
    board_tracker.make_membership(board_id, member.id, "member")
    board_tracker.make_membership(board_id, target.id, "member")
    column_id = board_tracker.make_column(board_id)
    member_card = board_tracker.make_card(column_id, "Member card", member.id, order=1.0)
    target_card = board_tracker.make_card(column_id, "Target card", target.id, order=2.0)
    admin_card = board_tracker.make_card(column_id, "Admin card", admin.id, order=3.0)
    unassigned_card = board_tracker.make_card(column_id, "Unassigned card", None, order=4.0)
    return Seed(
        board_id=board_id,
        admin_id=admin.id,
        member_id=member.id,
        target_id=target.id,
        target_card_id=target_card,
        outsider_id=outsider.id,
        outsider_name=outsider.name,
        outsider_email=outsider.email,
        card_ids=(member_card, target_card, admin_card, unassigned_card),
    )


def _state(app, seed: Seed) -> dict[str, Any]:
    """Read the board name, deleted_at, every membership row and every card assignment."""
    with app.app_context():
        try:
            name, deleted_at = db.session.execute(
                select(Board.name, Board.deleted_at).where(Board.id == seed.board_id)
            ).one()
            memberships = db.session.execute(
                select(BoardMember.user_id, BoardMember.role, BoardMember.deleted_at)
                .where(BoardMember.board_id == seed.board_id)
                .order_by(BoardMember.user_id)
            ).all()
            assignments = db.session.execute(
                select(Card.id, Card.assignee_id)
                .where(Card.id.in_(seed.card_ids))
                .order_by(Card.id)
            ).all()
            return {
                "name": name,
                "deleted_at": deleted_at,
                "memberships": [tuple(row) for row in memberships],
                "assignments": [tuple(row) for row in assignments],
            }
        finally:
            db.session.remove()


def _rename_body(_seed: Seed) -> dict[str, Any]:
    return {"name": RENAME_TO}


def _add_body(seed: Seed) -> dict[str, Any]:
    return {"email": seed.outsider_email}


def _no_body(_seed: Seed) -> None:
    return None


def _rename_admin_check(app, seed: Seed, response) -> None:
    assert response.status_code == 200
    assert response.get_json()["data"]["name"] == RENAME_TO
    assert _state(app, seed)["name"] == RENAME_TO


def _delete_admin_check(app, seed: Seed, response) -> None:
    assert response.status_code == 200
    assert response.get_json() == {"data": None}
    assert _state(app, seed)["deleted_at"] is not None


def _add_admin_check(app, seed: Seed, response) -> None:
    assert response.status_code == 201
    assert response.get_json()["data"] == {
        "user_id": str(seed.outsider_id),
        "name": seed.outsider_name,
        "role": "member",
    }
    rows = [row for row in _state(app, seed)["memberships"] if row[0] == seed.outsider_id]
    assert rows == [(seed.outsider_id, "member", None)]


def _remove_admin_check(app, seed: Seed, response) -> None:
    assert response.status_code == 200
    assert response.get_json() == {"data": None}
    state = _state(app, seed)
    target_rows = [row for row in state["memberships"] if row[0] == seed.target_id]
    assert target_rows[0][2] is not None
    assert (seed.target_card_id, None) in state["assignments"]


@dataclass(frozen=True)
class Endpoint:
    """One Admin-only request: method, path and body for a seeded board, and its Admin check."""

    method: str
    path: Callable[[Seed], str]
    body: Callable[[Seed], dict[str, Any] | None]
    admin_check: Callable[[Any, Seed, Any], None]


ENDPOINTS: dict[str, Endpoint] = {
    "E08 rename": Endpoint(
        "PATCH",
        lambda seed: f"/api/boards/{seed.board_id}",
        _rename_body,
        _rename_admin_check,
    ),
    "E09 delete": Endpoint(
        "DELETE",
        lambda seed: f"/api/boards/{seed.board_id}",
        _no_body,
        _delete_admin_check,
    ),
    "E11 add member": Endpoint(
        "POST",
        lambda seed: f"/api/boards/{seed.board_id}/members",
        _add_body,
        _add_admin_check,
    ),
    "E12 remove member": Endpoint(
        "DELETE",
        lambda seed: f"/api/boards/{seed.board_id}/members/{seed.target_id}",
        _no_body,
        _remove_admin_check,
    ),
}


@pytest.mark.parametrize("name", list(ENDPOINTS), ids=list(ENDPOINTS))
def test_member_gets_403_and_board_state_is_unchanged(client, board_tracker, app, name):
    endpoint = ENDPOINTS[name]
    seed = _seed(board_tracker)
    before = _state(app, seed)
    headers = bearer(board_tracker.token_for(seed.member_id))

    response = client.open(
        endpoint.path(seed),
        method=endpoint.method,
        json=endpoint.body(seed),
        headers=headers,
    )

    assert response.status_code == 403
    error = response.get_json()["error"]
    assert error["code"] == "FORBIDDEN"
    assert error.get("fields") is None
    after = _state(app, seed)
    assert after == before
    assert after["name"] == BOARD_NAME
    assert after["deleted_at"] is None


@pytest.mark.parametrize("name", list(ENDPOINTS), ids=list(ENDPOINTS))
def test_admin_succeeds_on_the_same_request_on_a_separate_board(client, board_tracker, app, name):
    endpoint = ENDPOINTS[name]
    seed = _seed(board_tracker)
    headers = bearer(board_tracker.token_for(seed.admin_id))

    response = client.open(
        endpoint.path(seed),
        method=endpoint.method,
        json=endpoint.body(seed),
        headers=headers,
    )

    endpoint.admin_check(app, seed, response)
