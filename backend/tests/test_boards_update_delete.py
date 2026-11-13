"""BT4 update and delete tests for E08 and E09 (task 2.8).

Requirements 1.9, 3.1, 3.2, 3.4, 3.5, 3.6 and 7.5.

Covers Admin rename and delete, the Member 403 with unchanged state, the later 404s on a deleted
board for E05 and E07 through E12, and duplicate names on rename. Every row is created through
`board_tracker`, which removes it after the test. The app is built from TEST_DATABASE_URL.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest
from sqlalchemy import select

from app.extensions import db
from app.models.board import Board
from app.models.board_member import BoardMember
from tests.auth_helpers import bearer


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@dataclass(frozen=True)
class Seed:
    """One board with an admin and a member, both created through the tracker."""

    board_id: Any
    admin_id: Any
    admin_email: str
    member_id: Any
    member_email: str


def _seed_board(board_tracker, name: str = "Original board") -> Seed:
    admin = board_tracker.make_user(name="Admin Owner")
    member = board_tracker.make_user(name="Team Member")
    board_id = board_tracker.make_board(admin.id, name=name)
    board_tracker.make_membership(board_id, admin.id, "admin")
    board_tracker.make_membership(board_id, member.id, "member")
    return Seed(board_id, admin.id, admin.email, member.id, member.email)


def _headers(board_tracker, user_id) -> dict[str, str]:
    return bearer(board_tracker.token_for(user_id))


def _snapshot(app, board_id) -> dict[str, Any]:
    """Read the board name, deleted_at and every membership row from the database."""
    with app.app_context():
        try:
            board = db.session.execute(
                select(Board).where(Board.id == board_id).execution_options(populate_existing=True)
            ).scalar_one()
            rows = db.session.scalars(
                select(BoardMember)
                .where(BoardMember.board_id == board_id)
                .order_by(BoardMember.id)
                .execution_options(populate_existing=True)
            ).all()
            return {
                "name": board.name,
                "deleted_at": board.deleted_at,
                "memberships": [(row.user_id, row.role, row.deleted_at) for row in rows],
            }
        finally:
            db.session.remove()


def _listed_board_ids(client, headers) -> list[str]:
    response = client.get("/api/boards", headers=headers)
    assert response.status_code == 200
    return [board["id"] for board in response.get_json()["data"]]


def _error(response) -> dict[str, Any]:
    return response.get_json()["error"]


def _requests_after_delete(seed: Seed) -> dict[str, tuple[str, str, dict[str, Any]]]:
    """Each E07–E12 request for the seeded board, with a valid body where one applies."""
    base = f"/api/boards/{seed.board_id}"
    return {
        "E07 detail": ("get", base, {}),
        "E08 rename": ("patch", base, {"json": {"name": "Renamed after delete"}}),
        "E09 delete": ("delete", base, {}),
        "E10 members": ("get", f"{base}/members", {}),
        "E11 add registered member": (
            "post",
            f"{base}/members",
            {"json": {"email": seed.member_email}},
        ),
        "E12 remove member": ("delete", f"{base}/members/{seed.member_id}", {}),
    }


# E08 and E09 as Admin


def test_admin_rename_returns_trimmed_summary_and_stores_the_name(client, board_tracker, app):
    seed = _seed_board(board_tracker)

    response = client.patch(
        f"/api/boards/{seed.board_id}",
        json={"name": "  Sprint planning  "},
        headers=_headers(board_tracker, seed.admin_id),
    )

    assert response.status_code == 200
    data = response.get_json()["data"]
    assert set(data) == {"id", "name", "role", "position_version"}
    assert data["id"] == str(seed.board_id)
    assert data["name"] == "Sprint planning"
    assert data["role"] == "admin"
    assert _snapshot(app, seed.board_id)["name"] == "Sprint planning"


def test_admin_delete_soft_deletes_the_board_and_returns_null_data(client, board_tracker, app):
    seed = _seed_board(board_tracker)
    before = _snapshot(app, seed.board_id)

    response = client.delete(
        f"/api/boards/{seed.board_id}", headers=_headers(board_tracker, seed.admin_id)
    )

    assert response.status_code == 200
    assert response.get_json() == {"data": None}
    after = _snapshot(app, seed.board_id)
    assert after["deleted_at"] is not None
    # Soft delete: the name and the memberships stay in place.
    assert after["name"] == before["name"]
    assert after["memberships"] == before["memberships"]


def test_rename_accepts_a_name_already_used_by_another_board(client, board_tracker, app):
    seed = _seed_board(board_tracker, name="Shared name")
    sibling_id = board_tracker.make_board(seed.admin_id, name="Other name")
    board_tracker.make_membership(sibling_id, seed.admin_id, "admin")
    headers = _headers(board_tracker, seed.admin_id)

    response = client.patch(
        f"/api/boards/{sibling_id}", json={"name": "Shared name"}, headers=headers
    )

    assert response.status_code == 200
    assert response.get_json()["data"]["name"] == "Shared name"
    assert _snapshot(app, sibling_id)["name"] == "Shared name"
    assert _snapshot(app, seed.board_id)["name"] == "Shared name"
    listed = client.get("/api/boards", headers=headers).get_json()["data"]
    assert [board["name"] for board in listed].count("Shared name") == 2


# Member gets 403 and the state does not change


@pytest.mark.parametrize(
    ("method", "kwargs"),
    [
        pytest.param("patch", {"json": {"name": "Member rename attempt"}}, id="E08-rename"),
        pytest.param("delete", {}, id="E09-delete"),
    ],
)
def test_member_gets_403_and_board_state_is_unchanged(client, board_tracker, app, method, kwargs):
    seed = _seed_board(board_tracker)
    before = _snapshot(app, seed.board_id)

    response = getattr(client, method)(
        f"/api/boards/{seed.board_id}",
        headers=_headers(board_tracker, seed.member_id),
        **kwargs,
    )

    assert response.status_code == 403
    error = _error(response)
    assert error["code"] == "FORBIDDEN"
    assert error.get("fields") is None
    after = _snapshot(app, seed.board_id)
    assert after == before
    assert after["deleted_at"] is None


# Later requests after E09 see the board as missing


AFTER_DELETE_ROUTES = (
    "E07 detail",
    "E08 rename",
    "E09 delete",
    "E10 members",
    "E11 add registered member",
    "E12 remove member",
)


@pytest.mark.parametrize("caller", ["admin", "member"])
@pytest.mark.parametrize("route", AFTER_DELETE_ROUTES)
def test_requests_on_a_deleted_board_return_the_same_404(client, board_tracker, app, caller, route):
    seed = _seed_board(board_tracker)
    caller_id = seed.admin_id if caller == "admin" else seed.member_id
    headers = _headers(board_tracker, caller_id)
    delete_response = client.delete(
        f"/api/boards/{seed.board_id}", headers=_headers(board_tracker, seed.admin_id)
    )
    assert delete_response.status_code == 200
    before = _snapshot(app, seed.board_id)

    method, path, kwargs = _requests_after_delete(seed)[route]
    response = getattr(client, method)(path, headers=headers, **kwargs)

    assert response.status_code == 404
    error = _error(response)
    assert error["code"] == "NOT_FOUND"
    assert error.get("fields") is None
    # A request that fails on the deleted board must not write.
    assert _snapshot(app, seed.board_id) == before


@pytest.mark.parametrize("caller", ["admin", "member"])
def test_deleted_board_is_omitted_from_the_listing(client, board_tracker, caller):
    seed = _seed_board(board_tracker)
    caller_id = seed.admin_id if caller == "admin" else seed.member_id
    assert str(seed.board_id) in _listed_board_ids(client, _headers(board_tracker, caller_id))

    client.delete(f"/api/boards/{seed.board_id}", headers=_headers(board_tracker, seed.admin_id))

    assert str(seed.board_id) not in _listed_board_ids(client, _headers(board_tracker, caller_id))


def test_second_delete_of_the_same_board_returns_404(client, board_tracker, app):
    seed = _seed_board(board_tracker)
    headers = _headers(board_tracker, seed.admin_id)
    assert client.delete(f"/api/boards/{seed.board_id}", headers=headers).status_code == 200
    deleted_at = _snapshot(app, seed.board_id)["deleted_at"]

    response = client.delete(f"/api/boards/{seed.board_id}", headers=headers)

    assert response.status_code == 404
    assert _error(response)["code"] == "NOT_FOUND"
    assert _snapshot(app, seed.board_id)["deleted_at"] == deleted_at
