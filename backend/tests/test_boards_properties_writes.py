"""Parameterized tests for boards-membership Properties 8–12 (task 2.17).

Requirements 1.1, 3.2, 3.3, 4.1–4.4, 4.7, 4.8, 5.1, 5.3–5.5, 7.2, 7.3 and 7.10. Each property runs
over an enumerated fixture matrix (roles, board layouts, membership sequences, token kinds). No
property-testing library is used (R8). Every test tags itself with its property in the docstring.

Writes go through the real routes and the real database on TEST_DATABASE_URL. Every row a test
creates is recorded by `board_tracker`, which deletes it afterwards, including when an assertion
fails. Failure injection patches only the single commit a test targets, and the patch is undone in
a `finally` block, so later commits and the rest of the suite run unchanged.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from app.extensions import db
from app.models.board import Board
from app.models.board_member import BoardMember
from app.models.card import Card
from tests.auth_helpers import PLACEHOLDER_HASH, bearer, decode_unverified, raw_token

ADMIN_NAME = "Owner Admin"
MEMBER_NAME = "Team Member"
TARGET_NAME = "Removal Target"
OUTSIDER_NAME = "Registered Outsider"
BOARD_NAME = "Property board"
RENAME_TO = "Renamed by property test"
NEW_BOARD_NAME = "Created by property test"
OTHER_SECRET = "another-secret-0123456789abcdefghijkl"

BOARD_SUMMARY_KEYS = {"id", "name", "role", "position_version"}
MEMBERSHIP_KEYS = {"user_id", "name", "role"}
COLUMN_KEYS = {"id", "board_id", "name", "is_done", "order", "cards"}
CARD_KEYS = {"id", "column_id", "title", "description", "assignee_id", "assignee_name", "order"}
DETAIL_KEYS = BOARD_SUMMARY_KEYS | {"columns"}


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@dataclass(frozen=True)
class Seed:
    """A board with an admin, a member, a removal target and a registered outsider."""

    admin_id: uuid.UUID
    admin_email: str
    member_id: uuid.UUID
    member_email: str
    target_id: uuid.UUID
    outsider_id: uuid.UUID
    outsider_email: str
    board_id: uuid.UUID
    card_ids: tuple[uuid.UUID, ...]


# Board layouts for the role matrix. "no-cards" has no column. "assigned-cards" has four cards:
# one assigned to the member, one to the removal target, one to the admin and one unassigned.
LAYOUTS = ("no-cards", "assigned-cards")


def _seed(board_tracker, layout: str) -> Seed:
    admin = board_tracker.make_user(name=ADMIN_NAME)
    member = board_tracker.make_user(name=MEMBER_NAME)
    target = board_tracker.make_user(name=TARGET_NAME)
    outsider = board_tracker.make_user(name=OUTSIDER_NAME)
    board_id = board_tracker.make_board(admin.id, name=BOARD_NAME)
    board_tracker.make_membership(board_id, admin.id, "admin")
    board_tracker.make_membership(board_id, member.id, "member")
    board_tracker.make_membership(board_id, target.id, "member")
    card_ids: tuple[uuid.UUID, ...] = ()
    if layout == "assigned-cards":
        column_id = board_tracker.make_column(board_id)
        card_ids = (
            board_tracker.make_card(column_id, "Member card", member.id, order=1.0),
            board_tracker.make_card(column_id, "Target card", target.id, order=2.0),
            board_tracker.make_card(column_id, "Admin card", admin.id, order=3.0),
            board_tracker.make_card(column_id, "Unassigned card", None, order=4.0),
        )
    return Seed(
        admin_id=admin.id,
        admin_email=admin.email,
        member_id=member.id,
        member_email=member.email,
        target_id=target.id,
        outsider_id=outsider.id,
        outsider_email=outsider.email,
        board_id=board_id,
        card_ids=card_ids,
    )


def _board_state(app, seed: Seed) -> dict[str, Any]:
    """Board name and deleted_at, every membership row and every seeded card assignment."""
    with app.app_context():
        try:
            name, deleted_at = db.session.execute(
                select(Board.name, Board.deleted_at).where(Board.id == seed.board_id)
            ).one()
            memberships = db.session.execute(
                select(
                    BoardMember.id, BoardMember.user_id, BoardMember.role, BoardMember.deleted_at
                )
                .where(BoardMember.board_id == seed.board_id)
                .order_by(BoardMember.id)
            ).all()
            assignments = db.session.execute(
                select(Card.id, Card.assignee_id, Card.deleted_at)
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


def _membership_rows(app, board_id: uuid.UUID, user_id: uuid.UUID) -> list[tuple[Any, ...]]:
    """(row id, role, deleted_at) for every membership row of one user on one board."""
    with app.app_context():
        try:
            rows = db.session.execute(
                select(BoardMember.id, BoardMember.role, BoardMember.deleted_at).where(
                    BoardMember.board_id == board_id, BoardMember.user_id == user_id
                )
            ).all()
            return [tuple(row) for row in rows]
        finally:
            db.session.remove()


def _active_admin_ids(app, board_id: uuid.UUID) -> list[uuid.UUID]:
    with app.app_context():
        try:
            return list(
                db.session.scalars(
                    select(BoardMember.user_id).where(
                        BoardMember.board_id == board_id,
                        BoardMember.role == "admin",
                        BoardMember.deleted_at.is_(None),
                    )
                )
            )
        finally:
            db.session.remove()


def _card_assignments(app, card_ids: tuple[uuid.UUID, ...]) -> dict[uuid.UUID, Any]:
    with app.app_context():
        try:
            rows = db.session.execute(
                select(Card.id, Card.assignee_id, Card.deleted_at).where(Card.id.in_(card_ids))
            ).all()
            return {row.id: (row.assignee_id, row.deleted_at) for row in rows}
        finally:
            db.session.remove()


def _assert_error(response, status: int, code: str) -> dict[str, Any]:
    assert response.status_code == status, response.get_data(as_text=True)
    error = response.get_json()["error"]
    assert error["code"] == code
    assert "fields" not in error
    return error


# Property 8: Role gate


@dataclass(frozen=True)
class RoleRequest:
    """One Admin-only request. `body` receives the seed and the layout's target email."""

    method: str
    path: Callable[[Seed], str]
    body: Callable[[Seed], dict[str, Any] | None]


