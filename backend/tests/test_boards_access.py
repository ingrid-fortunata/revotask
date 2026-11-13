"""Nonmember 404 matrix for E07–E12 (task 2.11).

Requirements 2.4, 2.5, 2.6, 5.2, 7.1, 7.2 and 7.5. Design DD1. Guidelines BE04, BE05 and BE07.

For each endpoint, four 404 sources must give the same status and error envelope: a board that
does not exist, a soft-deleted board, a caller who is a nonmember and a caller whose membership
was removed. Every request has an otherwise valid body, and every E12 request names an active
member of another board. The 404 therefore comes from board authorization. Rows are created
through `board_tracker`, which removes them after each test, including when an assertion fails.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

import pytest
from sqlalchemy import update

from app.extensions import db
from app.models.base import utcnow
from app.models.board import Board
from app.models.board_member import BoardMember
from app.models.user import User
from tests.auth_helpers import bearer

ENDPOINTS = ("E07", "E08", "E09", "E10", "E11", "E12")
OUTCOMES = ("success", "not-found", "invalid-uuid", "anonymous")
SUCCESS_STATUS = {"E07": 200, "E08": 200, "E09": 200, "E10": 200, "E11": 201, "E12": 200}
NOT_FOUND_ENVELOPE = {"code": "NOT_FOUND", "message": "Resource not found."}
INVALID_UUID_ENVELOPE = {"code": "VALIDATION_ERROR", "message": "Check the submitted fields."}
ANONYMOUS_ENVELOPE = {"code": "AUTH_REQUIRED", "message": "Authentication is required."}
SOURCES = ("nonexistent board", "soft-deleted board", "nonmember", "removed member")
PRIVATE_CACHE_CONTROL = "private, no-store"


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@dataclass(frozen=True)
class Seed:
    """A board with one admin and one member, both created through the tracker."""

    board_id: uuid.UUID
    admin: User
    member: User
    member_row_id: uuid.UUID


@dataclass(frozen=True)
class Case:
    """One 404 source: the board in the URL, the caller and the user named by E11 and E12."""

    board_id: uuid.UUID
    caller_id: uuid.UUID
    target_id: uuid.UUID
    target_email: str


def _seed(board_tracker, name: str) -> Seed:
    admin = board_tracker.make_user(name="Board Admin")
    member = board_tracker.make_user(name="Board Member")
    board_id = board_tracker.make_board(admin.id, name=name)
    board_tracker.make_membership(board_id, admin.id, "admin")
    member_row_id = board_tracker.make_membership(board_id, member.id, "member")
    return Seed(board_id, admin, member, member_row_id)


def _soft_delete_board(app, board_id: uuid.UUID) -> None:
    with app.app_context():
        try:
            db.session.execute(
                update(Board).where(Board.id == board_id).values(deleted_at=utcnow())
            )
            db.session.commit()
        finally:
            db.session.remove()


def _soft_delete_membership(app, row_id: uuid.UUID) -> None:
    with app.app_context():
        try:
            db.session.execute(
                update(BoardMember).where(BoardMember.id == row_id).values(deleted_at=utcnow())
            )
            db.session.commit()
        finally:
            db.session.remove()


def _build_cases(board_tracker, app) -> dict[str, Case]:
    """Build the four 404 sources. Every E11 and E12 request uses the same other-board member."""
    outsider = board_tracker.make_user(name="Outsider")
    other = _seed(board_tracker, "Other board")
    target = other.member

    deleted = _seed(board_tracker, "Deleted board")
    _soft_delete_board(app, deleted.board_id)

    live = _seed(board_tracker, "Live board")

    removed = _seed(board_tracker, "Removed board")
    _soft_delete_membership(app, removed.member_row_id)

    return {
        "nonexistent board": Case(uuid.uuid4(), outsider.id, target.id, target.email),
        "soft-deleted board": Case(deleted.board_id, deleted.admin.id, target.id, target.email),
        "nonmember": Case(live.board_id, outsider.id, target.id, target.email),
        "removed member": Case(removed.board_id, removed.member.id, target.id, target.email),
    }


def _route(
    endpoint: str, board_id: Any, target_id: Any, email: str
) -> tuple[str, str, dict[str, Any]]:
    """Return method, path and keyword arguments for one endpoint with a valid body."""
    base = f"/api/boards/{board_id}"
    routes = {
        "E07": ("GET", base, {}),
        "E08": ("PATCH", base, {"json": {"name": "Renamed board"}}),
        "E09": ("DELETE", base, {}),
        "E10": ("GET", f"{base}/members", {}),
        "E11": ("POST", f"{base}/members", {"json": {"email": email}}),
        "E12": ("DELETE", f"{base}/members/{target_id}", {}),
    }
    return routes[endpoint]


def _send(client, endpoint: str, board_id: Any, target_id: Any, email: str, headers: dict):
    method, path, kwargs = _route(endpoint, board_id, target_id, email)
    return client.open(path, method=method, headers=headers, **kwargs)


def _bearer_for(board_tracker, user_id: uuid.UUID) -> dict[str, str]:
    return bearer(board_tracker.token_for(user_id))


def _error_body(response) -> dict[str, Any]:
    return response.get_json()["error"]


def _without_request_id(error: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in error.items() if key != "request_id"}


def _success_response(client, board_tracker, endpoint: str):
    seed = _seed(board_tracker, "Success board")
    newcomer = board_tracker.make_user(name="Newcomer")
    caller = seed.member if endpoint == "E10" else seed.admin
    return _send(
        client,
        endpoint,
        seed.board_id,
        seed.member.id,
        newcomer.email,
        _bearer_for(board_tracker, caller.id),
    )


def _outcome_response(client, board_tracker, app, endpoint: str, outcome: str):
    if outcome == "success":
        return _success_response(client, board_tracker, endpoint)
    if outcome == "not-found":
        case = _build_cases(board_tracker, app)["nonmember"]
        headers = _bearer_for(board_tracker, case.caller_id)
        return _send(client, endpoint, case.board_id, case.target_id, case.target_email, headers)
    if outcome == "invalid-uuid":
        caller = board_tracker.make_user(name="Caller")
        target = board_tracker.make_user(name="Target")
        headers = _bearer_for(board_tracker, caller.id)
        return _send(client, endpoint, "not-a-uuid", target.id, target.email, headers)
    seed = _seed(board_tracker, "Anonymous board")
    return _send(client, endpoint, seed.board_id, seed.member.id, seed.member.email, {})


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_four_404_sources_return_the_same_status_code_and_message(
    client, board_tracker, app, endpoint
):
    cases = _build_cases(board_tracker, app)

    observed = {}
    for source, case in cases.items():
        response = _send(
            client,
            endpoint,
            case.board_id,
            case.target_id,
            case.target_email,
            _bearer_for(board_tracker, case.caller_id),
        )
        observed[source] = (response.status_code, _without_request_id(_error_body(response)))

    # Every source must match the envelope exactly, so no `fields` key can appear.
    assert observed == dict.fromkeys(SOURCES, (404, NOT_FOUND_ENVELOPE))


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_invalid_board_uuid_returns_400_before_any_lookup(client, board_tracker, endpoint):
    caller = board_tracker.make_user(name="Caller")
    target = board_tracker.make_user(name="Target")

    response = _send(
        client,
        endpoint,
        "not-a-uuid",
        target.id,
        target.email,
        _bearer_for(board_tracker, caller.id),
    )

    assert response.status_code == 400
    assert _without_request_id(_error_body(response)) == INVALID_UUID_ENVELOPE


def test_invalid_user_uuid_on_e12_returns_400(client, board_tracker):
    seed = _seed(board_tracker, "Invalid target board")

    response = client.delete(
        f"/api/boards/{seed.board_id}/members/not-a-uuid",
        headers=_bearer_for(board_tracker, seed.admin.id),
    )

    assert response.status_code == 400
    assert _without_request_id(_error_body(response)) == INVALID_UUID_ENVELOPE


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_anonymous_request_gets_401(client, board_tracker, endpoint):
    seed = _seed(board_tracker, "Anonymous board")

    response = _send(client, endpoint, seed.board_id, seed.member.id, seed.member.email, {})

    assert response.status_code == 401
    assert _without_request_id(_error_body(response)) == ANONYMOUS_ENVELOPE


@pytest.mark.parametrize("outcome", OUTCOMES)
@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_board_routes_send_private_no_store_cache_control(
    client, board_tracker, app, endpoint, outcome
):
    response = _outcome_response(client, board_tracker, app, endpoint, outcome)

    expected_status = {
        "success": SUCCESS_STATUS[endpoint],
        "not-found": 404,
        "invalid-uuid": 400,
        "anonymous": 401,
    }[outcome]
    assert response.status_code == expected_status
    assert response.headers["Cache-Control"] == PRIVATE_CACHE_CONTROL
