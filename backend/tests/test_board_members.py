"""BT5 member tests for E10, E11 and E12 (task 2.9).
Requirements 4.1 to 4.6, 4.8, 5.1, 5.3, 5.4 and 7.5. Covers E10 ordering (Admin first, then name,
then `user_id`), E11 creation, reactivation, conflict, unknown email and validation, E12 removal,
the missing-membership 404 and the Admin-target 409, and the allowlisted member fields.
Every row is created through `board_tracker`, which removes it after the test, even on failure.
Member names are collation-neutral lowercase letters. Equal names exercise the `user_id` tie-break.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

import pytest
from sqlalchemy import select, update

from app.extensions import db
from app.models.base import utcnow
from app.models.board_member import BoardMember
from tests.auth_helpers import PLACEHOLDER_HASH, bearer


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@dataclass(frozen=True)
class Seed:
    """One board with its admin and one active member, all created through the tracker."""

    board_id: uuid.UUID
    admin_id: uuid.UUID
    admin_email: str
    member_id: uuid.UUID
    member_email: str
    member_row_id: uuid.UUID


def _seed_board(board_tracker) -> Seed:
    admin = board_tracker.make_user(name="zulu")
    member = board_tracker.make_user(name="alpha")
    board_id = board_tracker.make_board(admin.id, name="Members board")
    board_tracker.make_membership(board_id, admin.id, "admin")
    member_row_id = board_tracker.make_membership(board_id, member.id, "member")
    return Seed(board_id, admin.id, admin.email, member.id, member.email, member_row_id)


def _headers(board_tracker, user_id: uuid.UUID) -> dict[str, str]:
    return bearer(board_tracker.token_for(user_id))


def _snapshot(app, board_id: uuid.UUID) -> list[tuple[uuid.UUID, uuid.UUID, str, Any]]:
    """Every membership row on the board as (row ID, user ID, role, deleted_at)."""
    with app.app_context():
        try:
            rows = db.session.scalars(
                select(BoardMember)
                .where(BoardMember.board_id == board_id)
                .order_by(BoardMember.id)
                .execution_options(populate_existing=True)
            ).all()
            return [(row.id, row.user_id, row.role, row.deleted_at) for row in rows]
        finally:
            db.session.remove()


def _soft_delete_membership(app, row_id: uuid.UUID) -> None:
    """Mark one membership row removed, as E12 does, so a later E11 must reactivate it."""
    with app.app_context():
        try:
            db.session.execute(
                update(BoardMember).where(BoardMember.id == row_id).values(deleted_at=utcnow())
            )
            db.session.commit()
        finally:
            db.session.remove()


def _error(response) -> dict[str, Any]:
    return response.get_json()["error"]


def _keys_in(value: Any) -> set[str]:
    """Every dictionary key at any depth of a parsed JSON value."""
    if isinstance(value, dict):
        found = set(value)
        for item in value.values():
            found |= _keys_in(item)
        return found
    if isinstance(value, list):
        found: set[str] = set()
        for item in value:
            found |= _keys_in(item)
        return found
    return set()


def _assert_no_private_fields(response, private_values: list[str]) -> None:
    """No email, password hash or timestamp appears in the body (Requirement 4.8)."""
    text = response.get_data(as_text=True)
    for value in private_values:
        assert value not in text
    for key in _keys_in(response.get_json()):
        assert key not in {"email", "password_hash"}
        assert not key.endswith("_at")


# E10 ordering: Admin first, then name, then user_id
def test_members_list_orders_admin_first_then_name_then_user_id(client, board_tracker):
    admin = board_tracker.make_user(name="zulu")
    board_id = board_tracker.make_board(admin.id, name="Order board")
    board_tracker.make_membership(board_id, admin.id, "admin")

    bravo = board_tracker.make_user(name="bravo")
    alpha = board_tracker.make_user(name="alpha")
    # Two members with the same name. The one with the smaller user_id must sort first, so the
    # larger ID is inserted first to rule out insertion order as the reason.
    first_same, second_same = sorted(
        (board_tracker.make_user(name="same"), board_tracker.make_user(name="same")),
        key=lambda user: user.id,
    )
    for user in (second_same, first_same, bravo, alpha):
        board_tracker.make_membership(board_id, user.id, "member")

    response = client.get(
        f"/api/boards/{board_id}/members", headers=_headers(board_tracker, admin.id)
    )

    assert response.status_code == 200
    data = response.get_json()["data"]
    assert [row["user_id"] for row in data] == [
        str(admin.id),
        str(alpha.id),
        str(bravo.id),
        str(first_same.id),
        str(second_same.id),
    ]
    assert [row["role"] for row in data] == ["admin", "member", "member", "member", "member"]
    assert [row["name"] for row in data] == ["zulu", "alpha", "bravo", "same", "same"]


# E11 creation and reactivation
def test_admin_adds_registered_user_as_member_with_201(client, board_tracker, app):
    seed = _seed_board(board_tracker)
    newcomer = board_tracker.make_user(name="charlie")
    before = _snapshot(app, seed.board_id)

    response = client.post(
        f"/api/boards/{seed.board_id}/members",
        json={"email": f"  {newcomer.email.upper()}  "},
        headers=_headers(board_tracker, seed.admin_id),
    )

    assert response.status_code == 201
    assert response.get_json()["data"] == {
        "user_id": str(newcomer.id),
        "name": "charlie",
        "role": "member",
    }
    after = _snapshot(app, seed.board_id)
    assert len(after) == len(before) + 1
    added = [row for row in after if row[1] == newcomer.id]
    assert len(added) == 1
    assert added[0][2] == "member"
    assert added[0][3] is None
    _assert_no_private_fields(response, [newcomer.email, PLACEHOLDER_HASH])


def test_reactivating_a_removed_member_reuses_the_row_as_member(client, board_tracker, app):
    seed = _seed_board(board_tracker)
    _soft_delete_membership(app, seed.member_row_id)

    response = client.post(
        f"/api/boards/{seed.board_id}/members",
        json={"email": seed.member_email},
        headers=_headers(board_tracker, seed.admin_id),
    )

    assert response.status_code == 201
    assert response.get_json()["data"]["role"] == "member"
    assert response.get_json()["data"]["user_id"] == str(seed.member_id)
    rows = [row for row in _snapshot(app, seed.board_id) if row[1] == seed.member_id]
    assert rows == [(seed.member_row_id, seed.member_id, "member", None)]


@pytest.mark.parametrize(
    "target",
    [
        pytest.param("member", id="active-member"),
        pytest.param("admin", id="admin"),
    ],
)
def test_adding_an_active_participant_returns_409_and_changes_nothing(
    client, board_tracker, app, target
):
    seed = _seed_board(board_tracker)
    email = seed.member_email if target == "member" else seed.admin_email
    before = _snapshot(app, seed.board_id)

    response = client.post(
        f"/api/boards/{seed.board_id}/members",
        json={"email": email},
        headers=_headers(board_tracker, seed.admin_id),
    )

    assert response.status_code == 409
    error = _error(response)
    assert error["code"] == "STATE_CONFLICT"
    assert error.get("fields") is None
    assert _snapshot(app, seed.board_id) == before


def test_unregistered_email_returns_user_not_found_without_fields(client, board_tracker, app):
    seed = _seed_board(board_tracker)
    unknown_email = f"nobody-{uuid.uuid4().hex[:12]}@example.test"
    before = _snapshot(app, seed.board_id)

    response = client.post(
        f"/api/boards/{seed.board_id}/members",
        json={"email": unknown_email},
        headers=_headers(board_tracker, seed.admin_id),
    )

    assert response.status_code == 404
    error = _error(response)
    assert error["code"] == "USER_NOT_FOUND"
    assert error.get("fields") is None
    assert unknown_email not in error["message"]
    assert _snapshot(app, seed.board_id) == before


@pytest.mark.parametrize(
    ("body", "field"),
    [
        pytest.param({"email": "not-an-email"}, "email", id="no-at-sign"),
        pytest.param({"email": "user@example"}, "email", id="no-dot-after-at"),
        pytest.param({"email": ""}, "email", id="empty-email"),
        pytest.param({}, "email", id="missing-email"),
        pytest.param({"role": "admin"}, "email", id="role-without-email"),
        pytest.param({"email": "EMAIL_PLACEHOLDER", "role": "admin"}, "role", id="unknown-field"),
    ],
)
def test_malformed_email_or_unknown_field_returns_400(client, board_tracker, app, body, field):
    seed = _seed_board(board_tracker)
    newcomer = board_tracker.make_user(name="delta")
    payload = {
        key: newcomer.email if value == "EMAIL_PLACEHOLDER" else value
        for key, value in body.items()
    }
    before = _snapshot(app, seed.board_id)

    response = client.post(
        f"/api/boards/{seed.board_id}/members",
        json=payload,
        headers=_headers(board_tracker, seed.admin_id),
    )

    assert response.status_code == 400
    error = _error(response)
    assert error["code"] == "VALIDATION_ERROR"
    assert field in error["fields"]
    assert _snapshot(app, seed.board_id) == before


# E12 removal
def test_admin_removes_member_with_200_null_and_soft_deletes_only_that_row(
    client, board_tracker, app
):
    seed = _seed_board(board_tracker)
    before = _snapshot(app, seed.board_id)

    response = client.delete(
        f"/api/boards/{seed.board_id}/members/{seed.member_id}",
        headers=_headers(board_tracker, seed.admin_id),
    )

    assert response.status_code == 200
    assert response.get_json() == {"data": None}
    after = _snapshot(app, seed.board_id)
    assert len(after) == len(before)
    removed = [row for row in after if row[1] == seed.member_id]
    assert removed[0][0] == seed.member_row_id
    assert removed[0][2] == "member"
    assert removed[0][3] is not None
    # The admin row is unchanged.
    assert [row for row in after if row[1] == seed.admin_id] == [
        row for row in before if row[1] == seed.admin_id
    ]


@pytest.mark.parametrize(
    "target",
    [
        pytest.param("never-member", id="never-a-member"),
        pytest.param("removed-member", id="already-removed"),
        pytest.param("unknown-user", id="unknown-user-id"),
    ],
)
def test_removing_a_target_without_active_membership_returns_404(
    client, board_tracker, app, target
):
    seed = _seed_board(board_tracker)
    if target == "never-member":
        target_id = board_tracker.make_user(name="echo").id
    elif target == "removed-member":
        _soft_delete_membership(app, seed.member_row_id)
        target_id = seed.member_id
    else:
        target_id = uuid.uuid4()
    before = _snapshot(app, seed.board_id)

    response = client.delete(
        f"/api/boards/{seed.board_id}/members/{target_id}",
        headers=_headers(board_tracker, seed.admin_id),
    )

    assert response.status_code == 404
    error = _error(response)
    assert error["code"] == "NOT_FOUND"
    assert error.get("fields") is None
    assert _snapshot(app, seed.board_id) == before


def test_removing_the_admin_returns_409_and_keeps_the_membership_active(client, board_tracker, app):
    seed = _seed_board(board_tracker)
    before = _snapshot(app, seed.board_id)

    response = client.delete(
        f"/api/boards/{seed.board_id}/members/{seed.admin_id}",
        headers=_headers(board_tracker, seed.admin_id),
    )

    assert response.status_code == 409
    error = _error(response)
    assert error["code"] == "STATE_CONFLICT"
    assert error.get("fields") is None
    after = _snapshot(app, seed.board_id)
    assert after == before
    assert all(row[3] is None for row in after)


# Allowlisted member fields on every member body
@pytest.mark.parametrize("route", ["list", "add"])
def test_member_bodies_expose_only_user_id_name_and_role(client, board_tracker, route):
    seed = _seed_board(board_tracker)
    headers = _headers(board_tracker, seed.admin_id)
    if route == "list":
        response = client.get(f"/api/boards/{seed.board_id}/members", headers=headers)
        expected_count = 2
    else:
        newcomer = board_tracker.make_user(name="foxtrot")
        response = client.post(
            f"/api/boards/{seed.board_id}/members",
            json={"email": newcomer.email},
            headers=headers,
        )
        expected_count = 1
    assert response.status_code in (200, 201)

    payload = response.get_json()["data"]
    rows = payload if isinstance(payload, list) else [payload]
    assert len(rows) == expected_count
    for row in rows:
        assert set(row) == {"user_id", "name", "role"}
    _assert_no_private_fields(response, [seed.member_email, seed.admin_email, PLACEHOLDER_HASH])
