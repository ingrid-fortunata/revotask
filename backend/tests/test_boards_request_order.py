"""Request order tests for E08 and E11 (task 2.13, Requirements 4.5, 4.6, 7.5, 7.9, DD3, DD8).

Order per request: authenticate (401), validate the body (400), then authorize against the board
(404 for a Nonmember, 403 for a Member, 404 `USER_NOT_FOUND` for an Admin with an unknown email).
Every board and membership row is created through `board_tracker`, which removes it after the test.
Each rejected request also checks that the board name and the membership rows did not change.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

import pytest
from sqlalchemy import select

from app.extensions import db
from app.models.board import Board
from app.models.board_member import BoardMember
from tests.auth_helpers import bearer, unique_email


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@dataclass(frozen=True)
class Seed:
    """One board with an Admin and a Member, plus a user with no membership (the Nonmember)."""

    board_id: uuid.UUID
    admin_id: uuid.UUID
    member_id: uuid.UUID
    nonmember_id: uuid.UUID


def _seed(board_tracker) -> Seed:
    admin = board_tracker.make_user(name="request-admin")
    member = board_tracker.make_user(name="request-member")
    nonmember = board_tracker.make_user(name="request-nonmember")
    board_id = board_tracker.make_board(admin.id, name="Request order board")
    board_tracker.make_membership(board_id, admin.id, "admin")
    board_tracker.make_membership(board_id, member.id, "member")
    return Seed(board_id, admin.id, member.id, nonmember.id)


def _headers(caller: str, seed: Seed, board_tracker) -> dict[str, str]:
    """Authorization headers for one caller. The anonymous caller sends none."""
    user_id = {
        "anonymous": None,
        "nonmember": seed.nonmember_id,
        "member": seed.member_id,
        "admin": seed.admin_id,
    }[caller]
    if user_id is None:
        return {}
    return bearer(board_tracker.token_for(user_id))


def _board_state(app, board_id: uuid.UUID) -> tuple[str, Any, list[tuple[Any, ...]]]:
    """The board name, its `deleted_at`, and every membership row as (user, role, deleted_at)."""
    with app.app_context():
        try:
            board = db.session.scalar(
                select(Board).where(Board.id == board_id).execution_options(populate_existing=True)
            )
            rows = db.session.scalars(
                select(BoardMember)
                .where(BoardMember.board_id == board_id)
                .order_by(BoardMember.id)
                .execution_options(populate_existing=True)
            ).all()
            return (
                board.name,
                board.deleted_at,
                [(row.user_id, row.role, row.deleted_at) for row in rows],
            )
        finally:
            db.session.remove()


def _send(client, endpoint: str, board_id: uuid.UUID, headers: dict[str, str], body: Any):
    """Send E08 (PATCH) or E11 (POST) with the given headers and JSON body."""
    if endpoint == "E08":
        return client.patch(f"/api/boards/{board_id}", json=body, headers=headers)
    return client.post(f"/api/boards/{board_id}/members", json=body, headers=headers)


def _valid_body(endpoint: str) -> dict[str, str]:
    """A valid body. E11 uses an email that no registered user has."""
    if endpoint == "E08":
        return {"name": "Renamed by request order test"}
    return {"email": unique_email("unregistered")}


def _error_code(response) -> str:
    return response.get_json()["error"]["code"]


CALLERS = ["anonymous", "nonmember", "member", "admin"]

INVALID_BODIES = [
    pytest.param("E08", {}, id="E08-empty-object"),
    pytest.param("E08", {"name": "   "}, id="E08-blank-name"),
    pytest.param("E08", {"name": "x" * 101}, id="E08-name-too-long"),
    pytest.param("E08", {"name": "Valid", "role": "admin"}, id="E08-unknown-field"),
    pytest.param("E08", ["Valid"], id="E08-not-an-object"),
    pytest.param("E11", {}, id="E11-empty-object"),
    pytest.param("E11", {"email": "not-an-email"}, id="E11-malformed-email"),
    pytest.param("E11", {"email": None}, id="E11-null-email"),
    pytest.param(
        "E11",
        {"email": "valid@example.test", "role": "admin"},
        id="E11-unknown-field",
    ),
    pytest.param("E11", ["valid@example.test"], id="E11-not-an-object"),
]


# Expected (status, code) for each endpoint and caller with a valid body. A Nonmember gets the
# same 404 as a missing board. A Member gets 403. USER_NOT_FOUND only reaches an Admin.
VALID_BODY_OUTCOMES = [
    pytest.param("E08", "anonymous", 401, "AUTH_REQUIRED", id="E08-anonymous"),
    pytest.param("E08", "nonmember", 404, "NOT_FOUND", id="E08-nonmember"),
    pytest.param("E08", "member", 403, "FORBIDDEN", id="E08-member"),
    pytest.param("E11", "anonymous", 401, "AUTH_REQUIRED", id="E11-anonymous"),
    pytest.param("E11", "nonmember", 404, "NOT_FOUND", id="E11-nonmember"),
    pytest.param("E11", "member", 403, "FORBIDDEN", id="E11-member"),
    pytest.param("E11", "admin", 404, "USER_NOT_FOUND", id="E11-admin-unregistered-email"),
]


@pytest.mark.parametrize("caller", CALLERS)
@pytest.mark.parametrize(("endpoint", "body"), INVALID_BODIES)
def test_invalid_body_returns_400_for_every_caller_before_authorization(
    client, board_tracker, app, endpoint, body, caller
):
    seed = _seed(board_tracker)
    before = _board_state(app, seed.board_id)

    response = _send(client, endpoint, seed.board_id, _headers(caller, seed, board_tracker), body)

    if caller == "anonymous":
        assert response.status_code == 401
        assert _error_code(response) == "AUTH_REQUIRED"
    else:
        assert response.status_code == 400
        assert _error_code(response) == "VALIDATION_ERROR"
    assert _board_state(app, seed.board_id) == before


@pytest.mark.parametrize(("endpoint", "caller", "status", "code"), VALID_BODY_OUTCOMES)
def test_valid_body_is_authorized_against_the_board(
    client, board_tracker, app, endpoint, caller, status, code
):
    seed = _seed(board_tracker)
    before = _board_state(app, seed.board_id)

    response = _send(
        client,
        endpoint,
        seed.board_id,
        _headers(caller, seed, board_tracker),
        _valid_body(endpoint),
    )

    assert response.status_code == status
    assert _error_code(response) == code
    if caller in {"anonymous", "nonmember", "member"}:
        # The unregistered email must not reveal anything to a caller who is not a board Admin.
        assert code != "USER_NOT_FOUND"
    assert _board_state(app, seed.board_id) == before


def test_admin_rename_with_valid_body_succeeds(client, board_tracker, app):
    """Positive control: an Admin with a valid E08 body passes every check and renames the board."""
    seed = _seed(board_tracker)
    body = _valid_body("E08")

    response = _send(client, "E08", seed.board_id, _headers("admin", seed, board_tracker), body)

    assert response.status_code == 200
    assert response.get_json()["data"]["name"] == body["name"]
    assert _board_state(app, seed.board_id)[0] == body["name"]