def _unregistered_email(_seed: Seed) -> dict[str, str]:
    return {"email": f"unregistered-{uuid.uuid4().hex[:12]}@example.test"}


ROLE_REQUESTS: dict[str, RoleRequest] = {
    "E08 rename": RoleRequest(
        "PATCH",
        lambda s: f"/api/boards/{s.board_id}",
        lambda _s: {"name": RENAME_TO},
    ),
    "E09 delete": RoleRequest(
        "DELETE",
        lambda s: f"/api/boards/{s.board_id}",
        lambda _s: None,
    ),
    "E11 registered email": RoleRequest(
        "POST",
        lambda s: f"/api/boards/{s.board_id}/members",
        lambda s: {"email": s.outsider_email},
    ),
    # The role check runs before the user lookup, so an unknown email is still 403 for a Member.
    "E11 unregistered email": RoleRequest(
        "POST",
        lambda s: f"/api/boards/{s.board_id}/members",
        _unregistered_email,
    ),
    "E12 remove member": RoleRequest(
        "DELETE",
        lambda s: f"/api/boards/{s.board_id}/members/{s.target_id}",
        lambda _s: None,
    ),
}


# Feature: boards-membership, Property 8: Role gate
@pytest.mark.parametrize("layout", LAYOUTS)
@pytest.mark.parametrize("request_name", list(ROLE_REQUESTS), ids=list(ROLE_REQUESTS))
def test_property_8_member_gets_403_and_state_is_unchanged(
    client, board_tracker, app, request_name, layout
):
    """Feature: boards-membership, Property 8: Role gate.

    **Validates: Requirements 3.2, 3.3, 4.7**
    """
    request = ROLE_REQUESTS[request_name]
    seed = _seed(board_tracker, layout)
    before = _board_state(app, seed)
    response = client.open(
        request.path(seed),
        method=request.method,
        json=request.body(seed),
        headers=bearer(board_tracker.token_for(seed.member_id)),
    )

    _assert_error(response, 403, "FORBIDDEN")
    after = _board_state(app, seed)
    assert after == before
    assert after["name"] == BOARD_NAME
    assert after["deleted_at"] is None


# Property 9: Membership model and admin invariant

PEOPLE = {
    "alpha": "Alpha",
    "bravo": "Bravo",
    "charlie": "Charlie",
    # Equal names exercise the user_id tie-break in E10.
    "dup-one": "Same Name",
    "dup-two": "Same Name",
}

# Each step is (operation, person). "admin" is the creator. Every sequence is enumerated by hand.
SEQUENCES: dict[str, list[tuple[str, str]]] = {
    "reactivation-after-removal": [
        ("add", "alpha"),
        ("add", "bravo"),
        ("remove", "alpha"),
        ("add", "alpha"),
        ("remove", "bravo"),
        ("add", "bravo"),
        ("add", "alpha"),
    ],
    "conflicts-and-missing-rows": [
        ("remove", "dup-one"),
        ("add", "charlie"),
        ("add", "charlie"),
        ("remove", "admin"),
        ("remove", "charlie"),
        ("remove", "charlie"),
        ("add", "charlie"),
    ],
    "equal-names-tie-break": [
        ("add", "dup-two"),
        ("add", "dup-one"),
        ("add", "alpha"),
        ("remove", "dup-two"),
        ("add", "dup-two"),
        ("remove", "admin"),
        ("remove", "alpha"),
        ("add", "bravo"),
    ],
}


def _expected_list(admin_id: uuid.UUID, ids: dict[str, uuid.UUID], active: set[str]) -> list:
    """The model: the admin first, then active members by name, then by user_id."""
    members = sorted(active, key=lambda key: (PEOPLE[key], ids[key]))
    return [{"user_id": str(admin_id), "name": ADMIN_NAME, "role": "admin"}] + [
        {"user_id": str(ids[key]), "name": PEOPLE[key], "role": "member"} for key in members
    ]


# Feature: boards-membership, Property 9: Membership model and admin invariant
@pytest.mark.parametrize("sequence_name", list(SEQUENCES), ids=list(SEQUENCES))
def test_property_9_membership_list_matches_model_after_every_step(
    client, board_tracker, app, sequence_name
):
    """Feature: boards-membership, Property 9: Membership model and admin invariant.

    **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 5.1, 5.3, 5.4**
    """
    admin = board_tracker.make_user(name=ADMIN_NAME)
    admin_headers = bearer(board_tracker.token_for(admin.id))
    created = client.post("/api/boards", json={"name": BOARD_NAME}, headers=admin_headers)
    board_id = board_tracker.record_board_from_response(created)

    people = {key: board_tracker.make_user(name=name) for key, name in PEOPLE.items()}
    ids = {key: user.id for key, user in people.items()}
    emails = {key: user.email for key, user in people.items()}
    ids["admin"] = admin.id

    active: set[str] = set()
    row_ids: dict[str, uuid.UUID] = {}

    for step_number, (operation, key) in enumerate(SEQUENCES[sequence_name], start=1):
        user_id = ids[key]
        if operation == "add":
            response = client.post(
                f"/api/boards/{board_id}/members",
                json={"email": emails[key]},
                headers=admin_headers,
            )
            if key in active:
                _assert_error(response, 409, "STATE_CONFLICT")
            else:
                assert response.status_code == 201, response.get_data(as_text=True)
                assert response.get_json()["data"] == {
                    "user_id": str(user_id),
                    "name": PEOPLE[key],
                    "role": "member",
                }
                active.add(key)
        else:
            response = client.delete(
                f"/api/boards/{board_id}/members/{user_id}", headers=admin_headers
            )
            if key == "admin":
                _assert_error(response, 409, "STATE_CONFLICT")
            elif key not in active:
                _assert_error(response, 404, "NOT_FOUND")
            else:
                assert response.status_code == 200, response.get_data(as_text=True)
                assert response.get_json() == {"data": None}
                active.discard(key)

        listing = client.get(f"/api/boards/{board_id}/members", headers=admin_headers)
        assert listing.status_code == 200
        assert listing.get_json()["data"] == _expected_list(admin.id, ids, active), (
            f"step {step_number} ({operation} {key})"
        )

        # One admin row, which is the creator. Each person has at most one row for this board.
        assert _active_admin_ids(app, board_id) == [admin.id]
        rows = _membership_rows(app, board_id, user_id)
        assert len(rows) <= 1, rows
        if key == "admin":
            continue
        if rows:
            row_id, role, deleted_at = rows[0]
            if key in active:
                assert deleted_at is None and role == "member"
            else:
                assert deleted_at is not None
            # A removed user who returns reuses the original row (DD4).
            assert row_ids.setdefault(key, row_id) == row_id
        else:
            assert key not in row_ids and key not in active


# Property 10: Response allowlist


def _assert_summary(item: dict[str, Any]) -> None:
    assert set(item) == BOARD_SUMMARY_KEYS


def _assert_membership(item: dict[str, Any]) -> None:
    assert set(item) == MEMBERSHIP_KEYS


def _assert_detail(detail: dict[str, Any]) -> None:
    assert set(detail) == DETAIL_KEYS
    assert detail["columns"], "the allowlist check needs at least one column"
    for column in detail["columns"]:
        assert set(column) == COLUMN_KEYS
        for card in column["cards"]:
            assert set(card) == CARD_KEYS


def _assert_none(data: Any) -> None:
    assert data is None


@dataclass(frozen=True)
class ShapeRoute:
    """A route that returns board data, its request, and the shape check for its `data`."""

    method: str
    path: Callable[[Seed], str]
    body: Callable[[Seed], dict[str, Any] | None]
    check: Callable[[Any], None]
    list_result: bool = False


SHAPE_ROUTES: dict[str, ShapeRoute] = {
    "E05 list": ShapeRoute("GET", lambda _s: "/api/boards", lambda _s: None, _assert_summary, True),
    "E06 create": ShapeRoute(
        "POST", lambda _s: "/api/boards", lambda _s: {"name": NEW_BOARD_NAME}, _assert_summary
    ),
    "E07 detail": ShapeRoute(
        "GET", lambda s: f"/api/boards/{s.board_id}", lambda _s: None, _assert_detail
    ),
    "E08 rename": ShapeRoute(
        "PATCH",
        lambda s: f"/api/boards/{s.board_id}",
        lambda _s: {"name": RENAME_TO},
        _assert_summary,
    ),
    "E09 delete": ShapeRoute(
        "DELETE", lambda s: f"/api/boards/{s.board_id}", lambda _s: None, _assert_none
    ),
    "E10 members": ShapeRoute(
        "GET",
        lambda s: f"/api/boards/{s.board_id}/members",
        lambda _s: None,
        _assert_membership,
        True,
    ),
    "E11 add member": ShapeRoute(
        "POST",
        lambda s: f"/api/boards/{s.board_id}/members",
        lambda s: {"email": s.outsider_email},
        _assert_membership,
    ),
    "E12 remove member": ShapeRoute(
        "DELETE",
        lambda s: f"/api/boards/{s.board_id}/members/{s.target_id}",
        lambda _s: None,
        _assert_none,
    ),
}


# Feature: boards-membership, Property 10: Response allowlist
@pytest.mark.parametrize("route_name", list(SHAPE_ROUTES), ids=list(SHAPE_ROUTES))
def test_property_10_responses_carry_only_allowlisted_fields(
    client, board_tracker, app, route_name
):
    """Feature: boards-membership, Property 10: Response allowlist.

    The admin's email, the outsider's email and the password hash carry extra attributes in the
    database. None may appear in any response body.

    **Validates: Requirements 4.8, 7.3**
    """
    route = SHAPE_ROUTES[route_name]
    seed = _seed(board_tracker, "assigned-cards")
    response = client.open(
        route.path(seed),
        method=route.method,
        json=route.body(seed),
        headers=bearer(board_tracker.token_for(seed.admin_id)),
    )

    assert response.status_code in (200, 201), response.get_data(as_text=True)
    if route_name == "E06 create":
        board_tracker.record_board_from_response(response)
    data = response.get_json()["data"]
    if route.list_result:
        assert isinstance(data, list) and data
        for item in data:
            route.check(item)
    else:
        route.check(data)

    body = response.get_data(as_text=True)
    for secret in (seed.admin_email, seed.member_email, PLACEHOLDER_HASH):
        assert secret not in body


# Property 11: Failed writes leave no partial state


@contextmanager
def _fail_only_matching_commit(monkeypatch, matches: Callable[[], bool]) -> Iterator[list[bool]]:
    """Make the next commit that `matches` selects raise, and let every other commit through.

    The patch covers only `db.session.commit`, and `monkeypatch.undo()` restores it in `finally`
    even when the request under test fails. The yielded list records each injected failure.
    """
    real_commit = db.session.commit
    injected: list[bool] = []

    def commit_or_fail() -> None:
        if matches():
            injected.append(True)
            raise OperationalError("COMMIT", {}, Exception("injected commit failure"))
        return real_commit()

    monkeypatch.setattr(db.session, "commit", commit_or_fail)
    try:
        yield injected
    finally:
        monkeypatch.undo()


# Feature: boards-membership, Property 11: Failed writes leave no partial state
def test_property_11_failed_e06_leaves_no_board_and_no_membership(
    client, board_tracker, app, monkeypatch
):
    """Feature: boards-membership, Property 11: Failed writes leave no partial state.

    The board insert runs, then the commit fails. No board or admin membership may remain.

    **Validates: Requirements 1.1, 5.1, 5.5**
    """
    creator = board_tracker.make_user(name="Atomic Creator")
    name = f"Atomic board {uuid.uuid4().hex[:8]}"

    def pending_board() -> bool:
        return any(isinstance(obj, Board) and obj.name == name for obj in db.session.new)

    with _fail_only_matching_commit(monkeypatch, pending_board) as injected:
        response = client.post(
            "/api/boards",
            json={"name": name},
            headers=bearer(board_tracker.token_for(creator.id)),
        )

    assert injected == [True], "the injected failure did not run"
    _assert_error(response, 500, "INTERNAL_ERROR")
    with app.app_context():
        try:
            boards = db.session.scalars(select(Board.id).where(Board.creator_id == creator.id))
            memberships = db.session.scalars(
                select(BoardMember.id).where(BoardMember.user_id == creator.id)
            )
            assert list(boards) == []
            assert list(memberships) == []
        finally:
            db.session.remove()


# Feature: boards-membership, Property 11: Failed writes leave no partial state
def test_property_11_failed_e12_keeps_membership_and_assignments_after_card_update(
    client, board_tracker, app, monkeypatch
):
    """Feature: boards-membership, Property 11: Failed writes leave no partial state.

    The membership soft delete and the card update both run, then the commit fails. The
    membership stays active and every assignment is unchanged. The probe reads the card inside
    the transaction to prove the update ran before the failure.

    **Validates: Requirements 1.1, 5.1, 5.5**
    """
    seed = _seed(board_tracker, "assigned-cards")
    membership_id = _membership_rows(app, seed.board_id, seed.member_id)[0][0]
    before_assignments = _card_assignments(app, seed.card_ids)
    before_membership = _membership_rows(app, seed.board_id, seed.member_id)
    observed: dict[str, Any] = {}

    def removal_pending() -> bool:
        deleted_at = db.session.scalar(
            select(BoardMember.deleted_at).where(BoardMember.id == membership_id)
        )
        if deleted_at is not None:
            observed["card_in_transaction"] = db.session.scalar(
                select(Card.assignee_id).where(Card.id == seed.card_ids[0])
            )
            return True
        return False

    with _fail_only_matching_commit(monkeypatch, removal_pending) as injected:
        response = client.delete(
            f"/api/boards/{seed.board_id}/members/{seed.member_id}",
            headers=bearer(board_tracker.token_for(seed.admin_id)),
        )

    assert injected == [True], "the injected failure did not run"
    assert observed["card_in_transaction"] is None, "the card update did not run before commit"
    _assert_error(response, 500, "INTERNAL_ERROR")
    assert _membership_rows(app, seed.board_id, seed.member_id) == before_membership
    assert before_membership[0][2] is None
    assert _card_assignments(app, seed.card_ids) == before_assignments


# Property 12: Authentication and private caching on every board route

ROUTE_NAMES = list(SHAPE_ROUTES)
TOKEN_KINDS = ("missing", "malformed", "wrong-signature", "expired", "revoked")


def _headers_for(board_tracker, user_id: uuid.UUID, kind: str) -> dict[str, str]:
    """Build the Authorization header for one invalid-token kind, or none for `missing`."""
    if kind == "missing":
        return {}
    if kind == "malformed":
        return {"Authorization": "Bearer not-a-jwt"}
    if kind == "wrong-signature":
        now = int(time.time())
        claims = {
            "sub": str(user_id),
            "jti": str(uuid.uuid4()),
            "iat": now,
            "exp": now + 3600,
            "type": "access",
            "fresh": False,
        }
        return bearer(raw_token(claims, secret=OTHER_SECRET))
    if kind == "expired":
        return bearer(board_tracker.token_for(user_id, expires_delta=timedelta(seconds=-60)))
    if kind == "revoked":
        token = board_tracker.token_for(user_id)
        board_tracker.revoke(decode_unverified(token)["jti"])
        return bearer(token)
    raise AssertionError(f"unknown token kind {kind}")


# Feature: boards-membership, Property 12: Authentication and private caching on every board route
@pytest.mark.parametrize("token_kind", TOKEN_KINDS)
@pytest.mark.parametrize("route_name", ROUTE_NAMES, ids=ROUTE_NAMES)
def test_property_12_invalid_token_gets_401_auth_required_on_every_board_route(
    client, board_tracker, app, route_name, token_kind
):
    """Feature: boards-membership, Property 12: Authentication and private caching.

    **Validates: Requirements 7.2**
    """
    route = SHAPE_ROUTES[route_name]
    seed = _seed(board_tracker, "no-cards")
    response = client.open(
        route.path(seed),
        method=route.method,
        json=route.body(seed),
        headers=_headers_for(board_tracker, seed.admin_id, token_kind),
    )

    _assert_error(response, 401, "AUTH_REQUIRED")
    assert response.headers["Cache-Control"] == "private, no-store"


# Feature: boards-membership, Property 12: Authentication and private caching on every board route
@pytest.mark.parametrize("outcome", ["success", "error"])
@pytest.mark.parametrize("route_name", ROUTE_NAMES, ids=ROUTE_NAMES)
def test_property_12_every_board_route_is_private_no_store_on_success_and_error(
    client, board_tracker, app, route_name, outcome
):
    """Feature: boards-membership, Property 12: Authentication and private caching.

    Success uses the Admin. The error case uses a registered nonmember with a valid request, or
    for E06 an empty name. E05 has no error case beyond authentication, which the auth test covers.

    **Validates: Requirements 7.2**
    """
    if route_name == "E05 list" and outcome == "error":
        pytest.skip("E05 has no error response for an authenticated caller (Property 12 auth test)")
    route = SHAPE_ROUTES[route_name]
    seed = _seed(board_tracker, "no-cards")
    if outcome == "success":
        headers = bearer(board_tracker.token_for(seed.admin_id))
        body = route.body(seed)
    else:
        outsider_id = seed.outsider_id
        headers = bearer(board_tracker.token_for(outsider_id))
        body = {"name": ""} if route_name == "E06 create" else route.body(seed)
    response = client.open(route.path(seed), method=route.method, json=body, headers=headers)

    if outcome == "success":
        assert response.status_code in (200, 201), response.get_data(as_text=True)
        if route_name == "E06 create":
            board_tracker.record_board_from_response(response)
    elif route_name == "E06 create":
        # A 400 for a bad name carries field messages, so only the status and code are checked.
        assert response.status_code == 400
        assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"
    else:
        _assert_error(response, 404, "NOT_FOUND")
    assert response.headers["Cache-Control"] == "private, no-store"
